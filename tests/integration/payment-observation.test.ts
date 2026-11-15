import {randomUUID} from 'node:crypto'
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import {signedObservation,merchantGatewayFor} from '../support/payment-observation'
import {claimWork,beginWork} from '@/domain/work/claim'
import {completeWork} from '@/domain/work/complete'
import {paymentObservationHandler} from '@/domain/payments/observation-work'
import {release} from '@/domain/inventory/allocate'
import {releaseOffer} from '@/domain/offers/release'
import {publishOffer} from '@/domain/offers/publication'
import {syntheticOfferTerms} from '../support/offer-fixtures'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {startCheckout} from '@/domain/bookings/start-checkout'
import {issueCheckoutAccess,readCheckoutStatus} from '@/features/booking/status'
import {retrieveMayaDeliveries} from '@/integrations/maya/signature'
import {ingestMayaDelivery} from '@/domain/payments/inbox'
import type {MayaGateway} from '@/integrations/maya/types'
import {dispatchCheckout} from '@/domain/payments/create-checkout'
import {applyPaymentObservation} from '@/domain/payments/observe'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()})
beforeEach(async()=>{await h.reset()})
afterAll(async()=>{await h?.reset();await h?.close()})
async function setup(options:Parameters<typeof checkoutFixture>[1]={}){const fixture=await checkoutFixture(h,options),ctx={...fixture.worker,actor:{kind:'system' as const,purpose:'payments' as const}},attempt=(await h.rows('payment-attempts'))[0];return {...fixture,publicCtx:fixture.ctx,ctx,attempt}}
const packet=(reference:string,overrides:Record<string,unknown>={})=>({id:randomUUID(),requestReferenceNumber:reference,status:'PAYMENT_SUCCESS',amount:'200.00',currency:'PHP',...overrides})
it('confirms once and records an extra actual collection as an issue',async()=>{
  const f=await setup(),first=await signedObservation(f.ctx,packet(f.attempt.merchantReference))
  expect((await applyPaymentObservation(f.ctx,first)).state).toBe('confirmed')
  expect((await applyPaymentObservation(f.ctx,first)).state).toBe('duplicate')
  const second=await signedObservation(f.ctx,packet(f.attempt.merchantReference))
  expect((await applyPaymentObservation(f.ctx,second)).state).toBe('issue')
  expect(await h.rows('bookings',{status:{equals:'confirmed'}})).toHaveLength(1)
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(2)
  expect(await h.rows('payment-issues',{state:{equals:'open'}})).toHaveLength(1)
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
  expect(await h.rows('work-items',{semanticKey:{equals:'booking-confirmation:'+f.receipt.bookingId+':1'}})).toHaveLength(1)
})
it('does not fulfill authentication or authorization and never lets an older failure undo collected money',async()=>{
  const f=await setup(),id=randomUUID()
  for(const status of ['AUTH_SUCCESS','AUTHORIZED','DONE','CAPTURED']){
    await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{id,status})))
    expect((await h.rows('bookings'))[0].status).toBe('held')
  }
  await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{id})))
  await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{id,status:'PAYMENT_FAILED'})))
  expect((await h.rows('bookings'))[0].status).toBe('confirmed')
  expect((await h.rows('payment-transactions'))[0].status).toBe('collected')
  expect((await h.rows('payment-attempts'))[0].state).toBe('succeeded')
})
it('records incompatible collected amounts and currencies without falsely confirming the accepted stay',async()=>{
  const f=await setup()
  for(const changed of [{amount:'199.99'},{currency:'USD'},{requestReferenceNumber:'OTHER_REFERENCE'}]){
    expect((await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,changed)))).state).toBe('issue')
  }
  expect((await h.rows('bookings'))[0].status).toBe('held')
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(3)
  expect(await h.rows('payment-issues',{state:{equals:'open'}})).toHaveLength(3)
})
it('serializes simultaneous observations and rolls every confirmation effect back on audit failure',async()=>{
  const f=await setup(),event=await signedObservation(f.ctx,packet(f.attempt.merchantReference))
  await h.pool.query("CREATE FUNCTION observation_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='payment:confirmed' THEN RAISE EXCEPTION 'injected confirmation failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER observation_test_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION observation_test_failure()")
  try{
    await expect(applyPaymentObservation(f.ctx,event)).rejects.toThrow()
    expect((await h.rows('bookings'))[0].status).toBe('held');expect(await h.rows('payment-transactions')).toHaveLength(0)
    expect((await h.rows('payment-inbox'))[0].state).toBe('pending')
  }finally{await h.pool.query('DROP TRIGGER observation_test_failure ON audit_entries; DROP FUNCTION observation_test_failure()')}
  const settled=await Promise.allSettled([applyPaymentObservation(f.ctx,event),applyPaymentObservation(f.ctx,event)])
  const results=settled.map(result=>{if(result.status==='rejected')throw result.reason;return result.value})
  expect(results.map(x=>x.state).sort()).toEqual(['confirmed','duplicate'])
  expect(await h.rows('payment-transactions')).toHaveLength(1)
})
it('refuses public/staff authority even when the inbox identity is known',async()=>{
  const f=await setup(),event=await signedObservation(f.ctx,packet(f.attempt.merchantReference))
  await expect(applyPaymentObservation({...f.ctx,actor:{kind:'anonymous'}},event)).rejects.toThrow()
  await expect(applyPaymentObservation({...f.ctx,actor:{kind:'system',purpose:'email'}},event)).rejects.toThrow()
  expect(await h.rows('payment-transactions')).toHaveLength(0)
})

