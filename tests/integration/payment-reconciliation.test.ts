import {randomUUID} from 'node:crypto'
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import type {MayaGateway,ProviderPayment} from '@/integrations/maya/types'
import {claimWork,beginWork} from '@/domain/work/claim'
import {completeWork} from '@/domain/work/complete'
import {dispatchCheckout} from '@/domain/payments/create-checkout'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {startCheckout} from '@/domain/bookings/start-checkout'
import {issueCheckoutAccess,readCheckoutStatus,checkoutDestination,requestCheckoutResume} from '@/features/booking/status'
import {reconcileAttempt,closeAttempt} from '@/domain/payments/reconcile'
import {expiryHandler} from '@/domain/payments/expire'
import {publishOffer} from '@/domain/offers/publication'
import {syntheticOfferTerms} from '../support/offer-fixtures'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()})
beforeEach(async()=>{await h.reset()})
afterAll(async()=>{await h?.reset();await h?.close()})
async function setup(unknown=false,options:Parameters<typeof checkoutFixture>[1]={}){
  const fixture=await checkoutFixture(h,options),id=randomUUID(),attempt=(await h.rows('payment-attempts'))[0]
  let creates=0,reference:ProviderPayment[]=[],root:ProviderPayment|undefined
  const gateway:MayaGateway={createCheckout:async()=>{creates++;return unknown?{kind:'unknown',environment:'sandbox',reference:attempt.merchantReference}:{kind:'created',environment:'sandbox',checkoutId:id,checkoutUrl:'https://payments-web-sandbox.paymaya.com/v2/checkout?id='+id}},findPaymentsByReference:async()=>reference,retrievePayment:async value=>{if(!root||root.id!==value)throw new Error('Unknown payment');return root},voidPayment:async()=>{throw new Error('Unexpected money operation')},refundPayment:async()=>{throw new Error('Unexpected money operation')}}
  const lease=(await claimWork(fixture.worker,'create-checkout'))!;await beginWork(fixture.worker,lease)
  await completeWork(fixture.worker,lease,await dispatchCheckout(fixture.worker,lease,gateway))
  const ctx={...fixture.worker,actor:{kind:'system' as const,purpose:'payments' as const}}
  const payment=(status:string,overrides:Partial<ProviderPayment>={}):ProviderPayment=>({id,environment:'sandbox',reference:attempt.merchantReference,amount:{minor:'20000',currency:'PHP'},status,method:'card',paidAt:null,canVoid:false,canRefund:false,...overrides})
  return {...fixture,publicCtx:fixture.ctx,ctx,id,attempt,gateway,creates:()=>creates,payment,setReference:(value:ProviderPayment[])=>{reference=value},setRoot:(value:ProviderPayment)=>{root=value}}
}
it('does not refresh the deadline or retry an unknown creation',async()=>{
  const f=await setup(true),before=(await h.rows('payment-attempts'))[0]
  h.clock.set(new Date(Date.parse(before.deadline)+1).toISOString())
  expect((await reconcileAttempt(f.ctx,before.id,f.gateway)).state).toBe('checking')
  expect((await h.rows('payment-attempts'))[0].deadline).toBe(before.deadline)
  expect(f.creates()).toBe(1)
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
})
it('confirms a delayed actual collection through the same canonical merchant processor',async()=>{
  const f=await setup();f.setReference([f.payment('PAYMENT_SUCCESS')]);f.setRoot(f.payment('PAYMENT_SUCCESS'))
  expect((await reconcileAttempt(f.ctx,f.attempt.id,f.gateway)).state).toBe('confirmed')
  expect((await h.rows('bookings'))[0].status).toBe('confirmed')
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(1)
  expect(f.creates()).toBe(1)
})
it('closes only an authoritatively expired original provider checkout and releases its whole-stay room',async()=>{
  const f=await setup();f.setRoot(f.payment('PAYMENT_EXPIRED'));f.setReference([f.payment('PAYMENT_EXPIRED')])
  h.clock.set(new Date(Date.parse(f.attempt.deadline)+1).toISOString())
  expect((await closeAttempt(f.ctx,f.attempt.id,f.gateway)).state).toBe('closed')
  expect((await h.rows('bookings'))[0].status).toBe('expired')
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(0)
  expect(f.creates()).toBe(1)
})
it('does not release a checkout that remains payable after the local deadline',async()=>{
  const f=await setup();f.setRoot(f.payment('PENDING_TOKEN'));f.setReference([f.payment('PENDING_TOKEN')])
  h.clock.set(new Date(Date.parse(f.attempt.deadline)+1).toISOString())
  expect((await closeAttempt(f.ctx,f.attempt.id,f.gateway)).state).toBe('checking')
  expect((await h.rows('bookings'))[0].status).toBe('held')
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
})
it('records every actual collection returned for a reference without double fulfillment',async()=>{
  const f=await setup();f.setReference([f.payment('PAYMENT_SUCCESS'),f.payment('PAYMENT_SUCCESS',{id:randomUUID()})]);f.setRoot(f.payment('PAYMENT_SUCCESS'))
  await reconcileAttempt(f.ctx,f.attempt.id,f.gateway)
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(2)
  expect(await h.rows('bookings',{status:{equals:'confirmed'}})).toHaveLength(1)
  expect(await h.rows('payment-issues',{state:{equals:'open'}})).toHaveLength(1)
})

