import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking} from '@/payload-types'
import {z} from 'zod'
import {assertDirectStaff} from './direct-policy'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
export type DirectClosure={state:'closed'}|{state:'saved';booking:Booking}
async function original(tx:DbTx,ctx:CommandContext,commandKey:string){
  const booking=(await tx.payload.find({collection:'bookings',where:{checkoutKey:{equals:commandKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(!booking)return null
  const receipt=z.object({creatorStaffId:z.uuid()}).passthrough().safeParse(booking.directContext)
  if(ctx.actor.kind!=='staff'||!['phone','walk-in'].includes(booking.source)||!receipt.success||receipt.data.creatorStaffId!==ctx.actor.id)throw new Error('Original staff entry is unavailable')
  return booking
}
export async function readDirectResult(ctx:CommandContext,commandKey:string):Promise<Booking|null>{assertDirectStaff(ctx);z.uuid().parse(commandKey);return ctx.uow.run(ctx.actor,async tx=>{const booking=await original(tx,ctx,commandKey);if(booking)await appendAudit(tx,{action:'booking:direct-result-read',recordType:'bookings',recordId:booking.id,outcome:'success'});return booking})}
/** DB-only closure races with a late save under serializable isolation; saved reservations are returned unchanged. */
export async function closeDirectCommand(ctx:CommandContext,quoteId:string,commandKey:string):Promise<DirectClosure>{
  assertDirectStaff(ctx);z.uuid().parse(quoteId);z.uuid().parse(commandKey)
  for(let retry=0;;retry++)try{return await ctx.uow.run(ctx.actor,async tx=>{
    const quote=await tx.payload.findByID({collection:'quotes',id:quoteId,depth:0,req:tx.req,overrideAccess:false})
    if(ctx.actor.kind!=='staff'||quote.scope!=='staff-direct'||relationshipId(quote.issuerStaff)!==ctx.actor.id||quote.directCommandKey!==commandKey)throw new Error('Original staff entry is unavailable')
    const booking=await original(tx,ctx,commandKey);if(booking)return {state:'saved' as const,booking}
    const previous=(await tx.payload.find({collection:'direct-command-closures',where:{commandKey:{equals:commandKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(previous)return {state:'closed' as const}
    const row=await tx.payload.create({collection:'direct-command-closures',data:{commandKey,quote:quote.id,staff:ctx.actor.id,closedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'booking:direct-entry-closed',recordType:'direct-command-closures',recordId:row.id,outcome:'success'})
    return {state:'closed' as const}
  })}catch(error){const row=error as {name?:string;data?:{errors?:{path?:string}[]}};if(retry<3&&row.name==='ValidationError'&&row.data?.errors?.some(value=>value.path==='commandKey'))continue;throw error}
}