async function closeAndRelease(f:Awaited<ReturnType<typeof setup>>,status:'expired'|'cancelled'='expired'){
  await h.uow.run(f.ctx.actor,async tx=>{
    await tx.payload.update({collection:'payment-attempts',id:f.attempt.id,data:{state:'closed'},req:tx.req,overrideAccess:false})
    await tx.payload.update({collection:'bookings',id:f.receipt.bookingId,data:{status},req:tx.req,overrideAccess:false})
    const held=(await tx.payload.find({collection:'allocations',where:{booking:{equals:f.receipt.bookingId}},req:tx.req,overrideAccess:false})).docs[0]
    await release(tx,held.id)
    if(status==='expired'){const offers=(await tx.payload.find({collection:'offer-allocations',where:{booking:{equals:f.receipt.bookingId}},req:tx.req,overrideAccess:false})).docs;for(const offer of offers)await releaseOffer(tx,offer.id,'expired-unpaid',h.clock.now())}
  })
}
it('keeps cancelled and superseded operations closed while preserving their collected funds',async()=>{
  const f=await setup();await closeAndRelease(f,'cancelled')
  const result=await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference)))
  expect(result.state).toBe('issue');expect((await h.rows('bookings'))[0].status).toBe('cancelled')
  expect((await h.rows('payment-attempts'))[0].state).toBe('closed')
  expect((await h.rows('payment-transactions'))[0].status).toBe('collected')
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(0)
})
it('reacquires a released room only under the original approved late policy',async()=>{
  const f=await setup({latePayment:'confirm-if-available'});await closeAndRelease(f)
  h.clock.set(new Date(Date.parse(f.attempt.deadline)+60000).toISOString())
  const result=await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference)))
  expect(result.state).toBe('confirmed')
  expect(await h.rows('allocations')).toHaveLength(2)
  expect(await h.rows('allocations',{released:{equals:false},purpose:{equals:'booking'}})).toHaveLength(1)
  expect((await h.rows('payment-attempts'))[0].deadline).toBe(f.attempt.deadline)
})
it('does not allocate a late paid stay over another reservation or infer late policy approval',async()=>{
  const f=await setup();await closeAndRelease(f)
  h.clock.set(new Date(Date.parse(f.attempt.deadline)+60000).toISOString())
  expect((await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference)))).state).toBe('issue')
  expect((await h.rows('bookings'))[0].status).toBe('expired')
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(0)
})
it('does not confirm a future-dated provider collection even when late confirmation is enabled',async()=>{
  const f=await setup({latePayment:'confirm-if-available'})
  const result=await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{paymentAt:'2028-01-01T00:00:00Z'})))
  expect(result.state).toBe('issue');expect((await h.rows('bookings'))[0].status).toBe('held')
  expect((await h.rows('payment-transactions'))[0].status).toBe('collected')
})
it('binds one actual collection after later authenticated evidence supplies the missing reference',async()=>{
  const f=await setup(),id=randomUUID(),unmatched=packet(f.attempt.merchantReference,{id});delete (unmatched as Record<string,unknown>).requestReferenceNumber
  expect((await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,unmatched,{merchantVerified:false}))).state).toBe('recorded')
  expect((await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{id})))).state).toBe('confirmed')
  expect(await h.rows('payment-transactions')).toHaveLength(1)
})
it('fences a stale processing lease before any canonical payment effects',async()=>{
  const f=await setup(),value=packet(f.attempt.merchantReference);await signedObservation(f.ctx,value)
  const worker={...f.ctx,actor:{kind:'system' as const,purpose:'work' as const}},handler=paymentObservationHandler(merchantGatewayFor(value))
  const first=(await claimWork(worker,'payment-observation'))!;await beginWork(worker,first)
  const result=await handler.execute(worker,first,new AbortController().signal)
  expect(await h.rows('payment-transactions')).toHaveLength(0)
  h.clock.set(new Date(Date.parse(first.expiresAt)+1).toISOString())
  await expect(completeWork(worker,first,result)).rejects.toThrow('stale')
  expect(await h.rows('payment-transactions')).toHaveLength(0)
  const next=(await claimWork(worker,'payment-observation'))!;await beginWork(worker,next)
  await completeWork(worker,next,await handler.execute(worker,next,new AbortController().signal))
  expect((await h.rows('bookings'))[0].status).toBe('confirmed')
})
it('protects collected money, application revision, successful attempts and booking codes in SQL',async()=>{
  const f=await setup();await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference)))
  const payment=(await h.rows('payment-transactions'))[0]
  for(const query of ["UPDATE payment_transactions SET amount_minor='1' WHERE id=$1","UPDATE payment_transactions SET status='failed' WHERE id=$1","UPDATE payment_transactions SET applied_revision=NULL WHERE id=$1"]){await expect(h.pool.query(query,[payment.id])).rejects.toThrow()}
  await expect(h.pool.query("UPDATE payment_attempts SET state='closed' WHERE id=$1",[f.attempt.id])).rejects.toThrow()
  await expect(h.pool.query("UPDATE bookings SET code='REPLACED' WHERE id=$1",[f.receipt.bookingId])).rejects.toThrow()
})

