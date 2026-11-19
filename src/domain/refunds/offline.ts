import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {RefundEvidence,RefundOperation} from '@/payload-types'
import {privateDigest} from '@/domain/security/private-state'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
import {refundStaff,requireRefundPolicy} from './policy'
export type OfflineReimbursementInput={refundId:string;method:'cash'|'bank-transfer';receiptReference:string;evidenceReference:string;paidAt?:string}
export type OfflineReview={refundId:string;evidenceId:string;decision:'confirm'|'reject'}
const text=(max:number)=>z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/)
const attestSchema=z.object({refundId:z.uuid(),method:z.enum(['cash','bank-transfer']),receiptReference:text(120),evidenceReference:text(240),paidAt:z.iso.datetime({offset:true}).optional()}).strict()
const reviewSchema=z.object({refundId:z.uuid(),evidenceId:z.uuid(),decision:z.enum(['confirm','reject'])}).strict()
const proofSchema=z.object({version:z.literal(1),trust:z.literal('staff-attested'),method:z.enum(['cash','bank-transfer']),receiptReference:z.string(),receiptKey:z.string(),evidenceReference:z.string(),paidAt:z.string()}).strict()
/** One physical reimbursement receipt can settle only one refund operation. */
export function offlineReimbursementKey(method:'cash'|'bank-transfer',receiptReference:string){return 'offline-refund:'+method+':'+receiptReference.trim().toUpperCase()}
function staffId(ctx:CommandContext){return ctx.actor.kind==='staff'?ctx.actor.id:''}
async function offlineOperation(tx:DbTx,ctx:CommandContext,refundId:string):Promise<RefundOperation>{
 const rule=await requireRefundPolicy(tx,ctx)
 if(rule.offlineReview!=='independent-staff')throw new Error('Offline reimbursement is unavailable')
 const operation=await tx.payload.findByID({collection:'refund-operations',id:refundId,depth:0,req:tx.req,overrideAccess:false})
 if(operation.origin!=='app'||operation.method!=='offline')throw new Error('An authorized offline reimbursement is required')
 return operation
}
/** Staff record what they paid out. The reservation stays held until a different staff member reviews it. */
export async function attestOfflineReimbursement(ctx:CommandContext,input:OfflineReimbursementInput):Promise<RefundEvidence>{
 refundStaff(ctx);const value=attestSchema.parse(input)
 return ctx.uow.run(ctx.actor,async tx=>{
  const operation=await offlineOperation(tx,ctx,value.refundId),now=ctx.clock.now(),paidAt=value.paidAt??now,key=offlineReimbursementKey(value.method,value.receiptReference)
  if(Date.parse(paidAt)>Date.parse(now))throw new Error('Reimbursement time cannot be in the future')
  const semanticKey=privateDigest('offline-refund-evidence\0'+JSON.stringify({operation:operation.id,key})),previous=(await tx.payload.find({collection:'refund-evidence',where:{semanticKey:{equals:semanticKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(previous){
   const saved=proofSchema.parse(previous.proof)
   if(relationshipId(previous.sourceStaff)!==staffId(ctx)||saved.evidenceReference!==value.evidenceReference||value.paidAt&&saved.paidAt!==value.paidAt)throw new Error('Receipt evidence conflicts with its original record')
   return previous
  }
  if(operation.state!=='authorized')throw new Error('Only an unsettled offline reservation accepts reimbursement evidence')
  const open=await tx.payload.count({collection:'refund-evidence',where:{and:[{operation:{equals:operation.id}},{source:{equals:'staff-attested'}},{state:{equals:'pending'}}]},req:tx.req,overrideAccess:false})
  if(open.totalDocs)throw new Error('Existing reimbursement evidence awaits review')
  const used=await tx.payload.count({collection:'refund-operations',where:{offlineReceiptKey:{equals:key}},req:tx.req,overrideAccess:false})
  if(used.totalDocs)throw new Error('Receipt already belongs to another reimbursement')
  const payment=await tx.payload.findByID({collection:'payment-transactions',id:relationshipId(operation.payment)!,depth:0,req:tx.req,overrideAccess:false})
  const row=await tx.payload.create({collection:'refund-evidence',data:{semanticKey,payment:payment.id,operation:operation.id,environment:'offline',kind:'offline',providerPaymentId:payment.providerPaymentId,amountMinor:operation.amountMinor,currency:operation.currency,providerStatus:'STAFF_ATTESTED',source:'staff-attested',observedAt:paidAt,proof:{version:1,trust:'staff-attested',method:value.method,receiptReference:value.receiptReference,receiptKey:key,evidenceReference:value.evidenceReference,paidAt},sourceStaff:staffId(ctx),state:'pending'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'refund:offline-attested',recordType:'refund-evidence',recordId:row.id,outcome:'success',safeChanges:{amountMinor:row.amountMinor,currency:row.currency}})
  return row
 })
}
/** A second staff member confirms or rejects the attested payout. Rejection keeps the reservation held. */
export async function reviewOfflineReimbursement(ctx:CommandContext,input:OfflineReview):Promise<RefundOperation>{
 refundStaff(ctx);const value=reviewSchema.parse(input)
 return ctx.uow.run(ctx.actor,async tx=>{
  const operation=await offlineOperation(tx,ctx,value.refundId),evidence=await tx.payload.findByID({collection:'refund-evidence',id:value.evidenceId,depth:0,req:tx.req,overrideAccess:false}),now=ctx.clock.now()
  if(relationshipId(evidence.operation)!==operation.id||evidence.source!=='staff-attested'||evidence.kind!=='offline')throw new Error('Reimbursement evidence does not belong to this operation')
  if(evidence.state!=='pending'||operation.state!=='authorized')throw new Error('Reimbursement evidence was already reviewed')
  if(relationshipId(evidence.sourceStaff)===staffId(ctx))throw new Error('An independent reviewer is required')
  const proof=proofSchema.parse(evidence.proof)
  if(value.decision==='reject'){
   await tx.payload.update({collection:'refund-evidence',id:evidence.id,data:{state:'exception',processedAt:now,reasonCode:'offline-evidence-rejected'},req:tx.req,overrideAccess:false})
   await appendAudit(tx,{action:'refund:offline-rejected',recordType:'refund-operations',recordId:operation.id,outcome:'refused',safeChanges:{reasonCode:'offline-evidence-rejected'}})
   return operation
  }
  const reviewed=await tx.payload.create({collection:'refund-evidence',data:{semanticKey:privateDigest('offline-refund-review\0'+evidence.id),payment:relationshipId(evidence.payment)!,operation:operation.id,environment:'offline',kind:'offline',providerPaymentId:evidence.providerPaymentId,amountMinor:evidence.amountMinor,currency:evidence.currency,providerStatus:'STAFF_REVIEWED',source:'staff-reviewed',observedAt:now,proof:{version:1,attestedEvidence:evidence.id,decision:'confirm'},sourceStaff:relationshipId(evidence.sourceStaff),reviewerStaff:staffId(ctx),state:'processed',processedAt:now},req:tx.req,overrideAccess:false})
  await tx.payload.update({collection:'refund-evidence',id:evidence.id,data:{state:'processed',processedAt:now},req:tx.req,overrideAccess:false})
  const completed=await tx.payload.update({collection:'refund-operations',id:operation.id,data:{state:'completed',actualAmountMinor:operation.amountMinor,actualCurrency:operation.currency,completedAt:now,observedAt:evidence.observedAt,lastEvidence:reviewed.id,offlineEvidence:proof,offlineReceiptKey:proof.receiptKey,reviewerStaff:staffId(ctx),resultProof:{version:1,source:'staff-reviewed',attestedEvidence:evidence.id,reviewedEvidence:reviewed.id}},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'refund:offline-completed',recordType:'refund-operations',recordId:operation.id,outcome:'success',safeChanges:{amountMinor:operation.amountMinor,currency:operation.currency}})
  return completed
 })
}
