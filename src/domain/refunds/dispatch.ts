import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import type {WorkLease,WorkResult} from '@/domain/work/types'
import type {MayaGateway,ProviderMoneyResult} from '@/integrations/maya/types'
import {assertWorker,fencedRow} from '@/domain/work/validation'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {parseEnvironment} from '@/config/env'
import {relationshipId} from '@/features/customer/bookings'
import {refundPolicySchema} from './policy'
import {refundBalances,reservedAmount} from './capacity'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {admitRefundFact,postedRefundFact} from './facts'
import {applyRefundEvidenceTx} from './apply'
export async function dispatchRefund(ctx:CommandContext,lease:WorkLease,gateway:MayaGateway,signal?:AbortSignal):Promise<WorkResult>{
 assertWorker(ctx)
 const prepared=await ctx.uow.run(ctx.actor,async tx=>{
  const work=await fencedRow(tx,lease,ctx.clock.now())
  if(work.kind!=='refund'||!work.dispatchStarted)throw new Error('Refund dispatch requires its started work lease')
  const {refundId}=z.object({refundId:z.uuid()}).strict().parse(work.payload),operation=await tx.payload.findByID({collection:'refund-operations',id:refundId,depth:0,req:tx.req,overrideAccess:false})
  if(operation.state!=='authorized'||operation.origin!=='app'||operation.dispatchGeneration!==0)return {kind:'skip' as const}
  const policy=await requireCurrentPolicy(tx,ctx,['refunds','work','maya']),rule=refundPolicySchema.parse(policy.sections.refunds),balance=await refundBalances(tx,relationshipId(operation.payment)!),booking=await tx.payload.findByID({collection:'bookings',id:balance.bookingId,depth:0,req:tx.req,overrideAccess:false}),staffId=relationshipId(operation.authorizedStaff)
  // This source-operator read is private to the live fenced system worker.
  const staff=staffId?await tx.payload.findByID({collection:'staff-users',id:staffId,depth:0,req:tx.req,overrideAccess:true}):null,own=reservedAmount(operation),beforePayment=BigInt(balance.payment.amountMinor)-balance.paymentUsed+own,beforeBooking=balance.bookingActual-balance.bookingUsed+own
  if(!rule.enabled||!staff||staff.deactivated||!rule.roles.includes(staff.role)||!rule.methods.includes(operation.method)||operation.method==='offline'||operation.expectedRevision!==booking.revision||BigInt(operation.amountMinor)>beforePayment||BigInt(operation.amountMinor)>beforeBooking||BigInt(operation.amountMinor)>BigInt(rule.maxAmountMinor)||balance.payment.environment==='offline'||balance.payment.environment!==parseEnvironment(process.env).mayaEnvironment||!balance.payment.merchantReference)return {kind:'refused' as const,id:operation.id,code:'current-authority-or-capacity'}
  z.uuid().parse(balance.payment.providerPaymentId)
  await tx.payload.update({collection:'refund-operations',id:operation.id,data:{state:'dispatching',dispatchGeneration:1,dispatchedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
  await enqueue(tx,{semanticKey:'reconcile-refund:'+operation.id+':dispatch',kind:'reconcile-refund',payload:{refundId:operation.id},availableAt:new Date(Date.parse(ctx.clock.now())+rule.reconcileSeconds*1000).toISOString()})
  await appendAudit(tx,{action:'refund:dispatch-owned',recordType:'refund-operations',recordId:operation.id,outcome:'unknown',safeChanges:{amountMinor:operation.amountMinor,currency:operation.currency,bookingId:balance.bookingId}})
  return {kind:'dispatch' as const,operation,payment:balance.payment,environment:balance.payment.environment,request:{operationId:operation.id,paymentId:balance.payment.providerPaymentId,reference:balance.payment.merchantReference,amount:{minor:operation.amountMinor,currency:operation.currency},reason:operation.reason}}
 })
 if(prepared.kind==='skip')return {state:'done'}
 if(prepared.kind==='refused')return {state:'done',apply:async tx=>{const current=await tx.payload.findByID({collection:'refund-operations',id:prepared.id,depth:0,req:tx.req,overrideAccess:false});if(current.state==='authorized'&&current.dispatchGeneration===0)await tx.payload.update({collection:'refund-operations',id:current.id,data:{state:'failed',reasonCode:prepared.code,resultProof:{version:1,source:'local-not-dispatched',reason:prepared.code}},req:tx.req,overrideAccess:false});await appendAudit(tx,{action:'refund:not-dispatched',recordType:'refund-operations',recordId:current.id,outcome:'refused',safeChanges:{reasonCode:prepared.code}})}}
 assertWorker(ctx)
 if(signal?.aborted||Date.parse(lease.expiresAt)<=Date.parse(ctx.clock.now()))throw new Error('Refund lease expired before dispatch')
 const owned=await ctx.uow.run(ctx.actor,async tx=>{await fencedRow(tx,lease,ctx.clock.now());const row=await tx.payload.findByID({collection:'refund-operations',id:prepared.operation.id,depth:0,req:tx.req,overrideAccess:false});return row.state==='dispatching'&&row.dispatchGeneration===1})
 if(!owned)return {state:'done'}
 let outcome:ProviderMoneyResult
 try{outcome=prepared.operation.method==='void'?await gateway.voidPayment(prepared.request,signal):await gateway.refundPayment(prepared.request,signal)}catch{outcome={kind:'unknown',environment:prepared.environment,paymentId:prepared.request.paymentId,operationId:prepared.operation.id}}
 if(outcome.kind==='verified'&&(!z.uuid().safeParse(outcome.id).success||outcome.environment!==prepared.environment||outcome.paymentId!==prepared.request.paymentId||outcome.amount.minor!==prepared.request.amount.minor||outcome.amount.currency!==prepared.request.amount.currency||!['SUCCESS','FAILED'].includes(outcome.status)))outcome={kind:'unknown',environment:prepared.environment,paymentId:prepared.request.paymentId,operationId:prepared.operation.id}
 const result=outcome,observedAt=ctx.clock.now()
 const fact=postedRefundFact({paymentId:prepared.payment.id,operationId:prepared.operation.id,kind:prepared.operation.method==='void'?'void':'refund',request:prepared.request,outcome:result,observedAt,workGeneration:lease.generation})
 // Keep the immutable POST receipt even if this lease is lost before completion; completion repeats the idempotent admission.
 if(fact){try{await ctx.uow.run(ctx.actor,tx=>admitRefundFact(tx,ctx,fact))}catch{/* Fenced completion or merchant reconciliation recovers it. */}}
 return {state:result.kind==='unknown'?'uncertain':'done',...(result.kind==='unknown'?{reason:'timeout' as const}:{}),apply:async tx=>{
  if(fact){await applyRefundEvidenceTx(tx,ctx,await admitRefundFact(tx,ctx,fact));return}
  const row=await tx.payload.findByID({collection:'refund-operations',id:prepared.operation.id,depth:0,req:tx.req,overrideAccess:false})
  if(row.dispatchGeneration!==1||!['dispatching','uncertain'].includes(row.state)||result.kind==='verified')return
  const state=result.kind==='unknown'?'uncertain':'failed',now=ctx.clock.now()
  await tx.payload.update({collection:'refund-operations',id:row.id,data:{state,observedAt:now,reasonCode:result.kind==='unknown'?'provider-outcome-unknown':result.reason,...(result.kind==='refused'?{resultProof:{version:1,source:'gateway-not-dispatched',reason:result.reason}}:{})},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'refund:result',recordType:'refund-operations',recordId:row.id,outcome:state==='uncertain'?'unknown':'failed',safeChanges:{state,amountMinor:row.amountMinor,currency:row.currency}})
 }}
}
