import {closeDirectCommand,readDirectResult} from '@/domain/bookings/direct-recovery'
import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import {opaqueSecret} from '@/domain/security/private-state'
import {closeAttempt} from '@/domain/payments/reconcile'
import {createDirectBooking} from '@/domain/bookings/direct'
import {recordOfflineCollection} from '@/domain/payments/offline'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {startCheckout} from '@/domain/bookings/start-checkout'
import {findAvailability} from '@/domain/inventory/availability'
import type {DirectBookingInput} from '@/domain/bookings/types'
import type {DirectBookingPolicy} from '@/domain/bookings/direct-policy'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()});beforeEach(async()=>{await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')});afterAll(async()=>{await h?.reset();await h?.close()})
async function setup(options:{role?:'staff'|'developer';thirdPartyBookings?:boolean;direct?:Partial<DirectBookingPolicy>}={}){
 const base=await checkoutFixture(h,{direct:options.direct??{},thirdPartyBookings:options.thirdPartyBookings})
 h.clock.set(new Date(Date.parse(base.receipt.deadline!)+1).toISOString());await closeAttempt({...base.worker,actor:{kind:'system',purpose:'payments'}},base.receipt.attemptId!)
 const staff=await h.seed('staff-users',{name:'Direct operator fixture',email:'direct-operator@example.test',password:'Synthetic-direct-operator-passphrase-946!',role:options.role??'developer'})
 const ctx={...base.ctx,actor:{kind:'staff' as const,collection:'staff-users' as const,id:staff.id,role:staff.role},browserKey:opaqueSecret()},quote=await quoteStay(ctx,{stay:base.quote.stay});await acceptQuote(ctx,quote.id,quote.version)
 const input:DirectBookingInput={commandKey:(await h.rows('quotes',{id:{equals:quote.id}}))[0].directCommandKey!,quoteId:quote.id,version:quote.version,source:'walk-in',contact:{name:'Direct booking contact',email:'dispatch-account@example.test',phone:'+639171234567'},stayingGuest:'Separate direct guest',agreementReference:'synthetic-phone-agreement',collection:{method:'cash',receiptReference:'CASH-'+randomUUID(),evidenceReference:'synthetic-cashbook-reference',amount:quote.total,receivedAt:h.clock.now()}}
 return {...base,ctx,staff,quote,input,guestCtx:base.ctx}
}
it('makes walk-in and web contenders share the last room',async()=>{
 const f=await setup(),web=await quoteStay(f.guestCtx,{stay:f.quote.stay});await acceptQuote(f.guestCtx,web.id,web.version)
 await Promise.all([createDirectBooking(f.ctx,f.input),startCheckout(f.guestCtx,{commandKey:randomUUID(),quoteId:web.id,version:web.version,contact:f.input.contact,stayingGuest:f.input.stayingGuest})])
 const successfulBookings=await h.rows('bookings',{status:{in:['held','confirmed']}}),overlappingAllocations=await h.rows('allocations',{released:{equals:false}})
 expect(successfulBookings).toHaveLength(1);expect(overlappingAllocations).toHaveLength(1)
 expect(await h.rows('payment-transactions',{environment:{equals:'offline'},status:{equals:'collected'}})).toHaveLength(1)
 expect((await findAvailability(f.guestCtx,f.quote.stay)).every(value=>value.availableUnits===0)).toBe(true)
})
it('confirms an approved full offline receipt without inventing a Maya payment or email-based account ownership',async()=>{
 const f=await setup({role:'staff'}),booking=await createDirectBooking(f.ctx,f.input)
 expect(booking.status).toBe('confirmed');expect(booking.code).toMatch(/^ACN-/);expect(booking.ownerCustomer??null).toBeNull()
 const payment=(await h.rows('payment-transactions',{booking:{equals:booking.id}}))[0]
 expect(payment).toMatchObject({environment:'offline',status:'collected',appliedRevision:1,amountMinor:'20000',merchantReference:null,attempt:null})
 expect(await h.rows('payment-attempts',{booking:{equals:booking.id}})).toHaveLength(0)
 expect(await h.rows('email-messages',{booking:{equals:booking.id},category:{equals:'booking'}})).toHaveLength(1)
})
it('reuses a matching direct command and receipt, but refuses changed intent or receipt reassignment',async()=>{
 const f=await setup(),first=await createDirectBooking(f.ctx,f.input),again=await createDirectBooking(f.ctx,f.input)
 expect(again.id).toBe(first.id)
 const payment=await recordOfflineCollection(f.ctx,{...f.input.collection!,bookingId:first.id,expectedRevision:1})
 expect(payment.id).toBe((await h.rows('payment-transactions',{environment:{equals:'offline'}}))[0].id)
 await expect(createDirectBooking(f.ctx,{...f.input,source:'phone'})).rejects.toThrow()
 await expect(recordOfflineCollection(f.ctx,{...f.input.collection!,bookingId:f.receipt.bookingId,expectedRevision:1})).rejects.toThrow()
 expect(await h.rows('payment-transactions',{environment:{equals:'offline'}})).toHaveLength(1)
})
it('does not let a typed amount reduce the accepted price or confirm an underpaid stay',async()=>{
 const f=await setup(),booking=await createDirectBooking(f.ctx,{...f.input,collection:{...f.input.collection!,amount:{minor:'1',currency:'PHP'}}})
 expect(booking.status).toBe('expired');expect((booking.acceptedQuote as {total:{minor:string}}).total.minor).toBe('20000')
 expect(await h.rows('allocations',{booking:{equals:booking.id},released:{equals:false}})).toHaveLength(0)
 expect((await h.rows('payment-transactions',{booking:{equals:booking.id}}))[0]).toMatchObject({amountMinor:'1',appliedRevision:null})
 expect((await h.rows('payment-issues',{booking:{equals:booking.id}}))[0].reasonCode).toBe('offline-amount-mismatch')
})
it('refuses unapproved unpaid reservations rather than creating a hold with an invented expiry',async()=>{
 const f=await setup();await expect(createDirectBooking(f.ctx,{...f.input,collection:null})).rejects.toThrow()
 expect(await h.rows('bookings',{source:{in:['phone','walk-in']}})).toHaveLength(0)
})
it('keeps customers, anonymous actors and unapproved staff away from offline collection',async()=>{
 const f=await setup();for(const ctx of [f.guestCtx,{...f.guestCtx,actor:{kind:'customer' as const,collection:'customers' as const,id:f.customer.id}}]){
  await expect(createDirectBooking(ctx,f.input)).rejects.toThrow();await expect(recordOfflineCollection(ctx,{...f.input.collection!,bookingId:f.receipt.bookingId,expectedRevision:1})).rejects.toThrow()
 }
 const staff=await h.seed('staff-users',{name:'Unapproved operator',email:'unapproved-direct@example.test',password:'Synthetic-unapproved-passphrase-946!',role:'staff'})
 await expect(createDirectBooking({...f.ctx,policy:{...f.ctx.policy,approvedSections:f.ctx.policy.approvedSections.filter(value=>value!=='directBookings')},actor:{kind:'staff',collection:'staff-users',id:staff.id,role:'staff'}},f.input)).rejects.toThrow()
})
it('rolls receipt, room, booking and notification back together when the confirmation audit fails',async()=>{
 const f=await setup();await h.pool.query("CREATE FUNCTION direct_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='booking:direct-created' THEN RAISE EXCEPTION 'injected direct failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER direct_test_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION direct_test_failure()")
 try{await expect(createDirectBooking(f.ctx,f.input)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER direct_test_failure ON audit_entries; DROP FUNCTION direct_test_failure()')}
 expect(await h.rows('bookings',{source:{in:['phone','walk-in']}})).toHaveLength(0);expect(await h.rows('payment-transactions',{environment:{equals:'offline'}})).toHaveLength(0)
 expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(0);expect(await h.rows('email-messages')).toHaveLength(0)
 expect((await createDirectBooking(f.ctx,f.input)).status).toBe('confirmed')
})

it('does not let a staff quote become a personal website checkout after logout',async()=>{
 const f=await setup(),guest={...f.guestCtx,browserKey:f.ctx.browserKey}
 const result=await startCheckout(guest,{commandKey:randomUUID(),quoteId:f.quote.id,version:f.quote.version,contact:f.input.contact,stayingGuest:f.input.stayingGuest})
 expect(result.state).toBe('rejected')
})

it('keeps valid cash for review when room capacity changes after the accepted quote',async()=>{
 const f=await setup();await h.uow.run(f.ctx.actor,tx=>tx.payload.update({collection:'room-types',id:f.type.id,data:{maxGuests:1},req:tx.req,overrideAccess:false}))
 const booking=await createDirectBooking(f.ctx,f.input)
 expect(booking.status).toBe('expired');expect(await h.rows('payment-transactions',{booking:{equals:booking.id}})).toHaveLength(1)
 expect(await h.rows('allocations',{booking:{equals:booking.id},released:{equals:false}})).toHaveLength(0)
})
it('cannot bypass the approved third-party stay rule through a staff cash command',async()=>{
 const f=await setup({thirdPartyBookings:false}),booking=await createDirectBooking(f.ctx,f.input)
 expect(booking.status).toBe('expired');expect((await h.rows('payment-issues',{booking:{equals:booking.id}}))[0].reasonCode).toBe('offline-stay-terms-mismatch')
 expect(await h.rows('allocations',{booking:{equals:booking.id},released:{equals:false}})).toHaveLength(0)
})
it('serializes duplicate physical receipts across two staff commands without recording or reserving twice',async()=>{
 const f=await setup();await h.seed('rooms',{label:'PRIVATE-DUPLICATE-RECEIPT-ROOM',roomType:f.type.id,onSale:true})
 const second=await quoteStay(f.ctx,{stay:f.quote.stay});await acceptQuote(f.ctx,second.id,second.version)
 const results=await Promise.allSettled([createDirectBooking(f.ctx,f.input),createDirectBooking(f.ctx,{...f.input,commandKey:(await h.rows('quotes',{id:{equals:second.id}}))[0].directCommandKey!,quoteId:second.id})])
 expect(results.filter(value=>value.status==='fulfilled')).toHaveLength(1)
 expect(await h.rows('payment-transactions',{environment:{equals:'offline'}})).toHaveLength(1)
 expect(await h.rows('bookings',{source:{in:['phone','walk-in']},status:{equals:'confirmed'}})).toHaveLength(1)
 expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(1)
})
it('keeps extra and stale-revision cash as distinct actual money without funding another stay context',async()=>{
 const f=await setup(),booking=await createDirectBooking(f.ctx,f.input),allocation=(await h.rows('allocations',{released:{equals:false}}))[0]
 for(const revision of [1,2])await recordOfflineCollection(f.ctx,{...f.input.collection!,receiptReference:'EXTRA-'+randomUUID(),bookingId:booking.id,expectedRevision:revision})
 expect(await h.rows('payment-transactions',{booking:{equals:booking.id},status:{equals:'collected'}})).toHaveLength(3)
 expect(await h.rows('payment-transactions',{booking:{equals:booking.id},appliedRevision:{exists:true}})).toHaveLength(1)
 expect(await h.rows('payment-issues',{booking:{equals:booking.id}})).toHaveLength(2)
 expect((await h.rows('allocations',{released:{equals:false}}))[0].id).toBe(allocation.id)
})
it('protects quote purpose, receipt evidence and source identity against direct SQL changes',async()=>{
 const f=await setup(),booking=await createDirectBooking(f.ctx,f.input),payment=(await h.rows('payment-transactions',{booking:{equals:booking.id}}))[0]
 await expect(h.pool.query("UPDATE quotes SET scope='website',issuer_staff_id=NULL WHERE id=$1",[f.quote.id])).rejects.toThrow()
 await expect(h.pool.query("UPDATE bookings SET direct_context='{}'::jsonb WHERE id=$1",[booking.id])).rejects.toThrow()
 for(const query of ["UPDATE payment_transactions SET offline_evidence='{}'::jsonb WHERE id=$1","UPDATE payment_transactions SET offline_receipt_key='reassigned' WHERE id=$1","UPDATE payment_transactions SET environment='sandbox' WHERE id=$1","DELETE FROM payment_transactions WHERE id=$1"]){await expect(h.pool.query(query,[payment.id])).rejects.toThrow()}
 await expect(h.seed('payment-transactions',{environment:'offline',providerPaymentId:'unproved-cash',amountMinor:'1',currency:'PHP',status:'collected'})).rejects.toThrow()
})
it('rolls the booking and collection back when durable confirmation storage fails',async()=>{
 const f=await setup();await h.pool.query("CREATE FUNCTION direct_mail_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='email:queued' THEN RAISE EXCEPTION 'injected direct mail intent failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER direct_mail_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION direct_mail_failure()")
 try{await expect(createDirectBooking(f.ctx,f.input)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER direct_mail_failure ON audit_entries; DROP FUNCTION direct_mail_failure()')}
 expect(await h.rows('payment-transactions',{environment:{equals:'offline'}})).toHaveLength(0)
 expect(await h.rows('bookings',{source:{in:['phone','walk-in']}})).toHaveLength(0)
 expect(await h.rows('allocations',{released:{equals:false}})).toHaveLength(0)
})

it('recovers only the original staff result and never closes a saved booking as an unfinished entry',async()=>{
 const f=await setup(),booking=await createDirectBooking(f.ctx,f.input)
 expect((await readDirectResult(f.ctx,f.input.commandKey))!.id).toBe(booking.id)
 expect(await closeDirectCommand(f.ctx,f.quote.id,f.input.commandKey)).toMatchObject({state:'saved',booking:{id:booking.id}})
 await expect(readDirectResult(f.guestCtx,f.input.commandKey)).rejects.toThrow()
})
it('serializes closing an unfinished direct command against a late save without losing a saved receipt',async()=>{
 const f=await setup(),results=await Promise.allSettled([createDirectBooking(f.ctx,f.input),closeDirectCommand(f.ctx,f.quote.id,f.input.commandKey)])
 const closure=results[1];expect(closure.status).toBe('fulfilled')
 const saved=await readDirectResult(f.ctx,f.input.commandKey)
 if(closure.status==='fulfilled'&&closure.value.state==='closed'){
  expect(saved).toBeNull();await expect(createDirectBooking(f.ctx,f.input)).rejects.toThrow()
 }else expect(saved?.status).toBe('confirmed')
 expect(await h.rows('bookings',{source:{in:['phone','walk-in']},status:{equals:'confirmed'}})).toHaveLength(saved?1:0)
})

it('requires a real server command key for every staff quote even through privileged SQL-backed creation',async()=>{
 const f=await setup(),original=(await h.rows('quotes',{id:{equals:f.quote.id}}))[0]
 const {id:unusedId,createdAt:unusedCreated,updatedAt:unusedUpdated,...data}=original
 void unusedId;void unusedCreated;void unusedUpdated
 await expect(h.seed('quotes',{...data,directCommandKey:null})).rejects.toThrow()
})
