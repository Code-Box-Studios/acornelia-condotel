import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {MayaGateway} from '@/integrations/maya/types'
import type {WorkHandler} from '@/domain/work/types'
import {assertWorker,fencedRow} from '@/domain/work/validation'
import {reconcileAttempt,reconcileWork,type ReconcileResult} from './reconcile'
async function attemptFor(tx:DbTx,bookingId:string){
  const booking=await tx.payload.findByID({collection:'bookings',id:z.uuid().parse(bookingId),depth:0,req:tx.req,overrideAccess:false})
  if(['confirmed','completed'].includes(booking.status)||booking.source!=='website'||!booking.checkoutKey)return null
  const attempts=(await tx.payload.find({collection:'payment-attempts',where:{and:[{booking:{equals:booking.id}},{commandKey:{equals:booking.checkoutKey}},{purpose:{equals:'booking'}}]},limit:2,depth:0,req:tx.req,overrideAccess:false})).docs
  if(attempts.length!==1)throw new Error('Booking expiry requires its original attempt')
  return attempts[0]
}
export async function expireHold(ctx:CommandContext,bookingId:string,gateway?:MayaGateway):Promise<ReconcileResult|null>{
  if(ctx.actor.kind!=='system'||!['payments','work','recovery'].includes(ctx.actor.purpose))throw new Error('Expiry authority required')
  const attempt=await ctx.uow.run(ctx.actor,tx=>attemptFor(tx,bookingId))
  return attempt?reconcileAttempt(ctx,attempt.id,gateway):null
}
export function expiryHandler(gateway:MayaGateway):WorkHandler{return {execute:async(ctx,lease,signal)=>{
  assertWorker(ctx)
  const {bookingId}=z.object({bookingId:z.uuid()}).strict().parse(lease.payload)
  const attempt=await ctx.uow.run(ctx.actor,async tx=>{const work=await fencedRow(tx,lease,ctx.clock.now());if(work.kind!=='expire-hold'||!work.dispatchStarted)throw new Error('Expiry requires its started lease');return attemptFor(tx,bookingId)})
  return attempt?reconcileWork(ctx,lease,gateway,signal,attempt.id):{state:'done'}
}}}