async function prepareAnother(f:Awaited<ReturnType<typeof setup>>,offerVersionId?:string){
  const quote=await quoteStay(f.publicCtx,{stay:f.quote.stay,...(offerVersionId?{offerVersionId}:{})})
  await acceptQuote(f.publicCtx,quote.id,quote.version)
  const input={...f.input,commandKey:randomUUID(),quoteId:quote.id,version:quote.version}
  const receipt=await startCheckout(f.publicCtx,input)
  if(receipt.state==='rejected')throw new Error('Additional fixture checkout rejected: '+receipt.code)
  const attempt=(await h.rows('payment-attempts',{booking:{equals:receipt.bookingId}}))[0]
  return {...f,receipt,attempt,quote,input}
}
it('keeps superseded revisions closed and surfaces unknown statuses without inventing collection',async()=>{
  const f=await setup();await closeAndRelease(f)
  await h.pool.query('UPDATE bookings SET revision=2 WHERE id=$1',[f.receipt.bookingId])
  expect((await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference)))).state).toBe('issue')
  expect((await h.rows('bookings'))[0].status).toBe('expired')
  expect((await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{status:'UNRECOGNIZED'})))).state).toBe('issue')
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(1)
})
it('preserves the paid exception when another allocation occupies the released room',async()=>{
  const f=await setup({latePayment:'confirm-if-available'});await closeAndRelease(f)
  const released=(await h.rows('allocations'))[0]
  await h.seed('allocations',{room:released.room as string,arrival:released.arrival,departure:released.departure,purpose:'block',released:false})
  h.clock.set(new Date(Date.parse(f.attempt.deadline)+60000).toISOString())
  expect((await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference)))).state).toBe('issue')
  expect((await h.rows('payment-issues'))[0].reasonCode).toBe('paid-room-unavailable')
  expect((await h.rows('bookings'))[0].status).toBe('expired')
})
it('races late confirmations for the last physical room without losing either actual collection',async()=>{
  const f=await setup({latePayment:'confirm-if-available'});await closeAndRelease(f)
  const next=await prepareAnother(f);await closeAndRelease(next)
  h.clock.set(new Date(Date.parse(next.attempt.deadline)+60000).toISOString())
  const events=await Promise.all([signedObservation(f.ctx,packet(f.attempt.merchantReference)),signedObservation(next.ctx,packet(next.attempt.merchantReference))])
  const settled=await Promise.allSettled(events.map(event=>applyPaymentObservation(f.ctx,event)))
  const results=settled.map(result=>{if(result.status==='rejected')throw result.reason;return result.value})
  expect(results.map(x=>x.state).sort()).toEqual(['confirmed','issue'])
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(2)
  expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
})
it('reacquires a released account offer once while competing late payments have two available rooms',async()=>{
  const f=await setup({customer:true,latePayment:'confirm-if-available'})
  for(const label of ['PRIVATE-OFFER-RACE-B','PRIVATE-OFFER-RACE-C'])await h.seed('rooms',{label,roomType:f.type.id,onSale:true})
  const staff=await h.seed('staff-users',{name:'Offer operator fixture',email:'late-offer-operator@example.test',password:'Synthetic-late-offer-passphrase-946!',role:'developer'})
  const version=await publishOffer({...f.ctx,actor:{kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}},{name:'Late offer fixture',terms:syntheticOfferTerms(),approvalReference:'synthetic-late-offer-terms'})
  const first=await prepareAnother(f,version.id)
  h.clock.set(new Date(Date.parse(first.attempt.deadline)+1).toISOString());await closeAndRelease(first)
  const second=await prepareAnother(f,version.id)
  h.clock.set(new Date(Date.parse(second.attempt.deadline)+1).toISOString());await closeAndRelease(second)
  const original=(await h.rows('offer-allocations')).map(row=>row.id)
  const events=await Promise.all([signedObservation(f.ctx,packet(first.attempt.merchantReference,{amount:'185.00'})),signedObservation(f.ctx,packet(second.attempt.merchantReference,{amount:'185.00'}))])
  const settled=await Promise.allSettled(events.map(event=>applyPaymentObservation(f.ctx,event)))
  const results=settled.map(result=>{if(result.status==='rejected')throw result.reason;return result.value})
  expect(results.map(x=>x.state).sort()).toEqual(['confirmed','issue'])
  const usages=await h.rows('offer-allocations')
  expect(usages.filter(row=>original.includes(row.id)).every(row=>row.state==='released')).toBe(true)
  expect(usages.filter(row=>row.state==='consumed')).toHaveLength(1)
  expect(usages.filter(row=>row.state==='consumed')[0].allocationKey).toMatch(/^late-payment:/)
  expect(await h.rows('allocations',{booking:{in:[first.receipt.bookingId,second.receipt.bookingId]},released:{equals:false}})).toHaveLength(1)
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(2)
})

