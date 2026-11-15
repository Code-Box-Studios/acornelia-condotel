import {z} from 'zod'
import type {Where} from 'payload'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking} from '@/payload-types'
import {decryptPrivateState,encryptPrivateState} from '@/domain/security/private-state'
import {parseMoney} from '@/domain/shared/money'
import type {BookingPage,BookingSummary} from './types'

export class CustomerAccessError extends Error {}
export class HistoryCursorError extends Error {}
export async function requireCustomer(tx:DbTx){
  if(tx.actor.kind!=='customer'||tx.req.user?.collection!=='customers'||!tx.req.user._verified||tx.req.user.deactivated)throw new CustomerAccessError('Customer access required')
  return tx.actor.id
}
export const relationshipId=(value:string|{id:string}|null|undefined):string|null=>typeof value==='string'?value:value?.id??null
export async function bookingSummaries(tx:DbTx,rows:Booking[]):Promise<BookingSummary[]>{
  if(!rows.length)return []
  const ids=rows.map(row=>row.id)
  // The transaction owns one PostgreSQL client; do not overlap queries on it.
  const attempts=await tx.payload.find({collection:'payment-attempts',where:{booking:{in:ids}},limit:1000,sort:['-createdAt','-id'],depth:0,overrideAccess:false,req:tx.req})
  const transactions=await tx.payload.find({collection:'payment-transactions',where:{booking:{in:ids}},limit:1000,sort:['-createdAt','-id'],depth:0,overrideAccess:false,req:tx.req})
  if(attempts.hasNextPage||transactions.hasNextPage)throw new Error('Booking payment history requires operator review')
  return rows.map(row=>{
    const contact=z.object({name:z.string().optional(),email:z.string().optional(),phone:z.string().optional()}).safeParse(row.contact)
    let acceptedTotal=null
    if(row.acceptedQuote&&typeof row.acceptedQuote==='object'&&!Array.isArray(row.acceptedQuote)&&'total' in row.acceptedQuote){try{acceptedTotal=parseMoney(row.acceptedQuote.total)}catch{/* Legacy quotes without a validated amount are not invented. */}}
    return {
      id:row.id,code:row.code??null,status:row.status,arrival:row.arrival.slice(0,10),departure:row.departure.slice(0,10),
      booker:{customerId:relationshipId(row.ownerCustomer)},
      contact:{name:contact.success?contact.data.name??null:null,email:contact.success?contact.data.email??null:null,phone:contact.success?contact.data.phone??null:null},
      stayingGuest:{name:row.stayingGuest??null},acceptedTotal,
      payments:{attempts:attempts.docs.filter(attempt=>relationshipId(attempt.booking)===row.id).map(attempt=>({id:attempt.id,state:attempt.state,amount:parseMoney({minor:attempt.amountMinor,currency:attempt.currency})})),transactions:transactions.docs.filter(payment=>relationshipId(payment.booking)===row.id).map(payment=>({id:payment.id,status:payment.status,amount:parseMoney({minor:payment.amountMinor,currency:payment.currency})}))},
    }
  })
}
const cursorSchema=z.object({owner:z.uuid(),id:z.uuid(),arrival:z.iso.datetime(),expires:z.number().int()}).strict()
export async function listOwnBookings(ctx:CommandContext,cursor:string|null):Promise<BookingPage>{
  return ctx.uow.run(ctx.actor,async tx=>{
    const owner=await requireCustomer(tx),conditions:Where[]=[{ownerCustomer:{equals:owner}}]
    if(cursor){
      let parsed:z.infer<typeof cursorSchema>
      try{if(cursor.length>2048)throw new Error();parsed=cursorSchema.parse(decryptPrivateState(cursor,'customer-history-cursor'))}catch{throw new HistoryCursorError('Invalid history cursor')}
      if(parsed.owner!==owner||parsed.expires<=Date.parse(ctx.clock.now()))throw new HistoryCursorError('Invalid history cursor')
      conditions.push({or:[{arrival:{less_than:parsed.arrival}},{and:[{arrival:{equals:parsed.arrival}},{id:{less_than:parsed.id}}]}]})
    }
    const result=await tx.payload.find({collection:'bookings',where:{and:conditions},limit:21,sort:['-arrival','-id'],depth:0,req:tx.req,overrideAccess:false})
    const rows=result.docs.slice(0,20),last=rows.at(-1)
    return {items:await bookingSummaries(tx,rows),nextCursor:result.docs.length>20&&last?encryptPrivateState({owner,id:last.id,arrival:last.arrival,expires:Date.parse(ctx.clock.now())+1800000},'customer-history-cursor'):null}
  })
}
export async function readOwnBooking(ctx:CommandContext,id:string):Promise<BookingSummary|null>{
  if(!z.uuid().safeParse(id).success)return null
  return ctx.uow.run(ctx.actor,async tx=>{
    const owner=await requireCustomer(tx),row=(await tx.payload.find({collection:'bookings',where:{and:[{id:{equals:id}},{ownerCustomer:{equals:owner}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    return row?(await bookingSummaries(tx,[row]))[0]:null
  })
}
