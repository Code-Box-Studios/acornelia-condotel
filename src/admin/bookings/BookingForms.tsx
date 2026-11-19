'use client'
import {ActionForm} from '@/admin/shared/ActionForm'
export function NoteForm({bookingId}:{bookingId:string}){
 return <ActionForm endpoint="/api/operations/notes" idempotent fixed={{bookingId}} fields={[{name:'text',label:'Internal note',kind:'textarea',required:true,maxLength:2000,hint:'Visible to staff only. Do not record card numbers, passwords or private links.'}]} submitLabel="Save note" successMessage="Note saved"/>
}
/** Requests a repayment from one actual collection. Capacity, method, timing and roles are enforced by the refund policy. */
export function RefundRequestForm({paymentIds,revision}:{paymentIds:{id:string;label:string}[];revision:number}){
 return <ActionForm endpoint="/api/operations/refunds" envelope="authorize" idempotent tone="quiet" fixed={{expectedRevision:revision}} submitLabel="Request refund" successMessage="Refund requested"
  fields={[{name:'paymentId',label:'Collection to repay',kind:'select',required:true,options:paymentIds.map(row=>({value:row.id,label:row.label})),defaultValue:paymentIds.length===1?paymentIds[0].id:undefined},
   {name:'amount',label:'Refund amount (PHP)',kind:'money',required:true},
   {name:'method',label:'Method',kind:'select',required:true,options:[{value:'refund',label:'Maya refund'},{value:'void',label:'Maya void (same day, full amount)'},{value:'offline',label:'Cash or bank transfer (needs a second staff review)'}]},
   {name:'reason',label:'Reason',kind:'select',required:true,options:[{value:'guest-cancellation',label:'Guest cancellation'},{value:'duplicate-payment',label:'Duplicate payment'},{value:'late-payment',label:'Late payment'},{value:'manual-review',label:'Reviewed exception'}]},
   {name:'evidenceReference',label:'Approval reference',kind:'text',required:true,maxLength:240,hint:'Where the approval is recorded, e.g. a signed form number. No card or bank details.'}]}/>
}