it('requires an applied collection before a private status projection can report paid confirmation',async()=>{
  const f=await setup();await closeAndRelease(f,'cancelled')
  await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference)))
  await h.pool.query("UPDATE bookings SET status='confirmed' WHERE id=$1",[f.receipt.bookingId])
  const access=await issueCheckoutAccess(f.publicCtx,f.receipt.bookingId)
  expect((await readCheckoutStatus(f.publicCtx,access.capability)).state).toBe('checking')
})

it('deduplicates simultaneous webhook and trusted retrieval then records every extra reference payment',async()=>{
  const f=await setup(),id=randomUUID(),event=await signedObservation(f.ctx,packet(f.attempt.merchantReference,{id}),{merchantVerified:false})
  const unavailable=async()=>{throw new Error('Unexpected outbound money call')}
  let reads=0
  const gateway:MayaGateway={createCheckout:unavailable,retrievePayment:unavailable,voidPayment:unavailable,refundPayment:unavailable,findPaymentsByReference:async()=>{reads++;return [{id,reference:f.attempt.merchantReference,environment:'sandbox',amount:{minor:'20000',currency:'PHP'},status:'PAYMENT_SUCCESS',method:null,paidAt:null,canVoid:false,canRefund:false}]}}
  const delivery=(await retrieveMayaDeliveries(gateway,f.attempt.merchantReference,'sandbox',f.ctx.clock.now))[0]
  const retrieved={inboxId:await ingestMayaDelivery(f.ctx,delivery)}
  expect(retrieved.inboxId).not.toBe(event.inboxId)
  const settled=await Promise.allSettled([applyPaymentObservation(f.ctx,event),applyPaymentObservation(f.ctx,retrieved)])
  const results=settled.map(result=>{if(result.status==='rejected')throw result.reason;return result.value})
  expect(results.map(value=>value.state).sort()).toEqual(['confirmed','recorded'])
  expect(reads).toBe(1);expect(await h.rows('payment-transactions')).toHaveLength(1)
  expect(await h.rows('payment-issues')).toHaveLength(0)
})

