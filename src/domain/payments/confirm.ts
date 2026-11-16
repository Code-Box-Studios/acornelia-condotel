import {queueBookingConfirmation} from '@/email/storage'
import {randomBytes} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Allocation,Booking,OfferAllocation,PaymentAttempt,PaymentTransaction} from '@/payload-types'
import type {AcceptedQuote} from '@/domain/quotes/types'
import {relationshipId} from '@/features/customer/bookings'
import {acceptedQuote} from '@/domain/quotes/validation'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {allocate} from '@/domain/inventory/allocate'
import {validateStay} from '@/domain/inventory/policy'
import {freePhysicalRooms} from '@/domain/inventory/availability'
import {consumeOffer} from '@/domain/offers/reserve'
import {bumpOfferUsage,loadOfferVersion,offerUsage} from '@/domain/offers/storage'
import {appendAudit} from '@/domain/audit/append'
const lateSchema=z.object({action:z.enum(['confirm-if-available','staff-review']),maxMinutes:z.number().int().min(1).max(10080)}).strict()
export async function originalPaymentContext(tx:DbTx,booking:Booking,attempt:PaymentAttempt):Promise<AcceptedQuote>{
  const context=z.object({quote:z.unknown(),ownerCustomerId:z.uuid().nullable(),contact:z.unknown(),stayingGuest:z.string(),deadline:z.string(),purpose:z.literal('booking'),revision:z.number().int().positive()}).strict().parse(attempt.acceptedContext)
  const id=relationshipId(booking.checkoutQuote);if(!id)throw new Error('Missing accepted quote')
  const row=await tx.payload.findByID({collection:'quotes',id,depth:0,req:tx.req,overrideAccess:false}),quote=acceptedQuote(row)
  if(attempt.purpose!=='booking'||attempt.revision!==booking.revision||attempt.commandKey!==booking.checkoutKey||attempt.fingerprint!==booking.checkoutFingerprint||relationshipId(row.consumedByBooking)!==booking.id||context.ownerCustomerId!==relationshipId(booking.ownerCustomer)||!isDeepStrictEqual(context.quote,quote)||!isDeepStrictEqual(booking.acceptedQuote,quote)||!isDeepStrictEqual(context.contact,booking.contact)||context.stayingGuest!==booking.stayingGuest||context.deadline!==attempt.deadline||context.revision!==attempt.revision||attempt.amountMinor!==quote.total.minor||attempt.currency!==quote.total.currency||booking.arrival.slice(0,10)!==quote.stay.arrival||booking.departure.slice(0,10)!==quote.stay.departure)throw new Error('Accepted operation context changed')
  return quote
}
type Plan={ok:true;hold:Allocation|null;offer:OfferAllocation|null;reacquire:boolean}|{ok:false;reason:string}
export async function planConfirmation(tx:DbTx,ctx:CommandContext,booking:Booking,attempt:PaymentAttempt,quote:AcceptedQuote,payment:PaymentTransaction,verifiedPaidAt?:string|null):Promise<Plan>{
  const holds=(await tx.payload.find({collection:'allocations',where:{and:[{booking:{equals:booking.id}},{released:{equals:false}}]},limit:3,depth:0,req:tx.req,overrideAccess:false})).docs
  if(holds.length>1||holds.some(row=>row.purpose!=='hold'||row.arrival!==booking.arrival||row.departure!==booking.departure||row.deadline!==attempt.deadline))return {ok:false,reason:'allocation-context-mismatch'}
  const hold=holds[0]??null
  let offer:OfferAllocation|null=null
  if(quote.offerVersionId){
    const active=(await tx.payload.find({collection:'offer-allocations',where:{and:[{booking:{equals:booking.id}},{offerVersion:{equals:quote.offerVersionId}},{state:{in:['reserved','consumed']}}]},limit:3,depth:0,req:tx.req,overrideAccess:false})).docs
    if(active.length>1||active.some(row=>relationshipId(row.quote)!==quote.id||relationshipId(row.customer)!==relationshipId(booking.ownerCustomer)))return {ok:false,reason:'offer-context-mismatch'}
    offer=active[0]??null
  }
  const paidAt=verifiedPaidAt??payment.collectedAt??ctx.clock.now(),late=Date.parse(paidAt)>Date.parse(attempt.deadline)||!hold||!!quote.offerVersionId&&!offer||booking.status==='expired'
  if(Date.parse(paidAt)<Date.parse(booking.preparedAt!)||Date.parse(paidAt)>Date.parse(ctx.clock.now())+300000)return {ok:false,reason:'payment-time-mismatch'}
  if(late){
    try{const policy=parseRuntimePolicy(quote.policySnapshot,['latePayment']),rule=lateSchema.parse(policy.sections.latePayment);if(rule.action!=='confirm-if-available'||Date.parse(ctx.clock.now())>Date.parse(attempt.deadline)+rule.maxMinutes*60000)return {ok:false,reason:'late-payment-review'}}catch{return {ok:false,reason:'late-payment-review'}}
  }
  if(!hold){
    try{validateStay(quote.policySnapshot,ctx.clock.now(),quote.stay);if(!(await freePhysicalRooms(tx,quote.stay)).rooms.length)return {ok:false,reason:'paid-room-unavailable'}}catch{return {ok:false,reason:'paid-room-unavailable'}}
  }
  const reacquire=!!quote.offerVersionId&&!offer
  if(reacquire){
    try{const {version}=await loadOfferVersion(tx,quote.offerVersionId!,ctx.clock.now());const customer=relationshipId(booking.ownerCustomer);if(!customer||(await offerUsage(tx,version,customer)).code)return {ok:false,reason:'paid-offer-unavailable'}}catch{return {ok:false,reason:'paid-offer-unavailable'}}
  }
  return {ok:true,hold,offer,reacquire}
}
export async function confirmPayment(tx:DbTx,ctx:CommandContext,booking:Booking,attempt:PaymentAttempt,quote:AcceptedQuote,payment:PaymentTransaction,plan:Extract<Plan,{ok:true}>):Promise<void>{
  const now=ctx.clock.now()
  const confirmed=await tx.payload.update({collection:'bookings',id:booking.id,data:{status:'confirmed',code:booking.code??'ACN-'+randomBytes(8).toString('hex').toUpperCase()},req:tx.req,overrideAccess:false})
  await tx.payload.update({collection:'payment-transactions',id:payment.id,data:{appliedRevision:booking.revision},req:tx.req,overrideAccess:false})
  if(plan.hold)await tx.payload.update({collection:'allocations',id:plan.hold.id,data:{purpose:'booking'},req:tx.req,overrideAccess:false})
  else await allocate(tx,{purpose:'booking',bookingId:booking.id,stay:quote.stay,policy:quote.policySnapshot,now})
  let offer=plan.offer
  if(plan.reacquire){
    const {version,offer:parent}=await loadOfferVersion(tx,quote.offerVersionId!,now)
    await bumpOfferUsage(tx,parent.id,parent.usageRevision)
    offer=await tx.payload.create({collection:'offer-allocations',data:{offer:version.offerId,offerVersion:version.id,quote:quote.id,booking:booking.id,customer:relationshipId(booking.ownerCustomer)!,allocationKey:'late-payment:'+payment.id,state:'reserved'},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'offer:reacquired',recordType:'offer-allocations',recordId:offer.id,outcome:'success',safeChanges:{bookingId:booking.id,offerVersionId:version.id}})
  }
  if(offer)await consumeOffer(tx,offer.id,now)
  await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'succeeded',resumeRequestedAt:null,nextReconcileAt:null},req:tx.req,overrideAccess:false})
  await queueBookingConfirmation(tx,ctx,confirmed,quote)
  await appendAudit(tx,{action:'payment:confirmed',recordType:'bookings',recordId:booking.id,outcome:'success',safeChanges:{amountMinor:payment.amountMinor,currency:payment.currency,revision:booking.revision,status:'confirmed'}})
}
