import type {CommandContext,DbTx} from '@/domain/db/types'
import type {PaymentAttempt} from '@/payload-types'
import type {CloseEvidence} from '@/domain/payments/close-attempt'
import type {RecoveryPolicy} from '@/domain/payments/recovery-policy'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
/** Close only the supplemental operation. Its original paid stay remains allocated. */
export async function closeUnpaidChange(tx:DbTx,ctx:CommandContext,attempt:PaymentAttempt,evidence:CloseEvidence,policy:RecoveryPolicy,definitelyRefused:boolean){
 if(attempt.state==='closed'&&attempt.closedAt)return true
 if(attempt.purpose!=='change'||attempt.state==='succeeded')return false
 const now=ctx.clock.now()
 if(Date.parse(attempt.deadline)>Date.parse(now)&&(policy.terminalRelease==='at-deadline'||evidence.kind==='never-dispatched'))return false
 const change=(await tx.payload.find({collection:'booking-changes',where:{paymentAttempt:{equals:attempt.id}},limit:2,depth:0,req:tx.req,overrideAccess:false})).docs
 if(change.length!==1||change[0].kind!=='stay'||change[0].state==='completed'||relationshipId(change[0].booking)!==relationshipId(attempt.booking))return false
 const money=await tx.payload.count({collection:'payment-transactions',where:{and:[{attempt:{equals:attempt.id}},{status:{in:['pending','authorized','collected']}}]},req:tx.req,overrideAccess:false})
 if(money.totalDocs)return false
 if(evidence.kind==='never-dispatched'){
  const work=(await tx.payload.find({collection:'work-items',where:{semanticKey:{equals:'checkout:'+attempt.id}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(attempt.state!=='preparing'||!work||work.state!=='ready'||work.dispatchStarted)return false
  await tx.payload.update({collection:'work-items',id:work.id,data:{state:'done',generation:work.generation+1},req:tx.req,overrideAccess:false})
 }else if(evidence.kind==='definite-refusal'&&!definitelyRefused)return false
 await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'closed',closedAt:now,closeEvidence:evidence,nextReconcileAt:null,resumeRequestedAt:null},req:tx.req,overrideAccess:false})
 if(change[0].state==='awaiting-payment')await tx.payload.update({collection:'booking-changes',id:change[0].id,data:{state:'failed',reasonCode:'supplemental-payment-unpaid'},req:tx.req,overrideAccess:false})
 await appendAudit(tx,{action:'change:unpaid-closed',recordType:'booking-changes',recordId:change[0].id,outcome:'success',safeChanges:{bookingId:relationshipId(attempt.booking),revision:attempt.revision,reasonCode:evidence.kind}})
 return true
}
