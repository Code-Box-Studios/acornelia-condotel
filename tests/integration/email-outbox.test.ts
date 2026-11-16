import {signedObservation} from '../support/payment-observation'
import {applyPaymentObservation} from '@/domain/payments/observe'
import {submitEnquiry} from '@/content/posts'
import {attemptIssue} from '@/domain/payments/exceptions'
import {randomUUID} from 'node:crypto'
import {issueClaim} from '@/domain/claims/issue'
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import {syntheticEmailPolicy} from '../support/email-policy'
import type {DeliveryResult,TransactionalMailer,TransactionalMessage} from '@/email/types'
import {emailHandler} from '@/email/deliver'
import {runWorkBatch} from '@/integrations/work-runner'
import {claimWork,beginWork} from '@/domain/work/claim'
import {replayWork,completeWork} from '@/domain/work/complete'
import {registerCustomer,requestCustomerRecovery} from '@/features/auth/actions'
import {decryptPrivateState} from '@/domain/security/private-state'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()});beforeEach(async()=>{await h.reset();h.clock.set('2026-11-13T04:00:00.000Z')});afterAll(async()=>{await h?.reset();await h?.close()})
function captured(result:DeliveryResult={kind:'accepted',providerMessageId:'<synthetic@example.test>'}){const messages:TransactionalMessage[]=[],mailer:TransactionalMailer={send:async value=>{messages.push(value);return result}};return {messages,mailer,handler:emailHandler(mailer)}}
async function setup(overrides:Parameters<typeof syntheticEmailPolicy>[0]={}){return checkoutFixture(h,{zero:true,email:overrides})}
it('freezes confirmation contact and accepted stay in the booking transaction and sends its private link separately',async()=>{
 const f=await setup(),mail=captured()
 expect(await h.rows('email-messages')).toHaveLength(1)
 await h.uow.run(f.worker.actor,tx=>tx.payload.update({collection:'bookings',id:f.receipt.bookingId,data:{contact:{name:'Changed contact',email:'changed@example.test',phone:'+639171234567'}},req:tx.req,overrideAccess:false}))
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 const main=mail.messages.find(value=>value.kind==='booking')!,view=mail.messages.find(value=>value.kind==='booking-view')!
 expect(main.to).toEqual(['dispatch-guest@example.test']);expect(main.cc).toEqual(['codeboxstudios.official@gmail.com'])
 expect(main.html).toContain('ACN-');expect(main.html).not.toContain('#token=')
 expect(view.to).toEqual(main.to);expect(view.cc).toEqual([]);expect(view.html).toContain('/booking/view#')
 expect((await h.rows('bookings'))[0].status).toBe('confirmed')
 expect((await h.rows('email-messages')).every(row=>row.state==='accepted')).toBe(true)
 expect((await runWorkBatch(f.worker,{email:mail.handler},{kind:'email'})).claimed).toBe(0)
})
it('keeps a paid booking and capacity confirmed when sending is unknown and never automatically repeats that send',async()=>{
 const f=await setup(),mail=captured({kind:'unknown',reason:'timeout'})
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:1})
 expect((await h.rows('bookings'))[0].status).toBe('confirmed');expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
 expect((await h.rows('email-messages',{category:{equals:'booking'}}))[0].state).toBe('uncertain')
 h.clock.set(new Date(Date.parse(h.clock.now())+60000).toISOString())
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 expect(mail.messages.filter(value=>value.kind==='booking')).toHaveLength(1)
})
it('retries definite transient nonacceptance within the work bound and keeps permanent refusal failed',async()=>{
 const f=await setup(),mail=captured({kind:'refused',reason:'temporary'})
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:1})
 const work=(await h.rows('work-items',{semanticKey:{equals:'booking-confirmation:'+f.receipt.bookingId+':1'}}))[0]
 expect(work.state).toBe('ready')
 h.clock.set(new Date(Date.parse(work.availableAt)+1).toISOString())
 const permanent=captured({kind:'refused',reason:'permanent'})
 await runWorkBatch(f.worker,{email:permanent.handler},{kind:'email',maxJobs:5})
 expect((await h.rows('email-messages',{category:{equals:'booking'}}))[0].state).toBe('failed')
 expect((await h.rows('bookings'))[0].status).toBe('confirmed')
})
it('counts confirmation copies as recipients and does not send when the approved daily budget is exhausted',async()=>{
 const f=await setup({dailyRecipients:1}),mail=captured()
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:1})
 expect(mail.messages).toHaveLength(0)
 expect((await h.rows('bookings'))[0].status).toBe('confirmed')
 expect((await h.rows('work-items',{semanticKey:{equals:'booking-confirmation:'+f.receipt.bookingId+':1'}}))[0].state).toBe('ready')
})
it('fences delivery completion after a crashed send without guessing that the message was not accepted',async()=>{
 const f=await setup(),mail=captured(),lease=(await claimWork(f.worker,'email'))!
 expect(await mail.handler.preflight!(f.worker,lease)).toBeNull();await beginWork(f.worker,lease)
 const result=await mail.handler.execute(f.worker,lease,new AbortController().signal)
 h.clock.set(new Date(Date.parse(lease.expiresAt)+1).toISOString())
 await expect(completeWork(f.worker,lease,result)).rejects.toThrow('stale')
 // Another private-link work item may be due; the original nonrepeatable send remains uncertain.
 await claimWork(f.worker,'email');await claimWork(f.worker,'email')
 expect((await h.rows('work-items',{id:{equals:lease.id}}))[0].state).toBe('uncertain')
 expect(mail.messages).toHaveLength(1)
 expect((await h.rows('email-messages',{category:{equals:'booking'}}))[0].state).toBe('uncertain')
})
it('delivers only still-valid activation/reset grants without booking copies or raw audit tokens',async()=>{
 const f=await setup(),mail=captured()
 await registerCustomer(f.ctx,{name:'Private <customer>',email:'activation@example.test'})
 await requestCustomerRecovery(f.ctx,'dispatch-account@example.test')
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 const auth=mail.messages.filter(value=>value.kind==='auth');expect(auth).toHaveLength(2)
 expect(auth.every(value=>value.cc.length===0)).toBe(true)
 const deliveries=await h.rows('auth-deliveries')
 for(const row of deliveries){const state=decryptPrivateState(row.encryptedState,'auth-delivery:'+row.id) as {token:string};expect(JSON.stringify(await h.rows('audit-entries'))).not.toContain(state.token)}
})
it('cancels expired authentication mail before dispatch without exposing a token',async()=>{
 const f=await setup();await registerCustomer(f.ctx,{name:'Expired customer',email:'expired@example.test'})
 h.clock.set(new Date(Date.parse(h.clock.now())+61*60000).toISOString());const mail=captured()
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 expect(mail.messages.some(value=>value.kind==='auth')).toBe(false)
 expect((await h.rows('auth-deliveries'))[0].state).toBe('cancelled')
})

