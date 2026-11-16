import type {DbTx} from '@/domain/db/types'
import type {PaymentInbox,PaymentTransaction,PaymentAttempt} from '@/payload-types'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {relationshipId} from '@/features/customer/bookings'
export async function paymentIssue(tx:DbTx,inbox:PaymentInbox,payment:PaymentTransaction,attempt:PaymentAttempt|undefined,reasonCode:string,now:string):Promise<string>{
  const issueKey=payment.id+':'+reasonCode,existing=(await tx.payload.find({collection:'payment-issues',where:{issueKey:{equals:issueKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(existing)return existing.id
  const issue=await tx.payload.create({collection:'payment-issues',data:{issueKey,reasonCode,booking:attempt?relationshipId(attempt.booking):undefined,attempt:attempt?.id,payment:payment.id,inbox:inbox.id,observedAmountMinor:inbox.amountMinor,observedCurrency:inbox.currency,state:'open'},req:tx.req,overrideAccess:false})
  await enqueue(tx,{semanticKey:'payment-issue:'+issue.id,kind:'email',payload:{category:'payment-issue',issueId:issue.id},availableAt:now})
  await appendAudit(tx,{action:'payment:issue-opened',recordType:'payment-issues',recordId:issue.id,outcome:'unknown',safeChanges:{reasonCode,amountMinor:inbox.amountMinor,currency:inbox.currency}})
  return issue.id
}
export async function attemptIssue(tx:DbTx,attempt:PaymentAttempt,reasonCode:string,now:string):Promise<string>{
  const issueKey='attempt:'+attempt.id+':'+reasonCode,existing=(await tx.payload.find({collection:'payment-issues',where:{issueKey:{equals:issueKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(existing)return existing.id
  const issue=await tx.payload.create({collection:'payment-issues',data:{issueKey,reasonCode,booking:relationshipId(attempt.booking),attempt:attempt.id,state:'open'},req:tx.req,overrideAccess:false})
  await enqueue(tx,{semanticKey:'payment-issue:'+issue.id,kind:'email',payload:{category:'payment-issue',issueId:issue.id},availableAt:now})
  await appendAudit(tx,{action:'payment:escalated',recordType:'payment-issues',recordId:issue.id,outcome:'unknown',safeChanges:{reasonCode,state:'open'}})
  return issue.id
}
