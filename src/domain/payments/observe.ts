import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {PaymentAttempt,PaymentTransaction} from '@/payload-types'
import type {PaymentObservation,PaymentApplyResult} from './types'
import {parseEnvironment} from '@/config/env'
import {relationshipId} from '@/features/customer/bookings'
import {sqlError} from '@/domain/bookings/validation'
import {InventoryConflict} from '@/domain/inventory/allocate'
import {appendAudit} from '@/domain/audit/append'
import {enqueue} from '@/domain/work/enqueue'
import {originalPaymentContext,planConfirmation,confirmPayment} from './confirm'
import {paymentIssue} from './exceptions'
const observationSchema=z.object({inboxId:z.uuid()}).strict()
const pending=new Set(['PENDING_TOKEN','PENDING_PAYMENT','FOR_AUTHENTICATION','AUTHENTICATING','AUTH_SUCCESS','PAYMENT_PROCESSING'])
const authorized=new Set(['AUTHORIZED','DONE','CAPTURED']),failed=new Set(['AUTH_FAILED','PAYMENT_FAILED','PAYMENT_CANCELLED','PAYMENT_EXPIRED','CAPTURE_HOLD_EXPIRED'])
function authority(ctx:CommandContext){if(ctx.actor.kind!=='system'||!['payments','work','recovery'].includes(ctx.actor.purpose)||parseEnvironment(process.env).operationMode!=='normal')throw new Error('Canonical payment authority required')}
export async function applyPaymentObservationTx(tx:DbTx,ctx:CommandContext,observation:PaymentObservation):Promise<PaymentApplyResult>{
  authority(ctx)
  const {inboxId}=observationSchema.parse(observation),inbox=await tx.payload.findByID({collection:'payment-inbox',id:inboxId,depth:0,req:tx.req,overrideAccess:false}),now=ctx.clock.now()
  if(inbox.state!=='pending')return {state:'duplicate'}
  // Maya publishes platform keys per environment. Only our authenticated merchant read proves ownership.
  if(inbox.source!=='retrieval')return {state:'recorded'}
  let attempt:PaymentAttempt|undefined
  if(inbox.merchantReference)attempt=(await tx.payload.find({collection:'payment-attempts',where:{merchantReference:{equals:inbox.merchantReference}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  const bookingId=attempt?relationshipId(attempt.booking)!:undefined
  if(attempt){
    // Any authenticated remote operation blocks a fresh create, including mismatched money.
    if(['preparing','ready'].includes(attempt.state))await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'unknown'},req:tx.req,overrideAccess:false})
    await enqueue(tx,{semanticKey:'reconcile-payment:'+attempt.id+':observation:'+inbox.id,kind:'reconcile-payment',payload:{attemptId:attempt.id},availableAt:now})
  }
  let payment=(await tx.payload.find({collection:'payment-transactions',where:{and:[{environment:{equals:inbox.environment}},{providerPaymentId:{equals:inbox.providerPaymentId}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  const collected=inbox.providerStatus==='PAYMENT_SUCCESS',reversal=['VOIDED','REFUNDED'].includes(inbox.providerStatus)
  const nextStatus:PaymentTransaction['status']=collected?'collected':authorized.has(inbox.providerStatus)?'authorized':failed.has(inbox.providerStatus)?'failed':inbox.providerStatus==='VOIDED'?'voided':'pending'
  let conflict=false
  if(payment){
    conflict=payment.status==='collected'&&(payment.amountMinor!==inbox.amountMinor||payment.currency!==inbox.currency||!!payment.merchantReference&&payment.merchantReference!==inbox.merchantReference)||!!relationshipId(payment.attempt)&&relationshipId(payment.attempt)!==attempt?.id
    const status=payment.status==='collected'?'collected':collected?'collected':payment.status==='authorized'&&nextStatus!=='voided'?'authorized':payment.status==='voided'?'voided':nextStatus
    payment=await tx.payload.update({collection:'payment-transactions',id:payment.id,data:{status,providerStatus:inbox.providerStatus,lastObservedAt:now,...(!payment.merchantReference&&inbox.merchantReference?{merchantReference:inbox.merchantReference}:{}),...(collected&&payment.status!=='collected'?{amountMinor:inbox.amountMinor,currency:inbox.currency,merchantReference:inbox.merchantReference,collectedAt:inbox.providerPaidAt??inbox.receivedAt}:{}),...(conflict&&payment.status!=='collected'?{attempt:null,booking:null}:!relationshipId(payment.attempt)&&attempt?{attempt:attempt.id,booking:bookingId}:{})},req:tx.req,overrideAccess:false})
  }else payment=await tx.payload.create({collection:'payment-transactions',data:{providerPaymentId:inbox.providerPaymentId,merchantReference:inbox.merchantReference,environment:inbox.environment,amountMinor:inbox.amountMinor,currency:inbox.currency,status:nextStatus,booking:bookingId,attempt:attempt?.id,providerStatus:inbox.providerStatus,lastObservedAt:now,...(collected?{collectedAt:inbox.providerPaidAt??inbox.receivedAt}:{})},req:tx.req,overrideAccess:false})
  let reason:string|undefined,result:PaymentApplyResult={state:'recorded',transactionId:payment.id,bookingId}
  if(conflict)reason='provider-facts-conflict'
  else if(reversal&&payment.status==='collected'||inbox.providerStatus==='REFUNDED')reason='external-reversal'
  else if(!collected&&!pending.has(inbox.providerStatus)&&!authorized.has(inbox.providerStatus)&&!failed.has(inbox.providerStatus)&&inbox.providerStatus!=='VOIDED')reason='unknown-provider-status'
  else if(collected){
    if(!attempt)reason='unmatched-reference'
    else{
      const booking=await tx.payload.findByID({collection:'bookings',id:bookingId!,depth:0,req:tx.req,overrideAccess:false})
      let quote
      try{quote=await originalPaymentContext(tx,booking,attempt)}catch{reason='accepted-context-mismatch'}
      if(!reason&&quote){
        const environment=(quote.policySnapshot.sections.maya as {environment?:string})?.environment
        if(!quote.policySnapshot.approvedSections.includes('maya')||environment!==inbox.environment||parseEnvironment(process.env).mayaEnvironment!==inbox.environment||attempt.providerEnvironment&&attempt.providerEnvironment!==inbox.environment)reason='environment-mismatch'
        else if(attempt.amountMinor!==inbox.amountMinor||attempt.currency!==inbox.currency)reason='money-mismatch'
        else if(['cancelled','completed'].includes(booking.status))reason='closed-operation'
        else if((await tx.payload.count({collection:'payment-inbox',where:{and:[{source:{equals:'retrieval'}},{environment:{equals:inbox.environment}},{providerPaymentId:{equals:inbox.providerPaymentId}},{providerStatus:{in:['VOIDED','REFUNDED']}}]},req:tx.req,overrideAccess:false})).totalDocs)reason='external-reversal'
        else if(payment.appliedRevision===booking.revision&&relationshipId(payment.booking)===booking.id)result={...result,state:'recorded'}
        else if(booking.status==='confirmed'||(await tx.payload.find({collection:'payment-transactions',where:{and:[{booking:{equals:booking.id}},{appliedRevision:{equals:booking.revision}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs.length)reason='duplicate-collection'
        else{
          const plan=await planConfirmation(tx,ctx,booking,attempt,quote,payment,inbox.providerPaidAt)
          if(!plan.ok)reason=plan.reason
          else{await confirmPayment(tx,ctx,booking,attempt,quote,payment,plan);result={...result,state:'confirmed'}}
        }
      }
    }
  }
  if(reason){const issueId=await paymentIssue(tx,inbox,payment,attempt,reason,now);result={...result,state:'issue',issueId}}
  await tx.payload.update({collection:'payment-inbox',id:inbox.id,data:{state:reason?'exception':'processed',processedAt:now,reasonCode:reason??null},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'payment:observed',recordType:'payment-transactions',recordId:payment.id,outcome:reason?'unknown':'success',safeChanges:{status:payment.status,amountMinor:inbox.amountMinor,currency:inbox.currency,...(reason?{reasonCode:reason}:{})}})
  return result
}
export async function applyPaymentObservation(ctx:CommandContext,observation:PaymentObservation):Promise<PaymentApplyResult>{
  authority(ctx);observationSchema.parse(observation)
  for(let attempt=0;attempt<4;attempt++){
    try{return await ctx.uow.run(ctx.actor,tx=>applyPaymentObservationTx(tx,ctx,observation))}catch(error){const sql=sqlError(error);if(attempt<3&&(error instanceof InventoryConflict||sql.code==='23505'&&['environment_providerPaymentId_idx','booking_appliedRevision_idx','payment_issues_issue_key_idx','offer_allocations_allocation_key_idx','work_items_semantic_key_idx','bookings_code_idx'].includes(sql.constraint||'')))continue;throw error}
  }
  throw new Error('Payment application requires retry')
}
