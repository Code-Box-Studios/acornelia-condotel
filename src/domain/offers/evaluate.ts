import type {CommandContext} from '@/domain/db/types'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {parseMoney} from '@/domain/shared/money'
import {nightsBetween,parsePropertyDate} from '@/domain/shared/dates'
import type {OfferEvaluation,OfferPricingInput,OfferVersion,OfferTerms,OfferReleaseReason} from './types'
import {offerTermsSchema,offerPolicySchema,releaseReasonSchema} from './validation'
export function evaluateOffer(ctx:Pick<CommandContext,'actor'|'policy'|'clock'>,input:OfferPricingInput,version:OfferVersion):OfferEvaluation{
  if(ctx.actor.kind!=='customer'||ctx.actor.collection!=='customers')return {ok:false,code:'account-required'}
  try{
    const policy=parseRuntimePolicy(ctx.policy,['offers']);offerPolicySchema.parse(policy.sections.offers)
    if(policy.id!==version.policyVersionId||version.synthetic&&process.env.APP_ENV==='production')return {ok:false,code:'unavailable'}
    const terms=offerTermsSchema.parse(version.terms),now=Date.parse(ctx.clock.now())
    if(!Number.isFinite(now)||now<Date.parse(terms.bookingFrom)||now>=Date.parse(terms.bookingUntil))return {ok:false,code:'outside-window'}
    parsePropertyDate(input.stay.arrival);parsePropertyDate(input.stay.departure);nightsBetween(input.stay.arrival,input.stay.departure)
    if(input.stay.arrival<terms.stayFrom||input.stay.departure>terms.stayUntil||!input.stay.roomTypeId||terms.roomScope==='selected'&&!terms.roomTypeIds.includes(input.stay.roomTypeId))return {ok:false,code:'inapplicable-stay'}
    const subtotal=parseMoney(input.basis.subtotal),discount=parseMoney(input.basis.discount)
    if(subtotal.currency!==terms.currency||discount.currency!==terms.currency||discount.minor!=='0')return {ok:false,code:'unavailable'}
    let eligible=0n,base=0n
    for(const line of input.basis.components){
      const amount=parseMoney(line.amount)
      if(amount.currency!==terms.currency)return {ok:false,code:'unavailable'}
      if(['night','extra-adult','child'].includes(line.kind))base+=BigInt(amount.minor)
      if(terms.eligibleComponents.some(kind=>kind===line.kind))eligible+=BigInt(amount.minor)
    }
    if(base!==BigInt(subtotal.minor)||eligible===0n)return {ok:false,code:'unavailable'}
    const spend=terms.minimumSpendBasis==='subtotal'?base:eligible
    if(spend<BigInt(terms.minimumSpend.minor))return {ok:false,code:'minimum-spend'}
    let value=terms.benefit.kind==='fixed'?BigInt(terms.benefit.minor):(eligible*BigInt(terms.benefit.bps)+5000n)/10000n
    if(terms.capMinor!==null&&value>BigInt(terms.capMinor))value=BigInt(terms.capMinor)
    if(value>eligible){if(terms.overDiscount==='reject')return {ok:false,code:'negative-total'};value=eligible}
    if(value===0n)return {ok:false,code:'unavailable'}
    return {ok:true,discount:{minor:value.toString(),currency:terms.currency},versionId:version.id,expiresAt:terms.bookingUntil}
  }catch{return {ok:false,code:'unavailable'}}
}
export function usageAfter(terms:OfferTerms,reason:OfferReleaseReason):'release'|'retain'{return offerTermsSchema.parse(terms).usage[releaseReasonSchema.parse(reason)]}
