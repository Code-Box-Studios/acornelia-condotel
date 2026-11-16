import type {CommandContext} from '@/domain/db/types'
import {randomUUID} from 'node:crypto'
import {privateDigest} from '@/domain/security/private-state'
import {appendAudit} from '@/domain/audit/append'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {validateStay} from '@/domain/inventory/policy'
import {freePhysicalRooms} from '@/domain/inventory/availability'
import {dateToStorage} from '@/domain/shared/dates'
import {plain} from '@/content/public-property'
import {loadOfferVersion,offerUsage,OfferUnavailable} from '@/domain/offers/storage'
import {evaluateOffer} from '@/domain/offers/evaluate'
import {calculatePrice,rateRulesSchema} from './calculate'
import {pricingPolicySchema,quoteIdentity,quoteRequestSchema,quoteSnapshot} from './validation'
import type {QuoteRequest,QuoteSnapshot} from './types'
import {quoteBookingTerms} from '@/domain/bookings/validation'
import {directStaffAllowed} from '@/domain/bookings/direct-policy'
export async function quoteStay(ctx:CommandContext,input:QuoteRequest):Promise<QuoteSnapshot>{
  const request=quoteRequestSchema.parse(input),now=ctx.clock.now()
  return ctx.uow.run(ctx.actor,async tx=>{
    await quoteIdentity(tx,ctx)
    const policy=await requireCurrentPolicy(tx,ctx,['stay','pricing',...(request.offerVersionId?['offers']:[])]),pricing=pricingPolicySchema.parse(policy.sections.pricing),{stay}=validateStay(policy,now,request.stay)
    const inventory=await freePhysicalRooms(tx,stay),type=inventory.types.find(type=>type.id===stay.roomTypeId)
    if(!type||!inventory.rooms.length)throw new Error('The selected stay is unavailable')
    const rates=await tx.payload.find({collection:'rate-plans',where:{and:[{roomType:{equals:type.id}},{policyVersion:{equals:policy.id}},{approved:{equals:true}},{validFrom:{less_than_equal:dateToStorage(stay.arrival)}},{validUntil:{greater_than_equal:dateToStorage(stay.departure)}},...(process.env.APP_ENV==='production'?[{synthetic:{equals:false}}]:[])]},limit:1,sort:'-revision',depth:0,req:tx.req,overrideAccess:false})
    const rate=rates.docs[0]
    if(!rate||!rate.approvalReference?.trim())throw new Error('An approved rate is required')
    const rules=rateRulesSchema.parse(rate.rules)
    if(rules.currency!==pricing.currency)throw new Error('Approved currency mismatch')
    let breakdown=calculatePrice(stay,rules),offerVersionId:string|null=null,offerUntil:number|undefined
    if(request.offerVersionId){
      if(ctx.actor.kind!=='customer')throw new OfferUnavailable('account-required')
      const {version}=await loadOfferVersion(tx,request.offerVersionId,now)
      const evaluation=evaluateOffer({...ctx,policy},{stay,basis:breakdown},version)
      if(!evaluation.ok)throw new OfferUnavailable('unavailable')
      const usage=await offerUsage(tx,version,ctx.actor.id)
      if(usage.code)throw new OfferUnavailable(usage.code)
      breakdown=calculatePrice(stay,rules,evaluation.discount);offerVersionId=version.id;offerUntil=Date.parse(evaluation.expiresAt)
    }
    if(breakdown.total.minor==='0'&&pricing.zeroTotal!=='confirm-without-payment')throw new Error('Zero-total checkout is not approved')
    const expiresAt=new Date(Math.min(Date.parse(now)+pricing.quoteMinutes*60000,offerUntil??Infinity)).toISOString()
    const snapshot={...breakdown,version:1,stay,roomType:{id:type.id,name:plain(type.name)},policyVersionId:policy.id,policyRevision:policy.revision,rateVersionId:rate.id,offerVersionId,issuedAt:now,expiresAt,synthetic:!!(policy.synthetic||rate.synthetic||type.synthetic),terms:quoteBookingTerms(policy)}
    const direct=ctx.actor.kind==='staff'&&directStaffAllowed(ctx)
    const row=await tx.payload.create({collection:'quotes',data:{version:1,scope:direct?'staff-direct':'website',directCommandKey:direct?randomUUID():undefined,issuerStaff:direct&&ctx.actor.kind==='staff'?ctx.actor.id:undefined,issuerCustomer:ctx.actor.kind==='customer'?ctx.actor.id:undefined,browserHash:privateDigest('quote-browser\0'+ctx.browserKey),snapshot,policySnapshot:policy,rateSnapshot:rules,policyVersion:policy.id,rateVersion:rate.id,offerVersion:offerVersionId,amountMinor:breakdown.total.minor,currency:breakdown.total.currency,issuedAt:now,expiresAt},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'quote:issued',recordType:'quotes',recordId:row.id,outcome:'success',safeChanges:{amountMinor:row.amountMinor,currency:row.currency,policyVersionId:policy.id,revision:policy.revision}})
    return quoteSnapshot(row)
  })
}
