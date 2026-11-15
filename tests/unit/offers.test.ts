import {describe,expect,it} from 'vitest'
import {evaluateOffer,usageAfter} from '@/domain/offers/evaluate'
import {calculatePrice} from '@/domain/quotes/calculate'
import type {OfferTerms,OfferVersion,OfferPricingInput} from '@/domain/offers/types'
import type {CommandContext} from '@/domain/db/types'
const policyId='11111111-1111-4111-8111-111111111111',roomId='22222222-2222-4222-8222-222222222222'
const terms:OfferTerms={accountScope:'all-customers',currency:'PHP',roomScope:'all',roomTypeIds:[],bookingFrom:'2026-11-15T00:00:00Z',bookingUntil:'2026-11-16T00:00:00Z',stayFrom:'2027-01-01',stayUntil:'2028-01-01',minimumSpend:{minor:'0',currency:'PHP'},minimumSpendBasis:'eligible-charges',eligibleComponents:['night'],benefit:{kind:'fixed',minor:'1500'},capMinor:null,overDiscount:'cap',overallLimit:10,perAccountLimit:1,limitScope:'offer',stacking:'single-offer',expiryHandling:'reserve-before-window-end',rounding:'half-up',usage:{failed:'release','expired-unpaid':'release',cancelled:'retain',refunded:'retain',reissue:'release'}}
const version:OfferVersion={id:'33333333-3333-4333-8333-333333333333',offerId:'44444444-4444-4444-8444-444444444444',policyVersionId:policyId,revision:1,name:'Synthetic account offer',terms,synthetic:true}
const stay={roomTypeId:roomId,arrival:'2027-02-10',departure:'2027-02-11',occupancy:{adults:2,children:1}}
const basis=calculatePrice(stay,{currency:'PHP',nightMinor:'10000',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'1000',fees:[],taxes:[],taxBasis:'room-after-discount',rounding:'half-up-per-line'})
const input:OfferPricingInput={stay,basis}
const ctx:Pick<CommandContext,'actor'|'policy'|'clock'>={actor:{kind:'customer',collection:'customers',id:'55555555-5555-4555-8555-555555555555'},policy:{id:policyId,revision:1,approvedSections:['offers'],sections:{offers:{enabled:true,accountScope:'all-customers',discountOrder:'before-fees-and-tax'}},synthetic:true},clock:{now:()=> '2026-11-15T04:00:00Z',today:()=> '2026-11-15'}}
describe('all-account offer eligibility and value',()=>{
  it('rejects guest redemption even if the guest knows the offer identity',()=>{
    expect(evaluateOffer({...ctx,actor:{kind:'anonymous'}},input,version)).toEqual({ok:false,code:'account-required'})
    expect(evaluateOffer(ctx,input,version)).toMatchObject({ok:true,discount:{minor:'1500',currency:'PHP'}})
  })
  it('calculates an approved percentage cap only over eligible charge components',()=>{
    expect(evaluateOffer(ctx,input,{...version,terms:{...terms,benefit:{kind:'percent',bps:1250},capMinor:'1000'}})).toMatchObject({ok:true,discount:{minor:'1000',currency:'PHP'}})
    expect(evaluateOffer(ctx,input,{...version,terms:{...terms,benefit:{kind:'percent',bps:1250},capMinor:null}})).toMatchObject({ok:true,discount:{minor:'1250',currency:'PHP'}})
  })
  it('enforces booking/stay windows, room scope and minimum spend',()=>{
    expect(evaluateOffer({...ctx,clock:{...ctx.clock,now:()=>terms.bookingUntil}},input,version).ok).toBe(false)
    expect(evaluateOffer(ctx,{...input,stay:{...stay,arrival:'2026-12-31'}},version).ok).toBe(false)
    expect(evaluateOffer(ctx,input,{...version,terms:{...terms,roomScope:'selected',roomTypeIds:[policyId]}}).ok).toBe(false)
    expect(evaluateOffer(ctx,input,{...version,terms:{...terms,minimumSpend:{minor:'10500',currency:'PHP'}}})).toEqual({ok:false,code:'minimum-spend'})
    expect(evaluateOffer(ctx,input,{...version,terms:{...terms,minimumSpend:{minor:'10500',currency:'PHP'},minimumSpendBasis:'subtotal'}}).ok).toBe(true)
  })
  it('caps or rejects over-discounting only according to its explicit rule',()=>{
    expect(evaluateOffer(ctx,input,{...version,terms:{...terms,benefit:{kind:'fixed',minor:'20000'},overDiscount:'cap'}})).toMatchObject({ok:true,discount:{minor:'10000',currency:'PHP'}})
    expect(evaluateOffer(ctx,input,{...version,terms:{...terms,benefit:{kind:'fixed',minor:'20000'},overDiscount:'reject'}})).toEqual({ok:false,code:'negative-total'})
  })
  it('denies missing approval, targeting, stacking and unsupported money rules',()=>{
    expect(evaluateOffer({...ctx,policy:{...ctx.policy,approvedSections:[]}},input,version).ok).toBe(false)
    for(const patch of [{accountScope:'selected'},{stacking:'combine'},{rounding:'bankers'},{benefit:{kind:'fixed',minor:'-1'}}])expect(evaluateOffer(ctx,input,{...version,terms:{...terms,...patch}} as OfferVersion).ok).toBe(false)
  })
  it('keeps each failure/cancellation/refund/reissue outcome explicit and never invents rewards',()=>{
    expect(usageAfter(terms,'failed')).toBe('release')
    expect(usageAfter(terms,'expired-unpaid')).toBe('release')
    expect(usageAfter(terms,'cancelled')).toBe('retain')
    expect(usageAfter(terms,'refunded')).toBe('retain')
    expect(usageAfter(terms,'reissue')).toBe('release')
  })
})
