import {randomUUID} from 'node:crypto'
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import {claimWork,beginWork} from '@/domain/work/claim'
import {completeWork} from '@/domain/work/complete'
import {dispatchCheckout,checkoutPreflight} from '@/domain/payments/create-checkout'
import {signedObservation} from '../support/payment-observation'
import {quoteStayChange} from '@/domain/changes/quote'
import {requestStayChange,abandonStayChange} from '@/domain/changes/request'
import {cancelBooking} from '@/domain/changes/cancel'
import {acceptQuote} from '@/domain/quotes/accept'
import {applyPaymentObservation} from '@/domain/payments/observe'
import {issueCheckoutAccess,readCheckoutStatus} from '@/features/booking/status'
import {startCheckout} from '@/domain/bookings/start-checkout'
import {closeAttempt} from '@/domain/payments/reconcile'
import {completeStayChangeTx,replacementRoom} from '@/domain/changes/complete'
import {quoteStay} from '@/domain/quotes/issue'
import {createDirectBooking} from '@/domain/bookings/direct'
import {recordOfflineCollection} from '@/domain/payments/offline'
import type {AcceptedQuote} from '@/domain/quotes/types'
import {opaqueSecret,privateDigest} from '@/domain/security/private-state'
import type {CommandContext} from '@/domain/db/types'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()});beforeEach(async()=>{await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')});afterAll(async()=>{await h?.reset();await h?.close()})
async function setup(){
 const base=await checkoutFixture(h,{changes:{},direct:{}}),f={...base,worker:{...base.worker,actor:{kind:'system' as const,purpose:'payments' as const}}},payment=(await h.rows('payment-attempts'))[0]
 await applyPaymentObservation(f.worker,await signedObservation(f.worker,{id:randomUUID(),requestReferenceNumber:payment.merchantReference,status:'PAYMENT_SUCCESS',amount:'200.00',currency:'PHP'}))
 const staff=await h.seed('staff-users',{name:'Stay change operator',email:'change-operator@example.test',password:'Synthetic-change-operator-passphrase-946!',role:'staff'})
 const ctx:CommandContext={...f.ctx,browserKey:opaqueSecret(),actor:{kind:'staff',collection:'staff-users',id:staff.id,role:staff.role}}
 const booking=(await h.rows('bookings',{id:{equals:f.receipt.bookingId}}))[0],originalAllocation=(await h.rows('allocations',{released:{equals:false}}))[0]
 return {...f,guestCtx:f.ctx,ctx,staff,booking,originalAllocation}
}
async function accepted(f:Awaited<ReturnType<typeof setup>>,arrival:string,departure:string){
 const stay={...f.quote.stay,arrival,departure}
 const promise=quoteStayChange(f.ctx,f.booking.id,1,stay);await expect(promise).resolves.toMatchObject({stay})
 const quote=await promise
 await acceptQuote(f.ctx,quote.id,quote.version)
 return {quoteId:quote.id,version:quote.version,agreementReference:'synthetic-reviewed-guest-agreement',reason:'Guest requested revised dates'}
}
it('keeps the original stay on failure and refuses an abandoned revision',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-10','2027-05-13'),pending=await requestStayChange(f.ctx,f.booking.id,1,input)
 expect(pending.kind).toBe('awaiting-payment')
 const currentAllocation=(await h.rows('allocations',{released:{equals:false}}))[0];expect(currentAllocation).toEqual(f.originalAllocation)
 await abandonStayChange(f.ctx,pending.changeId)
 const attempt=(await h.rows('payment-attempts',{id:{equals:pending.attemptId}}))[0]
 const latePaymentResult=await applyPaymentObservation(f.worker,await signedObservation(f.worker,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'100.00',currency:'PHP'}))
 expect(latePaymentResult.state).toBe('issue');expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(f.originalAllocation)
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].revision).toBe(1)
})
it('moves an overlapping equal-price stay without conflicting with its original room',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-11','2027-05-13'),result=await requestStayChange(f.ctx,f.booking.id,1,input)
 expect(result.kind).toBe('completed');const booking=(await h.rows('bookings',{id:{equals:f.booking.id}}))[0],allocation=(await h.rows('allocations',{released:{equals:false}}))[0]
 expect(booking).toMatchObject({revision:2,status:'confirmed',code:f.booking.code,arrival:'2027-05-11T00:00:00.000Z',departure:'2027-05-13T00:00:00.000Z'})
 expect(allocation.room).toBe(f.originalAllocation.room);expect(allocation.arrival).toBe(booking.arrival);expect(allocation.departure).toBe(booking.departure)
 expect(await h.rows('payment-attempts')).toHaveLength(1)
})
it('requires the exact supplemental merchant collection before completing an increased stay once',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-10','2027-05-13'),pending=await requestStayChange(f.ctx,f.booking.id,1,input),attempt=(await h.rows('payment-attempts',{id:{equals:pending.attemptId}}))[0]
 expect(attempt).toMatchObject({purpose:'change',revision:2,amountMinor:'10000',currency:'PHP'})
 const observation=await signedObservation(f.worker,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'100.00',currency:'PHP'})
 expect((await applyPaymentObservation(f.worker,observation)).state).toBe('confirmed');await applyPaymentObservation(f.worker,observation)
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0]).toMatchObject({revision:2,code:f.booking.code,departure:'2027-05-13T00:00:00.000Z'})
 expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1);expect(await h.rows('payment-transactions')).toHaveLength(2)
 expect(await h.rows('work-items',{semanticKey:{equals:'booking-confirmation:'+f.booking.id+':2'}})).toHaveLength(1)
 expect((await requestStayChange(f.ctx,f.booking.id,1,input)).changeId).toBe(pending.changeId)
})
it('commits a cheaper replacement before recording its separate refund review',async()=>{
 const f=await setup(),result=await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-10','2027-05-11'))
 expect(result).toMatchObject({kind:'completed',revision:2,refundReviewMinor:'10000'})
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].departure).toBe('2027-05-11T00:00:00.000Z')
 expect((await h.rows('payment-transactions'))[0]).toMatchObject({status:'collected',amountMinor:'20000',appliedRevision:1})
})
it('serializes competing changes at the same booking revision',async()=>{
 const f=await setup(),one=await accepted(f,'2027-05-11','2027-05-13'),two=await accepted(f,'2027-05-12','2027-05-14')
 expect(one.quoteId).not.toBe(two.quoteId)
 const results=await Promise.allSettled([requestStayChange(f.ctx,f.booking.id,1,one),requestStayChange(f.ctx,f.booking.id,1,two)])
 expect(results.filter(value=>value.status==='fulfilled')).toHaveLength(1);expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].revision).toBe(2)
 expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
})
it('rolls replacement and release back if the required action log fails',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-11','2027-05-13')
 await h.pool.query("CREATE FUNCTION change_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='booking:stay-changed' THEN RAISE EXCEPTION 'injected change audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER change_audit_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION change_audit_failure()")
 try{await expect(requestStayChange(f.ctx,f.booking.id,1,input)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER change_audit_failure ON audit_entries; DROP FUNCTION change_audit_failure()')}
 expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(f.originalAllocation);expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].revision).toBe(1)
})
it('cancels inventory separately from repayment and never resurrects a cancelled change',async()=>{
 const f=await setup(),pending=await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-10','2027-05-13'))
 const result=await cancelBooking(f.ctx,f.booking.id,1,{agreementReference:'synthetic-cancellation-review',reason:'Guest requested cancellation'});expect(result).toMatchObject({kind:'cancelled',revision:2})
 expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(0);expect((await h.rows('payment-transactions'))[0].status).toBe('collected')
 const attempt=(await h.rows('payment-attempts',{id:{equals:pending.attemptId}}))[0]
 expect((await applyPaymentObservation(f.worker,await signedObservation(f.worker,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'100.00',currency:'PHP'}))).state).toBe('issue')
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0]).toMatchObject({status:'cancelled',revision:2})
})

