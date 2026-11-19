import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import type {Enquiry,PaymentIssue,StaffNote,StayEvent} from '@/payload-types'
import {privateDigest} from '@/domain/security/private-state'
import {appendAudit} from '@/domain/audit/append'
import {allowedStayActions,localHour,stayKinds,type StayActionKind} from './read'
import {operationsStaff,requireOperations} from './policy'
import {StaffFacingError} from './policy'
const eventKind:Record<StayActionKind,StayEvent['kind']>={'check-in':'checked-in','check-out':'checked-out','no-show':'no-show'}
const stayInput=z.object({commandKey:z.uuid(),bookingId:z.uuid(),expectedRevision:z.number().int().positive(),action:z.enum(['check-in','check-out','no-show'])}).strict()
const noteText=z.string().trim().min(1).max(2000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+$/)
const reference=z.string().trim().min(1).max(240).regex(/^[^\u0000-\u001f\u007f]+$/)
export const resolutionCodes=['money-returned','money-applied','no-action-required','customer-contacted','provider-confirmed'] as const
export const enquiryOutcomes=['contacted','booked','not-pursued','duplicate'] as const
function staffId(ctx:CommandContext){return ctx.actor.kind==='staff'?ctx.actor.id:''}
/** Check-in, check-out and no-show use the booking's current revision and the property-local date. */
export async function recordStayAction(ctx:CommandContext,input:z.input<typeof stayInput>):Promise<StayEvent>{
 operationsStaff(ctx);const value=stayInput.parse(input),fingerprint=privateDigest('stay-action\0'+JSON.stringify({staff:staffId(ctx),...value}))
 return ctx.uow.run(ctx.actor,async tx=>{
  const {rule,timezone}=await requireOperations(tx,ctx,'stay')
  const previous=(await tx.payload.find({collection:'stay-events',where:{commandKey:{equals:value.commandKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(previous){if(previous.fingerprint!==fingerprint)throw new StaffFacingError('Stay action conflicts with its original request');return previous}
  const booking=await tx.payload.findByID({collection:'bookings',id:value.bookingId,depth:0,req:tx.req,overrideAccess:false})
  if(booking.revision!==value.expectedRevision)throw new StaffFacingError('The booking changed; reload it before recording this action')
  const kinds=(await stayKinds(tx,[booking.id])).get(booking.id)??new Set<string>(),now=ctx.clock.now(),today=ctx.clock.today(timezone)
  if(!allowedStayActions(booking,kinds,today,localHour(timezone,now),rule).includes(value.action))throw new StaffFacingError('This stay action is not available for the booking today')
  const event=await tx.payload.create({collection:'stay-events',data:{commandKey:value.commandKey,fingerprint,booking:booking.id,kind:eventKind[value.action],propertyDate:today,bookingRevision:booking.revision,staff:staffId(ctx),occurredAt:now},req:tx.req,overrideAccess:false})
  if(value.action==='check-out')await tx.payload.update({collection:'bookings',id:booking.id,data:{status:'completed'},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'stay:'+eventKind[value.action],recordType:'bookings',recordId:booking.id,outcome:'success',safeChanges:{state:eventKind[value.action],propertyDate:today,revision:booking.revision}})
  return event
 })
}
/** Internal notes stay out of customer views and out of the action log text. */
export async function addStaffNote(ctx:CommandContext,input:{commandKey:string;bookingId?:string;enquiryId?:string;text:string}):Promise<StaffNote>{
 operationsStaff(ctx)
 const value=z.object({commandKey:z.uuid(),bookingId:z.uuid().optional(),enquiryId:z.uuid().optional(),text:noteText}).strict().refine(row=>!!row.bookingId!==!!row.enquiryId,'A note needs exactly one booking or enquiry').parse(input)
 const fingerprint=privateDigest('staff-note\0'+JSON.stringify({staff:staffId(ctx),...value}))
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireOperations(tx,ctx,'notes')
  const previous=(await tx.payload.find({collection:'staff-notes',where:{commandKey:{equals:value.commandKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(previous){if(previous.fingerprint!==fingerprint)throw new StaffFacingError('Note conflicts with its original request');return previous}
  if(value.bookingId)await tx.payload.findByID({collection:'bookings',id:value.bookingId,depth:0,req:tx.req,overrideAccess:false})
  else await tx.payload.findByID({collection:'enquiries',id:value.enquiryId!,depth:0,req:tx.req,overrideAccess:false})
  const note=await tx.payload.create({collection:'staff-notes',data:{commandKey:value.commandKey,fingerprint,booking:value.bookingId,enquiry:value.enquiryId,staff:staffId(ctx),text:value.text,recordedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'operations:note-added',recordType:value.bookingId?'bookings':'enquiries',recordId:value.bookingId??value.enquiryId,outcome:'success',safeChanges:{count:value.text.length}})
  return note
 })
}
/** Records a staff decision on an open money exception. It never moves money by itself. */
export async function resolvePaymentIssue(ctx:CommandContext,input:{issueId:string;resolutionCode:string;evidenceReference:string}):Promise<PaymentIssue>{
 operationsStaff(ctx);const value=z.object({issueId:z.uuid(),resolutionCode:z.enum(resolutionCodes),evidenceReference:reference}).strict().parse(input)
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireOperations(tx,ctx,'issues')
  const issue=await tx.payload.findByID({collection:'payment-issues',id:value.issueId,depth:0,req:tx.req,overrideAccess:false})
  if(issue.state==='resolved')throw new StaffFacingError('This issue is already resolved')
  const resolved=await tx.payload.update({collection:'payment-issues',id:issue.id,data:{state:'resolved',resolvedAt:ctx.clock.now(),resolutionCode:value.resolutionCode,resolutionReference:value.evidenceReference,resolvedBy:staffId(ctx)},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'payment:issue-resolved',recordType:'payment-issues',recordId:issue.id,outcome:'success',safeChanges:{reasonCode:issue.reasonCode,resolutionCode:value.resolutionCode}})
  return resolved
 })
}
/** Closes an enquiry follow-up with an outcome and internal note. It never reserves a room. */
export async function closeEnquiry(ctx:CommandContext,input:{enquiryId:string;outcome:string;note:string}):Promise<Enquiry>{
 operationsStaff(ctx);const value=z.object({enquiryId:z.uuid(),outcome:z.enum(enquiryOutcomes),note:noteText}).strict().parse(input)
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireOperations(tx,ctx,'enquiries')
  const enquiry=await tx.payload.findByID({collection:'enquiries',id:value.enquiryId,depth:0,req:tx.req,overrideAccess:false}),now=ctx.clock.now()
  if(enquiry.closedAt||enquiry.state==='closed')throw new StaffFacingError('This enquiry is already closed')
  if(enquiry.state==='delivery-pending')throw new StaffFacingError('Wait until the enquiry notification has been delivered or failed')
  const closed=await tx.payload.update({collection:'enquiries',id:enquiry.id,data:{state:'closed',followUpOutcome:value.outcome,closedAt:now,closedBy:staffId(ctx)},req:tx.req,overrideAccess:false})
  const key=privateDigest('enquiry-closure-note\0'+enquiry.id)
  await tx.payload.create({collection:'staff-notes',data:{commandKey:randomUUID(),fingerprint:key,enquiry:enquiry.id,staff:staffId(ctx),text:value.note,recordedAt:now},req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'enquiry:closed',recordType:'enquiries',recordId:enquiry.id,outcome:'success',safeChanges:{state:'closed',reasonCode:value.outcome}})
  return closed
 })
}
