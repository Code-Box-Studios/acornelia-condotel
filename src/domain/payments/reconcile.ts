import {z} from 'zod'
import type {PaymentAttempt} from '@/payload-types'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {WorkLease,WorkResult} from '@/domain/work/types'
import type {MayaGateway} from '@/integrations/maya/types'
import type {VerifiedDelivery} from '@/integrations/maya/signature'
import {retrieveMayaDeliveries,retrieveMayaPaymentDelivery} from '@/integrations/maya/signature'
import {configuredMayaGateway} from '@/integrations/maya/configured'
import {parseEnvironment} from '@/config/env'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {relationshipId} from '@/features/customer/bookings'
import {fencedRow} from '@/domain/work/validation'
import {ingestMayaDeliveryTx} from './inbox'
import {applyPaymentObservationTx} from './observe'
import {definiteNoCreation,closeUnpaidAttempt,type CloseEvidence} from './close-attempt'
import {originalPaymentContext} from './confirm'
import {recoveryPolicy} from './recovery-policy'
import {attemptIssue} from './exceptions'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
export type ReconcileResult={state:'checking'|'confirmed'|'closed'|'escalated'|'issue';attemptId:string;deadline:string;retryAt?:string|null}
function authority(ctx:CommandContext){if(ctx.actor.kind!=='system'||!['payments','work','recovery'].includes(ctx.actor.purpose)||parseEnvironment(process.env).operationMode!=='normal')throw new Error('Payment reconciliation authority required')}
async function prepare(tx:DbTx,ctx:CommandContext,attemptId:string,lease?:WorkLease){
  authority(ctx);z.uuid().parse(attemptId)
  if(lease){const row=await fencedRow(tx,lease,ctx.clock.now());if(!row.dispatchStarted)throw new Error('Reconciliation requires started work')}
  const policy=recoveryPolicy(await requireCurrentPolicy(tx,ctx,['paymentRecovery']))
  const attempt=await tx.payload.findByID({collection:'payment-attempts',id:attemptId,depth:0,req:tx.req,overrideAccess:false})
  const booking=await tx.payload.findByID({collection:'bookings',id:relationshipId(attempt.booking)!,depth:0,req:tx.req,overrideAccess:false})
  let contextValid=true;try{await originalPaymentContext(tx,booking,attempt)}catch{contextValid=false}
  if(lease){if(lease.kind==='reconcile-payment'&&z.object({attemptId:z.uuid()}).strict().parse(lease.payload).attemptId!==attempt.id||lease.kind==='expire-hold'&&z.object({bookingId:z.uuid()}).strict().parse(lease.payload).bookingId!==booking.id||!['reconcile-payment','expire-hold'].includes(lease.kind))throw new Error('Reconciliation lease scope mismatch')}
  const work=(await tx.payload.find({collection:'work-items',where:{semanticKey:{equals:'checkout:'+attempt.id}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  const known=await tx.payload.count({collection:'payment-inbox',where:{and:[{merchantReference:{equals:attempt.merchantReference}},{environment:{equals:parseEnvironment(process.env).mayaEnvironment}},{source:{equals:'retrieval'}}]},req:tx.req,overrideAccess:false})
  const neverSent=attempt.state==='preparing'&&work?.state==='ready'&&!work.dispatchStarted&&!known.totalDocs
  const refused=definiteNoCreation(attempt)
  return {attempt,booking,policy,contextValid,sequence:attempt.reconcileSequence,neverSent,refused,startedAt:ctx.clock.now()}
}
type Plan=Awaited<ReturnType<typeof prepare>>
type Inspection={deliveries:VerifiedDelivery[];root:VerifiedDelivery|null;unavailable:boolean}
async function inspect(plan:Plan,gateway:MayaGateway|null,ctx:CommandContext,signal?:AbortSignal):Promise<Inspection>{
  if(plan.neverSent||plan.refused)return {deliveries:[],root:null,unavailable:false}
  if(!gateway)return {deliveries:[],root:null,unavailable:true}
  const env=parseEnvironment(process.env).mayaEnvironment
  let deliveries:VerifiedDelivery[]=[],root:VerifiedDelivery|null=null,unavailable=false
  try{deliveries=await retrieveMayaDeliveries(gateway,plan.attempt.merchantReference,env,ctx.clock.now,signal)}catch{unavailable=true}
  const recovered=deliveries.length===1&&deliveries[0].payment.amount.minor===plan.attempt.amountMinor&&deliveries[0].payment.amount.currency===plan.attempt.currency?deliveries[0].payment.id:undefined
  const id=plan.attempt.providerCheckoutId??(plan.attempt.createOutcome==='unknown'?recovered:undefined)
  if(id){try{root=await retrieveMayaPaymentDelivery(gateway,id,env,ctx.clock.now,signal)}catch{unavailable=true}}
  return {deliveries,root,unavailable}
}
const terminalUnpaid=new Set(['AUTH_FAILED','PAYMENT_EXPIRED','PAYMENT_FAILED','PAYMENT_CANCELLED','CAPTURE_HOLD_EXPIRED','VOIDED'])
async function apply(tx:DbTx,ctx:CommandContext,plan:Plan,inspection:Inspection):Promise<ReconcileResult>{
  authority(ctx)
  const now=ctx.clock.now(),attemptId=plan.attempt.id,base={attemptId,deadline:plan.attempt.deadline}
  for(const delivery of [...inspection.deliveries,...(inspection.root?[inspection.root]:[])]){const inboxId=await ingestMayaDeliveryTx(tx,delivery,now);await applyPaymentObservationTx(tx,ctx,{inboxId})}
  // Merge independently arrived merchant evidence before considering an unpaid release.
  const pending=(await tx.payload.find({collection:'payment-inbox',where:{and:[{merchantReference:{equals:plan.attempt.merchantReference}},{environment:{equals:parseEnvironment(process.env).mayaEnvironment}},{source:{equals:'retrieval'}},{state:{equals:'pending'}}]},limit:1000,depth:0,req:tx.req,overrideAccess:false})).docs
  for(const row of pending)await applyPaymentObservationTx(tx,ctx,{inboxId:row.id})
  let attempt=await tx.payload.findByID({collection:'payment-attempts',id:attemptId,depth:0,req:tx.req,overrideAccess:false})
  const bookingId=relationshipId(attempt.booking)!,booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
  if(!attempt.providerCheckoutId&&attempt.createOutcome==='unknown'&&inspection.root){const root=inspection.root.payment;if(root.reference===attempt.merchantReference&&root.amount.minor===attempt.amountMinor&&root.amount.currency===attempt.currency)attempt=await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{providerCheckoutId:root.id,providerEnvironment:root.environment,createOutcome:'created',createObservedAt:inspection.root.receivedAt},req:tx.req,overrideAccess:false})}
  if(attempt.deadline!==base.deadline||attempt.merchantReference!==plan.attempt.merchantReference||attempt.revision!==plan.attempt.revision)throw new Error('Reconciliation context changed')
  if(booking.status==='confirmed'&&attempt.state==='succeeded')return inspection.unavailable?scheduleCheck(tx,ctx,plan,attempt,inspection,'confirmed'):{...base,state:'confirmed'}
  const paid=await tx.payload.count({collection:'payment-transactions',where:{and:[{attempt:{equals:attemptId}},{status:{equals:'collected'}}]},req:tx.req,overrideAccess:false})
  if(paid.totalDocs)return inspection.unavailable?scheduleCheck(tx,ctx,plan,attempt,inspection,'issue'):{...base,state:'issue'}
  let evidence:CloseEvidence|undefined
  if(!plan.contextValid){await attemptIssue(tx,attempt,'accepted-context-mismatch',now);return {...base,state:'issue'}}
  if(plan.neverSent)evidence={kind:'never-dispatched',observedAt:now}
  else if(plan.refused)evidence={kind:'definite-refusal',observedAt:now}
  else if(!inspection.unavailable&&inspection.root){
    const root=inspection.root.payment
    if(root.id===attempt.providerCheckoutId&&root.reference===attempt.merchantReference&&root.amount.minor===attempt.amountMinor&&root.amount.currency===attempt.currency&&root.environment===(attempt.providerEnvironment??root.environment)&&terminalUnpaid.has(root.status)&&inspection.deliveries.every(delivery=>terminalUnpaid.has(delivery.payment.status)))evidence={kind:'provider-terminal',paymentId:root.id,status:root.status,observedAt:inspection.root.receivedAt}
  }
  if(evidence&&await closeUnpaidAttempt(tx,ctx,attempt,evidence,plan.policy))return {...base,state:'closed'}
  if(attempt.resumeRequestedAt&&attempt.resumeCount===plan.attempt.resumeCount&&attempt.resumeRequestedAt===plan.attempt.resumeRequestedAt&&!inspection.unavailable&&inspection.root&&Date.parse(inspection.root.receivedAt)>=Date.parse(attempt.resumeRequestedAt)){
    const root=inspection.root.payment,holds=(await tx.payload.find({collection:'allocations',where:{and:[{booking:{equals:bookingId}},{released:{equals:false}},{purpose:{equals:'hold'}}]},limit:2,depth:0,req:tx.req,overrideAccess:false})).docs
    const mayResume=booking.status==='held'&&plan.contextValid&&Date.parse(attempt.deadline)>Date.parse(now)&&attempt.resumeCount<=plan.policy.maxBrowserResumes&&!!attempt.checkoutUrl&&root.id===attempt.providerCheckoutId&&root.environment===attempt.providerEnvironment&&root.reference===attempt.merchantReference&&root.amount.minor===attempt.amountMinor&&root.amount.currency===attempt.currency&&root.status==='PENDING_TOKEN'&&inspection.deliveries.every(delivery=>delivery.payment.id===root.id||terminalUnpaid.has(delivery.payment.status))&&holds.length===1&&holds[0].deadline===attempt.deadline
    attempt=await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{resumeRequestedAt:null,...(mayResume?{state:'ready' as const}:{})},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:mayResume?'checkout:resumed':'checkout:resume-declined',recordType:'payment-attempts',recordId:attempt.id,outcome:mayResume?'success':'refused',safeChanges:{reasonCode:mayResume?'original-unstarted-session':'provider-not-resumable'}})
  }
  if(attempt.closedAt&&booking.status==='expired')return {...base,state:'closed'}
  return scheduleCheck(tx,ctx,plan,attempt,inspection,'checking')
}

