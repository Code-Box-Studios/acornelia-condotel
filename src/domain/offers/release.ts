import type {DbTx} from '@/domain/db/types'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
import {bumpOfferUsage,loadOfferVersion,OfferUnavailable} from './storage'
import {usageAfter} from './evaluate'
import {releaseReasonSchema} from './validation'
import type {OfferReleaseReason} from './types'
export async function releaseOffer(tx:DbTx,id:string,reason:OfferReleaseReason,now:string):Promise<void>{
  releaseReasonSchema.parse(reason)
  const allocation=await tx.payload.findByID({collection:'offer-allocations',id,depth:0,req:tx.req,overrideAccess:false})
  if(tx.actor.kind==='anonymous'||tx.actor.kind==='system'&&tx.actor.purpose==='email'||tx.actor.kind==='staff'&&tx.actor.role!=='developer')throw new OfferUnavailable('account-required')
  if(tx.actor.kind==='customer'&&relationshipId(allocation.customer)!==tx.actor.id)throw new OfferUnavailable('account-required')
  if(allocation.state==='released')return
  const {version,offer}=await loadOfferVersion(tx,relationshipId(allocation.offerVersion)!,now,false)
  if(usageAfter(version.terms,reason)==='retain')return
  if(reason==='refunded')throw new Error('Usage reinstatement requires the verified refund command')
  const bookingId=relationshipId(allocation.booking)!,booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
  if(reason==='cancelled'&&booking.status!=='cancelled'||reason==='expired-unpaid'&&booking.status!=='expired')throw new Error('Usage release reason does not match the booking transition')
  if(!['cancelled','expired'].includes(booking.status))throw new Error('A closed booking transition is required before usage release')
  const active=await tx.payload.count({collection:'payment-attempts',where:{and:[{booking:{equals:bookingId}},{state:{in:['preparing','ready','unknown','pending']}}]},req:tx.req,overrideAccess:false})
  if(active.totalDocs)throw new Error('Reconcile payable or unknown payment attempts before usage release')
  if(reason!=='cancelled'){
    const money=await tx.payload.count({collection:'payment-transactions',where:{and:[{booking:{equals:bookingId}},{status:{in:['pending','authorized','collected']}}]},req:tx.req,overrideAccess:false})
    if(money.totalDocs||allocation.state==='consumed')throw new Error('Known unpaid closure is required before usage release')
    if(reason==='expired-unpaid'){
      const future=await tx.payload.count({collection:'payment-attempts',where:{and:[{booking:{equals:bookingId}},{deadline:{greater_than:now}}]},req:tx.req,overrideAccess:false})
      if(future.totalDocs)throw new Error('The accepted payment deadline has not expired')
    }
  }
  await bumpOfferUsage(tx,offer.id,offer.usageRevision)
  await tx.payload.update({collection:'offer-allocations',id,data:{state:'released',releasedAt:now,releaseReason:reason},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'offer:released',recordType:'offer-allocations',recordId:id,outcome:'success',safeChanges:{bookingId,state:'released',reasonCode:reason}})
}
