'use client'
import {useState} from 'react'
import {ActionForm} from '@/admin/shared/ActionForm'
import type {EnquiryRow} from '@/domain/operations/read'
import {Button} from '@/components/ui/button'
const outcomes=[{value:'contacted',label:'Contacted the guest'},{value:'booked',label:'Booked separately'},{value:'not-pursued',label:'Not pursued'},{value:'duplicate',label:'Duplicate enquiry'}]
export function EnquiryActions({open}:{open:EnquiryRow[]}){
 const [message,setMessage]=useState('')
 return <>{message&&<p role="status" className="staff-message">{message}</p>}
  {open.length?<ul className="staff-queue">{open.map(row=><li key={row.id}><p><strong>{row.contact?.name??'Unknown sender'}</strong>{row.subject?' · '+row.subject:''}{row.eventDate?' · '+row.eventDate:''} · {row.state}</p>
   {row.contact&&<><p className="staff-message-body">{row.contact.message}</p><p className="staff-buttons"><Button asChild variant="outline"><a href={'mailto:'+row.contact.email}>Email {row.contact.name}</a></Button>{row.contact.phone&&<Button asChild variant="outline"><a href={'tel:'+row.contact.phone.replace(/[^+\d]/g,'')}>Call</a></Button>}</p></>}
   {row.state==='delivery-pending'?<p className="staff-empty">The notification is still being delivered. Close it after delivery.</p>:<ActionForm endpoint="/api/operations/enquiries" fixed={{enquiryId:row.id}} onSuccess={setMessage} tone="quiet" submitLabel="Close enquiry" successMessage="Enquiry closed" fields={[{name:'outcome',label:'Outcome',kind:'select',required:true,options:outcomes},{name:'note',label:'Follow-up note',kind:'textarea',required:true,maxLength:2000}]}/>}</li>)}</ul>:<p className="staff-empty">No open enquiries.</p>}</>
}