it('dispatches only the persisted supplemental delta and retains the original room throughout the provider request',async()=>{
 const f=await setup(),pending=await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-10','2027-05-13')),worker={...f.worker,actor:{kind:'system' as const,purpose:'work' as const}}
 let lease=(await claimWork(worker,'create-checkout'))!
 if((lease.payload as {attemptId:string}).attemptId!==pending.attemptId){const result=await checkoutPreflight(worker,lease);expect(result?.state).toBe('done');await completeWork(worker,lease,result!);lease=(await claimWork(worker,'create-checkout'))!}
 expect((lease.payload as {attemptId:string}).attemptId).toBe(pending.attemptId)
 await beginWork(worker,lease)
 let calls=0
 const unavailable=async()=>{throw new Error('Unexpected provider operation')},gateway={createCheckout:async(attempt:{amount:{minor:string;currency:string};revision:number})=>{calls++;expect(attempt.amount).toEqual({minor:'10000',currency:'PHP'});expect(attempt.revision).toBe(2);expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(f.originalAllocation);return {kind:'created' as const,environment:'sandbox' as const,checkoutId:'11111111-1111-4111-8111-111111111111',checkoutUrl:'https://payments-web-sandbox.paymaya.com/checkout?id=11111111-1111-4111-8111-111111111111'}},retrievePayment:unavailable,findPaymentsByReference:unavailable,voidPayment:unavailable,refundPayment:unavailable}
 const result=await dispatchCheckout(worker,lease,gateway);await completeWork(worker,lease,result)
 expect(calls).toBe(1);expect((await h.rows('payment-attempts',{id:{equals:pending.attemptId}}))[0].state).toBe('ready')
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].revision).toBe(1)
})

