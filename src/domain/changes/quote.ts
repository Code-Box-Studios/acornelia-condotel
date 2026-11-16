import type {CommandContext} from '@/domain/db/types'
import type {QuoteSnapshot} from '@/domain/quotes/types'
import type {ChangeQuoteInput} from './types'
import {z} from 'zod'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {requireChangePolicy,requireChangeable} from './policy'
import {currentStay,originalAllocation} from './context'
import {freePhysicalRooms} from '@/domain/inventory/availability'
import {validateStay} from '@/domain/inventory/policy'
import {pricingPolicySchema,quoteRequestSchema,quoteSnapshot} from '@/domain/quotes/validation'
import {calculatePrice,rateRulesSchema} from '@/domain/quotes/calculate'
import {quoteBookingTerms} from '@/domain/bookings/validation'
import {dateToStorage} from '@/domain/shared/dates'
import {privateDigest} from '@/domain/security/private-state'
import {plain} from '@/content/public-property'
import {appendAudit} from '@/domain/audit/append'
export async function quoteStayChange(ctx:CommandContext,bookingId:string,expectedRevision:number,input:ChangeQuoteInput):Promise<QuoteSnapshot>{
 z.uuid().parse(bookingId);const request=quoteRequestSchema.shape.stay.parse(input),now=ctx.clock.now()
 if(!ctx.browserKey||!/^[A-Za-z0-9_-]{43}$/.test(ctx.browserKey))throw new Error('Quote browser access required')
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireChangePolicy(tx,ctx);const policy=await requireCurrentPolicy(tx,ctx,['stay','pricing','bookingTerms']),booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
  requireChangeable(ctx,booking,expectedRevision);await originalAllocation(tx,booking)
  if((await currentStay(tx,booking)).offerVersionId)throw new Error('Changes to offer bookings require approved adjustment rules')
  const pricing=pricingPolicySchema.parse(policy.sections.pricing),{stay}=validateStay(policy,now,request),inventory=await freePhysicalRooms(tx,stay,booking.id),type=inventory.types.find(value=>value.id===stay.roomTypeId)
  if(!type||!inventory.rooms.length)throw new Error('The replacement stay is unavailable')
  const rate=(await tx.payload.find({collection:'rate-plans',where:{and:[{roomType:{equals:type.id}},{policyVersion:{equals:policy.id}},{approved:{equals:true}},{validFrom:{less_than_equal:dateToStorage(stay.arrival)}},{validUntil:{greater_than_equal:dateToStorage(stay.departure)}},...(process.env.APP_ENV==='production'?[{synthetic:{equals:false}}]:[])]},limit:1,sort:'-revision',depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(!rate?.approvalReference?.trim())throw new Error('An approved replacement rate is required')
  const rules=rateRulesSchema.parse(rate.rules),breakdown=calculatePrice(stay,rules)
  if(rules.currency!==pricing.currency||breakdown.total.minor==='0'&&pricing.zeroTotal!=='confirm-without-payment')throw new Error('Replacement price is unavailable')
  const expiresAt=new Date(Date.parse(now)+pricing.quoteMinutes*60000).toISOString(),snapshot={...breakdown,version:1,stay,roomType:{id:type.id,name:plain(type.name)},policyVersionId:policy.id,policyRevision:policy.revision,rateVersionId:rate.id,offerVersionId:null,issuedAt:now,expiresAt,synthetic:!!(policy.synthetic||rate.synthetic||type.synthetic),terms:quoteBookingTerms(policy)}
  const row=await tx.payload.create({collection:'quotes',data:{version:1,scope:'staff-change',issuerStaff:ctx.actor.kind==='staff'?ctx.actor.id:undefined,changeContext:{bookingId,revision:expectedRevision},browserHash:privateDigest('quote-browser\0'+ctx.browserKey),snapshot,policySnapshot:policy,rateSnapshot:rules,policyVersion:policy.id,rateVersion:rate.id,amountMinor:breakdown.total.minor,currency:breakdown.total.currency,issuedAt:now,expiresAt},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'change:quote-issued',recordType:'quotes',recordId:row.id,outcome:'success',safeChanges:{bookingId,revision:expectedRevision,amountMinor:row.amountMinor,currency:row.currency}})
  return quoteSnapshot(row)
 })
}
