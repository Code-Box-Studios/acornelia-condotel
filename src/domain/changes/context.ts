import {isDeepStrictEqual} from 'node:util'
import {z} from 'zod'
import type {DbTx} from '@/domain/db/types'
import type {Booking,BookingChange,PaymentAttempt} from '@/payload-types'
import {relationshipId} from '@/features/customer/bookings'
import {acceptedQuote,pricingPolicySchema} from '@/domain/quotes/validation'
import type {ChangeResult} from './types'
export async function currentStay(tx:DbTx,booking:Booking){
 const id=relationshipId(booking.currentQuote)||relationshipId(booking.checkoutQuote)
 if(!id)throw new Error('The accepted stay needs review')
 const row=await tx.payload.findByID({collection:'quotes',id,depth:0,req:tx.req,overrideAccess:false}),quote=acceptedQuote(row)
 if(relationshipId(row.consumedByBooking)!==booking.id)throw new Error('Accepted quote belongs to another booking')
 if(!isDeepStrictEqual(quote,booking.acceptedQuote))throw new Error('Accepted stay context mismatch')
 if(booking.status==='confirmed'&&!(quote.total.minor==='0'&&pricingPolicySchema.parse(quote.policySnapshot.sections.pricing).zeroTotal==='confirm-without-payment')){
  if(booking.currentQuote){
   const change=(await tx.payload.find({collection:'booking-changes',where:{and:[{booking:{equals:booking.id}},{kind:{equals:'stay'}},{state:{equals:'completed'}},{targetRevision:{equals:booking.revision}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
   if(!change||relationshipId(change.quote)!==quote.id||!isDeepStrictEqual(change.acceptedQuote,quote))throw new Error('Review the confirmed stay funding history')
  }else{
   const applied=await tx.payload.count({collection:'payment-transactions',where:{and:[{booking:{equals:booking.id}},{status:{equals:'collected'}},{appliedRevision:{equals:booking.revision}},{amountMinor:{equals:quote.total.minor}},{currency:{equals:quote.total.currency}}]},req:tx.req,overrideAccess:false})
   if(!applied.totalDocs)throw new Error('Review legacy confirmation funding before changing this stay')
  }
 }
 return quote
}
export async function originalAllocation(tx:DbTx,booking:Booking){
 const rows=(await tx.payload.find({collection:'allocations',where:{and:[{booking:{equals:booking.id}},{released:{equals:false}}]},limit:3,depth:0,req:tx.req,overrideAccess:false})).docs
 if(rows.length!==1||rows[0].purpose!=='booking'||rows[0].arrival!==booking.arrival||rows[0].departure!==booking.departure)throw new Error('Original allocation needs review')
 return rows[0]
}
export function changeResult(row:BookingChange):ChangeResult{return {kind:row.state,changeId:row.id,bookingId:relationshipId(row.booking)!,revision:row.state==='completed'?row.targetRevision:row.baseRevision,...(relationshipId(row.paymentAttempt)?{attemptId:relationshipId(row.paymentAttempt)!}:{}),...(BigInt(row.deltaMinor)<0n?{refundReviewMinor:(-BigInt(row.deltaMinor)).toString()}:{})}}
export class ChangeContextError extends Error{}
export async function changePaymentContext(tx:DbTx,booking:Booking,attempt:PaymentAttempt){
 const context=z.object({purpose:z.literal('change'),changeId:z.uuid(),quote:z.unknown(),delta:z.object({minor:z.string().regex(/^[1-9]\d*$/),currency:z.literal('PHP')}).strict(),bookingId:z.uuid(),baseRevision:z.number().int().positive(),targetRevision:z.number().int().positive(),ownerCustomerId:z.uuid().nullable(),contact:z.unknown(),stayingGuest:z.string(),deadline:z.iso.datetime()}).strict().parse(attempt.acceptedContext)
 const change=await tx.payload.findByID({collection:'booking-changes',id:context.changeId,depth:0,req:tx.req,overrideAccess:false}),quoteId=relationshipId(change.quote)
 if(!quoteId)throw new ChangeContextError('Missing change quote')
 const row=await tx.payload.findByID({collection:'quotes',id:quoteId,depth:0,req:tx.req,overrideAccess:false}),quote=(()=>{try{return acceptedQuote(row)}catch{throw new ChangeContextError('Invalid accepted change quote')}})()
 if(attempt.purpose!=='change'||relationshipId(attempt.booking)!==booking.id||context.bookingId!==booking.id||relationshipId(change.booking)!==booking.id||change.kind!=='stay'||relationshipId(change.paymentAttempt)!==attempt.id||attempt.commandKey!==change.commandKey||attempt.fingerprint!==change.fingerprint||attempt.revision!==change.targetRevision||context.targetRevision!==change.targetRevision||context.baseRevision!==change.baseRevision||context.targetRevision!==context.baseRevision+1||context.ownerCustomerId!==relationshipId(booking.ownerCustomer)||!isDeepStrictEqual(context.contact,booking.contact)||context.stayingGuest!==booking.stayingGuest||context.deadline!==attempt.deadline||row.scope!=='staff-change'||relationshipId(row.consumedByBooking)!==booking.id||!isDeepStrictEqual(context.quote,quote)||!isDeepStrictEqual(change.acceptedQuote,quote)||context.delta.minor!==change.deltaMinor||attempt.amountMinor!==context.delta.minor||attempt.currency!==context.delta.currency||change.currency!==attempt.currency)throw new ChangeContextError('Supplemental payment context mismatch')
 return {change,quote}
}
