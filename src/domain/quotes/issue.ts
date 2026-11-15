import type {CommandContext} from '@/domain/db/types'
import {privateDigest} from '@/domain/security/private-state'
import {appendAudit} from '@/domain/audit/append'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {validateStay} from '@/domain/inventory/policy'
import {freePhysicalRooms} from '@/domain/inventory/availability'
import {dateToStorage} from '@/domain/shared/dates'
import {plain} from '@/content/public-property'
import {calculatePrice,rateRulesSchema} from './calculate'
import {pricingPolicySchema,quoteIdentity,quoteRequestSchema,quoteSnapshot} from './validation'
import type {QuoteRequest,QuoteSnapshot} from './types'
export async function quoteStay(ctx:CommandContext,input:QuoteRequest):Promise<QuoteSnapshot>{
  const request=quoteRequestSchema.parse(input),now=ctx.clock.now()
  return ctx.uow.run(ctx.actor,async tx=>{
    await quoteIdentity(tx,ctx)
    const policy=await requireCurrentPolicy(tx,ctx,['stay','pricing']),pricing=pricingPolicySchema.parse(policy.sections.pricing),{stay}=validateStay(policy,now,request.stay)
    const inventory=await freePhysicalRooms(tx,stay),type=inventory.types.find(type=>type.id===stay.roomTypeId)
    if(!type||!inventory.rooms.length)throw new Error('The selected stay is unavailable')
    const rates=await tx.payload.find({collection:'rate-plans',where:{and:[{roomType:{equals:type.id}},{policyVersion:{equals:policy.id}},{approved:{equals:true}},{validFrom:{less_than_equal:dateToStorage(stay.arrival)}},{validUntil:{greater_than_equal:dateToStorage(stay.departure)}},...(process.env.APP_ENV==='production'?[{synthetic:{equals:false}}]:[])]},limit:1,sort:'-revision',depth:0,req:tx.req,overrideAccess:false})
    const rate=rates.docs[0]
    if(!rate||!rate.approvalReference?.trim())throw new Error('An approved rate is required')
    const rules=rateRulesSchema.parse(rate.rules)
    if(rules.currency!==pricing.currency)throw new Error('Approved currency mismatch')
    const breakdown=calculatePrice(stay,rules)
    if(breakdown.total.minor==='0'&&pricing.zeroTotal!=='confirm-without-payment')throw new Error('Zero-total checkout is not approved')
    const expiresAt=new Date(Date.parse(now)+pricing.quoteMinutes*60000).toISOString()
    const snapshot={...breakdown,version:1,stay,roomType:{id:type.id,name:plain(type.name)},policyVersionId:policy.id,policyRevision:policy.revision,rateVersionId:rate.id,offerVersionId:null,issuedAt:now,expiresAt,synthetic:!!(policy.synthetic||rate.synthetic||type.synthetic)}
    const row=await tx.payload.create({collection:'quotes',data:{version:1,issuerCustomer:ctx.actor.kind==='customer'?ctx.actor.id:undefined,browserHash:privateDigest('quote-browser\0'+ctx.browserKey),snapshot,policySnapshot:policy,rateSnapshot:rules,policyVersion:policy.id,rateVersion:rate.id,amountMinor:breakdown.total.minor,currency:breakdown.total.currency,issuedAt:now,expiresAt},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'quote:issued',recordType:'quotes',recordId:row.id,outcome:'success',safeChanges:{amountMinor:row.amountMinor,currency:row.currency,policyVersionId:policy.id,revision:policy.revision}})
    return quoteSnapshot(row)
  })
}