async function scheduleCheck(tx:DbTx,ctx:CommandContext,plan:Plan,attempt:PaymentAttempt,inspection:Inspection,desired:'checking'|'confirmed'|'issue'):Promise<ReconcileResult>{
  const now=ctx.clock.now(),attemptId=attempt.id,base={attemptId,deadline:attempt.deadline}
  if(attempt.escalatedAt)return {...base,state:desired==='checking'?'escalated':desired}
  // Competing checks may apply new money but must not fan out another identical polling sequence.
  if(attempt.reconcileSequence!==plan.sequence)return {...base,state:desired,retryAt:attempt.nextReconcileAt??null}
  const sequence=attempt.reconcileSequence+1
  const exhausted=sequence>=plan.policy.maxChecks||Date.parse(now)>=Date.parse(attempt.deadline)+plan.policy.escalateAfterDeadlineMinutes*60000
  if(exhausted){
    await attemptIssue(tx,attempt,desired==='confirmed'?'reference-reconciliation-incomplete':'payment-uncertain',now)
    await tx.payload.update({collection:'payment-attempts',id:attemptId,data:{reconcileSequence:sequence,lastReconciledAt:now,nextReconcileAt:null,escalatedAt:now,resumeRequestedAt:null},req:tx.req,overrideAccess:false})
    return {...base,state:desired==='checking'?'escalated':desired}
  }
  const retryAt=new Date(Date.parse(now)+plan.policy.intervalSeconds*1000).toISOString()
  await tx.payload.update({collection:'payment-attempts',id:attemptId,data:{reconcileSequence:sequence,lastReconciledAt:now,nextReconcileAt:retryAt},req:tx.req,overrideAccess:false})
  await enqueue(tx,{semanticKey:'reconcile-payment:'+attemptId+':check:'+sequence,kind:'reconcile-payment',payload:{attemptId},availableAt:retryAt})
  await appendAudit(tx,{action:'payment:reconciled',recordType:'payment-attempts',recordId:attemptId,outcome:'unknown',safeChanges:{state:desired,reasonCode:inspection.unavailable?'provider-unavailable':inspection.deliveries.length?'provider-open':'empty-reference'}})
  return {...base,state:desired,retryAt}
}

