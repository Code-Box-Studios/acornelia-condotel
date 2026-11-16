import type {CommandContext,DbTx} from '@/domain/db/types'
import type {PaymentTransaction} from '@/payload-types'
import type {OfflineCollectionEvidence} from '@/domain/bookings/types'
import {requireDirectPolicy,assertDirectStaff,type DirectBookingPolicy} from '@/domain/bookings/direct-policy'
import {offlineCollectionSchema,offlineReceiptId,validateOfflineReceipt} from './offline-validation'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
import {enqueue} from '@/domain/work/enqueue'
import {z} from 'zod'
export const offlineEvidenceSchema=z.object({version:z.literal(1),trust:z.literal('staff-attested'),method:z.enum(['cash','bank-transfer']),receiptReference:z.string(),evidenceReference:z.string(),receivedAt:z.iso.datetime(),bookingRevision:z.number().int().positive()}).strict()
export async function findOfflineReceipt(tx:DbTx,input:Pick<OfflineCollectionEvidence,'method'|'receiptReference'>){return (await tx.payload.find({collection:'payment-transactions',where:{and:[{environment:{equals:'offline'}},{offlineReceiptKey:{equals:offlineReceiptId(input)}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]??null}
async function offlineIssue(tx:DbTx,ctx:CommandContext,payment:PaymentTransaction,reasonCode:string){
  const issue=await tx.payload.create({collection:'payment-issues',data:{issueKey:payment.id+':'+reasonCode,reasonCode,booking:relationshipId(payment.booking),payment:payment.id,observedAmountMinor:payment.amountMinor,observedCurrency:payment.currency,state:'open'},req:tx.req,overrideAccess:false})
  await enqueue(tx,{semanticKey:'payment-issue:'+issue.id,kind:'email',payload:{category:'payment-issue',issueId:issue.id},availableAt:ctx.clock.now()})
  await appendAudit(tx,{action:'payment:offline-issue',recordType:'payment-issues',recordId:issue.id,outcome:'unknown',safeChanges:{reasonCode,amountMinor:payment.amountMinor,currency:payment.currency}})
}
/** Caller has current staff authority; only the direct creation command can apply its initial receipt. */
export async function recordOfflineCollectionTx(tx:DbTx,ctx:CommandContext,input:OfflineCollectionEvidence,policy:DirectBookingPolicy,initial?:{apply:boolean;reason?:string}):Promise<PaymentTransaction>{
  assertDirectStaff(ctx)
  const value=offlineCollectionSchema.parse(input),existing=await findOfflineReceipt(tx,value)
  if(existing){
    const saved=offlineEvidenceSchema.parse(existing.offlineEvidence)
    if(relationshipId(existing.booking)!==value.bookingId||saved.bookingRevision!==value.expectedRevision||saved.method!==value.method||saved.receiptReference!==value.receiptReference||existing.amountMinor!==value.amount.minor||existing.currency!==value.amount.currency||saved.evidenceReference!==value.evidenceReference||value.receivedAt&&saved.receivedAt!==value.receivedAt)throw new Error('Receipt already belongs to its original collection')
    return existing
  }
  validateOfflineReceipt(ctx,value,policy)
  const booking=await tx.payload.findByID({collection:'bookings',id:value.bookingId,depth:0,req:tx.req,overrideAccess:false})
  if(!['phone','walk-in'].includes(booking.source))throw new Error('Offline collection requires a direct booking')
  const now=ctx.clock.now(),receivedAt=value.receivedAt??now
  let payment=await tx.payload.create({collection:'payment-transactions',data:{environment:'offline',providerPaymentId:offlineReceiptId(value),offlineReceiptKey:offlineReceiptId(value),booking:booking.id,amountMinor:value.amount.minor,currency:value.amount.currency,status:'collected',collectedAt:receivedAt,lastObservedAt:now,providerStatus:'STAFF_ATTESTED',recordedByStaff:ctx.actor.kind==='staff'?ctx.actor.id:undefined,offlineEvidence:{version:1,trust:'staff-attested',method:value.method,receiptReference:value.receiptReference,evidenceReference:value.evidenceReference,receivedAt,bookingRevision:value.expectedRevision}},req:tx.req,overrideAccess:false})
  const applied=await tx.payload.count({collection:'payment-transactions',where:{and:[{booking:{equals:booking.id}},{appliedRevision:{equals:value.expectedRevision}}]},req:tx.req,overrideAccess:false})
  if(initial?.apply&&booking.status==='confirmed'&&booking.revision===value.expectedRevision&&!applied.totalDocs){
    const total=z.object({total:z.object({minor:z.string(),currency:z.string()})}).parse(booking.acceptedQuote).total,allocations=await tx.payload.count({collection:'allocations',where:{and:[{booking:{equals:booking.id}},{purpose:{equals:'booking'}},{released:{equals:false}}]},req:tx.req,overrideAccess:false})
    if(total.minor!==value.amount.minor||total.currency!==value.amount.currency||allocations.totalDocs!==1)throw new Error('Offline fulfillment context changed')
    payment=await tx.payload.update({collection:'payment-transactions',id:payment.id,data:{appliedRevision:value.expectedRevision},req:tx.req,overrideAccess:false})
  }else await offlineIssue(tx,ctx,payment,initial?.reason??(booking.revision!==value.expectedRevision?'offline-superseded-context':'extra-offline-collection'))
  await appendAudit(tx,{action:'payment:offline-recorded',recordType:'payment-transactions',recordId:payment.id,outcome:'success',safeChanges:{amountMinor:payment.amountMinor,currency:payment.currency,revision:value.expectedRevision}})
  return payment
}
export async function recordOfflineCollection(ctx:CommandContext,input:OfflineCollectionEvidence):Promise<PaymentTransaction>{
  assertDirectStaff(ctx)
  for(let retry=0;;retry++)try{return await ctx.uow.run(ctx.actor,async tx=>recordOfflineCollectionTx(tx,ctx,input,await requireDirectPolicy(tx,ctx)))}catch(error){const row=error as {name?:string;data?:{errors?:{path?:string}[]}};if(retry<3&&row.name==='ValidationError'&&row.data?.errors?.some(value=>value.path==='providerPaymentId'))continue;throw error}
}
