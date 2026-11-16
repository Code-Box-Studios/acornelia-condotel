import {syntheticRecovery} from '../support/recovery-policy'
import {randomUUID} from 'node:crypto'
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {opaqueSecret} from '@/domain/security/private-state'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {startCheckout} from '@/domain/bookings/start-checkout'
import {publishOffer} from '@/domain/offers/publication'
import {syntheticOfferTerms} from '../support/offer-fixtures'
import type {CheckoutInput} from '@/domain/bookings/types'
import type {RateRules} from '@/domain/quotes/types'
import type {CommandContext} from '@/domain/db/types'
const rules:RateRules={currency:'PHP',nightMinor:'10000',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[],taxes:[],taxBasis:'room-and-fees-after-discount',rounding:'half-up-per-line'}
describe('atomic checkout preparation',()=>{
  let h:TestHarness,providerCreateCalls:number
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-15T04:00:00Z');providerCreateCalls=0;vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{providerCreateCalls++;throw new Error('Provider call during database preparation')});vi.stubEnv('APP_OPERATION_MODE','normal')})
  afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks()})
  afterAll(async()=>{await h?.close()})
  async function setup(options:{offer?:boolean;zero?:boolean;rooms?:number}={}){
    const policy=await h.seed('policy-versions',{revision:1,active:true,approved:true,synthetic:true,approvalReference:'synthetic-checkout-review',approvedSections:['stay','pricing','offers','checkout','bookingTerms','checkoutStatus','paymentRecovery'],sections:{paymentRecovery:syntheticRecovery(),stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:options.zero?'confirm-without-payment':'unavailable'},offers:{enabled:true,accountScope:'all-customers',discountOrder:'before-fees-and-tax'},checkout:{payment:'full',holdMinutes:15,thirdPartyBookings:true},bookingTerms:{title:'Synthetic booking terms',text:'Local testing policy only. Full payment confirms the accepted stay.'},checkoutStatus:{minutes:120,pollPerMinute:60}}})
    const type=await h.seed('room-types',{name:'Checkout room fixture',slug:'checkout-room',maxGuests:2,onSale:true,_status:'published'})
    for(let n=0;n<(options.rooms??1);n++)await h.seed('rooms',{label:'PRIVATE-CHECKOUT-'+n,roomType:type.id,onSale:true})
    await h.seed('rate-plans',{roomType:type.id,policyVersion:policy.id,revision:1,rules:{...rules,nightMinor:options.zero&&!options.offer?'0':'10000'},validFrom:'2026-11-15T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-checkout-rate'})
    const customer=await h.seed('customers',{name:'Customer account',email:'owner@example.test',password:'Synthetic-checkout-passphrase-946!',_verified:true})
    const ctx:CommandContext={...h.ctx(options.offer?{kind:'customer',collection:'customers',id:customer.id}:{kind:'anonymous'}),policy:{id:policy.id,revision:1,approvedSections:policy.approvedSections as string[],sections:policy.sections as Record<string,unknown>,synthetic:true},browserKey:opaqueSecret()}
    let offerVersionId:string|undefined
    if(options.offer){const staff=await h.seed('staff-users',{name:'Checkout operator',email:'operator@example.test',password:'Synthetic-checkout-passphrase-946!',role:'developer'});offerVersionId=(await publishOffer({...ctx,actor:{kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}},{name:'Checkout fixture offer',terms:syntheticOfferTerms(options.zero?{benefit:{kind:'fixed',minor:'20000'}}:{}),approvalReference:'synthetic-checkout-offer'})).id}
    const request={stay:{roomTypeId:type.id,arrival:'2027-02-10',departure:'2027-02-12',occupancy:{adults:2,children:0}},...(offerVersionId?{offerVersionId}:{})}
    async function accepted(next=ctx){const quote=await quoteStay(next,request);await acceptQuote(next,quote.id,quote.version);return {commandKey:randomUUID(),quoteId:quote.id,version:quote.version,contact:{name:'Booking contact',email:'contact@example.test',phone:'+639171234567'},stayingGuest:'Staying guest'} satisfies CheckoutInput}
    return {ctx,customer,policy,type,accepted,request}
  }
  it('rolls back room and offer together after partial preparation',async()=>{
    const {ctx,accepted}=await setup({offer:true}),input=await accepted()
    await h.pool.query("CREATE FUNCTION reject_preparation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='checkout:prepared' THEN RAISE EXCEPTION 'injected preparation failure'; END IF; RETURN NEW; END $$")
    await h.pool.query('CREATE TRIGGER reject_preparation BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_preparation()')
    try{await expect(startCheckout(ctx,input)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_preparation ON audit_entries');await h.pool.query('DROP FUNCTION reject_preparation()')}
    for(const name of ['bookings','allocations','offer-allocations','payment-attempts','work-items'] as const)expect(await h.rows(name)).toHaveLength(0)
    expect((await h.rows('quotes'))[0].consumedByBooking).toBeNull();expect(providerCreateCalls).toBe(0)
  })
  it.each(['bookings','quotes','allocations','offer_allocations','payment_attempts','work_items'])('rolls back preparation when %s write fails',async table=>{
    const {ctx,accepted}=await setup({offer:true}),input=await accepted(),logs=await h.rows('audit-entries')
    await h.pool.query("CREATE FUNCTION reject_checkout_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected checkout write failure'; END $$")
    await h.pool.query('CREATE TRIGGER reject_checkout_write BEFORE '+(table==='quotes'?'UPDATE':'INSERT')+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION reject_checkout_write()')
    try{await expect(startCheckout(ctx,input)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_checkout_write ON '+table);await h.pool.query('DROP FUNCTION reject_checkout_write()')}
    for(const name of ['bookings','allocations','offer-allocations','payment-attempts','work-items'] as const)expect(await h.rows(name)).toHaveLength(0)
    expect((await h.rows('quotes'))[0].consumedByBooking).toBeNull()
    expect(await h.rows('audit-entries')).toHaveLength(logs.length);expect(providerCreateCalls).toBe(0)
  })
  it('freezes the exact reviewed booking terms in the accepted quote',async()=>{
    const {ctx,accepted}=await setup(),input=await accepted(),quote=await acceptQuote(ctx,input.quoteId,input.version)
    expect(quote.terms).toMatchObject({title:'Synthetic booking terms',text:'Local testing policy only. Full payment confirms the accepted stay.',payment:'full',holdMinutes:15,thirdPartyBookings:true,timezone:'Asia/Manila'})
    await expect(h.pool.query("UPDATE quotes SET snapshot=jsonb_set(snapshot,'{terms,text}','\"Changed terms\"') WHERE id=$1",[quote.id])).rejects.toMatchObject({code:'23514'})
  })
  it('requires a contact phone before final preparation',async()=>{
    const {ctx,accepted}=await setup(),input=await accepted(),missing={...input,contact:{name:input.contact.name,email:input.contact.email}} as CheckoutInput
    expect(await startCheckout(ctx,missing)).toEqual({state:'rejected',code:'invalid-input'})
    expect(await h.rows('bookings')).toHaveLength(0)
  })
  it('commits immutable amount, owner, room, offer, reference and work in one preparation',async()=>{
    const {ctx,accepted,customer}=await setup({offer:true}),result=await startCheckout(ctx,await accepted())
    expect(result.state).toBe('preparing')
    const booking=(await h.rows('bookings'))[0],attempt=(await h.rows('payment-attempts'))[0]
    expect(booking.ownerCustomer).toBe(customer.id);expect(booking.stayingGuest).toBe('Staying guest')
    expect(attempt.amountMinor).toBe('18500');expect(attempt.merchantReference).toMatch(/^[A-Za-z0-9]{20,36}$/)
    expect(await h.rows('allocations')).toHaveLength(1);expect(await h.rows('offer-allocations')).toHaveLength(1)
    expect((await h.rows('work-items',{kind:{equals:'create-checkout'}}))[0].payload).toEqual({attemptId:attempt.id})
    expect(providerCreateCalls).toBe(0);expect(JSON.stringify(result)).not.toContain('contact@example.test')
    for(const field of ['amount_minor','currency','merchant_reference','accepted_context','revision','purpose','deadline']){
      const values:Record<string,unknown>={amount_minor:'1',currency:'USD',merchant_reference:'changed',accepted_context:'{}',revision:2,purpose:'change',deadline:'2026-11-15T05:00:00Z'}
      await expect(h.pool.query('UPDATE payment_attempts SET '+field+'=$1 WHERE id=$2',[values[field],attempt.id])).rejects.toMatchObject({code:'23514'})
    }
    await expect(h.pool.query("UPDATE bookings SET accepted_quote='{}' WHERE id=$1",[booking.id])).rejects.toMatchObject({code:'23514'})
    await expect(h.pool.query('UPDATE bookings SET checkout_fingerprint=$1 WHERE id=$2',['a'.repeat(64),booking.id])).rejects.toMatchObject({code:'23514'})
  })
  it('reuses matching concurrent commands and rejects changed input, browser and quote reconsumption',async()=>{
    const {ctx,accepted}=await setup(),input=await accepted()
    const results=await Promise.all([startCheckout(ctx,input),startCheckout(ctx,input)])
    expect(results[0]).toEqual(results[1]);expect(results[0].state).toBe('preparing')
    expect(await startCheckout(ctx,{...input,contact:{...input.contact,name:'Changed'}})).toEqual({state:'rejected',code:'command-conflict'})
    expect((await startCheckout({...ctx,browserKey:opaqueSecret()},input)).state).toBe('rejected')
    expect(await startCheckout(ctx,{...input,commandKey:randomUUID()})).toEqual({state:'rejected',code:'already-prepared'})
    expect(await h.rows('bookings')).toHaveLength(1);expect(await h.rows('payment-attempts')).toHaveLength(1)
  })
  it('preserves a guest attempt through login without attaching booking history',async()=>{
    const {ctx,accepted,customer}=await setup(),input=await accepted(),original=await startCheckout(ctx,input)
    const signedIn={...ctx,actor:{kind:'customer' as const,collection:'customers' as const,id:customer.id}}
    expect(await startCheckout(signedIn,input)).toEqual(original)
    expect((await h.rows('bookings'))[0].ownerCustomer).toBeNull()
    expect((await h.rows('payment-attempts'))[0].amountMinor).toBe('20000')
  })
  it('allows a verified login before preparation to own a new guest quote booking',async()=>{
    const {ctx,accepted,customer}=await setup(),input=await accepted()
    expect((await startCheckout({...ctx,actor:{kind:'customer',collection:'customers',id:customer.id}},input)).state).toBe('preparing')
    expect((await h.rows('bookings'))[0].ownerCustomer).toBe(customer.id)
  })
  it.each([1,2])('keeps room and last-offer races atomic with %i physical rooms',async rooms=>{
    const {ctx,accepted}=await setup({offer:true,rooms})
    const second=await h.seed('customers',{name:'Second account',email:'second@example.test',password:'Synthetic-checkout-passphrase-946!',_verified:true})
    const next={...ctx,actor:{kind:'customer' as const,collection:'customers' as const,id:second.id},browserKey:opaqueSecret()}
    const a=await accepted(),b=await accepted(next),results=await Promise.all([startCheckout(ctx,a),startCheckout(next,b)])
    expect(results.filter(result=>result.state==='preparing')).toHaveLength(1)
    expect(results.filter(result=>result.state==='rejected')).toHaveLength(1)
    for(const name of ['bookings','allocations','offer-allocations','payment-attempts'] as const)expect(await h.rows(name)).toHaveLength(1)
    expect(await h.rows('work-items')).toHaveLength(2)
  })
  it('refuses a fresh preparation after acceptance expiry but reuses the original uncertain attempt',async()=>{
    const {ctx,accepted}=await setup({rooms:2}),old=await accepted(),input=await accepted(),started=await startCheckout(ctx,input)
    const attempt=(await h.rows('payment-attempts'))[0]
    await h.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'unknown'},overrideAccess:true})
    h.clock.set('2026-11-15T04:15:00Z')
    expect(await startCheckout(ctx,old)).toEqual({state:'rejected',code:'quote-expired'})
    const retry=await startCheckout(ctx,input);expect(retry.state).toBe('checking')
    expect(await startCheckout({...ctx,policy:{id:'unconfigured',revision:0,approvedSections:[],sections:{}}},input)).toEqual(retry)
    if(retry.state==='checking'&&started.state==='preparing')expect(retry.attemptId).toBe(started.attemptId)
    expect(await h.rows('payment-attempts')).toHaveLength(1)
  })
  it('confirms approved zero totals atomically without a provider attempt',async()=>{
    const {ctx,accepted}=await setup({zero:true}),input=await accepted(),result=await startCheckout(ctx,input)
    expect(result.state).toBe('confirmed');expect(await startCheckout(ctx,input)).toEqual(result)
    expect((await h.rows('bookings'))[0].status).toBe('confirmed');expect((await h.rows('allocations'))[0].purpose).toBe('booking')
    expect(await h.rows('payment-attempts')).toHaveLength(0);expect(await h.rows('work-items')).toHaveLength(1)
    expect((await h.rows('work-items'))[0].payload).toMatchObject({category:'booking',revision:1})
    expect(providerCreateCalls).toBe(0)
    if(result.state==='confirmed'){
      await h.payload.update({collection:'bookings',id:result.bookingId,data:{status:'cancelled'},overrideAccess:true})
      expect(await startCheckout(ctx,input)).toEqual({state:'rejected',code:'already-prepared'})
    }
  })
  it('consumes a full-discount offer exactly once during an approved no-payment confirmation',async()=>{
    const {ctx,accepted}=await setup({offer:true,zero:true}),input=await accepted(),result=await startCheckout(ctx,input)
    expect(result.state).toBe('confirmed');expect(await startCheckout(ctx,input)).toEqual(result)
    expect((await h.rows('offer-allocations'))[0].state).toBe('consumed')
    expect(await h.rows('offer-allocations')).toHaveLength(1);expect(await h.rows('payment-attempts')).toHaveLength(0)
    expect(providerCreateCalls).toBe(0)
  })
  it('denies unapproved checkout terms, altered totals and recovery quarantine',async()=>{
    const {ctx,accepted}=await setup(),input=await accepted()
    expect((await startCheckout({...ctx,policy:{...ctx.policy,approvedSections:['stay','pricing']}},input)).state).toBe('rejected')
    expect(await startCheckout(ctx,{...input,totalMinor:'1'} as CheckoutInput)).toEqual({state:'rejected',code:'invalid-input'})
    vi.stubEnv('APP_OPERATION_MODE','quarantine')
    expect((await startCheckout(ctx,input)).state).toBe('rejected');expect(await h.rows('bookings')).toHaveLength(0)
  })
})