it('limits another active browser hold while preserving the original command retry',async()=>{
  const f=await checkoutFixture(h,{recovery:{maxOpenHolds:1}})
  await h.seed('rooms',{label:'PRIVATE-SECOND-LIMIT-ROOM',roomType:f.type.id,onSale:true})
  expect((await startCheckout(f.ctx,f.input)).state).toBe('preparing')
  const quote=await quoteStay(f.ctx,{stay:f.quote.stay});await acceptQuote(f.ctx,quote.id,quote.version)
  expect(await startCheckout(f.ctx,{...f.input,commandKey:randomUUID(),quoteId:quote.id,version:quote.version})).toEqual({state:'rejected',code:'hold-limit'})
  expect(await h.rows('bookings')).toHaveLength(1)
})
it('does not send a checkout when the original deadline cannot contain the verified provider window',async()=>{
  const f=await checkoutFixture(h);h.clock.set(new Date(Date.parse(f.receipt.deadline!)-30000).toISOString())
  let creates=0;const unavailable=async()=>{throw new Error('Unexpected operation')}
  const gateway:MayaGateway={createCheckout:async()=>{creates++;return {kind:'refused',reason:'provider-authentication'}},retrievePayment:unavailable,findPaymentsByReference:unavailable,voidPayment:unavailable,refundPayment:unavailable}
  const lease=(await claimWork(f.worker,'create-checkout'))!;await beginWork(f.worker,lease)
  await completeWork(f.worker,lease,await dispatchCheckout(f.worker,lease,gateway))
  expect(creates).toBe(0)
  expect((await h.rows('payment-attempts'))[0].createOutcome).toBe('refused')
})
it('releases a never-dispatched expired hold atomically without assuming an empty provider lookup proves closure',async()=>{
  const f=await checkoutFixture(h);h.clock.set(new Date(Date.parse(f.receipt.deadline!)+1).toISOString())
  const ctx={...f.worker,actor:{kind:'system' as const,purpose:'payments' as const}}
  expect((await closeAttempt(ctx,f.receipt.attemptId!)).state).toBe('closed')
  expect((await h.rows('payment-attempts'))[0].closeEvidence).toMatchObject({kind:'never-dispatched'})
  expect((await h.rows('work-items',{semanticKey:{equals:'checkout:'+f.receipt.attemptId}}))[0].state).toBe('done')
})
it('escalates uncertainty without releasing the room or inventing an actual collection',async()=>{
  const f=await setup(true);h.clock.set(new Date(Date.parse(f.attempt.deadline)+31*60000).toISOString())
  expect((await reconcileAttempt(f.ctx,f.attempt.id,f.gateway)).state).toBe('escalated')
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
  expect(await h.rows('payment-transactions')).toHaveLength(0)
  expect((await h.rows('payment-issues'))[0]).toMatchObject({reasonCode:'payment-uncertain',payment:null})
})
it('recovers an unknown checkout identity from exact merchant evidence without inventing a payment URL',async()=>{
  const f=await setup(true);f.setReference([f.payment('PAYMENT_EXPIRED')]);f.setRoot(f.payment('PAYMENT_EXPIRED'))
  h.clock.set(new Date(Date.parse(f.attempt.deadline)+1).toISOString())
  expect((await closeAttempt(f.ctx,f.attempt.id,f.gateway)).state).toBe('closed')
  const attempt=(await h.rows('payment-attempts'))[0]
  expect(attempt.providerCheckoutId).toBe(f.id);expect(attempt.checkoutUrl).toBeNull()
  expect(attempt.closeEvidence).toMatchObject({kind:'provider-terminal',paymentId:f.id})
  expect(f.creates()).toBe(1)
})
it('keeps the original ready checkout usable when an expected unpaid provider session is verified',async()=>{
  const f=await setup();f.setReference([f.payment('PENDING_TOKEN')]);f.setRoot(f.payment('PENDING_TOKEN'))
  await reconcileAttempt(f.ctx,f.attempt.id,f.gateway)
  expect((await h.rows('payment-attempts'))[0].state).toBe('ready')
  expect((await h.rows('payment-attempts'))[0].deadline).toBe(f.attempt.deadline)
})
it('closes a known creation refusal without treating an arbitrary closed flag as proof',async()=>{
  const f=await checkoutFixture(h),unavailable=async()=>{throw new Error('Unexpected provider call')}
  const gateway:MayaGateway={createCheckout:async()=>({kind:'refused',reason:'provider-authentication'}),retrievePayment:unavailable,findPaymentsByReference:unavailable,voidPayment:unavailable,refundPayment:unavailable}
  const lease=(await claimWork(f.worker,'create-checkout'))!;await beginWork(f.worker,lease)
  await completeWork(f.worker,lease,await dispatchCheckout(f.worker,lease,gateway))
  h.clock.set(new Date(Date.parse(f.receipt.deadline!)+1).toISOString())
  expect((await closeAttempt({...f.worker,actor:{kind:'system',purpose:'payments'}},f.receipt.attemptId!,gateway)).state).toBe('closed')
  expect((await h.rows('payment-attempts'))[0].closeEvidence).toMatchObject({kind:'definite-refusal'})
})

