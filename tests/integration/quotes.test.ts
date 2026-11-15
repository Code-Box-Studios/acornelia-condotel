import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {opaqueSecret} from '@/domain/security/private-state'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {resolveCurrentPolicy} from '@/domain/policy/current'
import type {RateRules} from '@/domain/quotes/types'
const rules:RateRules={currency:'PHP',nightMinor:'10000',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'1000',childNightMinor:'500',fees:[],taxes:[],taxBasis:'room-and-fees-after-discount',rounding:'half-up-per-line'}
describe('versioned private quotes and approved policy snapshots',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-15T04:00:00Z')})
  afterAll(async()=>{await h?.close()})
  async function setup(zero='unavailable'){
    const policy=await h.seed('policy-versions',{revision:1,approved:true,active:true,synthetic:true,approvalReference:'synthetic-reviewed-fixture',approvedSections:['stay','pricing'],sections:{stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:zero}}})
    const type=await h.seed('room-types',{name:'Quote room fixture',slug:'quote-room',onSale:true,maxGuests:4,_status:'published'})
    await h.seed('rooms',{label:'PRIVATE-QUOTE-ROOM',roomType:type.id,onSale:true})
    const rate=await h.seed('rate-plans',{roomType:type.id,policyVersion:policy.id,revision:1,rules,validFrom:'2026-11-15T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-rate-review'})
    const ctx={...h.ctx({kind:'anonymous'}),browserKey:opaqueSecret(),policy:{id:policy.id,revision:policy.revision,synthetic:true as const,approvedSections:['stay','pricing'],sections:policy.sections as Record<string,unknown>}}
    const request={stay:{roomTypeId:type.id,arrival:'2027-02-10',departure:'2027-02-12',occupancy:{adults:2,children:1}}}
    return {policy,type,rate,ctx,request}
  }
  it('retains accepted price after a rate change',async()=>{
    const {ctx,request,rate,type,policy}=await setup(),original=await quoteStay(ctx,request),originalAccepted=await acceptQuote(ctx,original.id,original.version)
    expect(originalAccepted.total).toEqual({minor:'21000',currency:'PHP'})
    await expect(h.payload.update({collection:'rate-plans',id:rate.id,data:{rules:{...rules,nightMinor:'30000'}},overrideAccess:true})).rejects.toThrow()
    await h.seed('rate-plans',{roomType:type.id,policyVersion:policy.id,revision:2,rules:{...rules,nightMinor:'30000'},validFrom:'2026-11-15T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-new-rate-review'})
    const next=await quoteStay(ctx,request),reloadedAccepted=await acceptQuote(ctx,original.id,original.version)
    expect(next.total.minor).toBe('61000')
    expect(reloadedAccepted.total).toEqual(originalAccepted.total)
    expect(reloadedAccepted.rateVersionId).toBe(rate.id)
    const changedPriceWithoutAcceptance=await acceptQuote(ctx,next.id,next.version+1).then(()=>({ok:true}),()=>({ok:false}))
    expect(changedPriceWithoutAcceptance.ok).toBe(false)
    expect(await h.rows('payment-attempts')).toHaveLength(0)
    expect(await h.rows('allocations')).toHaveLength(0)
  })
  it('binds guest quotes to the original browser and refuses raw financial edits',async()=>{
    const {ctx,request}=await setup(),quote=await quoteStay(ctx,request)
    await expect(acceptQuote({...ctx,browserKey:opaqueSecret()},quote.id,quote.version)).rejects.toThrow()
    await expect(quoteStay({...ctx,browserKey:undefined},request)).rejects.toThrow()
    await expect(quoteStay(ctx,{...request,totalMinor:'1'} as typeof request)).rejects.toThrow()
    await expect(h.payload.findByID({collection:'quotes',id:quote.id,overrideAccess:false,depth:3})).rejects.toThrow()
    await expect(h.pool.query("UPDATE quotes SET amount_minor='1' WHERE id=$1",[quote.id])).rejects.toThrow()
  })
  it('expires unaccepted quotes but preserves an already accepted snapshot and idempotent acceptance',async()=>{
    const {ctx,request}=await setup(),unaccepted=await quoteStay(ctx,request),accepted=await quoteStay(ctx,request)
    const results=await Promise.all([acceptQuote(ctx,accepted.id,accepted.version),acceptQuote(ctx,accepted.id,accepted.version)])
    expect(results[0].acceptedAt).toBe(results[1].acceptedAt)
    h.clock.set('2026-11-15T04:15:00Z')
    await expect(acceptQuote(ctx,unaccepted.id,unaccepted.version)).rejects.toThrow()
    expect((await acceptQuote(ctx,accepted.id,accepted.version)).total).toEqual(results[0].total)
    expect(await h.rows('audit-entries',{action:{equals:'quote:accepted'}})).toHaveLength(1)
  })
  it('gates policy/rate approval and capacity without inventing defaults or physical-room promises',async()=>{
    expect((await resolveCurrentPolicy(h.payload)).revision).toBe(0)
    const {ctx,request,rate}=await setup()
    expect((await resolveCurrentPolicy(h.payload)).id).toBe(ctx.policy.id)
    await expect(quoteStay({...ctx,policy:{...ctx.policy,approvedSections:['stay']}},request)).rejects.toThrow()
    await expect(quoteStay(ctx,{stay:{...request.stay,occupancy:{adults:5,children:0}}})).rejects.toThrow()
    const quote=await quoteStay(ctx,request)
    expect(JSON.stringify(quote)).not.toContain('PRIVATE-QUOTE-ROOM')
    expect(quote.rateVersionId).toBe(rate.id)
    await expect(h.pool.query('UPDATE policy_versions SET sections=$1 WHERE id=$2',[JSON.stringify({pricing:{currency:'USD'}}),ctx.policy.id])).rejects.toThrow()
    await expect(quoteStay(ctx,{stay:{...request.stay,arrival:'2026-11-14',departure:'2026-11-15'}})).rejects.toThrow()
  })
  it('rejects zero and forged in-memory approval',async()=>{
    const {ctx,request,rate,type,policy}=await setup()
    const zero={...rules,nightMinor:'0',extraAdultNightMinor:'0',childNightMinor:'0'}
    await h.seed('rate-plans',{roomType:type.id,policyVersion:policy.id,revision:rate.revision+1,rules:zero,validFrom:'2026-11-15T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-zero-rate-review'})
    await expect(quoteStay(ctx,request)).rejects.toThrow()
    const approved={...ctx,policy:{...ctx.policy,sections:{...ctx.policy.sections,pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:'confirm-without-payment'}}}}
    // A different approval requires a new immutable policy version, not an in-memory override.
    await expect(quoteStay(approved,request)).rejects.toThrow()
    expect(await h.rows('payment-transactions')).toHaveLength(0)
  })
  it('allows an explicitly approved zero quote without creating payment or inventory effects',async()=>{
    const {ctx,request,type,policy}=await setup('confirm-without-payment')
    await h.seed('rate-plans',{roomType:type.id,policyVersion:policy.id,revision:2,rules:{...rules,nightMinor:'0',extraAdultNightMinor:'0',childNightMinor:'0'},validFrom:'2026-11-15T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-zero-rate-review'})
    const quote=await quoteStay(ctx,request),accepted=await acceptQuote(ctx,quote.id,quote.version)
    expect(accepted.total).toEqual({minor:'0',currency:'PHP'})
    expect(await h.rows('payment-attempts')).toHaveLength(0)
    expect(await h.rows('payment-transactions')).toHaveLength(0)
    expect(await h.rows('allocations')).toHaveLength(0)
  })
  it('keeps an account quote bound to its verified customer across account switching',async()=>{
    const {ctx,request}=await setup()
    const first=await h.seed('customers',{name:'Quote owner',email:'first@example.test',password:'Synthetic-quote-passphrase-823!',_verified:true})
    const second=await h.seed('customers',{name:'Other customer',email:'second@example.test',password:'Synthetic-quote-passphrase-823!',_verified:true})
    const owner={...ctx,actor:{kind:'customer' as const,collection:'customers' as const,id:first.id}},quote=await quoteStay(owner,request)
    await expect(acceptQuote({...ctx,actor:{kind:'customer',collection:'customers',id:second.id}},quote.id,quote.version)).rejects.toThrow()
    await expect(acceptQuote(ctx,quote.id,quote.version)).rejects.toThrow()
    expect((await acceptQuote(owner,quote.id,quote.version)).total).toEqual(quote.total)
  })
  it('rolls back acceptance if its required audit insert fails',async()=>{
    const {ctx,request}=await setup(),quote=await quoteStay(ctx,request)
    await h.pool.query("CREATE FUNCTION reject_quote_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='quote:accepted' THEN RAISE EXCEPTION 'injected quote audit failure'; END IF; RETURN NEW; END $$")
    await h.pool.query('CREATE TRIGGER reject_quote_audit BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_quote_audit()')
    try{await expect(acceptQuote(ctx,quote.id,quote.version)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_quote_audit ON audit_entries');await h.pool.query('DROP FUNCTION reject_quote_audit()')}
    expect((await h.rows('quotes'))[0].acceptedAt).toBeFalsy()
    expect((await acceptQuote(ctx,quote.id,quote.version)).acceptedAt).toBeTruthy()
  })
})
