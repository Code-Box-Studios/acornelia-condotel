import {z} from 'zod'
import type {CommandContext} from '../db/types'
import {appendAudit} from '../audit/append'
import {opaqueSecret,privateDigest} from '../security/private-state'
import type {ClaimEvidence,IssueClaimInput} from './types'
import {claimPolicy} from './policy'
import {emailPolicy} from '@/email/policy'
import {createEmail} from '@/email/storage'
import {enqueue} from '@/domain/work/enqueue'
const inputSchema=z.object({bookingId:z.uuid(),customerId:z.uuid(),proof:z.object({method:z.literal('staff-reviewed-original-evidence'),reviewReference:z.uuid()}).strict()}).strict()
/** Only an authorized operator can record completed independent evidence review. No email-match fallback. */
export async function issueClaim(ctx:CommandContext,input:IssueClaimInput):Promise<ClaimEvidence>{
  const policy=claimPolicy(ctx),parsed=inputSchema.parse(input)
  if(ctx.actor.kind!=='staff'||ctx.actor.role!=='developer')throw new Error('Historical claims require an authorized reviewer')
  return ctx.uow.run(ctx.actor,async tx=>{
    const booking=await tx.payload.findByID({collection:'bookings',id:parsed.bookingId,depth:0,overrideAccess:false,req:tx.req})
    if(booking.ownerCustomer)throw new Error('Booking ownership requires authorized recovery')
    const customer=await tx.payload.findByID({collection:'customers',id:parsed.customerId,depth:0,overrideAccess:true,req:tx.req})
    if(!customer._verified||customer.deactivated)throw new Error('Customer access required')
    const token=opaqueSecret(),expiresAt=new Date(Date.parse(ctx.clock.now())+policy.tokenMinutes*60000).toISOString()
    const approval=await tx.payload.create({collection:'booking-claims',data:{booking:booking.id,customer:customer.id,reviewer:ctx.actor.kind==='staff'?ctx.actor.id:'',purpose:'booking-claim',tokenHash:privateDigest('booking-claim\0'+token),proof:parsed.proof,policyId:ctx.policy.id,policyRevision:ctx.policy.revision,securityRevision:customer.securityRevision,expiresAt},req:tx.req,overrideAccess:false})
    if(ctx.policy.approvedSections.includes('transactionalEmail')&&emailPolicy(ctx.policy).claimDelivery==='reviewed-account'){
      const message=await createEmail(tx,{semanticKey:'claim:'+approval.id,category:'claim',snapshot:{approvalId:approval.id,token,recipient:customer.email},booking:booking.id,expiresAt})
      await enqueue(tx,{semanticKey:'claim:'+approval.id,kind:'email',payload:{category:'staff',messageId:message.id},availableAt:ctx.clock.now()})
    }
    await appendAudit(tx,{action:'booking:claim-issued',recordType:'booking-claims',recordId:approval.id,outcome:'success',safeChanges:{bookingId:booking.id,policyVersionId:ctx.policy.id,revision:ctx.policy.revision}})
    return {purpose:'booking-claim',approvalId:approval.id,token}
  })
}
