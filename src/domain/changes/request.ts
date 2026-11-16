import {z} from 'zod'
import {randomBytes} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import type {CommandContext} from '@/domain/db/types'
import type {ChangeInput,ChangeResult} from './types'
import {parseEnvironment} from '@/config/env'
import {requireChangePolicy,requireChangeable} from './policy'
import {currentStay,originalAllocation,changeResult} from './context'
import {replacementRoom,completeStayChangeTx} from './complete'
import {quoteIdentity,acceptedQuote} from '@/domain/quotes/validation'
import {relationshipId} from '@/features/customer/bookings'
import {privateDigest} from '@/domain/security/private-state'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {recoveryPolicy} from '@/domain/payments/recovery-policy'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {configuredMayaGateway} from '@/integrations/maya/configured'
const reference=z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/)
export const changeInputSchema=z.object({quoteId:z.uuid(),version:z.number().int().positive(),agreementReference:reference,reason:reference}).strict()
function staff(ctx:CommandContext){if(ctx.actor.kind!=='staff'||parseEnvironment(process.env).operationMode!=='normal')throw new Error('Authorized staff access required')}
export async function requestStayChange(ctx:CommandContext,bookingId:string,expectedRevision:number,input:ChangeInput):Promise<ChangeResult>{
 staff(ctx);z.uuid().parse(bookingId);z.number().int().positive().parse(expectedRevision)
 const value=changeInputSchema.parse(input),fingerprint=privateDigest('stay-change\0'+JSON.stringify({bookingId,expectedRevision,staff:ctx.actor.kind==='staff'?ctx.actor.id:null,...value}))
 return ctx.uow.run(ctx.actor,async tx=>{
  const previous=(await tx.payload.find({collection:'booking-changes',where:{commandKey:{equals:value.quoteId}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Change conflicts with its original command');return changeResult(previous)}
  const rule=await requireChangePolicy(tx,ctx),booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
  requireChangeable(ctx,booking,expectedRevision)
  const original=await currentStay(tx,booking),allocation=await originalAllocation(tx,booking)
  if(original.offerVersionId)throw new Error('Offer changes require approved adjustment rules')
  if((await tx.payload.count({collection:'booking-changes',where:{and:[{booking:{equals:bookingId}},{state:{equals:'awaiting-payment'}}]},req:tx.req,overrideAccess:false})).totalDocs)throw new Error('Review or abandon the existing pending change first')
  const row=await tx.payload.findByID({collection:'quotes',id:value.quoteId,depth:0,req:tx.req,overrideAccess:false});await quoteIdentity(tx,ctx,row)
  const quote=acceptedQuote(row),binding=z.object({bookingId:z.uuid(),revision:z.number().int().positive()}).strict().parse(row.changeContext)
  if(row.scope!=='staff-change'||binding.bookingId!==bookingId||binding.revision!==expectedRevision||row.consumedByBooking||quote.version!==value.version||quote.policyVersionId!==ctx.policy.id||quote.policyRevision!==ctx.policy.revision||Date.parse(quote.expiresAt)<=Date.parse(ctx.clock.now())||quote.offerVersionId||!quote.terms||relationshipId(row.issuerStaff)!==(ctx.actor.kind==='staff'?ctx.actor.id:null)||!isDeepStrictEqual(row.acceptedBy,ctx.actor)||quote.total.currency!==original.total.currency)throw new Error('Review and accept the current replacement quote')
  const delta=BigInt(quote.total.minor)-BigInt(original.total.minor)
  if(delta>0n){
   const policy=await requireCurrentPolicy(tx,ctx,['work','maya','paymentRecovery']),recovery=recoveryPolicy(policy),maya=z.object({checkoutEnabled:z.literal(true),kountEnabled:z.literal(false),maxAmountMinor:z.string().regex(/^[1-9]\d*$/),timeoutMs:z.number().int().positive()}).passthrough().parse(policy.sections.maya)
   if(rule.paymentMinutes*60000<=recovery.providerWindowMinutes*60000+maya.timeoutMs||delta>BigInt(maya.maxAmountMinor)||process.env.APP_ENV!=='test'&&!configuredMayaGateway(policy))throw new Error('Supplemental payment is unavailable')
  }
  let change=await tx.payload.create({collection:'booking-changes',data:{commandKey:value.quoteId,fingerprint,booking:bookingId,staff:ctx.actor.kind==='staff'?ctx.actor.id:'',kind:'stay',state:'awaiting-payment',baseRevision:expectedRevision,targetRevision:expectedRevision+1,quote:quote.id,originalQuote:original,acceptedQuote:quote,originalAllocation:{...allocation},deltaMinor:delta.toString(),currency:quote.total.currency,agreementReference:value.agreementReference,reason:value.reason},req:tx.req,overrideAccess:false})
  await tx.payload.update({collection:'quotes',id:quote.id,data:{consumedByBooking:bookingId},req:tx.req,overrideAccess:false})
  if(delta>0n){
   const deadline=new Date(Date.parse(ctx.clock.now())+rule.paymentMinutes*60000).toISOString(),attempt=await tx.payload.create({collection:'payment-attempts',data:{booking:bookingId,merchantReference:'ACN-C-'+randomBytes(15).toString('hex').toUpperCase(),commandKey:change.commandKey,fingerprint,amountMinor:delta.toString(),currency:quote.total.currency,reconcileSequence:0,resumeCount:0,purpose:'change',revision:change.targetRevision,state:'preparing',deadline,acceptedContext:{purpose:'change',changeId:change.id,quote,delta:{minor:delta.toString(),currency:quote.total.currency},bookingId,baseRevision:expectedRevision,targetRevision:expectedRevision+1,ownerCustomerId:relationshipId(booking.ownerCustomer),contact:booking.contact,stayingGuest:booking.stayingGuest,deadline}},req:tx.req,overrideAccess:false})
   change=await tx.payload.update({collection:'booking-changes',id:change.id,data:{paymentAttempt:attempt.id},req:tx.req,overrideAccess:false})
   await enqueue(tx,{semanticKey:'checkout:'+attempt.id,kind:'create-checkout',payload:{attemptId:attempt.id},availableAt:ctx.clock.now()})
   await enqueue(tx,{semanticKey:'reconcile-payment:'+attempt.id+':deadline',kind:'reconcile-payment',payload:{attemptId:attempt.id},availableAt:deadline})
  }else{
   const room=await replacementRoom(tx,ctx,booking,quote)
   if(!room)throw new Error('Replacement room is no longer available')
   await completeStayChangeTx(tx,ctx,booking,change,quote,room)
   change=await tx.payload.findByID({collection:'booking-changes',id:change.id,depth:0,req:tx.req,overrideAccess:false})
  }
  await appendAudit(tx,{action:'change:requested',recordType:'booking-changes',recordId:change.id,outcome:'success',safeChanges:{bookingId,revision:change.targetRevision,state:change.state}})
  return changeResult(change)
 })
}
export async function abandonStayChange(ctx:CommandContext,changeId:string):Promise<ChangeResult>{
 staff(ctx);z.uuid().parse(changeId)
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireChangePolicy(tx,ctx,false,true)
  let row=await tx.payload.findByID({collection:'booking-changes',id:changeId,depth:0,req:tx.req,overrideAccess:false})
  if(row.kind!=='stay')throw new Error('Only a stay change may be abandoned')
  if(row.state!=='awaiting-payment')return changeResult(row)
  row=await tx.payload.update({collection:'booking-changes',id:row.id,data:{state:'abandoned',abandonedAt:ctx.clock.now(),reasonCode:'staff-abandoned'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'change:abandoned',recordType:'booking-changes',recordId:row.id,outcome:'success',safeChanges:{bookingId:relationshipId(row.booking),revision:row.targetRevision}})
  return changeResult(row)
 })
}
