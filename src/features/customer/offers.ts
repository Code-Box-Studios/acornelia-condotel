import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {requireCustomer,relationshipId} from './bookings'
import {loadOfferVersion,offerUsage,OfferUnavailable} from '@/domain/offers/storage'
import {offerPolicySchema} from '@/domain/offers/validation'
import type {OfferTerms} from '@/domain/offers/types'
export type AccountOffer={id:string;name:string;terms:OfferTerms;status:'available'|'exhausted'|'account-limit';synthetic:boolean}
export async function readMyOffers(ctx:CommandContext):Promise<{items:AccountOffer[];timezone:string|null}>{
  return ctx.uow.run(ctx.actor,async tx=>{
    const customerId=await requireCustomer(tx)
    if(ctx.policy.revision<1||!['stay','pricing','offers'].every(section=>ctx.policy.approvedSections.includes(section)))return {items:[],timezone:null}
    const policy=await requireCurrentPolicy(tx,ctx,['stay','pricing','offers']);offerPolicySchema.parse(policy.sections.offers)
    const timezone=z.object({timezone:z.string().min(1)}).parse(policy.sections.stay).timezone,today=ctx.clock.today(timezone),now=ctx.clock.now()
    const parents=await tx.payload.find({collection:'offers',where:{active:{equals:true}},sort:'name',limit:100,depth:0,req:tx.req,overrideAccess:false})
    if(parents.hasNextPage)throw new Error('Current offers require operator review')
    const items:AccountOffer[]=[]
    for(const parent of parents.docs){
      const id=relationshipId(parent.currentVersion)
      if(!id)continue
      let version
      try{version=(await loadOfferVersion(tx,id,now)).version}catch(error){if(error instanceof OfferUnavailable)continue;throw error}
      if(version.policyVersionId!==policy.id||Date.parse(now)<Date.parse(version.terms.bookingFrom)||Date.parse(now)>=Date.parse(version.terms.bookingUntil)||version.terms.stayUntil<=today)continue
      const usage=await offerUsage(tx,version,customerId)
      items.push({id:version.id,name:version.name,terms:version.terms,status:usage.code??'available',synthetic:version.synthetic})
    }
    return {items,timezone}
  })
}
