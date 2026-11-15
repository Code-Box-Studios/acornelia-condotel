import type {Where} from 'payload'
import type {OfferVersion as OfferVersionRow} from '@/payload-types'
import type {DbTx} from '@/domain/db/types'
import {relationshipId} from '@/features/customer/bookings'
import type {OfferVersion} from './types'
import {offerTermsSchema} from './validation'
export class OfferUnavailable extends Error {constructor(public readonly code:'account-required'|'unavailable'|'exhausted'|'account-limit'|'reissue-required'){super('The account offer is unavailable')}}
export function offerVersionFromRecord(row:OfferVersionRow):OfferVersion{
  if(!row.approved||!row.approvalReference?.trim()||row.synthetic&&process.env.APP_ENV==='production')throw new OfferUnavailable('unavailable')
  return {id:row.id,offerId:relationshipId(row.offer)!,policyVersionId:relationshipId(row.policyVersion)!,revision:row.revision,name:row.name,terms:offerTermsSchema.parse(row.terms),synthetic:row.synthetic}
}
export async function loadOfferVersion(tx:DbTx,id:string,now:string,current=true){
  const row=await tx.payload.findByID({collection:'offer-versions',id,depth:0,req:tx.req,overrideAccess:false}),version=offerVersionFromRecord(row)
  if(Date.parse(row.publishedAt)>Date.parse(now))throw new OfferUnavailable('unavailable')
  const offer=await tx.payload.findByID({collection:'offers',id:version.offerId,depth:0,req:tx.req,overrideAccess:false})
  if(current&&(!offer.active||relationshipId(offer.currentVersion)!==version.id))throw new OfferUnavailable('unavailable')
  return {version,offer}
}
export async function bumpOfferUsage(tx:DbTx,id:string,revision:number){
  if(!Number.isSafeInteger(revision+1))throw new Error('Offer usage counter requires operator review')
  await tx.payload.update({collection:'offers',id,data:{usageRevision:revision+1},req:tx.req,overrideAccess:false})
}
export async function offerUsage(tx:DbTx,version:OfferVersion,customerId:string){
  const scope:Where=version.terms.limitScope==='offer'?{offer:{equals:version.offerId}}:{offerVersion:{equals:version.id}}
  const where:Where={and:[scope,{state:{in:['reserved','consumed']}}]}
  // One transaction uses one PostgreSQL client; serialize queries on that connection.
  const overall=await tx.payload.count({collection:'offer-allocations',where,req:tx.req,overrideAccess:false})
  const account=await tx.payload.count({collection:'offer-allocations',where:{and:[where,{customer:{equals:customerId}}]},req:tx.req,overrideAccess:false})
  if(!Number.isSafeInteger(overall.totalDocs)||!Number.isSafeInteger(account.totalDocs))throw new Error('Offer usage requires operator review')
  const code:'exhausted'|'account-limit'|null=version.terms.overallLimit!==null&&overall.totalDocs>=version.terms.overallLimit?'exhausted':version.terms.perAccountLimit!==null&&account.totalDocs>=version.terms.perAccountLimit?'account-limit':null
  return {overall:overall.totalDocs,account:account.totalDocs,code}
}