it('queues native Payload staff recovery inside the token transaction without sending or copying the token',async()=>{
 const f=await setup(),staff=await h.seed('staff-users',{name:'Staff recovery fixture',email:'staff-recovery@example.test',password:'Synthetic-staff-recovery-passphrase-946!',role:'developer'})
 const token=await h.payload.forgotPassword({collection:'staff-users',data:{email:staff.email}})
 expect(token).toMatch(/^[a-f0-9]{40}$/);h.clock.set(new Date().toISOString())
 const row=(await h.rows('email-messages',{category:{equals:'staff-reset'}}))[0];expect(row.state).toBe('pending')
 const mail=captured();await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 const message=mail.messages.find(value=>value.kind==='staff-reset')!;expect(message.cc).toEqual([]);expect(message.to).toEqual([staff.email]);expect(message.html).toContain('/staff/reset#token=')
 expect(JSON.stringify(await h.rows('audit-entries'))).not.toContain(token!)
})
it('rolls native reset token and email intent back together when the queue audit fails',async()=>{
 await setup();const staff=await h.seed('staff-users',{name:'Rollback recovery fixture',email:'rollback-recovery@example.test',password:'Synthetic-rollback-recovery-passphrase-946!',role:'developer'})
 await h.pool.query("CREATE FUNCTION email_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='email:queued' THEN RAISE EXCEPTION 'injected email failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER email_test_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION email_test_failure()")
 try{await expect(h.payload.forgotPassword({collection:'staff-users',data:{email:staff.email}})).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER email_test_failure ON audit_entries; DROP FUNCTION email_test_failure()')}
 expect(await h.rows('email-messages',{category:{equals:'staff-reset'}})).toHaveLength(0)
 const current=await h.payload.findByID({collection:'staff-users',id:staff.id,showHiddenFields:true,overrideAccess:true});expect(current.resetPasswordToken??null).toBeNull()
})

it('emails a reviewed claim only to its approved customer without a confirmation copy',async()=>{
 const f=await checkoutFixture(h,{zero:true,email:{claimDelivery:'reviewed-account'},claims:true}),staff=await h.seed('staff-users',{name:'Claim review fixture',email:'claim-review@example.test',password:'Synthetic-claim-review-passphrase-946!',role:'developer'})
 const claim=await issueClaim({...f.ctx,actor:{kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}},{bookingId:f.receipt.bookingId,customerId:f.customer.id,proof:{method:'staff-reviewed-original-evidence',reviewReference:randomUUID()}})
 const mail=captured();await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 const message=mail.messages.find(value=>value.kind==='claim')!;expect(message.to).toEqual([f.customer.email]);expect(message.cc).toEqual([]);expect(message.text).toContain(claim.token)
 expect(JSON.stringify(await h.rows('audit-entries'))).not.toContain(claim.token)
})

it('moves a never-dispatched reservation to the current UTC quota day after worker takeover',async()=>{
 const f=await setup({dailyRecipients:2}),mail=captured(),first=(await claimWork(f.worker,'email'))!
 expect(await mail.handler.preflight!(f.worker,first)).toBeNull()
 const oldDay=h.clock.now().slice(0,10);h.clock.set(new Date(Date.parse(h.clock.now())+86400000).toISOString())
 let next=await claimWork(f.worker,'email');if(next?.id!==first.id)next=await claimWork(f.worker,'email')
 expect(next?.id).toBe(first.id);expect(await mail.handler.preflight!(f.worker,next!)).toBeNull()
 const row=(await h.rows('email-messages',{category:{equals:'booking'}}))[0]
 expect(row.reservedDay).not.toBe(oldDay);expect(row.reservedDay).toBe(h.clock.now().slice(0,10))
})
it('keeps actual verified money and the confirmed stay when confirmation email fails',async()=>{
 const f=await checkoutFixture(h,{email:{}}),attempt=(await h.rows('payment-attempts'))[0],ctx={...f.worker,actor:{kind:'system' as const,purpose:'payments' as const}}
 await applyPaymentObservation(ctx,await signedObservation(ctx,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'200.00',currency:'PHP'}))
 const mail=captured({kind:'unknown',reason:'timeout'});await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:1})
 expect((await h.rows('bookings'))[0].status).toBe('confirmed');expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(1)
 expect(await h.rows('allocations',{released:{equals:false},purpose:{equals:'booking'}})).toHaveLength(1)
})
it('sends enquiries and payment exceptions to their approved operational inboxes with escaped content',async()=>{
 const f=await checkoutFixture(h,{email:{}}),mail=captured(),enquiryId=await submitEnquiry(f.ctx,{nonce:randomUUID(),name:'Enquiry <guest>',email:'enquiry-guest@example.test',message:'A private <script>alert(1)</script> enquiry',consent:true})
 const attempt=(await h.rows('payment-attempts'))[0];await h.uow.run(f.worker.actor,tx=>attemptIssue(tx,attempt,'payment-uncertain',h.clock.now()))
 await runWorkBatch(f.worker,{enquiry:mail.handler},{kind:'enquiry',maxJobs:1});await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:1})
 expect(mail.messages.find(value=>value.kind==='enquiry')!.to).toEqual(['enquiries@example.test'])
 expect(mail.messages.find(value=>value.kind==='payment-issue')!.to).toEqual(['operations@example.test'])
 expect(mail.messages.every(value=>!value.html.includes('<script>'))).toBe(true)
 expect((await h.rows('enquiries',{id:{equals:enquiryId}}))[0].state).toBe('delivered')
})
it('does not overspend the shared recipient budget under competing preflights',async()=>{
 const f=await setup({dailyRecipients:2});await registerCustomer(f.ctx,{name:'Quota customer',email:'quota-customer@example.test'})
 const mail=captured(),first=(await claimWork(f.worker,'email'))!,second=(await claimWork(f.worker,'email'))!
 await Promise.all([mail.handler.preflight!(f.worker,first),mail.handler.preflight!(f.worker,second)])
 const reserved=(await h.rows('email-messages')).reduce((sum,row)=>sum+(row.reservedDay?row.recipientCount??0:0),0)
 expect(reserved).toBeLessThanOrEqual(2);expect(reserved).toBeGreaterThan(0);expect(mail.messages).toHaveLength(0)
})
it('protects original encrypted content, prepared messages and accepted receipts in SQL',async()=>{
 const f=await setup(),mail=captured();await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:1})
 const row=(await h.rows('email-messages',{category:{equals:'booking'}}))[0]
 for(const query of ["UPDATE email_messages SET encrypted_snapshot='changed' WHERE id=$1","UPDATE email_messages SET encrypted_message='changed' WHERE id=$1","UPDATE email_messages SET state='pending' WHERE id=$1","DELETE FROM email_messages WHERE id=$1"]){await expect(h.pool.query(query,[row.id])).rejects.toThrow()}
})
it('retains uncertain delivery after an external acceptance whose completion audit rolls back',async()=>{
 const f=await setup(),mail=captured(),lease=(await claimWork(f.worker,'email'))!;await mail.handler.preflight!(f.worker,lease);await beginWork(f.worker,lease)
 const result=await mail.handler.execute(f.worker,lease,new AbortController().signal)
 await h.pool.query("CREATE FUNCTION email_completion_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='email:outcome' THEN RAISE EXCEPTION 'injected email completion failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER email_completion_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION email_completion_failure()")
 try{await expect(completeWork(f.worker,lease,result)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER email_completion_failure ON audit_entries; DROP FUNCTION email_completion_failure()')}
 h.clock.set(new Date(Date.parse(lease.expiresAt)+1).toISOString());await claimWork(f.worker,'email');await claimWork(f.worker,'email')
 expect((await h.rows('email-messages',{category:{equals:'booking'}}))[0].state).toBe('uncertain');expect(mail.messages).toHaveLength(1)
 expect((await h.rows('bookings'))[0].status).toBe('confirmed')
})
it('does not send against yesterday’s quota if midnight passes after dispatch preparation',async()=>{
 h.clock.set('2026-11-13T23:59:59.000Z');const f=await setup(),mail=captured(),lease=(await claimWork(f.worker,'email'))!
 await mail.handler.preflight!(f.worker,lease);await beginWork(f.worker,lease);h.clock.set('2026-11-14T00:00:00.001Z')
 await completeWork(f.worker,lease,await mail.handler.execute(f.worker,lease,new AbortController().signal))
 expect(mail.messages).toHaveLength(0)
 expect((await h.rows('work-items',{id:{equals:lease.id}}))[0].state).toBe('ready')
})
it('cancels a revoked private-view delivery before exposing its capability',async()=>{
 const f=await setup(),mail=captured();await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:1})
 const view=(await h.rows('booking-views',{purpose:{equals:'booking-view'}}))[0]
 await h.uow.run(f.worker.actor,tx=>tx.payload.update({collection:'booking-views',id:view.id,data:{revokedAt:h.clock.now()},req:tx.req,overrideAccess:false}))
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 expect(mail.messages.filter(value=>value.kind==='booking-view')).toHaveLength(0)
})
it('does not send an obsolete confirmation after the booking has been cancelled',async()=>{
 const f=await setup(),mail=captured()
 await h.uow.run(f.worker.actor,tx=>tx.payload.update({collection:'bookings',id:f.receipt.bookingId,data:{status:'cancelled'},req:tx.req,overrideAccess:false}))
 await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 expect(mail.messages).toHaveLength(0)
})