function noMoneyGateway(onCreate:()=>void):MayaGateway{const unavailable=async()=>{throw new Error('Unexpected provider read')};return {createCheckout:async()=>{onCreate();return {kind:'refused',reason:'provider-authentication'}},retrievePayment:unavailable,findPaymentsByReference:unavailable,voidPayment:unavailable,refundPayment:unavailable}}
it('does not create another checkout after an incompatible actual collection has been observed',async()=>{
  const f=await setup();await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{amount:'1.00'})))
  let creates=0
  const lease=(await claimWork(f.worker,'create-checkout'))!;await beginWork(f.worker,lease)
  await expect(dispatchCheckout(f.worker,lease,noMoneyGateway(()=>{creates++}))).rejects.toThrow()
  expect(creates).toBe(0)
})
it('rechecks canonical observation ownership immediately before an external create call',async()=>{
  const f=await setup(),event=await signedObservation(f.ctx,packet(f.attempt.merchantReference))
  const lease=(await claimWork(f.worker,'create-checkout'))!;await beginWork(f.worker,lease)
  let injected=false,creates=0
  const worker={...f.worker,uow:{run:async<T>(actor:Parameters<typeof f.worker.uow.run>[0],work:Parameters<typeof f.worker.uow.run<T>>[1])=>{
    const result=await f.worker.uow.run(actor,work)
    if(!injected){injected=true;await applyPaymentObservation(f.ctx,event)}
    return result
  }}}
  await dispatchCheckout(worker,lease,noMoneyGateway(()=>{creates++}))
  expect(creates).toBe(0)
  expect((await h.rows('bookings'))[0].status).toBe('confirmed')
})
it('never treats a platform signature alone as proof of money belonging to this merchant',async()=>{
  const f=await setup(),packetValue=packet(f.attempt.merchantReference)
  const {verifyMayaDelivery}=await import('@/integrations/maya/signature')
  const {config,keys}=await import('../support/maya-delivery')
  const {sign}=await import('node:crypto')
  const nonce='abcdef1234567890abcdef1234567890',canonical=Object.entries(packetValue).map(([key,value])=>key+'='+String(value)).sort().join('&')+'&nonce='+nonce
  const delivery=verifyMayaDelivery(Buffer.from(JSON.stringify(packetValue)),new Headers({'x-maya-webhook-timestamp':String(Date.parse(f.ctx.clock.now())),'x-maya-webhook-signature':'nonce='+nonce+',v1='+sign('RSA-SHA256',Buffer.from(canonical),keys[0].privateKey).toString('hex')}),config,f.ctx.clock.now())
  const inboxId=await ingestMayaDelivery(f.ctx,delivery)
  expect((await applyPaymentObservation(f.ctx,{inboxId})).state).toBe('recorded')
  expect(await h.rows('payment-transactions')).toHaveLength(0)
  expect((await h.rows('bookings'))[0].status).toBe('held')
})
it('does not fulfill an older success after authenticated reversal evidence is already known',async()=>{
  const f=await setup(),id=randomUUID()
  await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{id,status:'REFUNDED'})))
  expect((await applyPaymentObservation(f.ctx,await signedObservation(f.ctx,packet(f.attempt.merchantReference,{id})))).state).toBe('issue')
  expect((await h.rows('bookings'))[0].status).toBe('held')
  expect((await h.rows('payment-transactions'))[0].status).toBe('collected')
})
it('blocks provider creation while merchant-verified evidence is awaiting canonical processing',async()=>{
  const f=await setup();await signedObservation(f.ctx,packet(f.attempt.merchantReference))
  const lease=(await claimWork(f.worker,'create-checkout'))!;await beginWork(f.worker,lease)
  let creates=0;await dispatchCheckout(f.worker,lease,noMoneyGateway(()=>{creates++}))
  expect(creates).toBe(0);expect((await h.rows('bookings'))[0].status).toBe('held')
})
it('does not credit a signed foreign payment when this merchant reports only an unpaid operation',async()=>{
  const f=await setup(),foreignId=randomUUID(),ownId=randomUUID()
  await signedObservation(f.ctx,packet(f.attempt.merchantReference,{id:foreignId}),{merchantVerified:false})
  const handler=paymentObservationHandler(merchantGatewayFor(packet(f.attempt.merchantReference,{id:ownId,status:'PENDING_PAYMENT'})))
  const lease=(await claimWork(f.worker,'payment-observation'))!;await beginWork(f.worker,lease)
  await completeWork(f.worker,lease,await handler.execute(f.worker,lease,new AbortController().signal))
  expect((await h.rows('bookings'))[0].status).toBe('held')
  expect(await h.rows('payment-transactions',{status:{equals:'collected'}})).toHaveLength(0)
  expect((await h.rows('payment-transactions'))[0].providerPaymentId).toBe(ownId)
  expect((await h.rows('work-items',{id:{equals:lease.id}}))[0].state).toBe('ready')
  expect((await h.rows('payment-inbox',{providerPaymentId:{equals:foreignId}}))[0].state).toBe('pending')
})