it('shows the committed current stay through the original private receipt after a cheaper change',async()=>{
 const f=await setup(),access=await issueCheckoutAccess(f.guestCtx,f.booking.id)
 await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-10','2027-05-11'))
 expect(await readCheckoutStatus(f.guestCtx,access.capability)).toMatchObject({state:'confirmed',code:f.booking.code,arrival:'2027-05-10',departure:'2027-05-11',total:{minor:'10000',currency:'PHP'},canPay:false})
})
it('retains the original stay and actual delta when additional capacity is lost after agreement',async()=>{
 const f=await setup(),pending=await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-10','2027-05-13'))
 await h.seed('allocations',{room:String(f.originalAllocation.room),arrival:'2027-05-12T00:00:00Z',departure:'2027-05-13T00:00:00Z',purpose:'block',released:false})
 const attempt=(await h.rows('payment-attempts',{id:{equals:pending.attemptId}}))[0],result=await applyPaymentObservation(f.worker,await signedObservation(f.worker,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'100.00',currency:'PHP'}))
 expect(result.state).toBe('issue');expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].revision).toBe(1)
 expect((await h.rows('allocations',{id:{equals:f.originalAllocation.id}}))[0]).toEqual(f.originalAllocation)
 expect((await h.rows('booking-changes',{id:{equals:pending.changeId}}))[0].state).toBe('failed')
 expect((await h.rows('payment-transactions',{attempt:{equals:attempt.id}}))[0]).toMatchObject({status:'collected',amountMinor:'10000',appliedRevision:null})
})
it('serializes cancellation against a competing immediate change',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-11','2027-05-13'),results=await Promise.allSettled([requestStayChange(f.ctx,f.booking.id,1,input),cancelBooking(f.ctx,f.booking.id,1,{agreementReference:'synthetic-reviewed-cancel',reason:'Guest cancellation request'})])
 expect(results.filter(value=>value.status==='fulfilled')).toHaveLength(1)
 const booking=(await h.rows('bookings',{id:{equals:f.booking.id}}))[0]
 expect(booking.revision).toBe(2);expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(booking.status==='cancelled'?0:1)
})
it('rejects direct edits to accepted change evidence, quote binding and live revision',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-11','2027-05-13'),result=await requestStayChange(f.ctx,f.booking.id,1,input)
 await expect(h.pool.query("UPDATE booking_changes SET delta_minor='-9999' WHERE id=$1",[result.changeId])).rejects.toThrow()
 await expect(h.pool.query("DELETE FROM booking_changes WHERE id=$1",[result.changeId])).rejects.toThrow()
 await expect(h.pool.query("UPDATE quotes SET change_context='{}'::jsonb WHERE id=$1",[input.quoteId])).rejects.toThrow()
 await expect(h.pool.query('UPDATE bookings SET revision=revision+1 WHERE id=$1',[f.booking.id])).rejects.toThrow()
})

