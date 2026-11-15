import {isDeepStrictEqual} from 'node:util'
import type {DbTx} from '@/domain/db/types'
import type {AcceptedQuote} from '@/domain/quotes/types'
import type {OfferAllocation} from '@/payload-types'
import {acceptedQuote} from '@/domain/quotes/validation'
import {calculatePrice} from '@/domain/quotes/calculate'
import {relationshipId,requireCustomer} from '@/features/customer/bookings'
import {propertyToday} from '@/domain/shared/dates'
import {appendAudit} from '@/domain/audit/append'
import {evaluateOffer} from './evaluate'
import {bumpOfferUsage,loadOfferVersion,offerUsage,OfferUnavailable} from './storage'
export async function reserveOffer(tx:DbTx,input:AcceptedQuote,now:string):Promise<OfferAllocation>{
  const customerId=await requireCustomer(tx)
  const quote=await tx.payload.findByID({collection:'quotes',id:input.id,depth:0,req:tx.req,overrideAccess:false}),saved=acceptedQuote(quote)
  if(!saved.offerVersionId||!isDeepStrictEqual(saved,input)||relationshipId(quote.issuerCustomer)!==customerId)throw new OfferUnavailable('account-required')
  const bookingId=relationshipId(quote.consumedByBooking)
  if(!bookingId)throw new Error('Reserve offers only in the booking preparation transaction')
  const booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
  if(relationshipId(booking.ownerCustomer)!==customerId)throw new OfferUnavailable('account-required')
  const key='quote:'+saved.id,existing=(await tx.payload.find({collection:'offer-allocations',where:{allocationKey:{equals:key}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(existing){
    if(relationshipId(existing.booking)!==bookingId||relationshipId(existing.customer)!==customerId||relationshipId(existing.offerVersion)!==saved.offerVersionId)throw new OfferUnavailable('unavailable')
    if(existing.state==='released')throw new OfferUnavailable('reissue-required')
    return existing
  }
  const {version,offer}=await loadOfferVersion(tx,saved.offerVersionId,now)
  const evaluated=evaluateOffer({actor:tx.actor,policy:saved.policySnapshot,clock:{now:()=>now,today:tz=>propertyToday(tz,new Date(now))}},{stay:saved.stay,basis:calculatePrice(saved.stay,saved.rateSnapshot)},version)
  if(!evaluated.ok||!isDeepStrictEqual(evaluated.discount,saved.discount)||Date.parse(saved.expiresAt)<=Date.parse(now))throw new OfferUnavailable('unavailable')
  const usage=await offerUsage(tx,version,customerId)
  if(usage.code)throw new OfferUnavailable(usage.code)
  await bumpOfferUsage(tx,offer.id,offer.usageRevision)
  const row=await tx.payload.create({collection:'offer-allocations',data:{offer:offer.id,offerVersion:version.id,quote:saved.id,booking:bookingId,customer:customerId,allocationKey:key,state:'reserved'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'offer:reserved',recordType:'offer-allocations',recordId:row.id,outcome:'success',safeChanges:{offerVersionId:version.id,bookingId,state:row.state,discountMinor:saved.discount.minor,currency:saved.discount.currency}})
  return row
}
export async function consumeOffer(tx:DbTx,id:string,now=new Date().toISOString()):Promise<void>{
  const allocation=await tx.payload.findByID({collection:'offer-allocations',id,depth:0,req:tx.req,overrideAccess:false})
  if(tx.actor.kind==='anonymous'||tx.actor.kind==='system'&&!['payments','recovery'].includes(tx.actor.purpose)||tx.actor.kind==='staff'&&tx.actor.role!=='developer')throw new OfferUnavailable('account-required')
  if(tx.actor.kind==='customer'&&relationshipId(allocation.customer)!==tx.actor.id)throw new OfferUnavailable('account-required')
  if(allocation.state==='consumed')return
  if(allocation.state==='released')throw new OfferUnavailable('reissue-required')
  const quoteId=relationshipId(allocation.quote)
  if(!quoteId)throw new Error('Offer consumption requires an accepted quote')
  const quote=acceptedQuote(await tx.payload.findByID({collection:'quotes',id:quoteId,depth:0,req:tx.req,overrideAccess:false})),bookingId=relationshipId(allocation.booking)!
  const booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
  if(booking.status!=='confirmed')throw new Error('Confirm the booking before consuming offer usage')
  const zero=quote.total.minor==='0'&&(quote.policySnapshot.sections.pricing as {zeroTotal?:string}).zeroTotal==='confirm-without-payment'
  if(!zero){
    if(tx.actor.kind==='customer')throw new OfferUnavailable('account-required')
    const payment=await tx.payload.find({collection:'payment-transactions',where:{and:[{booking:{equals:bookingId}},{status:{equals:'collected'}},{amountMinor:{equals:quote.total.minor}},{currency:{equals:quote.total.currency}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})
    if(!payment.docs.length)throw new Error('Verified full payment is required before consuming offer usage')
  }
  await tx.payload.update({collection:'offer-allocations',id,data:{state:'consumed',consumedAt:now},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'offer:consumed',recordType:'offer-allocations',recordId:id,outcome:'success',safeChanges:{bookingId,state:'consumed'}})
}
