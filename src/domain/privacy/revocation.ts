import type {DbTx} from '@/domain/db/types'
import {appendAudit} from '@/domain/audit/append'
import {endAccountAccess} from '@/features/auth/revocation'
import type {RevocationSubject} from './types'
/**
 * Revokes sessions, pending reset/verification tokens, unused historical-claim tokens and
 * account-bound private status links. Booking ownership, booking-view links sent to the booking
 * contact, money and audit records are left untouched. Returns the new security revision.
 */
export async function revokeCapabilities(tx:DbTx,subject:RevocationSubject,reason:string,at:string,changes:Record<string,unknown>={}):Promise<number>{
 const revision=await endAccountAccess(tx,subject.collection,subject.id,changes)
 let count=0
 if(subject.collection==='customers'){
  const tokens=await tx.payload.find({collection:'auth-tokens',where:{and:[{account:{equals:subject.id}},{usedAt:{exists:false}}]},limit:1000,depth:0,req:tx.req,overrideAccess:false})
  for(const row of tokens.docs){await tx.payload.update({collection:'auth-tokens',id:row.id,data:{usedAt:at},req:tx.req,overrideAccess:false});count++}
  const claims=await tx.payload.find({collection:'booking-claims',where:{and:[{customer:{equals:subject.id}},{usedAt:{exists:false}},{revokedAt:{exists:false}}]},limit:1000,depth:0,req:tx.req,overrideAccess:false})
  for(const row of claims.docs){await tx.payload.update({collection:'booking-claims',id:row.id,data:{revokedAt:at},req:tx.req,overrideAccess:false});count++}
  const views=await tx.payload.find({collection:'booking-views',where:{and:[{customer:{equals:subject.id}},{revokedAt:{exists:false}}]},limit:1000,depth:0,req:tx.req,overrideAccess:false})
  for(const row of views.docs){await tx.payload.update({collection:'booking-views',id:row.id,data:{revokedAt:at},req:tx.req,overrideAccess:false});count++}
  if(tokens.hasNextPage||claims.hasNextPage||views.hasNextPage)throw new Error('Too many outstanding capabilities; revoke in an operator-reviewed batch')
 }
 await appendAudit(tx,{action:'account:capabilities-revoked',recordType:subject.collection,recordId:subject.id,outcome:'success',safeChanges:{reasonCode:reason,count,revision}})
 return revision
}
