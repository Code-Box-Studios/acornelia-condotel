import type {DbTx} from '@/domain/db/types'
/**
 * Candidate retention rules pending Decision 07. Anonymization scrubs the account's own identity
 * fields only. Booking contact snapshots, payments, refunds, stay history and audit entries are
 * retained as booking, financial and security evidence; nothing here deletes them.
 */
export const anonymizedName='Deleted account'
export function anonymizedEmail(accountId:string){return 'deleted-'+accountId+'@account.invalid'}
/** Private booking-view links for the account's own bookings end when its holder asks to be forgotten. */
export async function revokeOwnedBookingLinks(tx:DbTx,accountId:string,at:string):Promise<number>{
 const bookings=await tx.payload.find({collection:'bookings',where:{ownerCustomer:{equals:accountId}},limit:1000,depth:0,req:tx.req,overrideAccess:false})
 if(bookings.hasNextPage)throw new Error('Too many bookings; anonymize in an operator-reviewed batch')
 if(!bookings.docs.length)return 0
 const links=await tx.payload.find({collection:'booking-views',where:{and:[{booking:{in:bookings.docs.map(row=>row.id)}},{purpose:{equals:'booking-view'}},{revokedAt:{exists:false}}]},limit:5000,depth:0,req:tx.req,overrideAccess:false})
 for(const row of links.docs)await tx.payload.update({collection:'booking-views',id:row.id,data:{revokedAt:at},req:tx.req,overrideAccess:false})
 return links.docs.length
}
