import {z} from 'zod'
import type {CommandContext} from '../db/types'
import type {Result} from '../shared/types'
import {appendAudit} from '../audit/append'
import {matchesPrivateDigest} from '../security/private-state'
import {relationshipId,requireCustomer} from '@/features/customer/bookings'
import type {ClaimError,ClaimEvidence} from './types'
import {claimPolicy} from './policy'
const evidenceSchema=z.object({purpose:z.literal('booking-claim'),approvalId:z.uuid(),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict()
export async function attachClaim(ctx:CommandContext,evidence:ClaimEvidence):Promise<Result<string,ClaimError>>{
  const invalid={ok:false as const,code:'insufficient-evidence' as const},parsed=evidenceSchema.safeParse(evidence)
  if(!parsed.success||ctx.actor.kind!=='customer')return invalid
  try{claimPolicy(ctx)}catch{return invalid}
  return ctx.uow.run(ctx.actor,async tx=>{
    const customerId=await requireCustomer(tx)
    const claim=(await tx.payload.find({collection:'booking-claims',where:{id:{equals:parsed.data.approvalId}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(!claim||relationshipId(claim.customer)!==customerId||claim.purpose!=='booking-claim'||!matchesPrivateDigest('booking-claim\0'+parsed.data.token,claim.tokenHash)||claim.revokedAt||claim.securityRevision!==(tx.req.user?.collection==='customers'?tx.req.user.securityRevision:0)||claim.policyId!==ctx.policy.id||claim.policyRevision!==ctx.policy.revision)return invalid
    if(claim.usedAt)return {ok:false,code:'used'}
    if(Date.parse(claim.expiresAt)<=Date.parse(ctx.clock.now()))return {ok:false,code:'expired'}
    const booking=await tx.payload.findByID({collection:'bookings',id:relationshipId(claim.booking)!,depth:0,req:tx.req,overrideAccess:false})
    if(booking.ownerCustomer)return {ok:false,code:'conflict'}
    await tx.payload.update({collection:'booking-claims',id:claim.id,data:{usedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
    await tx.payload.update({collection:'bookings',id:booking.id,data:{ownerCustomer:customerId},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'booking:claimed',recordType:'bookings',recordId:booking.id,outcome:'success'})
    return {ok:true,value:booking.id}
  })
}
