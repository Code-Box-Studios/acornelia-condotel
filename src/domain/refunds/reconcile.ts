import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {MayaGateway} from '@/integrations/maya/types'
import {relationshipId} from '@/features/customer/bookings'
import {refundSystem,retrieveRefundFacts,admitRefundFact} from './facts'
import {applyRefundEvidenceTx} from './apply'
import type {RefundOperation} from '@/payload-types'
import type {WorkLease,WorkResult} from '@/domain/work/types'
import {assertWorker,fencedRow} from '@/domain/work/validation'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {refundPolicySchema} from './policy'
/** POST receipts bind provider IDs to local operations, so they apply before unbound merchant reads. */
export async function applyPendingRefundEvidence(tx:DbTx,ctx:CommandContext,paymentId:string){
 const pending=await tx.payload.find({collection:'refund-evidence',where:{and:[{payment:{equals:paymentId}},{state:{equals:'pending'}},{source:{in:['merchant-post','merchant-get']}}]},sort:['createdAt','id'],limit:1000,depth:0,req:tx.req,overrideAccess:false})
 if(pending.hasNextPage)throw new Error('Refund evidence backlog requires operator review')
 for(const row of [...pending.docs.filter(item=>item.source==='merchant-post'),...pending.docs.filter(item=>item.source!=='merchant-post')])await applyRefundEvidenceTx(tx,ctx,row)
}
export async function reconcilePaymentRefunds(ctx:CommandContext,paymentId:string,gateway:MayaGateway):Promise<{state:'reconciled'|'uncertain';count:number}>{
 refundSystem(ctx,false)
 const result=await retrieveRefundFacts(ctx,paymentId,gateway)
 await ctx.uow.run(ctx.actor,async tx=>{
  for(const fact of result.facts)await admitRefundFact(tx,ctx,fact)
  await applyPendingRefundEvidence(tx,ctx,paymentId)
 })
 return {state:result.complete?'reconciled':'uncertain',count:result.facts.length}
}
export async function reconcileRefund(ctx:CommandContext,refundId:string,gateway:MayaGateway):Promise<{state:'completed'|'failed'|'uncertain'|'authorized'|'dispatching'|'cancelled'}>{
 refundSystem(ctx,false);z.uuid().parse(refundId)
 const row=await ctx.uow.run(ctx.actor,tx=>tx.payload.findByID({collection:'refund-operations',id:refundId,depth:0,req:tx.req,overrideAccess:false}))
 await reconcilePaymentRefunds(ctx,relationshipId(row.payment)!,gateway)
 const current=await ctx.uow.run(ctx.actor,tx=>tx.payload.findByID({collection:'refund-operations',id:refundId,depth:0,req:tx.req,overrideAccess:false}))
 return {state:current.state==='satisfied'?'completed':current.state}
}
async function outcomeIssue(tx:DbTx,ctx:CommandContext,operation:RefundOperation){
 const key='refund-operation:'+operation.id+':outcome-uncertain',old=(await tx.payload.find({collection:'payment-issues',where:{issueKey:{equals:key}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
 if(old)return
 const row=await tx.payload.create({collection:'payment-issues',data:{issueKey:key,booking:relationshipId(operation.booking),payment:relationshipId(operation.payment),reasonCode:'refund-outcome-uncertain',observedAmountMinor:operation.amountMinor,observedCurrency:operation.currency,state:'open'},req:tx.req,overrideAccess:false})
 await enqueue(tx,{semanticKey:'payment-issue:'+row.id,kind:'email',payload:{category:'payment-issue',issueId:row.id},availableAt:ctx.clock.now()})
 await appendAudit(tx,{action:'refund:issue-opened',recordType:'payment-issues',recordId:row.id,outcome:'unknown',safeChanges:{reasonCode:'refund-outcome-uncertain'}})
}
/** True while the original dispatch may still finish its single POST under a live lease. */
async function dispatchLive(tx:DbTx,operationId:string,now:string){
 const work=(await tx.payload.find({collection:'work-items',where:{semanticKey:{equals:'refund:'+operationId}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
 return !!work&&(work.state==='ready'||work.state==='leased'&&!!work.leaseExpires&&Date.parse(work.leaseExpires)>Date.parse(now))
}
/** Bounded merchant checks for one dispatched operation. An empty or failed read never releases its reservation. */
export async function reconcileRefundWork(ctx:CommandContext,lease:WorkLease,gateway:MayaGateway,signal?:AbortSignal):Promise<WorkResult>{
 assertWorker(ctx)
 const {refundId}=z.object({refundId:z.uuid()}).strict().parse(lease.payload)
 const plan=await ctx.uow.run(ctx.actor,async tx=>{
  const work=await fencedRow(tx,lease,ctx.clock.now())
  if(work.kind!=='reconcile-refund'||!work.dispatchStarted)throw new Error('Refund reconciliation requires its started work lease')
  const rule=refundPolicySchema.parse((await requireCurrentPolicy(tx,ctx,['refunds'])).sections.refunds),operation=await tx.payload.findByID({collection:'refund-operations',id:refundId,depth:0,req:tx.req,overrideAccess:false})
  return {rule,operation,sequence:operation.reconcileSequence}
 })
 if(!['dispatching','uncertain'].includes(plan.operation.state)||plan.operation.origin!=='app')return {state:'done'}
 let facts:Awaited<ReturnType<typeof retrieveRefundFacts>>['facts']=[]
 try{facts=(await retrieveRefundFacts(ctx,relationshipId(plan.operation.payment)!,gateway,signal)).facts}catch{/* Unavailable reads keep the reservation and schedule another bounded check. */}
 return {state:'done',apply:async tx=>{
  for(const fact of facts)await admitRefundFact(tx,ctx,fact)
  await applyPendingRefundEvidence(tx,ctx,relationshipId(plan.operation.payment)!)
  let operation=await tx.payload.findByID({collection:'refund-operations',id:refundId,depth:0,req:tx.req,overrideAccess:false})
  const now=ctx.clock.now()
  if(!['dispatching','uncertain'].includes(operation.state))return
  if(operation.state==='dispatching'&&!await dispatchLive(tx,operation.id,now)){
   operation=await tx.payload.update({collection:'refund-operations',id:operation.id,data:{state:'uncertain',reasonCode:'provider-outcome-unknown',observedAt:now},req:tx.req,overrideAccess:false})
   await appendAudit(tx,{action:'refund:result',recordType:'refund-operations',recordId:operation.id,outcome:'unknown',safeChanges:{state:'uncertain',amountMinor:operation.amountMinor,currency:operation.currency}})
  }
  // Competing checks may apply evidence but never fan out a second polling sequence.
  if(operation.reconcileSequence!==plan.sequence)return
  const sequence=plan.sequence+1
  if(sequence>=plan.rule.maxChecks){
   await tx.payload.update({collection:'refund-operations',id:operation.id,data:{reconcileSequence:sequence,nextReconcileAt:null},req:tx.req,overrideAccess:false})
   await outcomeIssue(tx,ctx,operation);return
  }
  const retryAt=new Date(Date.parse(now)+plan.rule.reconcileSeconds*1000).toISOString()
  await tx.payload.update({collection:'refund-operations',id:operation.id,data:{reconcileSequence:sequence,nextReconcileAt:retryAt},req:tx.req,overrideAccess:false})
  await enqueue(tx,{semanticKey:'reconcile-refund:'+operation.id+':check:'+sequence,kind:'reconcile-refund',payload:{refundId:operation.id},availableAt:retryAt})
 }}
}
