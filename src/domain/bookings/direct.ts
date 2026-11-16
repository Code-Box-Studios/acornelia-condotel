import type {CommandContext} from '@/domain/db/types'
import type {Booking} from '@/payload-types'
import type {DirectBookingInput} from './types'
import {z} from 'zod'
import {randomBytes} from 'node:crypto'
import {checkoutInputSchema} from './validation'
import {assertDirectStaff,requireDirectPolicy} from './direct-policy'
import {offlineReceiptSchema,validateOfflineReceipt} from '@/domain/payments/offline-validation'
import {findOfflineReceipt,recordOfflineCollectionTx} from '@/domain/payments/offline'
import {acceptedQuote,quoteIdentity} from '@/domain/quotes/validation'
import {freePhysicalRooms} from '@/domain/inventory/availability'
import {InventoryInputError} from '@/domain/inventory/policy'
import {allocate,InventoryConflict} from '@/domain/inventory/allocate'
import {dateToStorage} from '@/domain/shared/dates'
import {privateDigest} from '@/domain/security/private-state'
import {relationshipId} from '@/features/customer/bookings'
import {queueBookingConfirmation} from '@/email/storage'
import {appendAudit} from '@/domain/audit/append'
export const directInputSchema=z.object({commandKey:z.uuid(),quoteId:z.uuid(),version:z.number().int().positive(),source:z.enum(['phone','walk-in']),contact:checkoutInputSchema.shape.contact,stayingGuest:checkoutInputSchema.shape.stayingGuest,agreementReference:z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/),collection:offlineReceiptSchema.nullable()}).strict()
export async function createDirectBooking(ctx:CommandContext,input:DirectBookingInput):Promise<Booking>{
  assertDirectStaff(ctx)
  const value=directInputSchema.parse(input),fingerprint=privateDigest('direct-command\0'+(ctx.actor.kind==='staff'?ctx.actor.id:'')+'\0'+JSON.stringify(value))
  for(let conflict=0;;conflict++)try{return await ctx.uow.run(ctx.actor,async tx=>{
    assertDirectStaff(ctx)
    const previous=(await tx.payload.find({collection:'bookings',where:{checkoutKey:{equals:value.commandKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(previous){if(!['phone','walk-in'].includes(previous.source)||previous.checkoutFingerprint!==fingerprint)throw new Error('Direct command conflicts with its original receipt');return previous}
    const closed=await tx.payload.count({collection:'direct-command-closures',where:{commandKey:{equals:value.commandKey}},req:tx.req,overrideAccess:false})
    if(closed.totalDocs)throw new Error('This unfinished direct entry has been closed')
    const policy=await requireDirectPolicy(tx,ctx,true),quoteRow=await tx.payload.findByID({collection:'quotes',id:value.quoteId,depth:0,req:tx.req,overrideAccess:false})
    await quoteIdentity(tx,ctx,quoteRow)
    const quote=acceptedQuote(quoteRow),acceptedBy=z.object({kind:z.literal('staff'),id:z.uuid()}).passthrough().parse(quoteRow.acceptedBy),now=ctx.clock.now()
    if(quoteRow.scope!=='staff-direct'||quoteRow.directCommandKey!==value.commandKey||relationshipId(quoteRow.issuerStaff)!==(ctx.actor.kind==='staff'?ctx.actor.id:null)||acceptedBy.id!==relationshipId(quoteRow.issuerStaff)||quote.version!==value.version||quoteRow.consumedByBooking||Date.parse(quote.expiresAt)<=Date.parse(now)||quote.policyVersionId!==ctx.policy.id||quote.policyRevision!==ctx.policy.revision||quote.offerVersionId||!quote.terms)throw new Error('Review and accept a fresh direct-booking quote')
    if(quote.total.minor!=='0'&&!value.collection)throw new Error('Unpaid direct bookings are unavailable')
    if(quote.total.minor==='0'&&value.collection)throw new Error('An approved zero total requires no collection')
    if(value.collection){validateOfflineReceipt(ctx,value.collection,policy);if(await findOfflineReceipt(tx,value.collection))throw new Error('Receipt is already recorded; review its original booking')}
    const matching=!value.collection||value.collection.amount.minor===quote.total.minor&&value.collection.amount.currency===quote.total.currency,stayingGuest=value.stayingGuest??value.contact.name,termsMatch=quote.terms.thirdPartyBookings||stayingGuest.toLowerCase()===value.contact.name.toLowerCase()
    let available=false
    if(matching&&termsMatch)try{available=(await freePhysicalRooms(tx,quote.stay)).rooms.length>0}catch(error){if(!(error instanceof InventoryInputError))throw error}
    const confirmed=available
    const booking=await tx.payload.create({collection:'bookings',data:{checkoutKey:value.commandKey,checkoutFingerprint:fingerprint,checkoutBrowserHash:privateDigest('staff-direct-browser\0'+(ctx.actor.kind==='staff'?ctx.actor.id:'')+'\0'+value.commandKey),checkoutQuote:quote.id,preparedAt:now,source:value.source,status:confirmed?'confirmed':'expired',revision:1,code:confirmed?'ACN-'+randomBytes(8).toString('hex').toUpperCase():undefined,arrival:dateToStorage(quote.stay.arrival),departure:dateToStorage(quote.stay.departure),acceptedQuote:quote,contact:value.contact,stayingGuest:value.stayingGuest??value.contact.name,directContext:{purpose:'staff-direct',creatorStaffId:ctx.actor.kind==='staff'?ctx.actor.id:null,agreementReference:value.agreementReference,quoteId:quote.id,quoteVersion:quote.version}},req:tx.req,overrideAccess:false})
    await tx.payload.update({collection:'quotes',id:quote.id,data:{consumedByBooking:booking.id},req:tx.req,overrideAccess:false})
    if(confirmed)await allocate(tx,{purpose:'booking',bookingId:booking.id,stay:quote.stay,policy:quote.policySnapshot,now})
    if(value.collection)await recordOfflineCollectionTx(tx,ctx,{...value.collection,bookingId:booking.id,expectedRevision:1},policy,{apply:confirmed,reason:!matching?'offline-amount-mismatch':!termsMatch?'offline-stay-terms-mismatch':'offline-paid-room-unavailable'})
    if(confirmed)await queueBookingConfirmation(tx,ctx,booking,quote)
    await appendAudit(tx,{action:'booking:direct-created',recordType:'bookings',recordId:booking.id,outcome:confirmed?'success':'unknown',safeChanges:{status:booking.status,amountMinor:quote.total.minor,currency:quote.total.currency,revision:1}})
    return booking
  })}catch(error){const row=error as {name?:string;data?:{errors?:{path?:string}[]}};if(conflict<3&&(error instanceof InventoryConflict||row.name==='ValidationError'&&row.data?.errors?.some(value=>['checkoutKey','providerPaymentId'].includes(value.path??''))))continue;throw error}
}
