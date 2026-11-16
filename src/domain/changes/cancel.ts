import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import type {CancellationResult,CancellationInput} from './types'
import {requireChangePolicy,requireChangeable} from './policy'
import {currentStay,originalAllocation} from './context'
import {changeInputSchema} from './request'
import {privateDigest} from '@/domain/security/private-state'
import {release} from '@/domain/inventory/allocate'
import {appendAudit} from '@/domain/audit/append'
export async function cancelBooking(ctx:CommandContext,bookingId:string,expectedRevision:number,input?:CancellationInput):Promise<CancellationResult>{
 z.uuid().parse(bookingId);z.number().int().positive().parse(expectedRevision)
 const value=z.object({agreementReference:changeInputSchema.shape.agreementReference,reason:changeInputSchema.shape.reason}).strict().parse(input),key='cancel:'+bookingId+':'+expectedRevision,fingerprint=privateDigest('cancel-booking\0'+JSON.stringify({bookingId,expectedRevision,staff:ctx.actor.kind==='staff'?ctx.actor.id:null,...value}))
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireChangePolicy(tx,ctx,true)
  const previous=(await tx.payload.find({collection:'booking-changes',where:{commandKey:{equals:key}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Cancellation conflicts with its original command');return {kind:'cancelled',bookingId,revision:previous.targetRevision,cancellationId:previous.id}}
  const booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false});requireChangeable(ctx,booking,expectedRevision,true)
  const quote=await currentStay(tx,booking),allocation=await originalAllocation(tx,booking),now=ctx.clock.now()
  const pending=(await tx.payload.find({collection:'booking-changes',where:{and:[{booking:{equals:bookingId}},{state:{equals:'awaiting-payment'}}]},limit:100,depth:0,req:tx.req,overrideAccess:false})).docs
  for(const change of pending)await tx.payload.update({collection:'booking-changes',id:change.id,data:{state:'abandoned',abandonedAt:now,reasonCode:'booking-cancelled'},req:tx.req,overrideAccess:false})
  const row=await tx.payload.create({collection:'booking-changes',data:{commandKey:key,fingerprint,booking:bookingId,staff:ctx.actor.kind==='staff'?ctx.actor.id:'',kind:'cancellation',state:'completed',baseRevision:expectedRevision,targetRevision:expectedRevision+1,originalQuote:quote,acceptedQuote:quote,originalAllocation:{...allocation},deltaMinor:'0',currency:quote.total.currency,agreementReference:value.agreementReference,reason:value.reason,completedAt:now},req:tx.req,overrideAccess:false})
  await tx.payload.update({collection:'bookings',id:bookingId,data:{status:'cancelled',revision:expectedRevision+1},req:tx.req,overrideAccess:false})
  await release(tx,allocation.id,{cancellationId:row.id})
  // Consumed offer usage remains consumed. Repayment and possible reinstatement
  // need their own approved authorization and independently verified outcome.
  await appendAudit(tx,{action:'booking:cancelled',recordType:'bookings',recordId:bookingId,outcome:'success',safeChanges:{revision:expectedRevision+1,status:'cancelled'}})
  return {kind:'cancelled',bookingId,revision:expectedRevision+1,cancellationId:row.id}
 })
}