it('reopens only the original link after an explicit request and fresh unstarted-session merchant evidence',async()=>{
  const f=await setup(),access=await issueCheckoutAccess(f.publicCtx,f.receipt.bookingId)
  await checkoutDestination(f.publicCtx,access.capability,f.receipt.bookingId)
  f.setRoot(f.payment('PENDING_TOKEN'));f.setReference([f.payment('PENDING_TOKEN')])
  await requestCheckoutResume(f.publicCtx,access.capability,f.receipt.bookingId)
  await reconcileAttempt(f.ctx,f.attempt.id,f.gateway)
  expect((await readCheckoutStatus(f.publicCtx,access.capability)).canPay).toBe(true)
  expect((await h.rows('payment-attempts'))[0]).toMatchObject({state:'ready',resumeCount:1,deadline:f.attempt.deadline})
  expect(f.creates()).toBe(1)
})
it('does not reopen processing/unknown creation and bounds repeated private resume requests',async()=>{
  const f=await setup(),access=await issueCheckoutAccess(f.publicCtx,f.receipt.bookingId)
  await checkoutDestination(f.publicCtx,access.capability,f.receipt.bookingId)
  f.setRoot(f.payment('PAYMENT_PROCESSING'));f.setReference([f.payment('PAYMENT_PROCESSING')])
  for(let n=0;n<2;n++){await requestCheckoutResume(f.publicCtx,access.capability,f.receipt.bookingId);await reconcileAttempt(f.ctx,f.attempt.id,f.gateway);expect((await readCheckoutStatus(f.publicCtx,access.capability)).canPay).toBe(false)}
  await expect(requestCheckoutResume(f.publicCtx,access.capability,f.receipt.bookingId)).rejects.toThrow()
  expect((await h.rows('payment-attempts'))[0].resumeCount).toBe(2)
  expect(f.creates()).toBe(1)
})
it('requires the original private browser scope for a resume request',async()=>{
  const f=await setup(),access=await issueCheckoutAccess(f.publicCtx,f.receipt.bookingId)
  await checkoutDestination(f.publicCtx,access.capability,f.receipt.bookingId)
  await expect(requestCheckoutResume({...f.publicCtx,browserKey:'a'.repeat(43)},access.capability,f.receipt.bookingId)).rejects.toThrow()
  expect((await h.rows('payment-attempts'))[0].resumeCount).toBe(0)
})
it('keeps verified money when another provider read fails and retains a bounded reference sweep',async()=>{
  const f=await setup();f.setRoot(f.payment('PAYMENT_SUCCESS'))
  f.gateway.findPaymentsByReference=async()=>{throw new Error('Reference lookup temporarily unavailable')}
  expect((await reconcileAttempt(f.ctx,f.attempt.id,f.gateway)).state).toBe('confirmed')
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(1)
  expect((await h.rows('work-items')).some(row=>row.kind==='reconcile-payment'&&row.semanticKey.includes(':check:'))).toBe(true)
})

