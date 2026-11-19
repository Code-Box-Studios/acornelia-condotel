import type {CommandContext,DbTx} from '@/domain/db/types'
import type {RefundEvidence,RefundOperation} from '@/payload-types'
import {relationshipId} from '@/features/customer/bookings'
import {privateDigest} from '@/domain/security/private-state'
import {appendAudit} from '@/domain/audit/append'
import {enqueue} from '@/domain/work/enqueue'
import {refundSystem} from './facts'
async function issue(tx:DbTx,ctx:CommandContext,evidence:RefundEvidence,bookingId:string,reason:string){
 const key='refund-evidence:'+evidence.id+':'+reason,old=(await tx.payload.find({collection:'payment-issues',where:{issueKey:{equals:key}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
 if(old)return
 const row=await tx.payload.create({collection:'payment-issues',data:{issueKey:key,booking:bookingId,payment:relationshipId(evidence.payment),reasonCode:reason,observedAmountMinor:evidence.amountMinor,observedCurrency:evidence.currency,state:'open'},req:tx.req,overrideAccess:false})
 await enqueue(tx,{semanticKey:'payment-issue:'+row.id,kind:'email',payload:{category:'payment-issue',issueId:row.id},availableAt:ctx.clock.now()})
 await appendAudit(tx,{action:'refund:issue-opened',recordType:'payment-issues',recordId:row.id,outcome:'unknown',safeChanges:{reasonCode:reason}})
}
async function processed(tx:DbTx,ctx:CommandContext,evidence:RefundEvidence,operation:RefundOperation,outcome:'success'|'failed'|'unknown'){
 await tx.payload.update({collection:'refund-evidence',id:evidence.id,data:{state:'processed',processedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
 await appendAudit(tx,{action:'refund:evidence-applied',recordType:'refund-operations',recordId:operation.id,outcome,safeChanges:{state:operation.state,amountMinor:evidence.amountMinor,currency:evidence.currency}})
 return operation
}
/** Applies a POST receipt to the operation that sent it. Provider rows imported before it settle the reservation once. */
async function applyBoundReceipt(tx:DbTx,ctx:CommandContext,evidence:RefundEvidence,bookingId:string,known:RefundOperation|undefined,proof:Record<string,unknown>,positive:boolean,failed:boolean){
 const target=await tx.payload.findByID({collection:'refund-operations',id:relationshipId(evidence.operation)!,depth:0,req:tx.req,overrideAccess:false}),outcome=positive?'success' as const:failed?'failed' as const:'unknown' as const
 if(target.origin!=='app'||target.dispatchGeneration<1||evidence.source!=='merchant-post'||relationshipId(target.payment)!==relationshipId(evidence.payment)||target.amountMinor!==evidence.amountMinor||target.currency!==evidence.currency||target.method!==evidence.kind||target.providerOperationId&&target.providerOperationId!==evidence.providerOperationId)throw new Error('Refund receipt does not match its operation')
 if(target.state==='satisfied'||target.state==='completed'){
  if(target.state==='completed'&&positive&&target.actualAmountMinor!==evidence.amountMinor)await issue(tx,ctx,evidence,bookingId,'refund-evidence-money-conflict')
  return processed(tx,ctx,evidence,target,outcome)
 }
 if(known&&known.id!==target.id){
  if(positive&&known.origin==='provider'&&known.state==='completed'&&known.actualAmountMinor===target.amountMinor&&known.currency===target.currency){
   const settled=await tx.payload.update({collection:'refund-operations',id:target.id,data:{state:'satisfied',settledByRefund:known.id,observedAt:evidence.observedAt,lastEvidence:evidence.id,resultProof:{...proof,settledBy:known.id}},req:tx.req,overrideAccess:false})
   return processed(tx,ctx,evidence,settled,'success')
  }
  await issue(tx,ctx,evidence,bookingId,'refund-evidence-identity-conflict')
  await tx.payload.update({collection:'refund-evidence',id:evidence.id,data:{state:'exception',processedAt:ctx.clock.now(),reasonCode:'refund-evidence-identity-conflict'},req:tx.req,overrideAccess:false});return null
 }
 if(!known&&positive&&target.method==='void'){
  // A merchant root read may already have imported this void without an operation ID; count it once.
  const root=(await tx.payload.find({collection:'refund-operations',where:{and:[{payment:{equals:relationshipId(target.payment)}},{origin:{equals:'provider'}},{method:{equals:'void'}},{state:{equals:'completed'}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(root){
   const claimed=await tx.payload.count({collection:'refund-operations',where:{settledByRefund:{equals:root.id}},req:tx.req,overrideAccess:false})
   if(!claimed.totalDocs&&root.actualAmountMinor===target.amountMinor&&root.currency===target.currency){
    const settled=await tx.payload.update({collection:'refund-operations',id:target.id,data:{state:'satisfied',settledByRefund:root.id,observedAt:evidence.observedAt,lastEvidence:evidence.id,resultProof:{...proof,settledBy:root.id}},req:tx.req,overrideAccess:false})
    return processed(tx,ctx,evidence,settled,'success')
   }
   await issue(tx,ctx,evidence,bookingId,'refund-evidence-identity-conflict')
  }
 }
 const state=positive?'completed':failed?'failed':'uncertain'
 const updated=await tx.payload.update({collection:'refund-operations',id:target.id,data:{state,providerEnvironment:evidence.environment==='offline'?undefined:evidence.environment,providerOperationId:evidence.providerOperationId,providerStatus:evidence.providerStatus,observedAt:evidence.observedAt,lastEvidence:evidence.id,resultProof:proof,reasonCode:failed?'provider-failed':positive?null:'provider-outcome-pending',...(positive?{actualAmountMinor:evidence.amountMinor,actualCurrency:evidence.currency,completedAt:ctx.clock.now()}:{})},req:tx.req,overrideAccess:false})
 return processed(tx,ctx,evidence,updated,outcome)
}
export async function applyRefundEvidenceTx(tx:DbTx,ctx:CommandContext,evidence:RefundEvidence):Promise<RefundOperation|null>{
 refundSystem(ctx)
 if(evidence.state!=='pending')return null
 const payment=await tx.payload.findByID({collection:'payment-transactions',id:relationshipId(evidence.payment)!,depth:0,req:tx.req,overrideAccess:false}),bookingId=relationshipId(payment.booking)!
 if(payment.providerPaymentId!==evidence.providerPaymentId||payment.environment!==evidence.environment||payment.currency!==evidence.currency){
  await issue(tx,ctx,evidence,bookingId,'refund-evidence-context-mismatch')
  await tx.payload.update({collection:'refund-evidence',id:evidence.id,data:{state:'exception',processedAt:ctx.clock.now(),reasonCode:'refund-evidence-context-mismatch'},req:tx.req,overrideAccess:false});return null
 }
 const positive=evidence.providerStatus==='SUCCESS'||evidence.kind==='void'&&evidence.providerStatus==='VOIDED',failed=evidence.providerStatus==='FAILED'
 const known=evidence.providerOperationId?(await tx.payload.find({collection:'refund-operations',where:{and:[{providerEnvironment:{equals:evidence.environment}},{providerOperationId:{equals:evidence.providerOperationId}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]:undefined
 if(known&&relationshipId(known.payment)!==payment.id)throw new Error('Provider refund identity belongs to another collection')
 const proof={version:1,source:evidence.kind==='void'&&!evidence.providerOperationId?'merchant-payment-root':evidence.source,evidenceId:evidence.id,providerPaymentId:evidence.providerPaymentId,providerOperationId:evidence.providerOperationId,status:evidence.providerStatus},state=positive?'completed':failed?'failed':'uncertain'
 if(positive&&BigInt(evidence.amountMinor)>BigInt(payment.amountMinor))await issue(tx,ctx,evidence,bookingId,'refund-evidence-exceeds-collection')
 if(relationshipId(evidence.operation))return applyBoundReceipt(tx,ctx,evidence,bookingId,known,proof,positive,failed)
 let operation:RefundOperation|undefined=known
 if(!evidence.providerOperationId&&evidence.kind==='void')operation=(await tx.payload.find({collection:'refund-operations',where:{and:[{payment:{equals:payment.id}},{method:{equals:'void'}},{state:{equals:'completed'}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
 if(operation?.state==='completed'){
  if(positive&&(operation.actualAmountMinor!==evidence.amountMinor||operation.actualCurrency!==evidence.currency))await issue(tx,ctx,evidence,bookingId,'refund-evidence-money-conflict')
 }else if(operation){
  operation=await tx.payload.update({collection:'refund-operations',id:operation.id,data:{state,providerStatus:evidence.providerStatus,observedAt:evidence.observedAt,lastEvidence:evidence.id,resultProof:proof,...(positive?{actualAmountMinor:evidence.amountMinor,actualCurrency:evidence.currency,completedAt:ctx.clock.now()}:{})},req:tx.req,overrideAccess:false})
 }else{
  const key=evidence.providerOperationId?'provider:'+evidence.environment+':'+evidence.providerOperationId:'provider-void:'+evidence.environment+':'+evidence.providerPaymentId,booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
  operation=await tx.payload.create({collection:'refund-operations',data:{commandKey:key,fingerprint:privateDigest(key+'\0'+payment.id),origin:'provider',booking:bookingId,payment:payment.id,expectedRevision:booking.revision,method:evidence.kind==='void'?'void':'refund',state,amountMinor:evidence.amountMinor,currency:evidence.currency,reason:'manual-review',providerEnvironment:evidence.environment==='offline'?undefined:evidence.environment,providerOperationId:evidence.providerOperationId,providerStatus:evidence.providerStatus,observedAt:evidence.observedAt,lastEvidence:evidence.id,resultProof:proof,...(positive?{actualAmountMinor:evidence.amountMinor,actualCurrency:evidence.currency,completedAt:ctx.clock.now()}:{}),dispatchGeneration:0,reconcileSequence:0},req:tx.req,overrideAccess:false})
 }
 return processed(tx,ctx,evidence,operation,positive?'success':failed?'failed':'unknown')
}
