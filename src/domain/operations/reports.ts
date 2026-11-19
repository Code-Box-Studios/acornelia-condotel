import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking} from '@/payload-types'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
import {dateToStorage,parsePropertyDate,propertyToday} from '@/domain/shared/dates'
import {requireOperations,type OperationsPolicy} from './policy'
import {StaffFacingError} from './policy'
import {contactOf,stayKinds,stayStateOf,totalOf} from './read'
export type ReportQuery={from:string;to:string}
export type ReportRow={bookingCode:string|null;source:string;status:string;stayState:string;arrival:string;departure:string;guestName:string|null;currency:string|null;totalMinor:string|null;collectedMinor:string;refundedMinor:string}
export type ReportResult={range:{from:string;to:string;timezone:string};bookings:{status:string;count:number}[];payments:{currency:string;collectedMinor:string;count:number}[];refunds:{currency:string;state:string;amountMinor:string;count:number}[];openRefunds:{currency:string;state:string;amountMinor:string;count:number}[];rows:ReportRow[]}
const statusOrder=['held','confirmed','completed','cancelled','expired']
/** Neutralises spreadsheet formulas and applies RFC 4180 quoting. */
export function csvCell(value:string):string{
 const text=/^[=+\-@\t\r]/.test(value)?"'"+value:value
 return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text
}
export function formatMinor(minor:string){const value=BigInt(minor),sign=value<0n?'-':'',abs=value<0n?-value:value;return sign+(abs/100n).toString()+'.'+(abs%100n).toString().padStart(2,'0')}
function rangeOf(query:ReportQuery,rule:OperationsPolicy){
 const from=parsePropertyDate(query.from),to=parsePropertyDate(query.to),days=(Date.parse(to)-Date.parse(from))/86400000+1
 if(days<1)throw new StaffFacingError('The report must end on or after its start date')
 if(days>rule.reportMaxDays)throw new StaffFacingError('Choose a report range of at most '+rule.reportMaxDays+' days')
 return {from,to}
}
function add(map:Map<string,{minor:bigint;count:number}>,key:string,minor:string){const row=map.get(key)??{minor:0n,count:0};row.minor+=BigInt(minor);row.count++;map.set(key,row)}
/** Booking rows use arrival dates; collections and completed refunds use their property-local dates. Each currency stays separate. */
async function build(tx:DbTx,query:ReportQuery,rule:OperationsPolicy,timezone:string):Promise<ReportResult>{
 const {from,to}=rangeOf(query,rule),localDate=(value:string)=>propertyToday(timezone,new Date(value)),inRange=(value:string)=>{const date=localDate(value);return date>=from&&date<=to}
 const window={from:new Date(Date.parse(from+'T00:00:00.000Z')-86400000).toISOString(),to:new Date(Date.parse(to+'T00:00:00.000Z')+2*86400000).toISOString()}
 const found=await tx.payload.find({collection:'bookings',where:{and:[{arrival:{greater_than_equal:dateToStorage(from)}},{arrival:{less_than_equal:dateToStorage(to)}}]},sort:['arrival','id'],limit:5000,depth:0,req:tx.req,overrideAccess:false})
 const collections=await tx.payload.find({collection:'payment-transactions',where:{and:[{status:{equals:'collected'}},{collectedAt:{greater_than_equal:window.from}},{collectedAt:{less_than:window.to}}]},limit:10000,depth:0,req:tx.req,overrideAccess:false})
 const completed=await tx.payload.find({collection:'refund-operations',where:{and:[{state:{equals:'completed'}},{completedAt:{greater_than_equal:window.from}},{completedAt:{less_than:window.to}}]},limit:10000,depth:0,req:tx.req,overrideAccess:false})
 const open=await tx.payload.find({collection:'refund-operations',where:{state:{in:['authorized','dispatching','uncertain']}},limit:10000,depth:0,req:tx.req,overrideAccess:false})
 if(found.hasNextPage||collections.hasNextPage||completed.hasNextPage||open.hasNextPage)throw new StaffFacingError('This report is too large; choose a shorter range')
 const bookings:Booking[]=found.docs,ids=bookings.map(row=>row.id),kinds=await stayKinds(tx,ids)
 const bookingMoney=ids.length?await tx.payload.find({collection:'payment-transactions',where:{and:[{booking:{in:ids}},{status:{equals:'collected'}}]},limit:10000,depth:0,req:tx.req,overrideAccess:false}):{docs:[],hasNextPage:false}
 const bookingRefunds=ids.length?await tx.payload.find({collection:'refund-operations',where:{and:[{booking:{in:ids}},{state:{equals:'completed'}}]},limit:10000,depth:0,req:tx.req,overrideAccess:false}):{docs:[],hasNextPage:false}
 if(bookingMoney.hasNextPage||bookingRefunds.hasNextPage)throw new StaffFacingError('This report is too large; choose a shorter range')
 const statuses=new Map<string,number>(),payments=new Map<string,{minor:bigint;count:number}>(),refunds=new Map<string,{minor:bigint;count:number}>(),reserved=new Map<string,{minor:bigint;count:number}>()
 for(const row of bookings)statuses.set(row.status,(statuses.get(row.status)??0)+1)
 for(const row of collections.docs)if(row.collectedAt&&inRange(row.collectedAt))add(payments,row.currency,row.amountMinor)
 for(const row of completed.docs)if(row.completedAt&&inRange(row.completedAt))add(refunds,(row.actualCurrency??row.currency)+'\0completed',row.actualAmountMinor??row.amountMinor)
 for(const row of open.docs)add(reserved,row.currency+'\0'+row.state,row.amountMinor)
 const sum=(rows:{booking?:unknown;currency?:string|null;actualCurrency?:string|null;amountMinor:string;actualAmountMinor?:string|null}[],bookingId:string,currency:string|null)=>rows.filter(row=>relationshipId(row.booking as string)===bookingId&&(row.actualCurrency??row.currency)===currency).reduce((total,row)=>total+BigInt(row.actualAmountMinor??row.amountMinor),0n).toString()
 const split=(map:Map<string,{minor:bigint;count:number}>)=>[...map].sort(([a],[b])=>a.localeCompare(b)).map(([key,row])=>{const [currency,state]=key.split('\0');return {currency,state,amountMinor:row.minor.toString(),count:row.count}})
 return {range:{from,to,timezone},
  bookings:statusOrder.filter(status=>statuses.has(status)).map(status=>({status,count:statuses.get(status)!})),
  payments:[...payments].sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>({currency,collectedMinor:row.minor.toString(),count:row.count})),
  refunds:split(refunds),openRefunds:split(reserved),
  rows:bookings.map(row=>{const total=totalOf(row),currency=total?.currency??null;return {bookingCode:row.code??null,source:row.source,status:row.status,stayState:stayStateOf(row,kinds.get(row.id)??new Set()),arrival:row.arrival.slice(0,10),departure:row.departure.slice(0,10),guestName:contactOf(row)?.name??null,currency,totalMinor:total?.minor??null,collectedMinor:sum(bookingMoney.docs,row.id,currency),refundedMinor:sum(bookingRefunds.docs,row.id,currency)}})}
}
export async function runReport(ctx:CommandContext,query:ReportQuery):Promise<ReportResult>{
 return ctx.uow.run(ctx.actor,async tx=>{
  const {rule,timezone}=await requireOperations(tx,ctx,'reports'),result=await build(tx,query,rule,timezone)
  await appendAudit(tx,{action:'operations:report-read',recordType:'reports',outcome:'success',safeChanges:{rangeFrom:result.range.from,rangeTo:result.range.to}})
  return result
 })
}
export async function exportReportCsv(ctx:CommandContext,query:ReportQuery):Promise<string>{
 return ctx.uow.run(ctx.actor,async tx=>{
  await requireOperations(tx,ctx,'reports');const {rule,timezone}=await requireOperations(tx,ctx,'exports'),result=await build(tx,query,rule,timezone)
  const header=['Booking code','Source','Booking status','Stay state','Arrival','Departure','Guest','Currency','Total','Collected','Refunded']
  const lines=[header.join(','),...result.rows.map(row=>[row.bookingCode??'',row.source,row.status,row.stayState,row.arrival,row.departure,row.guestName??'',row.currency??'',row.totalMinor?formatMinor(row.totalMinor):'',formatMinor(row.collectedMinor),formatMinor(row.refundedMinor)].map(csvCell).join(','))]
  await appendAudit(tx,{action:'operations:report-exported',recordType:'reports',outcome:'success',safeChanges:{rangeFrom:result.range.from,rangeTo:result.range.to,count:result.rows.length}})
  return lines.join('\r\n')+'\r\n'
 })
}