it('returns the committed revision when the original checkout command is retried after a change',async()=>{
 const f=await setup();await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-10','2027-05-11'))
 expect(await startCheckout(f.guestCtx,f.input)).toMatchObject({state:'confirmed',bookingId:f.booking.id,revision:2,total:{minor:'10000',currency:'PHP'}})
})
it('does not turn already applied original money into an exception after the stay revision changes',async()=>{
 const f=await setup(),payment=(await h.rows('payment-transactions'))[0],attempt=(await h.rows('payment-attempts'))[0]
 await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-11','2027-05-13'))
 const result=await applyPaymentObservation(f.worker,await signedObservation(f.worker,{id:payment.providerPaymentId,requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'200.00',currency:'PHP',paymentAt:h.clock.now()}))
 expect(result.state).toBe('recorded');expect(await h.rows('payment-issues')).toHaveLength(0)
})

it('closes an undispatched unpaid supplemental operation without expiring the paid original stay',async()=>{
 const f=await setup(),pending=await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-10','2027-05-13')),attempt=(await h.rows('payment-attempts',{id:{equals:pending.attemptId}}))[0]
 h.clock.set(new Date(Date.parse(attempt.deadline)+1).toISOString())
 expect((await closeAttempt(f.worker,attempt.id)).state).toBe('closed')
 expect((await h.rows('booking-changes',{id:{equals:pending.changeId}}))[0].state).toBe('failed')
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0]).toMatchObject({status:'confirmed',revision:1})
 expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(f.originalAllocation)
})
it('denies customers and a different staff issuer access to the change quote',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-11','2027-05-13'),other=await h.seed('staff-users',{name:'Other operator',email:'other-change-operator@example.test',password:'Synthetic-other-operator-passphrase-946!',role:'staff'})
 await expect(quoteStayChange(f.guestCtx,f.booking.id,1,f.quote.stay)).rejects.toThrow()
 await expect(requestStayChange({...f.ctx,actor:{kind:'staff',collection:'staff-users',id:other.id,role:other.role}},f.booking.id,1,input)).rejects.toThrow()
 await expect(cancelBooking(f.guestCtx,f.booking.id,1,{agreementReference:'untrusted-request',reason:'Untrusted cancellation'})).rejects.toThrow()
 expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(f.originalAllocation)
})
it('rolls cancellation back when inventory release fails',async()=>{
 const f=await setup()
 await h.pool.query("CREATE FUNCTION change_release_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.released AND NOT OLD.released THEN RAISE EXCEPTION 'injected release failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER change_release_failure BEFORE UPDATE ON allocations FOR EACH ROW EXECUTE FUNCTION change_release_failure()")
 try{await expect(cancelBooking(f.ctx,f.booking.id,1,{agreementReference:'synthetic-reviewed-cancel',reason:'Guest cancellation'})).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER change_release_failure ON allocations; DROP FUNCTION change_release_failure()')}
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0]).toMatchObject({status:'confirmed',revision:1});expect(await h.rows('booking-changes')).toHaveLength(0)
 expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(f.originalAllocation)
})
it('preserves the original stay if inserting the replacement fails after its old interval is retired',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-11','2027-05-13')
 await h.pool.query("CREATE FUNCTION replacement_insert_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.purpose='booking' THEN RAISE EXCEPTION 'injected replacement insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER replacement_insert_failure BEFORE INSERT ON allocations FOR EACH ROW EXECUTE FUNCTION replacement_insert_failure()")
 try{await expect(requestStayChange(f.ctx,f.booking.id,1,input)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER replacement_insert_failure ON allocations; DROP FUNCTION replacement_insert_failure()')}
 expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(f.originalAllocation);expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].revision).toBe(1)
 expect(await h.rows('booking-changes')).toHaveLength(0)
})
it('secures a different physical room while retaining the original allocation as released history',async()=>{
 const f=await setup(),type=await h.seed('room-types',{name:'Replacement type',slug:'replacement-type',maxGuests:2,onSale:true,_status:'published'}),room=await h.seed('rooms',{label:'PRIVATE-REPLACEMENT-ROOM',roomType:type.id,onSale:true}),rate=(await h.rows('rate-plans'))[0]
 const {id,createdAt,updatedAt,...data}=rate;void id;void createdAt;void updatedAt
 await h.seed('rate-plans',{...data,roomType:type.id})
 const quote=await quoteStayChange(f.ctx,f.booking.id,1,{...f.quote.stay,roomTypeId:type.id});await acceptQuote(f.ctx,quote.id,quote.version)
 expect((await requestStayChange(f.ctx,f.booking.id,1,{quoteId:quote.id,version:quote.version,agreementReference:'synthetic-room-change-agreement',reason:'Guest changed room type'})).kind).toBe('completed')
 expect((await h.rows('allocations',{released:{equals:false}}))[0].room).toBe(room.id)
 expect((await h.rows('allocations',{id:{equals:f.originalAllocation.id}}))[0]).toMatchObject({released:true,room:f.originalAllocation.room,arrival:f.originalAllocation.arrival,departure:f.originalAllocation.departure})
})
it('keeps the approved action cutoff and unapproved policies closed',async()=>{
 const f=await setup(),input=await accepted(f,'2027-05-11','2027-05-13')
 const unapproved={...f.ctx,policy:{...f.ctx.policy,approvedSections:f.ctx.policy.approvedSections.filter(value=>value!=='stayChanges')}}
 await expect(requestStayChange(unapproved,f.booking.id,1,input)).rejects.toThrow()
 h.clock.set('2027-05-10T01:00:00.000Z')
 await expect(cancelBooking(f.ctx,f.booking.id,1,{agreementReference:'late-cancel-reference',reason:'Late cancellation request'})).rejects.toThrow()
 expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(f.originalAllocation)
})

