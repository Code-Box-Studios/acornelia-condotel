import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import {claimWork,beginWork} from '@/domain/work/claim'
import {completeWork} from '@/domain/work/complete'
import {dispatchCheckout} from '@/domain/payments/create-checkout'
import {checkoutDestination,issueCheckoutAccess,readCheckoutStatus} from '@/features/booking/status'
import {createBookingView} from '@/features/booking/view-access'
import {opaqueSecret} from '@/domain/security/private-state'
import type {CheckoutAttempt,CreateCheckoutResult,MayaGateway} from '@/integrations/maya/types'
import type {DbTx} from '@/domain/db/types'
import type {Principal} from '@/domain/shared/types'
import {policyFromRecord} from '@/domain/policy/current'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {startCheckout} from '@/domain/bookings/start-checkout'
import {randomUUID} from 'node:crypto'
import {setCheckoutAccess} from '@/features/booking/status-http'
const providerId='99999999-9999-4999-8999-999999999999'
function fakeGateway(result:CreateCheckoutResult={kind:'created',environment:'sandbox',checkoutId:providerId,checkoutUrl:'https://payments-web-sandbox.paymaya.com/v2/checkout?id='+providerId}){
  const calls:CheckoutAttempt[]=[],unavailable=async()=>{throw new Error('Unexpected provider operation')}
  const gateway:MayaGateway={createCheckout:async attempt=>{calls.push(attempt);return result},retrievePayment:unavailable,findPaymentsByReference:unavailable,voidPayment:unavailable,refundPayment:unavailable}
  return {calls,gateway}
}
describe('controlled checkout dispatch and private status',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-15T04:00:00Z');vi.stubEnv('APP_OPERATION_MODE','normal')})
  afterEach(()=>vi.unstubAllEnvs())
  afterAll(async()=>{await h?.close()})
  it('dispatches once outside transactions and commits a ready association only through its live work fence',async()=>{
    const fixture=await checkoutFixture(h),fake=fakeGateway(),lease=(await claimWork(fixture.worker,'create-checkout'))!
    await beginWork(fixture.worker,lease)
    let inside=0
    fixture.worker.uow={run:async<T>(actor:Principal,callback:(tx:DbTx)=>Promise<T>)=>{inside++;try{return await h.uow.run(actor,callback)}finally{inside--}}}
    const create=fake.gateway.createCheckout
    fake.gateway.createCheckout=async attempt=>{expect(inside).toBe(0);return create(attempt)}
    const result=await dispatchCheckout(fixture.worker,lease,fake.gateway)
    expect(fake.calls).toHaveLength(1);expect(fake.calls[0].amount).toEqual({minor:'20000',currency:'PHP'})
    expect((await h.rows('payment-attempts'))[0].state).toBe('unknown')
    expect(await h.rows('work-items',{kind:{equals:'reconcile-payment'}})).toHaveLength(1)
    await completeWork(fixture.worker,lease,result)
    const attempt=(await h.rows('payment-attempts'))[0]
    expect(attempt.state).toBe('ready');expect(attempt.providerCheckoutId).toBe(providerId)
    expect((await h.rows('bookings'))[0].status).toBe('held')
    await expect(dispatchCheckout(fixture.worker,lease,fake.gateway)).rejects.toThrow();expect(fake.calls).toHaveLength(1)
  })
  it('retains an unknown attempt and reconciliation intent after a lost creation response',async()=>{
    const {worker}=await checkoutFixture(h),fake=fakeGateway({kind:'unknown',environment:'sandbox',reference:'ignored-by-owner-check'}),lease=(await claimWork(worker,'create-checkout'))!
    await beginWork(worker,lease);await completeWork(worker,lease,await dispatchCheckout(worker,lease,fake.gateway))
    expect((await h.rows('payment-attempts'))[0].state).toBe('unknown');expect((await h.rows('work-items',{id:{equals:lease.id}}))[0].state).toBe('uncertain')
    expect(await claimWork(worker,'create-checkout')).toBeNull();expect(fake.calls).toHaveLength(1)
    expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
  })
  it('hands off a ready checkout once and keeps both redirect return and double submit unconfirmed',async()=>{
    const {ctx,worker,receipt}=await checkoutFixture(h),fake=fakeGateway(),lease=(await claimWork(worker,'create-checkout'))!
    await beginWork(worker,lease);await completeWork(worker,lease,await dispatchCheckout(worker,lease,fake.gateway))
    const access=await issueCheckoutAccess(ctx,receipt.bookingId)
    expect((await readCheckoutStatus(ctx,access.capability)).canPay).toBe(true)
    const results=await Promise.allSettled([checkoutDestination(ctx,access.capability,receipt.bookingId),checkoutDestination(ctx,access.capability,receipt.bookingId)])
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
    expect((await readCheckoutStatus(ctx,access.capability)).state).toBe('checking')
    expect((await h.rows('payment-attempts'))[0].state).toBe('pending')
    expect((await h.rows('bookings'))[0].status).toBe('held');expect(fake.calls).toHaveLength(1)
  })
  it('does not dispatch from expired, unstarted, stale or quarantined work',async()=>{
    const {worker}=await checkoutFixture(h),fake=fakeGateway(),lease=(await claimWork(worker,'create-checkout'))!
    await expect(dispatchCheckout(worker,lease,fake.gateway)).rejects.toThrow()
    await beginWork(worker,lease);h.clock.set('2026-11-15T04:00:30Z')
    await expect(dispatchCheckout(worker,lease,fake.gateway)).rejects.toThrow()
    expect(fake.calls).toHaveLength(0)
    h.clock.set('2026-11-15T04:00:01Z');vi.stubEnv('APP_OPERATION_MODE','quarantine')
    await expect(dispatchCheckout(worker,lease,fake.gateway)).rejects.toThrow();expect(fake.calls).toHaveLength(0)
  })
  it('fences a late creation response and preserves its original unknown attempt',async()=>{
    const {worker}=await checkoutFixture(h),fake=fakeGateway(),lease=(await claimWork(worker,'create-checkout'))!
    await beginWork(worker,lease);const result=await dispatchCheckout(worker,lease,fake.gateway)
    h.clock.set('2026-11-15T04:00:30Z');await claimWork(worker,'create-checkout')
    await expect(completeWork(worker,lease,result)).rejects.toThrow()
    expect((await h.rows('payment-attempts'))[0].state).toBe('unknown')
    expect((await h.rows('payment-attempts'))[0].checkoutUrl).toBeNull()
    expect(fake.calls).toHaveLength(1)
  })
  it('requires a scoped token and original browser, and hides provider/contact fields',async()=>{
    const {ctx,receipt}=await checkoutFixture(h),access=await issueCheckoutAccess(ctx,receipt.bookingId)
    const status=await readCheckoutStatus(ctx,access.capability)
    expect(status.state).toBe('preparing');expect(status.canPay).toBe(false)
    expect(JSON.stringify(status)).not.toMatch(/merchantReference|checkoutUrl|providerCheckoutId|dispatch-guest@example|PRIVATE-DISPATCH/)
    await expect(readCheckoutStatus({...ctx,browserKey:opaqueSecret()},access.capability)).rejects.toThrow()
    await expect(readCheckoutStatus(ctx,receipt.bookingId)).rejects.toThrow()
    const view=await h.uow.run({kind:'system',purpose:'payments'},tx=>createBookingView(tx,receipt.bookingId,'2026-11-15T05:00:00Z'))
    await expect(readCheckoutStatus(ctx,view.id+'.'+view.token)).rejects.toThrow()
  })
  it('expires and revokes status access without cancelling a booking',async()=>{
    const {ctx,receipt}=await checkoutFixture(h),access=await issueCheckoutAccess(ctx,receipt.bookingId)
    const id=access.capability.split('.')[0]
    await h.pool.query('UPDATE booking_views SET revoked_at=$1 WHERE id=$2',[h.clock.now(),id])
    await expect(readCheckoutStatus(ctx,access.capability)).rejects.toThrow()
    const next=await issueCheckoutAccess(ctx,receipt.bookingId);h.clock.set(next.expiresAt)
    await expect(readCheckoutStatus(ctx,next.capability)).rejects.toThrow()
    expect((await h.rows('bookings'))[0].status).toBe('held')
  })
  it('requires the issuing customer for account-owned status and keeps guest login separate',async()=>{
    const owned=await checkoutFixture(h,{customer:true}),access=await issueCheckoutAccess(owned.ctx,owned.receipt.bookingId)
    await expect(readCheckoutStatus({...owned.ctx,actor:{kind:'anonymous'}},access.capability)).rejects.toThrow()
    const other=await h.seed('customers',{name:'Other account',email:'other-status@example.test',password:'Synthetic-status-passphrase-946!',_verified:true})
    await expect(readCheckoutStatus({...owned.ctx,actor:{kind:'customer',collection:'customers',id:other.id}},access.capability)).rejects.toThrow()
    expect((await readCheckoutStatus(owned.ctx,access.capability)).bookingId).toBe(owned.receipt.bookingId)
  })
  it('confirms only an approved no-payment booking through the status projection',async()=>{
    const {ctx,receipt}=await checkoutFixture(h,{zero:true}),access=await issueCheckoutAccess(ctx,receipt.bookingId)
    expect((await readCheckoutStatus(ctx,access.capability)).state).toBe('confirmed')
    expect(await h.rows('payment-attempts')).toHaveLength(0)
  })
  it('does not report paid confirmation from a booking flag without canonical collection evidence',async()=>{
    const {ctx,receipt}=await checkoutFixture(h),access=await issueCheckoutAccess(ctx,receipt.bookingId)
    await h.payload.update({collection:'bookings',id:receipt.bookingId,data:{status:'confirmed'},overrideAccess:true})
    const status=await readCheckoutStatus(ctx,access.capability)
    expect(status.state).toBe('checking');expect(status.canPay).toBe(false)
  })
  it('bounds valid polling and protects capability scope from direct SQL changes',async()=>{
    const {ctx,receipt}=await checkoutFixture(h),access=await issueCheckoutAccess(ctx,receipt.bookingId)
    const id=access.capability.split('.')[0]
    await expect(h.pool.query("UPDATE booking_views SET purpose='booking-view',browser_hash=NULL WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'})
    for(let n=0;n<60;n++)await readCheckoutStatus(ctx,access.capability)
    await expect(readCheckoutStatus(ctx,access.capability)).rejects.toThrow('Wait before checking payment again')
  })
  it('does not shorten another active checkout browser credential when a later policy uses a shorter status lifetime',async()=>{
    const fixture=await checkoutFixture(h)
    await issueCheckoutAccess(fixture.ctx,fixture.receipt.bookingId)
    const original=(await h.rows('rate-plans'))[0]
    const next=await h.seed('policy-versions',{revision:2,active:false,approved:true,synthetic:true,approvalReference:'synthetic-shorter-status',approvedSections:fixture.policy.approvedSections,sections:{...fixture.ctx.policy.sections,checkoutStatus:{minutes:5,pollPerMinute:60}}})
    await h.payload.update({collection:'policy-versions',id:fixture.policy.id,data:{active:false},overrideAccess:true})
    const active=await h.payload.update({collection:'policy-versions',id:next.id,data:{active:true},overrideAccess:true})
    await h.seed('rooms',{label:'PRIVATE-SECOND-STATUS-ROOM',roomType:fixture.type.id,onSale:true})
    await h.seed('rate-plans',{roomType:fixture.type.id,policyVersion:next.id,revision:2,rules:original.rules,validFrom:original.validFrom,validUntil:original.validUntil,approved:true,synthetic:true,approvalReference:'synthetic-shorter-status-rate'})
    const ctx={...fixture.ctx,policy:policyFromRecord(active)},quote=await quoteStay(ctx,{stay:fixture.quote.stay})
    await acceptQuote(ctx,quote.id,quote.version)
    const receipt=await startCheckout(ctx,{...fixture.input,commandKey:randomUUID(),quoteId:quote.id,version:quote.version})
    expect(receipt.state).toBe('preparing');if(receipt.state==='rejected')throw new Error('Expected a prepared fixture')
    const headers=new Headers();await setCheckoutAccess(headers,ctx,receipt.bookingId)
    const cookies=headers.getSetCookie()
    const browserAge=Number(/Max-Age=(\d+)/.exec(cookies.find(value=>value.startsWith('acornelia-quote-browser='))!)![1])
    expect(browserAge).toBeGreaterThanOrEqual(7200);expect(browserAge).toBeLessThanOrEqual(86400)
    expect(cookies.find(value=>value.startsWith('acornelia-payment-status-'))).toContain('Max-Age=300')
  })
})
