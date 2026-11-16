import {isDeepStrictEqual} from 'node:util'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking,BookingChange,PaymentTransaction,Room} from '@/payload-types'
import type {AcceptedQuote} from '@/domain/quotes/types'
import {InventoryConflict} from '@/domain/inventory/allocate'
import {freePhysicalRooms} from '@/domain/inventory/availability'
import {InventoryInputError,validateStay} from '@/domain/inventory/policy'
import {dateToStorage} from '@/domain/shared/dates'
import {relationshipId} from '@/features/customer/bookings'
import {requireChangePolicy} from './policy'
import {originalAllocation} from './context'
import {appendAudit} from '@/domain/audit/append'
import {queueBookingConfirmation} from '@/email/storage'
export async function replacementRoom(tx:DbTx,ctx:CommandContext,booking:Booking,quote:AcceptedQuote):Promise<Room|null>{
 try{validateStay(quote.policySnapshot,ctx.clock.now(),quote.stay);const rooms=(await freePhysicalRooms(tx,quote.stay,booking.id)).rooms,old=await originalAllocation(tx,booking);return rooms.find(room=>room.id===relationshipId(old.room))??rooms[0]??null}catch(error){if(error instanceof InventoryInputError)return null;throw error}
}
/** Database-only replacement. The exclusion constraint protects the enlarged interval at commit. */
export async function completeStayChangeTx(tx:DbTx,ctx:CommandContext,booking:Booking,change:BookingChange,quote:AcceptedQuote,room:Room,payment?:PaymentTransaction){
 const stored=await tx.payload.findByID({collection:'booking-changes',id:change.id,depth:0,req:tx.req,overrideAccess:false}),live=await tx.payload.findByID({collection:'bookings',id:booking.id,depth:0,req:tx.req,overrideAccess:false})
 if(relationshipId(stored.booking)!==live.id||relationshipId(stored.quote)!==quote.id||!isDeepStrictEqual(stored.acceptedQuote,quote)||!isDeepStrictEqual(live.acceptedQuote,stored.originalQuote))throw new Error('Persisted change context is required')
 change=stored;booking=live
 const originalTotal=(stored.originalQuote as {total:{minor:string;currency:string}}).total,delta=BigInt(quote.total.minor)-BigInt(originalTotal.minor)
 if(delta.toString()!==stored.deltaMinor||quote.total.currency!==stored.currency||originalTotal.currency!==stored.currency)throw new Error('Accepted change delta mismatch')
 if(delta>0n){
  if(tx.actor.kind!=='system'||!['payments','work','recovery'].includes(tx.actor.purpose)||!payment)throw new Error('Verified supplemental payment authority required')
  const actual=await tx.payload.findByID({collection:'payment-transactions',id:payment.id,depth:0,req:tx.req,overrideAccess:false}),attemptId=relationshipId(stored.paymentAttempt)
  if(!attemptId||actual.status!=='collected'||actual.environment==='offline'||actual.appliedRevision!=null||actual.amountMinor!==stored.deltaMinor||actual.currency!==stored.currency||relationshipId(actual.booking)!==booking.id||relationshipId(actual.attempt)!==attemptId)throw new Error('Exact merchant collection is required')
  const attempt=await tx.payload.findByID({collection:'payment-attempts',id:attemptId,depth:0,req:tx.req,overrideAccess:false})
  const evidence=await tx.payload.count({collection:'payment-inbox',where:{and:[{source:{equals:'retrieval'}},{environment:{equals:actual.environment}},{providerPaymentId:{equals:actual.providerPaymentId}},{merchantReference:{equals:attempt.merchantReference}},{providerStatus:{equals:'PAYMENT_SUCCESS'}},{amountMinor:{equals:stored.deltaMinor}},{currency:{equals:stored.currency}}]},req:tx.req,overrideAccess:false})
  if(attempt.purpose!=='change'||attempt.revision!==stored.targetRevision||attempt.state==='closed'||attempt.createOutcome==='refused'||!evidence.totalDocs)throw new Error('Live supplemental merchant evidence is required')
  payment=actual
 }else{if(payment)throw new Error('A non-increasing change requires no supplemental collection');await requireChangePolicy(tx,ctx)}
 if(change.state!=='awaiting-payment'||booking.status!=='confirmed'||booking.revision!==change.baseRevision||!isDeepStrictEqual(booking.acceptedQuote,change.originalQuote))throw new Error('Change no longer owns this booking revision')
 const old=await originalAllocation(tx,booking)
 if(!isDeepStrictEqual(old,change.originalAllocation))throw new Error('Original room allocation changed')
 await tx.payload.update({collection:'booking-changes',id:change.id,data:{state:'completed',completedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
 if(payment)await tx.payload.update({collection:'payment-transactions',id:payment.id,data:{appliedRevision:change.targetRevision},req:tx.req,overrideAccess:false})
 if(relationshipId(change.paymentAttempt))await tx.payload.update({collection:'payment-attempts',id:relationshipId(change.paymentAttempt)!,data:{state:'succeeded',nextReconcileAt:null,resumeRequestedAt:null},req:tx.req,overrideAccess:false})
 const current=await tx.payload.update({collection:'bookings',id:booking.id,data:{revision:change.targetRevision,currentQuote:quote.id,acceptedQuote:quote,arrival:dateToStorage(quote.stay.arrival),departure:dateToStorage(quote.stay.departure)},req:tx.req,overrideAccess:false})
 const dates={arrival:current.arrival,departure:current.departure}
 try{
  // Historical allocations are immutable. Replacing the same room retires
  // its old interval before inserting the new one in this same transaction.
  // Other transactions see the old or new committed allocation, never a gap.
  const sameRoom=room.id===relationshipId(old.room)
  if(sameRoom)await tx.payload.update({collection:'allocations',id:old.id,data:{released:true},req:tx.req,overrideAccess:false})
  await tx.payload.create({collection:'allocations',data:{...dates,room:room.id,booking:booking.id,purpose:'booking',released:false},req:tx.req,overrideAccess:false})
  if(!sameRoom)await tx.payload.update({collection:'allocations',id:old.id,data:{released:true},req:tx.req,overrideAccess:false})
 }catch(error){let cause:unknown=error;for(let depth=0;depth<7&&cause&&typeof cause==='object';depth++){const value=cause as {code?:string;cause?:unknown};if(value.code==='23P01')throw new InventoryConflict();cause=value.cause}throw error}
 await appendAudit(tx,{action:'booking:allocation-replaced',recordType:'allocations',recordId:old.id,outcome:'success',safeChanges:{bookingId:booking.id,revision:current.revision}})
 await queueBookingConfirmation(tx,ctx,current,quote)
 await appendAudit(tx,{action:'booking:stay-changed',recordType:'bookings',recordId:booking.id,outcome:'success',safeChanges:{revision:current.revision,amountMinor:quote.total.minor,currency:quote.total.currency}})
 return current
}
