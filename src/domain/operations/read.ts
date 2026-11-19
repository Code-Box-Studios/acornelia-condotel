import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking} from '@/payload-types'
import type {Money} from '@/domain/shared/types'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
import {dateToStorage,parsePropertyDate} from '@/domain/shared/dates'
import {requireOperations,type OperationsPolicy} from './policy'
import {StaffFacingError} from './policy'
export type StayActionKind='check-in'|'check-out'|'no-show'
export type StayState='expected'|'in-house'|'departed'|'no-show'|'unconfirmed'|'not-staying'
export type StaffBookingSummary={id:string;bookingCode:string|null;status:Booking['status'];stayState:StayState;source:Booking['source'];arrival:string;departure:string;guestName:string|null;roomLabel:string|null;total:Money|null;revision:number}
export type StaffBookingView=StaffBookingSummary&{
 contact:{name:string;email:string;phone:string|null}|null;stayingGuest:string|null;collected:Money[]
 payments:{id:string;environment:string;status:string;amount:Money;collectedAt:string|null;providerReference:string}[]
 refunds:{id:string;origin:string;method:string;state:string;reason:string;amount:Money;createdAt:string}[]
 issues:{id:string;reasonCode:string;state:string;createdAt:string;resolutionCode:string|null}[]
 notes:{id:string;text:string;staffName:string;recordedAt:string}[]
 stayEvents:{kind:string;propertyDate:string;occurredAt:string}[]
 allowedActions:StayActionKind[]
}
export type TodayView={propertyDate:string;range:{from:string;to:string;timezone:string};arrivals:StaffBookingSummary[];departures:StaffBookingSummary[];inHouse:StaffBookingSummary[];upcoming:StaffBookingSummary[];openIssues:{id:string;reasonCode:string;bookingCode:string|null;createdAt:string}[];uncertainRefunds:number;pendingOfflineReviews:number;openEnquiries:number}
export type CalendarView={from:string;days:string[];rooms:{id:string;label:string}[];entries:{roomId:string;kind:'booking'|'hold'|'block';from:string;to:string;bookingId:string|null;bookingCode:string|null;blockId:string|null;label:string|null}[]}
export type PaymentQueue={issues:{id:string;reasonCode:string;bookingId:string|null;bookingCode:string|null;observed:Money|null;createdAt:string}[];uncertain:{id:string;bookingId:string;bookingCode:string|null;method:string;amount:Money;createdAt:string;candidates:{id:string;providerOperationId:string|null;amount:Money}[]}[];offline:{id:string;bookingId:string;bookingCode:string|null;amount:Money;attestation:{evidenceId:string;method:string;receiptReference:string;paidAt:string;attestedBy:string}|null}[]}
export type EnquiryRow={id:string;reference:string;submittedAt:string;state:string;contact:{name:string;email:string;phone:string|null;message:string}|null;subject:string|null;eventDate:string|null;followUpOutcome:string|null;closedAt:string|null}
export type BookingSearch={text?:string;from?:string;to?:string}
const codePattern=/^ACN-[0-9A-F]{16}$/,dateOf=(value:string)=>value.slice(0,10)
const contactSchema=z.object({name:z.string(),email:z.string(),phone:z.string().nullish()}).passthrough()
const totalSchema=z.object({total:z.object({minor:z.string(),currency:z.string()})}).passthrough()
export function addDays(date:string,days:number){const value=new Date(parsePropertyDate(date)+'T00:00:00.000Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)}
export function localHour(timezone:string,now:string){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',hourCycle:'h23'}).format(new Date(now)))}
export function stayStateOf(booking:Pick<Booking,'status'>,kinds:Set<string>):StayState{
 if(kinds.has('checked-out'))return 'departed'
 if(kinds.has('checked-in'))return 'in-house'
 if(booking.status==='held')return 'unconfirmed'
 if(booking.status==='cancelled'||booking.status==='expired')return 'not-staying'
 return kinds.has('no-show')?'no-show':'expected'
}
/** Front-desk actions the current property date and recorded history permit. */
export function allowedStayActions(booking:Pick<Booking,'status'|'arrival'|'departure'>,kinds:Set<string>,today:string,hour:number,rule:OperationsPolicy):StayActionKind[]{
 const arrival=dateOf(booking.arrival),departure=dateOf(booking.departure),open=booking.status==='confirmed'&&today>=arrival&&today<departure,actions:StayActionKind[]=[]
 if(open&&!kinds.has('checked-in'))actions.push('check-in')
 if(booking.status==='confirmed'&&kinds.has('checked-in')&&!kinds.has('checked-out')&&today>=arrival)actions.push('check-out')
 if(open&&!kinds.has('checked-in')&&!kinds.has('no-show')&&(today>arrival||hour>=rule.noShowFromHour))actions.push('no-show')
 return actions
}
export function contactOf(booking:Booking){const parsed=contactSchema.safeParse(booking.contact);return parsed.success?{name:parsed.data.name,email:parsed.data.email,phone:parsed.data.phone??null}:null}
export function totalOf(booking:Booking):Money|null{const parsed=totalSchema.safeParse(booking.acceptedQuote);return parsed.success?parsed.data.total:null}
export async function stayKinds(tx:DbTx,ids:string[]){
 const map=new Map<string,Set<string>>()
 if(!ids.length)return map
 const rows=await tx.payload.find({collection:'stay-events',where:{booking:{in:ids}},limit:4*ids.length,depth:0,req:tx.req,overrideAccess:false})
 for(const row of rows.docs){const id=relationshipId(row.booking)!;if(!map.has(id))map.set(id,new Set());map.get(id)!.add(row.kind)}
 return map
}
export async function summaries(tx:DbTx,bookings:Booking[]):Promise<StaffBookingSummary[]>{
 const ids=bookings.map(row=>row.id),kinds=await stayKinds(tx,ids),labels=new Map<string,string>()
 if(ids.length){
  const allocations=await tx.payload.find({collection:'allocations',where:{and:[{booking:{in:ids}},{purpose:{in:['booking','hold']}},{released:{equals:false}}]},limit:2*ids.length+10,depth:0,req:tx.req,overrideAccess:false})
  const roomIds=[...new Set(allocations.docs.map(row=>relationshipId(row.room)!))],rooms=roomIds.length?await tx.payload.find({collection:'rooms',where:{id:{in:roomIds}},limit:roomIds.length,depth:0,req:tx.req,overrideAccess:false}):{docs:[]}
  const label=new Map(rooms.docs.map(row=>[row.id,row.label]))
  for(const row of allocations.docs)labels.set(relationshipId(row.booking)!,label.get(relationshipId(row.room)!)??'')
 }
 return bookings.map(booking=>({id:booking.id,bookingCode:booking.code??null,status:booking.status,stayState:stayStateOf(booking,kinds.get(booking.id)??new Set()),source:booking.source,arrival:dateOf(booking.arrival),departure:dateOf(booking.departure),guestName:contactOf(booking)?.name??null,roomLabel:labels.get(booking.id)||null,total:totalOf(booking),revision:booking.revision}))
}
async function staffNames(tx:DbTx,ids:string[]){
 if(!ids.length)return new Map<string,string>()
 // Internal projection of display names only; staff records stay protected from ordinary reads.
 const rows=await tx.payload.find({collection:'staff-users',where:{id:{in:ids}},limit:ids.length,depth:0,req:tx.req,overrideAccess:true})
 return new Map(rows.docs.map(row=>[row.id,row.name]))
}
export async function bookingView(tx:DbTx,ctx:CommandContext,booking:Booking,rule:OperationsPolicy,timezone:string):Promise<StaffBookingView>{
 const [summary]=await summaries(tx,[booking]),kinds=(await stayKinds(tx,[booking.id])).get(booking.id)??new Set<string>()
 const payments=await tx.payload.find({collection:'payment-transactions',where:{booking:{equals:booking.id}},sort:'collectedAt',limit:200,depth:0,req:tx.req,overrideAccess:false})
 const refunds=await tx.payload.find({collection:'refund-operations',where:{booking:{equals:booking.id}},sort:'-createdAt',limit:200,depth:0,req:tx.req,overrideAccess:false})
 const issues=await tx.payload.find({collection:'payment-issues',where:{booking:{equals:booking.id}},sort:'-createdAt',limit:200,depth:0,req:tx.req,overrideAccess:false})
 const notes=await tx.payload.find({collection:'staff-notes',where:{booking:{equals:booking.id}},sort:'recordedAt',limit:500,depth:0,req:tx.req,overrideAccess:false})
 const events=await tx.payload.find({collection:'stay-events',where:{booking:{equals:booking.id}},sort:'occurredAt',limit:10,depth:0,req:tx.req,overrideAccess:false})
 if(payments.hasNextPage||refunds.hasNextPage||issues.hasNextPage||notes.hasNextPage)throw new StaffFacingError('Booking history requires operator review')
 const names=await staffNames(tx,[...new Set(notes.docs.map(row=>relationshipId(row.staff)!))]),collected=new Map<string,bigint>()
 for(const row of payments.docs)if(row.status==='collected')collected.set(row.currency,(collected.get(row.currency)??0n)+BigInt(row.amountMinor))
 const now=ctx.clock.now(),today=ctx.clock.today(timezone)
 return {...summary,contact:contactOf(booking),stayingGuest:booking.stayingGuest??null,collected:[...collected].map(([currency,minor])=>({minor:minor.toString(),currency})),
  payments:payments.docs.map(row=>({id:row.id,environment:row.environment,status:row.status,amount:{minor:row.amountMinor,currency:row.currency},collectedAt:row.collectedAt??null,providerReference:row.environment==='offline'?'Staff-recorded receipt':row.providerPaymentId})),
  refunds:refunds.docs.map(row=>({id:row.id,origin:row.origin,method:row.method,state:row.state,reason:row.reason,amount:{minor:row.actualAmountMinor??row.amountMinor,currency:row.actualCurrency??row.currency},createdAt:row.createdAt})),
  issues:issues.docs.map(row=>({id:row.id,reasonCode:row.reasonCode,state:row.state??'open',createdAt:row.createdAt,resolutionCode:row.resolutionCode??null})),
  notes:notes.docs.map(row=>({id:row.id,text:row.text,staffName:names.get(relationshipId(row.staff)!)??'Staff member',recordedAt:row.recordedAt})),
  stayEvents:events.docs.map(row=>({kind:row.kind,propertyDate:row.propertyDate,occurredAt:row.occurredAt})),
  allowedActions:allowedStayActions(booking,kinds,today,localHour(timezone,now),rule)}
}
/** A booking code locates a reservation for signed-in staff; it never proves the holder is the guest. */
export async function lookupBooking(ctx:CommandContext,code:string):Promise<StaffBookingView|null>{
 const value=z.string().max(64).parse(code).trim().toUpperCase()
 return ctx.uow.run(ctx.actor,async tx=>{
  const {rule,timezone}=await requireOperations(tx,ctx,'view')
  if(!codePattern.test(value))return null
  const booking=(await tx.payload.find({collection:'bookings',where:{code:{equals:value}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(!booking)return null
  const view=await bookingView(tx,ctx,booking,rule,timezone)
  await appendAudit(tx,{action:'operations:booking-viewed',recordType:'bookings',recordId:booking.id,outcome:'success',safeChanges:{source:'code'}})
  return view
 })
}
export async function readBooking(ctx:CommandContext,id:string):Promise<StaffBookingView>{
 z.uuid().parse(id)
 return ctx.uow.run(ctx.actor,async tx=>{
  const {rule,timezone}=await requireOperations(tx,ctx,'view'),booking=await tx.payload.findByID({collection:'bookings',id,depth:0,req:tx.req,overrideAccess:false}),view=await bookingView(tx,ctx,booking,rule,timezone)
  await appendAudit(tx,{action:'operations:booking-viewed',recordType:'bookings',recordId:booking.id,outcome:'success',safeChanges:{source:'record'}})
  return view
 })
}
async function overlapping(tx:DbTx,from:string,to:string,statuses:Booking['status'][]){
 const rows=await tx.payload.find({collection:'bookings',where:{and:[{status:{in:statuses}},{arrival:{less_than_equal:dateToStorage(to)}},{departure:{greater_than_equal:dateToStorage(from)}}]},sort:['arrival','id'],limit:1000,depth:0,req:tx.req,overrideAccess:false})
 if(rows.hasNextPage)throw new StaffFacingError('Too many stays in this range; choose a shorter range')
 return rows.docs
}
export async function readToday(ctx:CommandContext,propertyDate:string):Promise<TodayView>{
 const date=parsePropertyDate(propertyDate)
 return ctx.uow.run(ctx.actor,async tx=>{
  const {rule,timezone}=await requireOperations(tx,ctx,'view'),to=addDays(date,rule.upcomingDays-1)
  const rows=await summaries(tx,await overlapping(tx,date,to,['confirmed','completed']))
  const issues=await tx.payload.find({collection:'payment-issues',where:{state:{equals:'open'}},sort:'-createdAt',limit:50,depth:0,req:tx.req,overrideAccess:false})
  const issueBookings=[...new Set(issues.docs.map(row=>relationshipId(row.booking)).filter((id):id is string=>!!id))],codes=issueBookings.length?new Map((await tx.payload.find({collection:'bookings',where:{id:{in:issueBookings}},limit:issueBookings.length,depth:0,req:tx.req,overrideAccess:false})).docs.map(row=>[row.id,row.code??null])):new Map<string,string|null>()
  const count=async(collection:'refund-operations'|'refund-evidence'|'enquiries',where:object)=>(await tx.payload.count({collection,where:where as never,req:tx.req,overrideAccess:false})).totalDocs
  return {propertyDate:date,range:{from:date,to,timezone},
   arrivals:rows.filter(row=>row.arrival===date),departures:rows.filter(row=>row.departure===date&&row.stayState!=='no-show'),
   inHouse:rows.filter(row=>row.stayState==='in-house'&&row.arrival<=date&&date<=row.departure),upcoming:rows.filter(row=>row.arrival>date&&row.arrival<=to&&row.status==='confirmed'),
   openIssues:issues.docs.map(row=>({id:row.id,reasonCode:row.reasonCode,bookingCode:codes.get(relationshipId(row.booking)??'')??null,createdAt:row.createdAt})),
   uncertainRefunds:await count('refund-operations',{state:{equals:'uncertain'}}),pendingOfflineReviews:await count('refund-evidence',{and:[{source:{equals:'staff-attested'}},{state:{equals:'pending'}}]}),openEnquiries:await count('enquiries',{closedAt:{exists:false}})}
 })
}
/** Guest text matches name, email, phone, staying guest or booking code within a bounded arrival range. */
export async function searchBookings(ctx:CommandContext,query:BookingSearch):Promise<StaffBookingSummary[]>{
 const value=z.object({text:z.string().trim().max(120).optional(),from:z.string().optional(),to:z.string().optional()}).strict().parse(query)
 return ctx.uow.run(ctx.actor,async tx=>{
  const {timezone}=await requireOperations(tx,ctx,'view'),today=ctx.clock.today(timezone),text=value.text?.toLowerCase()??''
  let rows:Booking[]
  if(codePattern.test(text.toUpperCase()))rows=(await tx.payload.find({collection:'bookings',where:{code:{equals:text.toUpperCase()}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs
  else{
   const from=parsePropertyDate(value.from??addDays(today,-30)),to=parsePropertyDate(value.to??addDays(today,365))
   if(to<from||(Date.parse(to)-Date.parse(from))/86400000>400)throw new StaffFacingError('Choose a search range of at most 400 days')
   const found=await tx.payload.find({collection:'bookings',where:{and:[{arrival:{greater_than_equal:dateToStorage(from)}},{arrival:{less_than_equal:dateToStorage(to)}}]},sort:['arrival','id'],limit:1000,depth:0,req:tx.req,overrideAccess:false})
   if(found.hasNextPage)throw new StaffFacingError('Too many bookings in this range; narrow the dates')
   rows=found.docs.filter(row=>{if(!text)return true;const contact=contactOf(row);return [contact?.name,contact?.email,contact?.phone,row.stayingGuest,row.code].some(field=>field?.toLowerCase().includes(text))})
  }
  await appendAudit(tx,{action:'operations:booking-searched',recordType:'bookings',outcome:'success',safeChanges:{count:rows.length}})
  return summaries(tx,rows.slice(0,200))
 })
}
export async function readCalendar(ctx:CommandContext,query:{from:string;days:number}):Promise<CalendarView>{
 const from=parsePropertyDate(query.from),days=z.number().int().min(1).max(31).parse(query.days),end=addDays(from,days)
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireOperations(tx,ctx,'view')
  const rooms=await tx.payload.find({collection:'rooms',sort:'label',limit:500,depth:0,req:tx.req,overrideAccess:false})
  const allocations=await tx.payload.find({collection:'allocations',where:{and:[{released:{equals:false}},{arrival:{less_than:dateToStorage(end)}},{departure:{greater_than:dateToStorage(from)}}]},limit:5000,depth:0,req:tx.req,overrideAccess:false})
  if(rooms.hasNextPage||allocations.hasNextPage)throw new StaffFacingError('Calendar range is too large')
  const bookingIds=[...new Set(allocations.docs.map(row=>relationshipId(row.booking)).filter((id):id is string=>!!id))],codes=bookingIds.length?new Map((await tx.payload.find({collection:'bookings',where:{id:{in:bookingIds}},limit:bookingIds.length,depth:0,req:tx.req,overrideAccess:false})).docs.map(row=>[row.id,row.code??null])):new Map<string,string|null>()
  const blockIds=allocations.docs.filter(row=>row.purpose==='block').map(row=>row.id),blocks=blockIds.length?new Map((await tx.payload.find({collection:'room-blocks',where:{allocation:{in:blockIds}},limit:blockIds.length,depth:0,req:tx.req,overrideAccess:false})).docs.map(row=>[relationshipId(row.allocation)!,{id:row.id,reason:row.reason}])):new Map<string,{id:string;reason:string}>()
  return {from,days:Array.from({length:days},(_,index)=>addDays(from,index)),rooms:rooms.docs.map(row=>({id:row.id,label:row.label})),
   entries:allocations.docs.map(row=>({roomId:relationshipId(row.room)!,kind:row.purpose==='block'?'block' as const:row.purpose==='booking'?'booking' as const:'hold' as const,from:dateOf(row.arrival),to:dateOf(row.departure),bookingId:relationshipId(row.booking)??null,bookingCode:codes.get(relationshipId(row.booking)??'')??null,blockId:blocks.get(row.id)?.id??null,label:row.purpose==='block'?blocks.get(row.id)?.reason??'Blocked':null}))}
 })
}
async function bookingCodes(tx:DbTx,ids:(string|null|undefined)[]){
 const unique=[...new Set(ids.filter((id):id is string=>!!id))]
 return unique.length?new Map((await tx.payload.find({collection:'bookings',where:{id:{in:unique}},limit:unique.length,depth:0,req:tx.req,overrideAccess:false})).docs.map(row=>[row.id,row.code??null])):new Map<string,string|null>()
}
/** Money exceptions and refund work needing a staff decision. Actions re-check their own policies. */
export async function readPaymentQueue(ctx:CommandContext):Promise<PaymentQueue>{
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireOperations(tx,ctx,'view')
  const issues=await tx.payload.find({collection:'payment-issues',where:{state:{equals:'open'}},sort:'-createdAt',limit:100,depth:0,req:tx.req,overrideAccess:false})
  const uncertain=await tx.payload.find({collection:'refund-operations',where:{and:[{origin:{equals:'app'}},{state:{equals:'uncertain'}}]},sort:'createdAt',limit:100,depth:0,req:tx.req,overrideAccess:false})
  const offline=await tx.payload.find({collection:'refund-operations',where:{and:[{method:{equals:'offline'}},{state:{equals:'authorized'}}]},sort:'createdAt',limit:100,depth:0,req:tx.req,overrideAccess:false})
  const codes=await bookingCodes(tx,[...issues.docs.map(row=>relationshipId(row.booking)),...uncertain.docs.map(row=>relationshipId(row.booking)),...offline.docs.map(row=>relationshipId(row.booking))])
  const payments=[...new Set(uncertain.docs.map(row=>relationshipId(row.payment)!))],imported=payments.length?(await tx.payload.find({collection:'refund-operations',where:{and:[{origin:{equals:'provider'}},{state:{equals:'completed'}},{payment:{in:payments}}]},limit:1000,depth:0,req:tx.req,overrideAccess:false})).docs:[]
  const settled=imported.length?new Set((await tx.payload.find({collection:'refund-operations',where:{settledByRefund:{in:imported.map(row=>row.id)}},limit:1000,depth:0,req:tx.req,overrideAccess:false})).docs.map(row=>relationshipId(row.settledByRefund)!)):new Set<string>()
  const attestations=offline.docs.length?(await tx.payload.find({collection:'refund-evidence',where:{and:[{operation:{in:offline.docs.map(row=>row.id)}},{source:{equals:'staff-attested'}},{state:{equals:'pending'}}]},limit:200,depth:0,req:tx.req,overrideAccess:false})).docs:[]
  const names=await staffNames(tx,[...new Set(attestations.map(row=>relationshipId(row.sourceStaff)!))]),proof=z.object({method:z.string(),receiptReference:z.string(),paidAt:z.string()}).passthrough()
  return {
   issues:issues.docs.map(row=>({id:row.id,reasonCode:row.reasonCode,bookingId:relationshipId(row.booking)??null,bookingCode:codes.get(relationshipId(row.booking)??'')??null,observed:row.observedAmountMinor&&row.observedCurrency?{minor:row.observedAmountMinor,currency:row.observedCurrency}:null,createdAt:row.createdAt})),
   uncertain:uncertain.docs.map(row=>({id:row.id,bookingId:relationshipId(row.booking)!,bookingCode:codes.get(relationshipId(row.booking)!)??null,method:row.method,amount:{minor:row.amountMinor,currency:row.currency},createdAt:row.createdAt,
    candidates:imported.filter(item=>relationshipId(item.payment)===relationshipId(row.payment)&&item.actualAmountMinor===row.amountMinor&&item.method===row.method&&!settled.has(item.id)).map(item=>({id:item.id,providerOperationId:item.providerOperationId??null,amount:{minor:item.actualAmountMinor!,currency:item.actualCurrency??item.currency}}))})),
   offline:offline.docs.map(row=>{const evidence=attestations.find(item=>relationshipId(item.operation)===row.id),parsed=evidence?proof.safeParse(evidence.proof):null
    return {id:row.id,bookingId:relationshipId(row.booking)!,bookingCode:codes.get(relationshipId(row.booking)!)??null,amount:{minor:row.amountMinor,currency:row.currency},attestation:evidence&&parsed?.success?{evidenceId:evidence.id,method:parsed.data.method,receiptReference:parsed.data.receiptReference,paidAt:parsed.data.paidAt,attestedBy:names.get(relationshipId(evidence.sourceStaff)!)??'Staff member'}:null}}),
  }
 })
}
const enquiryContact=z.object({name:z.string(),email:z.string(),phone:z.string().nullish(),message:z.string()}).passthrough(),enquiryPost=z.object({title:z.string().nullish(),eventDate:z.string().nullish()}).passthrough()
export async function readEnquiries(ctx:CommandContext):Promise<{open:EnquiryRow[];recent:EnquiryRow[]}>{
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireOperations(tx,ctx,'enquiries')
  const map=(row:import('@/payload-types').Enquiry):EnquiryRow=>{const contact=enquiryContact.safeParse(row.contact),post=enquiryPost.safeParse(row.postSnapshot??{});return {id:row.id,reference:row.reference,submittedAt:row.submittedAt,state:row.state,contact:contact.success?{name:contact.data.name,email:contact.data.email,phone:contact.data.phone??null,message:contact.data.message}:null,subject:post.success?post.data.title??null:null,eventDate:post.success?post.data.eventDate??null:null,followUpOutcome:row.followUpOutcome??null,closedAt:row.closedAt??null}}
  const open=await tx.payload.find({collection:'enquiries',where:{closedAt:{exists:false}},sort:'-submittedAt',limit:100,depth:0,req:tx.req,overrideAccess:false})
  const recent=await tx.payload.find({collection:'enquiries',where:{closedAt:{exists:true}},sort:'-closedAt',limit:20,depth:0,req:tx.req,overrideAccess:false})
  await appendAudit(tx,{action:'operations:enquiries-viewed',recordType:'enquiries',outcome:'success',safeChanges:{count:open.docs.length}})
  return {open:open.docs.map(map),recent:recent.docs.map(map)}
 })
}
