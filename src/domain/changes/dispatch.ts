import {isDeepStrictEqual} from 'node:util'
import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking,PaymentAttempt} from '@/payload-types'
import {changePaymentContext,ChangeContextError,originalAllocation} from './context'
import {changePolicySchema} from './policy'
import {relationshipId} from '@/features/customer/bookings'
import {recoveryPolicy} from '@/domain/payments/recovery-policy'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
export async function changeStillPayable(tx:DbTx,booking:Booking,attempt:PaymentAttempt){
 let context
 try{context=await changePaymentContext(tx,booking,attempt)}catch(error){if(error instanceof ChangeContextError||error instanceof z.ZodError)return false;throw error}
 const {change}=context
 if(booking.status!=='confirmed'||booking.revision!==change.baseRevision||change.state!=='awaiting-payment'||!isDeepStrictEqual(booking.acceptedQuote,change.originalQuote))return false
 return isDeepStrictEqual(await originalAllocation(tx,booking),change.originalAllocation)
}
export async function prepareChangeCheckout(tx:DbTx,ctx:CommandContext,attempt:PaymentAttempt,backoffSeconds:number){
 const bookingId=relationshipId(attempt.booking)!,booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false}),refuse=(code:string)=>({kind:'window-refused' as const,attemptId:attempt.id,code})
 if(attempt.state!=='preparing'||!await changeStillPayable(tx,booking,attempt))return refuse('change-no-longer-payable')
 const {change,quote}=await changePaymentContext(tx,booking,attempt),policy=await requireCurrentPolicy(tx,ctx,['work','maya','paymentRecovery','stayChanges']),rule=changePolicySchema.parse(policy.sections.stayChanges),staff=await tx.payload.findByID({collection:'staff-users',id:relationshipId(change.staff)!,depth:0,req:tx.req,overrideAccess:true})
 if(staff.deactivated||!rule.enabled||!rule.roles.includes(staff.role))return refuse('change-authority-removed')
 const environment=z.enum(['sandbox','production']).parse((quote.policySnapshot.sections.maya as {environment?:unknown})?.environment)
 if(!quote.policySnapshot.approvedSections.includes('maya'))return refuse('change-payment-unapproved')
 const timeout=z.number().int().positive().parse((policy.sections.maya as {timeoutMs?:unknown}).timeoutMs),window=recoveryPolicy(policy).providerWindowMinutes*60000
 if(Date.parse(attempt.deadline)-Date.parse(ctx.clock.now())<=window+timeout)return refuse('window-too-short')
 await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'unknown'},req:tx.req,overrideAccess:false})
 await enqueue(tx,{semanticKey:'reconcile-payment:'+attempt.id+':dispatch',kind:'reconcile-payment',payload:{attemptId:attempt.id},availableAt:new Date(Date.parse(ctx.clock.now())+backoffSeconds*1000).toISOString()})
 await appendAudit(tx,{action:'checkout:dispatch-owned',recordType:'payment-attempts',recordId:attempt.id,outcome:'unknown'})
 return {kind:'dispatch' as const,attempt:{id:attempt.id,bookingId,merchantReference:attempt.merchantReference,amount:{minor:attempt.amountMinor,currency:attempt.currency},revision:attempt.revision,deadline:attempt.deadline,synthetic:quote.synthetic},environment}
}
