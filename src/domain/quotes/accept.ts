import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import {appendAudit} from '@/domain/audit/append'
import {acceptedQuote,quoteIdentity,quoteSnapshot} from './validation'
import type {AcceptedQuote} from './types'
export async function acceptQuote(ctx:CommandContext,quoteId:string,version:number):Promise<AcceptedQuote>{
  z.uuid().parse(quoteId);z.number().int().positive().parse(version)
  return ctx.uow.run(ctx.actor,async tx=>{
    const row=await tx.payload.findByID({collection:'quotes',id:quoteId,depth:0,req:tx.req,overrideAccess:false})
    await quoteIdentity(tx,ctx,row);quoteSnapshot(row)
    if(row.version!==version)throw new Error('Review the current quote before agreeing')
    if(row.acceptedAt)return acceptedQuote(row)
    if(Date.parse(row.expiresAt)<=Date.parse(ctx.clock.now()))throw new Error('This quote has expired; request a fresh price')
    const accepted=await tx.payload.update({collection:'quotes',id:row.id,data:{acceptedAt:ctx.clock.now(),acceptedBy:ctx.actor},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'quote:accepted',recordType:'quotes',recordId:row.id,outcome:'success'})
    return acceptedQuote(accepted)
  })
}
