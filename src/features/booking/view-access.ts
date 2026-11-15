import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import {commandActor} from '@/payload/access/internal'
import {opaqueSecret,privateDigest,matchesPrivateDigest} from '@/domain/security/private-state'
import {appendAudit} from '@/domain/audit/append'
import {bookingSummaries,relationshipId} from '@/features/customer/bookings'
import type {BookingSummary} from '@/features/customer/types'
export type BookingViewRef={id:string;bookingId:string;token:string}
const viewSchema=z.object({id:z.uuid(),bookingId:z.uuid(),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict()
/** Called inside the transaction that creates a booking or an approved replacement capability. */
export async function createBookingView(tx:DbTx,bookingId:string,expiresAt:string):Promise<BookingViewRef>{
  if(!commandActor(tx.req)||!tx.req.transactionID)throw new Error('Booking views require a trusted transaction')
  z.uuid().parse(bookingId);z.iso.datetime().parse(expiresAt)
  const token=opaqueSecret(),row=await tx.payload.create({collection:'booking-views',data:{booking:bookingId,tokenHash:privateDigest('booking-view\0'+token),expiresAt},req:tx.req,overrideAccess:false})
  return {id:row.id,bookingId,token}
}
export async function verifyBookingView(ctx:CommandContext,input:BookingViewRef):Promise<BookingSummary|null>{
  const parsed=viewSchema.safeParse(input)
  if(!parsed.success)return null
  return ctx.uow.run(ctx.actor,async tx=>{
    const view=(await tx.payload.find({collection:'booking-views',where:{id:{equals:parsed.data.id}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(!view||view.revokedAt||Date.parse(view.expiresAt)<=Date.parse(ctx.clock.now())||relationshipId(view.booking)!==parsed.data.bookingId||!matchesPrivateDigest('booking-view\0'+parsed.data.token,view.tokenHash))return null
    const row=await tx.payload.findByID({collection:'bookings',id:parsed.data.bookingId,depth:0,req:tx.req,overrideAccess:false})
    const result=(await bookingSummaries(tx,[row]))[0]
    // Guest capability holders never receive the account owner's internal identity.
    return {...result,booker:{customerId:null}}
  })
}
export async function revokeBookingView(ctx:CommandContext,id:string):Promise<void>{
  if(ctx.actor.kind!=='staff'||ctx.actor.role!=='developer')throw new Error('Authorized recovery required')
  z.uuid().parse(id)
  await ctx.uow.run(ctx.actor,async tx=>{
    await tx.payload.update({collection:'booking-views',id,data:{revokedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'booking:view-revoked',recordType:'booking-views',recordId:id,outcome:'success'})
  })
}
