import {z} from 'zod'
import type {Booking} from '@/payload-types'
import type {CommandContext} from '@/domain/db/types'
import {relationshipId} from '@/features/customer/bookings'
import type {DirectSummary} from './types'
export async function directSummary(ctx:CommandContext,booking:Booking):Promise<DirectSummary>{
  const accepted=z.object({total:z.object({minor:z.string(),currency:z.string()})}).passthrough().safeParse(booking.acceptedQuote)
  const details=await ctx.uow.run(ctx.actor,async tx=>{
    const allocation=(await tx.payload.find({collection:'allocations',where:{and:[{booking:{equals:booking.id}},{purpose:{equals:'booking'}},{released:{equals:false}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    const roomLabel=allocation?(await tx.payload.findByID({collection:'rooms',id:relationshipId(allocation.room)!,depth:0,req:tx.req,overrideAccess:false})).label:null,payments=await tx.payload.find({collection:'payment-transactions',where:{and:[{booking:{equals:booking.id}},{environment:{equals:'offline'}},{status:{equals:'collected'}}]},limit:1000,depth:0,req:tx.req,overrideAccess:false})
    if(payments.hasNextPage)throw new Error('Collection history requires operator review')
    const currency=payments.docs[0]?.currency,recordedAmount=currency&&payments.docs.every(row=>row.currency===currency)?{minor:payments.docs.reduce((sum,row)=>sum+BigInt(row.amountMinor),0n).toString(),currency}:null
    return {roomLabel,hasRecordedCollection:!!payments.docs.length,recordedAmount}
  })
  return {id:booking.id,code:booking.code??null,status:booking.status,source:booking.source,arrival:booking.arrival.slice(0,10),departure:booking.departure.slice(0,10),total:accepted.success?accepted.data.total:null,...details}
}