it('does not let staff complete a Maya-only increase with separately recorded offline cash',async()=>{
 const f=await setup();await h.seed('rooms',{label:'PRIVATE-DIRECT-CHANGE-ROOM',roomType:f.type.id,onSale:true})
 const quote=await quoteStay(f.ctx,{stay:f.quote.stay});await acceptQuote(f.ctx,quote.id,quote.version)
 const booking=await createDirectBooking(f.ctx,{commandKey:(await h.rows('quotes',{id:{equals:quote.id}}))[0].directCommandKey!,quoteId:quote.id,version:quote.version,source:'phone',contact:f.input.contact,stayingGuest:f.input.stayingGuest,agreementReference:'synthetic-direct-agreement',collection:{method:'cash',receiptReference:'DIRECT-'+randomUUID(),evidenceReference:'synthetic-original-cashbook',amount:quote.total,receivedAt:h.clock.now()}})
 const direct={...f,booking},pending=await requestStayChange(f.ctx,booking.id,1,await accepted(direct,'2027-05-10','2027-05-13')),change=(await h.rows('booking-changes',{id:{equals:pending.changeId}}))[0]
 const cash=await recordOfflineCollection(f.ctx,{bookingId:booking.id,expectedRevision:1,method:'cash',receiptReference:'SEPARATE-'+randomUUID(),evidenceReference:'synthetic-extra-cashbook',amount:{minor:'10000',currency:'PHP'},receivedAt:h.clock.now()})
 await expect(f.ctx.uow.run(f.ctx.actor,async tx=>{const quote=change.acceptedQuote as AcceptedQuote,room=await replacementRoom(tx,f.ctx,booking,quote);return completeStayChangeTx(tx,f.ctx,booking,change,quote,room!,cash)})).rejects.toThrow()
 expect((await h.rows('bookings',{id:{equals:booking.id}}))[0].revision).toBe(1)
 expect((await h.rows('payment-transactions',{id:{equals:cash.id}}))[0].appliedRevision).toBeNull()
})
it('serializes an incremental extension against a website booking for its additional night',async()=>{
 const f=await setup(),pending=await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-10','2027-05-13')),attempt=(await h.rows('payment-attempts',{id:{equals:pending.attemptId}}))[0]
 const web=await quoteStay(f.guestCtx,{stay:{...f.quote.stay,arrival:'2027-05-12',departure:'2027-05-13'}});await acceptQuote(f.guestCtx,web.id,web.version)
 const observation=await signedObservation(f.worker,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'100.00',currency:'PHP'})
 const [extra,website]=await Promise.all([applyPaymentObservation(f.worker,observation),startCheckout(f.guestCtx,{...f.input,commandKey:randomUUID(),quoteId:web.id,version:web.version})])
 const booking=(await h.rows('bookings',{id:{equals:f.booking.id}}))[0],allocations=await h.rows('allocations',{released:{equals:false}})
 if(booking.revision===2){expect(extra.state).toBe('confirmed');expect(website.state).toBe('rejected');expect(allocations).toHaveLength(1)}
 else{expect(booking).toMatchObject({status:'confirmed',revision:1,arrival:f.booking.arrival,departure:f.booking.departure});expect(extra.state).toBe('issue');expect(website.state).toBe('preparing');expect(allocations).toHaveLength(2)}
 for(let i=0;i<allocations.length;i++)for(let j=i+1;j<allocations.length;j++)expect(allocations[i].room!==allocations[j].room||allocations[i].departure<=allocations[j].arrival||allocations[j].departure<=allocations[i].arrival).toBe(true)
 expect(await h.rows('payment-transactions',{attempt:{equals:attempt.id},status:{equals:'collected'}})).toHaveLength(1)
})