export async function reconcileAttempt(ctx:CommandContext,attemptId:string,gateway?:MayaGateway):Promise<ReconcileResult>{
  authority(ctx)
  const plan=await ctx.uow.run(ctx.actor,tx=>prepare(tx,ctx,attemptId)),inspection=await inspect(plan,gateway??configuredMayaGateway(ctx.policy,{requireCheckout:false}),ctx)
  return ctx.uow.run(ctx.actor,tx=>apply(tx,ctx,plan,inspection))
}
export async function closeAttempt(ctx:CommandContext,attemptId:string,gateway?:MayaGateway):Promise<ReconcileResult>{return reconcileAttempt(ctx,attemptId,gateway)}
export async function reconcileWork(ctx:CommandContext,lease:WorkLease,gateway:MayaGateway,signal:AbortSignal,expiryAttemptId?:string):Promise<WorkResult>{
  authority(ctx)
  const attemptId=expiryAttemptId??z.object({attemptId:z.uuid()}).strict().parse(lease.payload).attemptId
  const plan=await ctx.uow.run(ctx.actor,tx=>prepare(tx,ctx,attemptId,lease))
  if(plan.attempt.escalatedAt)return {state:'done'}
  const inspection=await inspect(plan,gateway,ctx,signal)
  return {state:'done',apply:async tx=>{await apply(tx,ctx,plan,inspection)}}
}