it('allows an authorized retry of definite failed mail without replaying an uncertain send',async()=>{
 const f=await setup(),refusal=captured({kind:'refused',reason:'permanent'});await runWorkBatch(f.worker,{email:refusal.handler},{kind:'email',maxJobs:1})
 const work=(await h.rows('work-items',{semanticKey:{equals:'booking-confirmation:'+f.receipt.bookingId+':1'}}))[0],staff=await h.seed('staff-users',{name:'Mail recovery operator',email:'mail-recovery-operator@example.test',password:'Synthetic-mail-operator-passphrase-946!',role:'developer'})
 await replayWork({...f.worker,actor:{kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}},work.id)
 const success=captured();await runWorkBatch(f.worker,{email:success.handler},{kind:'email',maxJobs:5})
 expect(success.messages.filter(value=>value.kind==='booking')).toHaveLength(1)
 expect((await h.rows('email-messages',{category:{equals:'booking'}}))[0].state).toBe('accepted')
})

it('does not reject a verified booking because its valid checkout contact exceeds a mail-only limit',async()=>{
 const f=await checkoutFixture(h,{email:{},contactName:'N'.repeat(160)}),attempt=(await h.rows('payment-attempts'))[0],ctx={...f.worker,actor:{kind:'system' as const,purpose:'payments' as const}}
 const observation=await signedObservation(ctx,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'200.00',currency:'PHP'})
 expect((await applyPaymentObservation(ctx,observation)).state).toBe('confirmed')
 const mail=captured();await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 expect(mail.messages.find(value=>value.kind==='booking')!.text).toContain('N'.repeat(160))
})
