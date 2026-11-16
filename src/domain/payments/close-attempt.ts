import type {CommandContext,DbTx} from '@/domain/db/types'
import type {PaymentAttempt} from '@/payload-types'
import type {RecoveryPolicy} from './recovery-policy'
import {release} from '@/domain/inventory/allocate'
import {releaseOffer} from '@/domain/offers/release'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
export type CloseEvidence={kind:'provider-terminal';paymentId:string;status:string;observedAt:string}|{kind:'never-dispatched'|'definite-refusal';observedAt:string}
export function definiteNoCreation(attempt:PaymentAttempt){return attempt.createOutcome==='refused'&&!!attempt.createObservedAt&&['configuration','invalid-input','unsupported-method','provider-authentication','window-too-short'].includes(attempt.createRefusalCode??'')}
export async function closeUnpaidAttempt(tx:DbTx,ctx:CommandContext,input:PaymentAttempt,evidence:CloseEvidence,policy:RecoveryPolicy):Promise<boolean>{
  const now=ctx.clock.now(),attempt=await tx.payload.findByID({collection:'payment-attempts',id:input.id,depth:0,req:tx.req,overrideAccess:false}),bookingId=relationshipId(attempt.booking)!,booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
  if(attempt.state==='closed'&&attempt.closedAt&&booking.status==='expired')return true
  if(attempt.purpose!=='booking'||attempt.revision!==booking.revision||booking.status!=='held'||attempt.state==='succeeded')return false
  if(Date.parse(attempt.deadline)>Date.parse(now)&&(policy.terminalRelease==='at-deadline'||evidence.kind==='never-dispatched'))return false
  const money=await tx.payload.count({collection:'payment-transactions',where:{and:[{booking:{equals:bookingId}},{status:{in:['pending','authorized','collected']}}]},req:tx.req,overrideAccess:false})
  const other=await tx.payload.count({collection:'payment-attempts',where:{and:[{booking:{equals:bookingId}},{id:{not_equals:attempt.id}},{state:{in:['preparing','ready','unknown','pending']}}]},req:tx.req,overrideAccess:false})
  if(money.totalDocs||other.totalDocs)return false
  if(evidence.kind==='never-dispatched'){
    const work=(await tx.payload.find({collection:'work-items',where:{semanticKey:{equals:'checkout:'+attempt.id}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(attempt.state!=='preparing'||!work||work.state!=='ready'||work.dispatchStarted)return false
    await tx.payload.update({collection:'work-items',id:work.id,data:{state:'done',generation:work.generation+1},req:tx.req,overrideAccess:false})
  }else if(evidence.kind==='definite-refusal'&&!definiteNoCreation(attempt))return false
  const allocations=(await tx.payload.find({collection:'allocations',where:{and:[{booking:{equals:bookingId}},{released:{equals:false}}]},limit:3,depth:0,req:tx.req,overrideAccess:false})).docs
  if(allocations.length!==1||allocations[0].purpose!=='hold')return false
  await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'closed',closedAt:now,closeEvidence:evidence,nextReconcileAt:null,resumeRequestedAt:null},req:tx.req,overrideAccess:false})
  await tx.payload.update({collection:'bookings',id:bookingId,data:{status:'expired'},req:tx.req,overrideAccess:false})
  await release(tx,allocations[0].id)
  const offers=(await tx.payload.find({collection:'offer-allocations',where:{and:[{booking:{equals:bookingId}},{state:{not_equals:'released'}}]},limit:100,depth:0,req:tx.req,overrideAccess:false})).docs
  for(const offer of offers)await releaseOffer(tx,offer.id,'expired-unpaid',now)
  await appendAudit(tx,{action:'payment:closed-unpaid',recordType:'payment-attempts',recordId:attempt.id,outcome:'success',safeChanges:{bookingId,reasonCode:evidence.kind,state:'closed'}})
  return true
}
