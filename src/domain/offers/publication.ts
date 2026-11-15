import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import {appendAudit} from '@/domain/audit/append'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {offerTermsSchema,offerPolicySchema} from './validation'
import {offerVersionFromRecord} from './storage'
import type {OfferTerms,OfferVersion} from './types'
const inputSchema=z.object({offerId:z.uuid().optional(),expectedRevision:z.number().int().min(1).optional(),name:z.string().trim().min(1).max(160),terms:offerTermsSchema,approvalReference:z.string().trim().min(1).max(240)}).strict()
export async function publishOffer(ctx:CommandContext,input:{offerId?:string;expectedRevision?:number;name:string;terms:OfferTerms;approvalReference:string}):Promise<OfferVersion>{
  if(ctx.actor.kind!=='staff'||ctx.actor.role!=='developer')throw new Error('Offer publication requires an authorized operator')
  const parsed=inputSchema.parse(input)
  if(parsed.terms.usage.refunded==='release')throw new Error('Refund-triggered reinstatement requires the verified refund workflow')
  return ctx.uow.run(ctx.actor,async tx=>{
    const policy=await requireCurrentPolicy(tx,ctx,['offers','pricing']);offerPolicySchema.parse(policy.sections.offers)
    const offer=parsed.offerId?await tx.payload.findByID({collection:'offers',id:parsed.offerId,depth:0,req:tx.req,overrideAccess:false}):await tx.payload.create({collection:'offers',data:{name:parsed.name,active:false,usageRevision:0},req:tx.req,overrideAccess:false})
    const previous=(await tx.payload.find({collection:'offer-versions',where:{offer:{equals:offer.id}},sort:'-revision',limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(parsed.offerId&&parsed.expectedRevision!==previous?.revision)throw new Error('Offer version changed; review before publishing')
    const row=await tx.payload.create({collection:'offer-versions',data:{offer:offer.id,policyVersion:policy.id,name:parsed.name,revision:(previous?.revision??0)+1,terms:parsed.terms,approved:true,approvalReference:parsed.approvalReference,publishedAt:ctx.clock.now(),synthetic:!!policy.synthetic},req:tx.req,overrideAccess:false})
    await tx.payload.update({collection:'offers',id:offer.id,data:{name:parsed.name,active:true,currentVersion:row.id,usageRevision:offer.usageRevision+1},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'offer:published',recordType:'offer-versions',recordId:row.id,outcome:'success',safeChanges:{title:row.name,revision:row.revision,policyVersionId:policy.id}})
    return offerVersionFromRecord(row)
  })
}
export async function withdrawOffer(ctx:CommandContext,id:string):Promise<void>{
  if(ctx.actor.kind!=='staff'||ctx.actor.role!=='developer')throw new Error('Offer withdrawal requires an authorized operator')
  z.uuid().parse(id)
  await ctx.uow.run(ctx.actor,async tx=>{
    const offer=await tx.payload.findByID({collection:'offers',id,depth:0,req:tx.req,overrideAccess:false})
    if(!offer.active)return
    await tx.payload.update({collection:'offers',id,data:{active:false,usageRevision:offer.usageRevision+1},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'offer:withdrawn',recordType:'offers',recordId:id,outcome:'success'})
  })
}
