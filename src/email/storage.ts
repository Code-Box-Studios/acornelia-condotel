import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking,EmailMessage} from '@/payload-types'
import type {AcceptedQuote} from '@/domain/quotes/types'
import {encryptPrivateState,decryptPrivateState} from '@/domain/security/private-state'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import type {BookingMailSnapshot} from './types'
export const bookingSnapshotSchema=z.object({code:z.string().min(1).max(80),recipient:z.email().max(254),name:z.string().max(160),room:z.string().max(240),arrival:z.string().max(10),departure:z.string().max(10),adults:z.number().int().nonnegative(),children:z.number().int().nonnegative(),total:z.object({minor:z.string().regex(/^(0|[1-9]\d*)$/),currency:z.string().regex(/^[A-Z]{3}$/)}).strict(),timezone:z.string().max(100)}).strict()
export async function createEmail(tx:DbTx,input:{semanticKey:string;category:EmailMessage['category'];snapshot:unknown;booking?:string;revision?:number;authDelivery?:string;enquiry?:string;issue?:string;expiresAt?:string}):Promise<EmailMessage>{
  const previous=(await tx.payload.find({collection:'email-messages',where:{semanticKey:{equals:input.semanticKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(previous)return previous
  const {snapshot,...data}=input
  const row=await tx.payload.create({collection:'email-messages',data:{...data,encryptedSnapshot:encryptPrivateState(snapshot,'mail-snapshot:'+data.semanticKey),state:'pending'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'email:queued',recordType:'email-messages',recordId:row.id,outcome:'success'})
  return row
}
export function readMailSnapshot(row:EmailMessage):unknown{return decryptPrivateState(row.encryptedSnapshot,'mail-snapshot:'+row.semanticKey)}
/** Freeze recipient and accepted content with confirmation, even while sending is unconfigured. */
export async function queueBookingConfirmation(tx:DbTx,ctx:CommandContext,booking:Booking,quote:AcceptedQuote):Promise<void>{
  const contact=z.object({name:z.string(),email:z.email()}).parse(booking.contact)
  const snapshot:BookingMailSnapshot=bookingSnapshotSchema.parse({code:booking.code,recipient:contact.email,name:contact.name,room:quote.roomType.name,arrival:quote.stay.arrival,departure:quote.stay.departure,adults:quote.stay.occupancy.adults,children:quote.stay.occupancy.children,total:quote.total,timezone:(quote.policySnapshot.sections.stay as {timezone:string}).timezone})
  const key='booking-confirmation:'+booking.id+':'+booking.revision
  await createEmail(tx,{semanticKey:key,category:'booking',snapshot,booking:booking.id,revision:booking.revision})
  await enqueue(tx,{semanticKey:key,kind:'email',payload:{category:'booking',bookingId:booking.id,revision:booking.revision},availableAt:ctx.clock.now()})
}
