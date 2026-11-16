import {isDeepStrictEqual} from 'node:util'
import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking,PaymentAttempt,PaymentInbox,PaymentTransaction} from '@/payload-types'
import {parseEnvironment} from '@/config/env'
import {relationshipId} from '@/features/customer/bookings'
import {changePaymentContext,ChangeContextError} from './context'
import {replacementRoom,completeStayChangeTx} from './complete'
export async function applyChangePaymentTx(tx:DbTx,ctx:CommandContext,booking:Booking,attempt:PaymentAttempt,payment:PaymentTransaction,inbox:PaymentInbox):Promise<{state:'confirmed'|'recorded'}|{reason:string}>{
 let context
 try{context=await changePaymentContext(tx,booking,attempt)}catch(error){if(error instanceof ChangeContextError||error instanceof z.ZodError)return {reason:'change-context-mismatch'};throw error}
 const {change,quote}=context,environment=(quote.policySnapshot.sections.maya as {environment?:string})?.environment
 if(!quote.policySnapshot.approvedSections.includes('maya')||environment!==inbox.environment||parseEnvironment(process.env).mayaEnvironment!==inbox.environment||attempt.providerEnvironment&&attempt.providerEnvironment!==inbox.environment)return {reason:'environment-mismatch'}
 if(attempt.amountMinor!==inbox.amountMinor||attempt.currency!==inbox.currency)return {reason:'money-mismatch'}
 if((await tx.payload.count({collection:'payment-inbox',where:{and:[{source:{equals:'retrieval'}},{environment:{equals:inbox.environment}},{providerPaymentId:{equals:inbox.providerPaymentId}},{providerStatus:{in:['VOIDED','REFUNDED']}}]},req:tx.req,overrideAccess:false})).totalDocs)return {reason:'external-reversal'}
 if(change.state==='completed'&&payment.appliedRevision===change.targetRevision&&relationshipId(payment.booking)===booking.id)return {state:'recorded'}
 if(attempt.state==='closed'||attempt.createOutcome==='refused')return {reason:'closed-change'}
 if(change.state!=='awaiting-payment')return {reason:'closed-change'}
 if(booking.status!=='confirmed'||booking.revision!==change.baseRevision||!isDeepStrictEqual(booking.acceptedQuote,change.originalQuote))return {reason:'superseded-change'}
 const paidAt=inbox.providerPaidAt??payment.collectedAt??ctx.clock.now()
 if(Date.parse(ctx.clock.now())>Date.parse(attempt.deadline)||Date.parse(paidAt)>Date.parse(attempt.deadline)||Date.parse(paidAt)<Date.parse(quote.acceptedAt)||Date.parse(paidAt)>Date.parse(ctx.clock.now())+300000)return {reason:'late-change-payment'}
 const room=await replacementRoom(tx,ctx,booking,quote)
 if(!room){await tx.payload.update({collection:'booking-changes',id:change.id,data:{state:'failed',reasonCode:'paid-replacement-unavailable'},req:tx.req,overrideAccess:false});return {reason:'paid-replacement-unavailable'}}
 await completeStayChangeTx(tx,ctx,booking,change,quote,room,payment)
 return {state:'confirmed'}
}