it('records extra original-attempt money as an issue after a real committed revision',async()=>{
 const f=await setup(),attempt=(await h.rows('payment-attempts'))[0]
 await requestStayChange(f.ctx,f.booking.id,1,await accepted(f,'2027-05-11','2027-05-13'))
 const before=(await h.rows('allocations',{released:{equals:false}}))[0],extra=await applyPaymentObservation(f.worker,await signedObservation(f.worker,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'200.00',currency:'PHP'}))
 expect(extra.state).toBe('issue');expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].revision).toBe(2)
 expect((await h.rows('allocations',{released:{equals:false}}))[0]).toEqual(before)
 expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(2)
 expect(await h.rows('payment-transactions',{appliedRevision:{exists:true}})).toHaveLength(1)
})

it('refuses to turn an unreviewed legacy confirmation into a newly funded revision',async()=>{
 const f=await setup(),room=await h.seed('rooms',{label:'PRIVATE-LEGACY-CHANGE-ROOM',roomType:f.type.id,onSale:true}),quote=await quoteStay(f.guestCtx,{stay:f.quote.stay}),accepted=await acceptQuote(f.guestCtx,quote.id,quote.version)
 const legacy=await h.seed('bookings',{checkoutKey:randomUUID(),checkoutFingerprint:privateDigest('synthetic-legacy-command'),checkoutBrowserHash:privateDigest('synthetic-legacy-browser'),checkoutQuote:quote.id,preparedAt:h.clock.now(),code:'ACN-LEGACY-FIXTURE',status:'confirmed',revision:1,arrival:f.booking.arrival,departure:f.booking.departure,acceptedQuote:accepted,source:'website',contact:f.input.contact,stayingGuest:f.input.stayingGuest})
 await f.worker.uow.run(f.worker.actor,tx=>tx.payload.update({collection:'quotes',id:quote.id,data:{consumedByBooking:legacy.id},req:tx.req,overrideAccess:false}))
 await h.seed('allocations',{room:room.id,booking:legacy.id,arrival:legacy.arrival,departure:legacy.departure,purpose:'booking',released:false})
 await h.seed('payment-transactions',{booking:legacy.id,providerPaymentId:randomUUID(),environment:'sandbox',amountMinor:'20000',currency:'PHP',status:'collected',collectedAt:h.clock.now()})
 await expect(quoteStayChange(f.ctx,legacy.id,1,{...f.quote.stay,arrival:'2027-05-11',departure:'2027-05-13'})).rejects.toThrow()
 expect((await h.rows('bookings',{id:{equals:legacy.id}}))[0].revision).toBe(1)
})
