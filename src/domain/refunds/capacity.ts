import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {RefundOperation} from '@/payload-types'
import type {Money} from '@/domain/shared/types'
import {relationshipId} from '@/features/customer/bookings'
import {requireRefundPolicy} from './policy'
export function reservedAmount(row:RefundOperation):bigint{return row.state==='completed'?BigInt(row.actualAmountMinor??row.amountMinor):['authorized','dispatching','uncertain'].includes(row.state)?BigInt(row.amountMinor):0n}
export async function refundBalances(tx:DbTx,paymentId:string){
 const payment=await tx.payload.findByID({collection:'payment-transactions',id:paymentId,depth:0,req:tx.req,overrideAccess:false}),bookingId=relationshipId(payment.booking)
 if(payment.status!=='collected'||!bookingId)throw new Error('An actual booking collection is required')
 const operations=await tx.payload.find({collection:'refund-operations',where:{booking:{equals:bookingId}},limit:10000,depth:0,req:tx.req,overrideAccess:false}),collections=await tx.payload.find({collection:'payment-transactions',where:{and:[{booking:{equals:bookingId}},{status:{equals:'collected'}},{currency:{equals:payment.currency}}]},limit:10000,depth:0,req:tx.req,overrideAccess:false})
 if(operations.hasNextPage||collections.hasNextPage)throw new Error('Refund history requires operator review')
 let paymentUsed=0n,bookingUsed=0n
 for(const row of operations.docs){if(row.currency!==payment.currency)continue;const used=reservedAmount(row);bookingUsed+=used;if(relationshipId(row.payment)===payment.id)paymentUsed+=used}
 const actual=BigInt(payment.amountMinor),bookingActual=collections.docs.reduce((sum,row)=>sum+BigInt(row.amountMinor),0n),paymentRemaining=actual-paymentUsed,bookingRemaining=bookingActual-bookingUsed,remaining=paymentRemaining<bookingRemaining?paymentRemaining:bookingRemaining
 return {payment,bookingId,operations:operations.docs,paymentUsed,bookingUsed,bookingActual,remaining:remaining>0n?remaining:0n}
}
export async function readRefundCapacity(ctx:CommandContext,paymentId:string):Promise<Money>{
 z.uuid().parse(paymentId)
 return ctx.uow.run(ctx.actor,async tx=>{await requireRefundPolicy(tx,ctx);const value=await refundBalances(tx,paymentId);return {minor:value.remaining.toString(),currency:value.payment.currency}})
}
