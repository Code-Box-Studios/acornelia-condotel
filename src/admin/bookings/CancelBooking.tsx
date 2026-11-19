'use client'
import {useState} from 'react'
import {ActionForm} from '@/admin/shared/ActionForm'
/** Stays mounted after the booking changes so its result message survives the refresh. */
export function CancelBooking({bookingId,revision,allowed}:{bookingId:string;revision:number;allowed:boolean}){
 const [message,setMessage]=useState('')
 return <>{message&&<p role="status" className="staff-message">{message}</p>}
  {allowed&&<details className="staff-details"><summary>Cancel this booking</summary><p>Record the guest&apos;s agreement first. Cancelling releases the room; any refund is requested separately.</p>
   <ActionForm endpoint="/api/operations/cancel" fixed={{bookingId,expectedRevision:revision}} onSuccess={setMessage} tone="quiet" submitLabel="Cancel booking" successMessage="Booking cancelled" fields={[{name:'agreementReference',label:'Guest agreement reference',kind:'text',required:true,maxLength:240},{name:'reason',label:'Cancellation reason',kind:'textarea',required:true,maxLength:500}]}/></details>}</>
}
