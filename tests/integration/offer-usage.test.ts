import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {syntheticOfferTerms} from '../support/offer-fixtures'
import {publishOffer,withdrawOffer} from '@/domain/offers/publication'
import {reserveOffer,consumeOffer} from '@/domain/offers/reserve'
import {releaseOffer} from '@/domain/offers/release'
import {evaluateOffer} from '@/domain/offers/evaluate'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {calculatePrice} from '@/domain/quotes/calculate'
import {policyFromRecord} from '@/domain/policy/current'
import {opaqueSecret} from '@/domain/security/private-state'
import type {CommandContext} from '@/domain/db/types'
import type {AcceptedQuote,RateRules} from '@/domain/quotes/types'
import type {OfferTerms} from '@/domain/offers/types'
const rules:RateRules={currency:'PHP',nightMinor:'10000',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[],taxes:[],taxBasis:'room-after-discount',rounding:'half-up-per-line'}
describe('all-account offers and atomic usage',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-15T04:00:00Z')})
  afterAll(async()=>{await h?.close()})
  async function setup(overrides:Partial<OfferTerms>={},zero='unavailable'){
    const policy=await h.seed('policy-versions',{revision:1,approved:true,active:true,synthetic:true,approvalReference:'synthetic-offer-policy',approvedSections:['stay','pricing','offers'],sections:{stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:zero},offers:{enabled:true,accountScope:'all-customers',discountOrder:'before-fees-and-tax'}}})
    const type=await h.seed('room-types',{name:'Offer room fixture',slug:'offer-room',onSale:true,maxGuests:2,_status:'published'})
    await h.seed('rooms',{label:'PRIVATE-OFFER-ROOM',roomType:type.id,onSale:true})
    await h.seed('rate-plans',{roomType:type.id,policyVersion:policy.id,revision:1,rules,validFrom:'2026-11-01T00:00:00Z',validUntil:'2028-01-01T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-offer-rate'})
    const staff=await h.seed('staff-users',{name:'Offer developer',email:'offer-dev@example.test',password:'Synthetic-offer-passphrase-946!',role:'developer'})
    const customers=[];for(const suffix of ['a','b'])customers.push(await h.seed('customers',{name:'Offer customer '+suffix,email:suffix+'@example.test',password:'Synthetic-offer-passphrase-946!',_verified:true}))
    const policySnapshot=policyFromRecord(policy),staffCtx={...h.ctx({kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}),policy:policySnapshot}
    const contexts=customers.map(customer=>({...h.ctx({kind:'customer',collection:'customers',id:customer.id}),policy:policySnapshot,browserKey:opaqueSecret()}))
    const terms=syntheticOfferTerms(overrides),version=await publishOffer(staffCtx,{name:'All-account fixture',terms,approvalReference:'synthetic-offer-review'})
    const stay={roomTypeId:type.id,arrival:'2027-02-10',departure:'2027-02-11',occupancy:{adults:2,children:0}}
    return {contexts,staffCtx,customers,version,stay,policySnapshot}
  }
  async function accepted(ctx:CommandContext,stay:Parameters<typeof quoteStay>[1]['stay'],versionId:string){const quote=await quoteStay(ctx,{stay,offerVersionId:versionId});return acceptQuote(ctx,quote.id,quote.version)}
  async function prepare(ctx:CommandContext,quote:AcceptedQuote){return ctx.uow.run(ctx.actor,async tx=>{
    const booking=await tx.payload.create({collection:'bookings',data:{ownerCustomer:ctx.actor.kind==='customer'?ctx.actor.id:undefined,status:'held',revision:1,arrival:quote.stay.arrival+'T00:00:00Z',departure:quote.stay.departure+'T00:00:00Z',acceptedQuote:quote,contact:{name:'Synthetic offer contact'},source:'website'},req:tx.req,overrideAccess:false})
    await tx.payload.update({collection:'quotes',id:quote.id,data:{consumedByBooking:booking.id},req:tx.req,overrideAccess:false})
    return reserveOffer(tx,quote,ctx.clock.now())
  })}
  it('rejects guest redemption and protects the last offer use',async()=>{
    const {contexts,version,stay}=await setup()
    const guestRedemption=evaluateOffer({...contexts[0],actor:{kind:'anonymous'}},{stay,basis:calculatePrice(stay,rules)},version)
    expect(guestRedemption.ok).toBe(false)
    await expect(quoteStay({...contexts[0],actor:{kind:'anonymous'}},{stay,offerVersionId:version.id})).rejects.toThrow()
    const quotes:AcceptedQuote[]=[];for(const ctx of contexts)quotes.push(await accepted(ctx,stay,version.id))
    expect(quotes[0].total).toEqual({minor:'8500',currency:'PHP'})
    const results=await Promise.allSettled(contexts.map((ctx,index)=>prepare(ctx,quotes[index])))
    const successfulReservations=results.filter(result=>result.status==='fulfilled')
    expect(successfulReservations).toHaveLength(1)
    expect(await h.rows('offer-allocations')).toHaveLength(1)
    expect(await h.rows('bookings')).toHaveLength(1)
  })
  it('enforces per-account caps across concurrent quotes and makes an identical reservation retry idempotent',async()=>{
    const {contexts,version,stay}=await setup({overallLimit:5,perAccountLimit:1}),ctx=contexts[0]
    const quotes=[await accepted(ctx,stay,version.id),await accepted(ctx,stay,version.id)]
    const results=await Promise.allSettled(quotes.map(quote=>prepare(ctx,quote)))
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
    const winner=results.findIndex(result=>result.status==='fulfilled'),allocation=(await h.rows('offer-allocations'))[0]
    expect((await ctx.uow.run(ctx.actor,tx=>reserveOffer(tx,quotes[winner],ctx.clock.now()))).id).toBe(allocation.id)
    expect(await h.rows('offer-allocations')).toHaveLength(1)
  })
  it('keeps withdrawal from changing an already reserved accepted price or consuming usage twice',async()=>{
    const {contexts,staffCtx,version,stay}=await setup(),quote=await accepted(contexts[0],stay,version.id),allocation=await prepare(contexts[0],quote)
    await withdrawOffer(staffCtx,version.offerId)
    expect((await acceptQuote(contexts[0],quote.id,quote.version)).total).toEqual(quote.total)
    expect((await contexts[0].uow.run(contexts[0].actor,tx=>reserveOffer(tx,quote,contexts[0].clock.now()))).id).toBe(allocation.id)
    await expect(quoteStay(contexts[1],{stay,offerVersionId:version.id})).rejects.toThrow()
    const bookingId=typeof allocation.booking==='string'?allocation.booking:allocation.booking.id
    await h.seed('payment-transactions',{booking:bookingId,providerPaymentId:'SYNTHETIC-COLLECTED',merchantReference:'SYNTHETIC-OFFER-PAYMENT',environment:'sandbox',amountMinor:quote.total.minor,currency:'PHP',status:'collected'})
    await h.payload.update({collection:'bookings',id:bookingId,data:{status:'confirmed'},overrideAccess:true})
    await Promise.all([contexts[0].uow.run({kind:'system',purpose:'payments'},tx=>consumeOffer(tx,allocation.id)),contexts[0].uow.run({kind:'system',purpose:'payments'},tx=>consumeOffer(tx,allocation.id))])
    expect((await h.rows('offer-allocations'))[0].state).toBe('consumed')
    expect(await h.rows('audit-entries',{action:{equals:'offer:consumed'}})).toHaveLength(1)
  })
  it('releases only known closed unpaid usage and never releases or reinstates twice',async()=>{
    const {contexts,staffCtx,version,stay}=await setup(),quote=await accepted(contexts[0],stay,version.id),allocation=await prepare(contexts[0],quote)
    const bookingId=typeof allocation.booking==='string'?allocation.booking:allocation.booking.id
    const attempt=await h.seed('payment-attempts',{booking:bookingId,merchantReference:randomUUID(),commandKey:randomUUID(),fingerprint:'synthetic',amountMinor:quote.total.minor,currency:'PHP',acceptedContext:quote,purpose:'booking',revision:1,state:'unknown',deadline:'2026-11-15T04:15:00Z'})
    await h.payload.update({collection:'bookings',id:bookingId,data:{status:'expired'},overrideAccess:true})
    await expect(staffCtx.uow.run({kind:'system',purpose:'work'},tx=>releaseOffer(tx,allocation.id,'failed',staffCtx.clock.now()))).rejects.toThrow()
    await h.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'closed'},overrideAccess:true})
    await staffCtx.uow.run({kind:'system',purpose:'work'},tx=>releaseOffer(tx,allocation.id,'failed',staffCtx.clock.now()))
    await staffCtx.uow.run({kind:'system',purpose:'work'},tx=>releaseOffer(tx,allocation.id,'failed',staffCtx.clock.now()))
    expect((await h.rows('offer-allocations'))[0].state).toBe('released')
    expect(await h.rows('audit-entries',{action:{equals:'offer:released'}})).toHaveLength(1)
    expect((await prepare(contexts[1],await accepted(contexts[1],stay,version.id))).state).toBe('reserved')
    await expect(h.pool.query("UPDATE offer_allocations SET state='reserved' WHERE id=$1",[allocation.id])).rejects.toThrow()
  })
  it('denies generic customer writes and database inserts that exceed a real usage cap',async()=>{
    const {contexts,customers,version,stay}=await setup(),quote=await accepted(contexts[0],stay,version.id),allocation=await prepare(contexts[0],quote)
    await expect(h.payload.update({collection:'offer-allocations',id:allocation.id,data:{state:'released'},user:{...customers[0],collection:'customers'},overrideAccess:false})).rejects.toThrow()
    const otherBooking=await h.seed('bookings',{ownerCustomer:customers[1].id,status:'held',revision:1,arrival:'2027-02-10T00:00:00Z',departure:'2027-02-11T00:00:00Z',acceptedQuote:{fixture:true},contact:{fixture:true},source:'website'})
    await expect(h.pool.query("INSERT INTO offer_allocations(offer_id,offer_version_id,booking_id,customer_id,allocation_key,state) VALUES($1,$2,$3,$4,$5,'reserved')",[version.offerId,version.id,otherBooking.id,customers[1].id,randomUUID()])).rejects.toMatchObject({code:'23514'})
  })
  it.each(['offer','version'] as const)('honors explicit %s usage scope across newly published versions',async scope=>{
    const {contexts,staffCtx,version,stay}=await setup({overallLimit:5,perAccountLimit:1,limitScope:scope})
    await prepare(contexts[0],await accepted(contexts[0],stay,version.id))
    const next=await publishOffer(staffCtx,{offerId:version.offerId,expectedRevision:1,name:'New version fixture',terms:syntheticOfferTerms({overallLimit:5,perAccountLimit:1,limitScope:scope}),approvalReference:'synthetic-next-review'})
    if(scope==='offer')await expect(accepted(contexts[0],stay,next.id)).rejects.toThrow()
    else expect((await prepare(contexts[0],await accepted(contexts[0],stay,next.id))).state).toBe('reserved')
  })
  it.each(['unavailable','confirm-without-payment'])('uses the explicit %s zero-total policy for full discounts',async zero=>{
    const {contexts,version,stay}=await setup({benefit:{kind:'percent',bps:10000}},zero)
    if(zero==='unavailable')await expect(accepted(contexts[0],stay,version.id)).rejects.toThrow()
    else{
      const quote=await accepted(contexts[0],stay,version.id),allocation=await prepare(contexts[0],quote)
      expect(quote.total.minor).toBe('0')
      await h.payload.update({collection:'bookings',id:typeof allocation.booking==='string'?allocation.booking:allocation.booking.id,data:{status:'confirmed'},overrideAccess:true})
      await contexts[0].uow.run(contexts[0].actor,tx=>consumeOffer(tx,allocation.id,contexts[0].clock.now()))
      expect((await h.rows('offer-allocations'))[0].state).toBe('consumed')
    }
    expect(await h.rows('payment-transactions')).toHaveLength(0)
  })
  it('requires authorized publication and preserves the prior version if publication audit fails',async()=>{
    const {contexts,staffCtx,version}=await setup()
    await expect(publishOffer(contexts[0],{name:'Denied customer offer',terms:syntheticOfferTerms(),approvalReference:'not-authority'})).rejects.toThrow()
    await expect(h.payload.update({collection:'offer-versions',id:version.id,data:{name:'Edited immutable version'},overrideAccess:true})).rejects.toThrow()
    await h.pool.query("CREATE FUNCTION reject_offer_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='offer:published' THEN RAISE EXCEPTION 'injected publication audit failure'; END IF; RETURN NEW; END $$")
    await h.pool.query('CREATE TRIGGER reject_offer_publication BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_offer_publication()')
    try{await expect(publishOffer(staffCtx,{offerId:version.offerId,expectedRevision:1,name:'Rollback version',terms:syntheticOfferTerms(),approvalReference:'synthetic-next-review'})).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_offer_publication ON audit_entries');await h.pool.query('DROP FUNCTION reject_offer_publication()')}
    expect(await h.rows('offer-versions')).toHaveLength(1)
    expect((await h.rows('offers'))[0].currentVersion).toBe(version.id)
  })
  it('does not publish refund reinstatement before verified refund handling exists',async()=>{
    const {staffCtx}=await setup(),terms=syntheticOfferTerms()
    await expect(publishOffer(staffCtx,{name:'Unsupported refund restoration',terms:{...terms,usage:{...terms.usage,refunded:'release'}},approvalReference:'synthetic-review'})).rejects.toThrow()
  })
  it('does not treat expiry as a cancellation to bypass the approved release rules',async()=>{
    const terms=syntheticOfferTerms(),{contexts,staffCtx,version,stay}=await setup({usage:{...terms.usage,cancelled:'release','expired-unpaid':'retain'}})
    const allocation=await prepare(contexts[0],await accepted(contexts[0],stay,version.id)),bookingId=typeof allocation.booking==='string'?allocation.booking:allocation.booking.id
    await h.payload.update({collection:'bookings',id:bookingId,data:{status:'expired'},overrideAccess:true})
    await expect(staffCtx.uow.run(staffCtx.actor,tx=>releaseOffer(tx,allocation.id,'cancelled',staffCtx.clock.now()))).rejects.toThrow()
    expect((await h.rows('offer-allocations'))[0].state).toBe('reserved')
  })
  it('rolls back usage and booking consumption if reservation audit fails',async()=>{
    const {contexts,version,stay}=await setup(),quote=await accepted(contexts[0],stay,version.id)
    await h.pool.query("CREATE FUNCTION reject_offer_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='offer:reserved' THEN RAISE EXCEPTION 'injected offer audit failure'; END IF; RETURN NEW; END $$")
    await h.pool.query('CREATE TRIGGER reject_offer_audit BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_offer_audit()')
    try{await expect(prepare(contexts[0],quote)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_offer_audit ON audit_entries');await h.pool.query('DROP FUNCTION reject_offer_audit()')}
    expect(await h.rows('offer-allocations')).toHaveLength(0)
    expect(await h.rows('bookings')).toHaveLength(0)
    expect((await h.rows('quotes'))[0].consumedByBooking).toBeFalsy()
  })
})
