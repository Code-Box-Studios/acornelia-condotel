'use client'
import {useState} from 'react'
import Link from 'next/link'
import {ActionForm} from '@/admin/shared/ActionForm'
import type {PaymentQueue} from '@/domain/operations/read'
import {formatMoney} from '@/domain/shared/money'
const resolutions=[{value:'money-returned',label:'Money returned to the payer'},{value:'money-applied',label:'Money applied to the booking'},{value:'provider-confirmed',label:'Maya confirmed the outcome'},{value:'customer-contacted',label:'Guest contacted; no money moved'},{value:'no-action-required',label:'Reviewed; no action required'}]
/** One message area for the whole queue, so it survives rows leaving the list after refresh. */
export function PaymentQueueActions({queue}:{queue:PaymentQueue}){
 const [message,setMessage]=useState('')
 const booking=(id:string|null,code:string|null)=>id?<Link href={'/staff/bookings/'+id}>{code??'Booking'}</Link>:'No booking'
 return <>
  {message&&<p role="status" className="staff-message">{message}</p>}
  <section className="staff-panel" aria-labelledby="issues-heading"><h2 id="issues-heading">Open payment issues</h2>
   {queue.issues.length?<ul className="staff-queue">{queue.issues.map(row=><li key={row.id}><p><strong>{row.reasonCode}</strong> · {booking(row.bookingId,row.bookingCode)}{row.observed?' · '+formatMoney(row.observed):''}</p>
    <ActionForm endpoint="/api/operations/issues" fixed={{issueId:row.id}} onSuccess={setMessage} submitLabel="Resolve issue" successMessage="Issue resolved" fields={[{name:'resolutionCode',label:'Resolution',kind:'select',required:true,options:resolutions},{name:'evidenceReference',label:'Evidence reference',kind:'text',required:true,maxLength:240}]}/></li>)}</ul>:<p className="staff-empty">No open payment issues.</p>}
  </section>
  <section className="staff-panel" aria-labelledby="uncertain-heading"><h2 id="uncertain-heading">Uncertain refunds</h2><p>The amount stays reserved. Do not send another refund for the same money. Pause app refunds before acting in the Maya dashboard.</p>
   {queue.uncertain.length?<ul className="staff-queue">{queue.uncertain.map(row=><li key={row.id}><p><strong>{formatMoney(row.amount)}</strong> {row.method} · {booking(row.bookingId,row.bookingCode)}</p>
    {row.candidates.length?<ActionForm endpoint="/api/operations/refunds" envelope="resolve" fixed={{refundId:row.id}} onSuccess={setMessage} tone="quiet" submitLabel="Settle against Maya refund" successMessage="Refund settled once" fields={[{name:'providerRefundId',label:'Imported Maya refund',kind:'select',required:true,options:row.candidates.map(item=>({value:item.id,label:(item.providerOperationId??'Maya refund')+' · '+formatMoney(item.amount)}))},{name:'evidenceReference',label:'Dashboard review reference',kind:'text',required:true,maxLength:240}]}/>:<p className="staff-empty">No matching imported Maya refund yet. Reconciliation keeps checking.</p>}</li>)}</ul>:<p className="staff-empty">No uncertain refunds.</p>}
  </section>
  <section className="staff-panel" aria-labelledby="offline-heading"><h2 id="offline-heading">Cash and bank-transfer reimbursements</h2>
   {queue.offline.length?<ul className="staff-queue">{queue.offline.map(row=><li key={row.id}><p><strong>{formatMoney(row.amount)}</strong> · {booking(row.bookingId,row.bookingCode)}</p>
    {row.attestation?<><p>Recorded by {row.attestation.attestedBy}: {row.attestation.method} receipt {row.attestation.receiptReference}, paid {row.attestation.paidAt.slice(0,16).replace('T',' ')}.</p>
     <ActionForm endpoint="/api/operations/refunds" envelope="review" fixed={{refundId:row.id,evidenceId:row.attestation.evidenceId,decision:'confirm'}} onSuccess={setMessage} submitLabel="Confirm payout" successMessage="Reimbursement confirmed"/>
     <ActionForm endpoint="/api/operations/refunds" envelope="review" fixed={{refundId:row.id,evidenceId:row.attestation.evidenceId,decision:'reject'}} onSuccess={setMessage} tone="quiet" submitLabel="Reject record" successMessage="Record rejected; the amount stays reserved"/></>
    :<ActionForm endpoint="/api/operations/refunds" envelope="attest" fixed={{refundId:row.id}} onSuccess={setMessage} tone="quiet" submitLabel="Record payout" successMessage="Payout recorded for review" fields={[{name:'method',label:'Paid by',kind:'select',required:true,options:[{value:'cash',label:'Cash'},{value:'bank-transfer',label:'Bank transfer'}]},{name:'receiptReference',label:'Receipt reference',kind:'text',required:true,maxLength:120},{name:'evidenceReference',label:'Evidence reference',kind:'text',required:true,maxLength:240}]}/>}</li>)}</ul>:<p className="staff-empty">No reimbursements are waiting.</p>}
  </section>
 </>
}
