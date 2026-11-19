import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import type {RefundOperation} from '@/payload-types'
import type {RefundInput} from './types'
import {privateDigest} from '@/domain/security/private-state'
import {relationshipId} from '@/features/customer/bookings'
import {propertyToday} from '@/domain/shared/dates'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {parseEnvironment} from '@/config/env'
import {refundStaff,requireRefundPolicy} from './policy'
import {refundBalances,reservedAmount} from './capacity'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
export const refundInputSchema=z.object({commandKey:z.uuid(),paymentId:z.uuid(),expectedRevision:z.number().int().positive(),amount:z.object({minor:z.string().regex(/^[1-9]\d*$/).max(60),currency:z.literal('PHP')}).strict(),method:z.enum(['refund','void','offline']),reason:z.enum(['guest-cancellation','stay-change','duplicate-payment','late-payment','manual-review']),evidenceReference:z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/),changeId:z.uuid().optional()}).strict()
export async function authorizeRefund(ctx:CommandContext,input:RefundInput):Promise<RefundOperation>{
 refundStaff(ctx);const value=refundInputSchema.parse(input),fingerprint=privateDigest('refund-command\0'+JSON.stringify({staff:ctx.actor.kind==='staff'?ctx.actor.id:null,...value}))
 return ctx.uow.run(ctx.actor,async tx=>{
  const previous=(await tx.payload.find({collection:'refund-operations',where:{commandKey:{equals:value.commandKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(previous){if(previous.fingerprint!==fingerprint||previous.origin!=='app')throw new Error('Refund conflicts with its original intent');return previous}
  const rule=await requireRefundPolicy(tx,ctx,true),balance=await refundBalances(tx,value.paymentId),{payment,bookingId}=balance,booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false}),requested=BigInt(value.amount.minor)
  if(booking.revision!==value.expectedRevision||value.amount.currency!==payment.currency||!rule.methods.includes(value.method)||requested>balance.remaining||requested>BigInt(rule.maxAmountMinor))throw new Error('Refund exceeds current approved capacity or revision')
  if(payment.environment==='offline'){
   if(!payment.offlineEvidence||!payment.offlineReceiptKey||!relationshipId(payment.recordedByStaff)||value.method!=='offline')throw new Error('Reviewed offline collection proof is required')
  }else{
   const owned=await tx.payload.count({collection:'payment-inbox',where:{and:[{source:{equals:'retrieval'}},{environment:{equals:payment.environment}},{providerPaymentId:{equals:payment.providerPaymentId}},{providerStatus:{equals:'PAYMENT_SUCCESS'}},{amountMinor:{equals:payment.amountMinor}},{currency:{equals:payment.currency}}]},req:tx.req,overrideAccess:false})
   if(!owned.totalDocs||payment.environment!==parseEnvironment(process.env).mayaEnvironment)throw new Error('Merchant-owned collection proof is required')
  }
  if(value.reason==='guest-cancellation'&&booking.status!=='cancelled'||['duplicate-payment','late-payment'].includes(value.reason)&&payment.appliedRevision!=null||value.reason==='manual-review'&&payment.appliedRevision!=null&&!['cancelled','completed','expired'].includes(booking.status))throw new Error('The refund reason does not authorize returning this stay funding')
  if(value.reason==='stay-change'){
   if(!value.changeId)throw new Error('A completed price reduction is required')
   const change=await tx.payload.findByID({collection:'booking-changes',id:value.changeId,depth:0,req:tx.req,overrideAccess:false})
   if(change.kind!=='stay'||change.state!=='completed'||relationshipId(change.booking)!==bookingId||BigInt(change.deltaMinor)>=0n)throw new Error('A committed price reduction is required')
   const used=balance.operations.filter(row=>relationshipId(row.change)===change.id).reduce((sum,row)=>sum+reservedAmount(row),0n)
   if(used+requested>-BigInt(change.deltaMinor))throw new Error('Price reduction is already returned or reserved')
  }else if(value.changeId)throw new Error('Change context is only valid for a price reduction')
  if(value.method==='offline'){if(rule.offlineReview!=='independent-staff')throw new Error('Offline reimbursement is unavailable')}
  else{
   const policy=await requireCurrentPolicy(tx,ctx,['work','maya']),maya=z.object({environment:z.enum(['sandbox','production']),voidEnabled:z.boolean(),refundEnabled:z.boolean(),partialRefunds:z.boolean(),moneyMethods:z.array(z.string()),maxAmountMinor:z.string().regex(/^[1-9]\d*$/)}).passthrough().parse(policy.sections.maya)
   if(payment.environment==='offline'||maya.environment!==payment.environment||requested>BigInt(maya.maxAmountMinor)||!payment.collectedAt)throw new Error('Provider repayment is unavailable')
   const actualDate=propertyToday('Asia/Manila',new Date(payment.collectedAt)),today=propertyToday('Asia/Manila',new Date(ctx.clock.now())),days=(Date.parse(today)-Date.parse(actualDate))/86400000
   if(value.method==='void'&&(!maya.voidEnabled||days!==0||requested!==BigInt(payment.amountMinor)||balance.paymentUsed!==0n)||value.method==='refund'&&(!maya.refundEnabled||days<1||days>180||Date.parse(ctx.clock.now())-Date.parse(payment.collectedAt)>180*86400000||!maya.partialRefunds&&requested!==BigInt(payment.amountMinor)))throw new Error('Provider method, amount or timing is ineligible')
   const facts=(await tx.payload.find({collection:'payment-inbox',where:{and:[{source:{equals:'retrieval'}},{environment:{equals:payment.environment}},{providerPaymentId:{equals:payment.providerPaymentId}},{providerStatus:{equals:'PAYMENT_SUCCESS'}}]},limit:1,sort:'-receivedAt',depth:0,req:tx.req,overrideAccess:false})).docs[0]
   if(!facts?.method||!maya.moneyMethods.includes(facts.method))throw new Error('This payment method requires a separately approved reimbursement route')
  }
  const row=await tx.payload.create({collection:'refund-operations',data:{commandKey:value.commandKey,fingerprint,origin:'app',booking:bookingId,payment:payment.id,authorizedStaff:ctx.actor.kind==='staff'?ctx.actor.id:undefined,change:value.changeId,expectedRevision:value.expectedRevision,method:value.method,state:'authorized',amountMinor:value.amount.minor,currency:value.amount.currency,reason:value.reason,evidenceReference:value.evidenceReference,policySnapshot:ctx.policy,dispatchGeneration:0,reconcileSequence:0},req:tx.req,overrideAccess:false})
  if(value.method!=='offline')await enqueue(tx,{semanticKey:'refund:'+row.id,kind:'refund',payload:{refundId:row.id},availableAt:ctx.clock.now()})
  await appendAudit(tx,{action:'refund:authorized',recordType:'refund-operations',recordId:row.id,outcome:'success',safeChanges:{bookingId,amountMinor:row.amountMinor,currency:row.currency,revision:value.expectedRevision}})
  return row
 })
}