async function offerCheckout(recovery:NonNullable<Parameters<typeof checkoutFixture>[1]>["recovery"]={}){
  const f=await checkoutFixture(h,{recovery,customer:true,latePayment:'confirm-if-available'})
  await h.seed('rooms',{label:'PRIVATE-OFFER-RECOVERY-ROOM',roomType:f.type.id,onSale:true})
  const staff=await h.seed('staff-users',{name:'Recovery fixture operator',email:'recovery-operator@example.test',password:'Synthetic-recovery-passphrase-946!',role:'developer'})
  const offer=await publishOffer({...f.ctx,actor:{kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}},{name:'Recovery offer fixture',terms:syntheticOfferTerms(),approvalReference:'synthetic-recovery-offer'})
  const quote=await quoteStay(f.ctx,{stay:f.quote.stay,offerVersionId:offer.id});await acceptQuote(f.ctx,quote.id,quote.version)
  const receipt=await startCheckout(f.ctx,{...f.input,commandKey:randomUUID(),quoteId:quote.id,version:quote.version})
  if(receipt.state==='rejected')throw new Error('Offer fixture rejected')
  const attempt=(await h.rows('payment-attempts',{id:{equals:receipt.attemptId}}))[0]
  return {...f,receipt,attempt,ctx:{...f.worker,actor:{kind:'system' as const,purpose:'payments' as const}}}
}
it('releases room and account offer together and rolls both back when the expiry audit fails',async()=>{
  const f=await offerCheckout();h.clock.set(new Date(Date.parse(f.attempt.deadline)+1).toISOString())
  await h.pool.query("CREATE FUNCTION recovery_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='payment:closed-unpaid' THEN RAISE EXCEPTION 'injected expiry failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER recovery_test_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION recovery_test_failure()")
  try{await expect(closeAttempt(f.ctx,f.attempt.id)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER recovery_test_failure ON audit_entries; DROP FUNCTION recovery_test_failure()')}
  expect((await h.rows('bookings',{id:{equals:f.receipt.bookingId}}))[0].status).toBe('held')
  expect((await h.rows('payment-attempts',{id:{equals:f.attempt.id}}))[0].closedAt).toBeNull()
  expect(await h.rows('allocations',{booking:{equals:f.receipt.bookingId},released:{equals:false}})).toHaveLength(1)
  expect((await h.rows('offer-allocations',{booking:{equals:f.receipt.bookingId}}))[0].state).toBe('reserved')
  expect((await h.rows('work-items',{semanticKey:{equals:'checkout:'+f.attempt.id}}))[0].state).toBe('ready')
  expect((await closeAttempt(f.ctx,f.attempt.id)).state).toBe('closed')
  expect(await h.rows('allocations',{booking:{equals:f.receipt.bookingId},released:{equals:false}})).toHaveLength(0)
  expect((await h.rows('offer-allocations',{booking:{equals:f.receipt.bookingId}}))[0].state).toBe('released')
})
it('serializes expiry racing actual collection and reacquires the original room under the approved late policy',async()=>{
  const f=await setup(false,{latePayment:'confirm-if-available'})
  h.clock.set(new Date(Date.parse(f.attempt.deadline)+1).toISOString())
  const expired={...f.gateway,findPaymentsByReference:async()=>[f.payment('PAYMENT_EXPIRED')],retrievePayment:async()=>f.payment('PAYMENT_EXPIRED')}
  f.setRoot(f.payment('PAYMENT_SUCCESS'));f.setReference([f.payment('PAYMENT_SUCCESS')])
  await Promise.all([closeAttempt(f.ctx,f.attempt.id,expired),reconcileAttempt(f.ctx,f.attempt.id,f.gateway)])
  expect((await h.rows('bookings'))[0].status).toBe('confirmed')
  expect(await h.rows('allocations',{released:{equals:false},purpose:{equals:'booking'}})).toHaveLength(1)
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(1)
  expect((await h.rows('payment-attempts'))[0].deadline).toBe(f.attempt.deadline)
})
it('fences a crashed expiry worker after its read and safely repeats the read under a new lease',async()=>{
  const f=await setup();f.setRoot(f.payment('PAYMENT_EXPIRED'));f.setReference([f.payment('PAYMENT_EXPIRED')])
  h.clock.set(new Date(Date.parse(f.attempt.deadline)+1).toISOString())
  const handler=expiryHandler(f.gateway),first=(await claimWork(f.worker,'expire-hold'))!;await beginWork(f.worker,first)
  const stale=await handler.execute(f.worker,first,new AbortController().signal)
  h.clock.set(new Date(Date.parse(first.expiresAt)+1).toISOString())
  const second=(await claimWork(f.worker,'expire-hold'))!;expect(second.generation).toBeGreaterThan(first.generation)
  await expect(completeWork(f.worker,first,stale)).rejects.toThrow()
  expect((await h.rows('bookings'))[0].status).toBe('held');expect(await h.rows('payment-inbox')).toHaveLength(0)
  await beginWork(f.worker,second);await completeWork(f.worker,second,await handler.execute(f.worker,second,new AbortController().signal))
  expect((await h.rows('bookings'))[0].status).toBe('expired')
})
it('does not repeat a creation whose worker crashed after dispatch without committing its outcome',async()=>{
  const f=await checkoutFixture(h),lease=(await claimWork(f.worker,'create-checkout'))!;await beginWork(f.worker,lease)
  let creates=0;const unavailable=async()=>{throw new Error('Unknown original provider identity')}
  const gateway:MayaGateway={createCheckout:async()=>{creates++;return {kind:'unknown',environment:'sandbox',reference:'original'}},findPaymentsByReference:async()=>[],retrievePayment:unavailable,voidPayment:unavailable,refundPayment:unavailable}
  await dispatchCheckout(f.worker,lease,gateway)
  h.clock.set(new Date(Date.parse(lease.expiresAt)+1).toISOString())
  expect(await claimWork(f.worker,'create-checkout')).toBeNull()
  const result=await reconcileAttempt({...f.worker,actor:{kind:'system',purpose:'payments'}},f.receipt.attemptId!,gateway)
  expect(result.state).toBe('checking');expect(creates).toBe(1)
  expect((await h.rows('payment-attempts'))[0].deadline).toBe(f.receipt.deadline)
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
})

it('releases an offer before the deadline only with authoritative terminal proof and approved immediate release',async()=>{
  const f=await offerCheckout({terminalRelease:'immediate'})
  const gateway:MayaGateway={createCheckout:async()=>({kind:'refused',reason:'provider-authentication'}),findPaymentsByReference:async()=>[],retrievePayment:async()=>{throw new Error('No provider checkout exists')},voidPayment:async()=>{throw new Error('Unexpected')},refundPayment:async()=>{throw new Error('Unexpected')}}
  // Both fixture creates are due; complete them without any real provider request.
  for(let n=0;n<2;n++){const lease=(await claimWork(f.worker,'create-checkout'))!;await beginWork(f.worker,lease);await completeWork(f.worker,lease,await dispatchCheckout(f.worker,lease,gateway))}
  expect((await closeAttempt(f.ctx,f.attempt.id,gateway)).state).toBe('closed')
  expect((await h.rows('offer-allocations',{booking:{equals:f.receipt.bookingId}}))[0].state).toBe('released')
  expect(await h.rows('allocations',{booking:{equals:f.receipt.bookingId},released:{equals:false}})).toHaveLength(0)
})
