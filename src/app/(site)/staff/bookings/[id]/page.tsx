import {staffPageContext} from '@/features/staff/page-context'
import {readBooking,type StaffBookingView} from '@/domain/operations/read'
import {OperationsAccessError,operationsAllowed,operationsTimezone} from '@/domain/operations/policy'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {StayActions} from '@/admin/bookings/StayActions'
import {CancelBooking} from '@/admin/bookings/CancelBooking'
import {NoteForm,RefundRequestForm} from '@/admin/bookings/BookingForms'
import {ActionForm} from '@/admin/shared/ActionForm'
import {money,moneyList,stayLabels,statusLabels,when,statusTones,stayTones} from '@/admin/shared/labels'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table'
export const metadata={title:'Booking — staff',robots:{index:false,follow:false}}
export default async function StaffBooking({params}:{params:Promise<{id:string}>}){
 const ctx=await staffPageContext(),{id}=await params,timezone=operationsTimezone(ctx)
 let view:StaffBookingView
 try{view=await readBooking(ctx,id)}catch(error){return <StaffShell title="Booking" description="Reservation details." current="/staff/bookings"><StaffUnavailable denied={error instanceof OperationsAccessError}/></StaffShell>}
 const collected=view.payments.filter(row=>row.status==='collected')
 return <StaffShell title={view.bookingCode??'Booking without code'} description={`${view.guestName??'Guest'} · ${view.arrival} to ${view.departure}`} current="/staff/bookings">
  <section className="staff-panel" aria-labelledby="summary-heading"><h2 id="summary-heading">Summary</h2><dl className="staff-facts">
   <div><dt>Booking status</dt><dd><Badge variant={statusTones[view.status]??'outline'}>{statusLabels[view.status]??view.status}</Badge></dd></div><div><dt>Stay</dt><dd className="staff-stay-state"><Badge variant={stayTones[view.stayState]??'outline'}>{stayLabels[view.stayState]??view.stayState}</Badge></dd></div>
   <div><dt>Source</dt><dd>{view.source}</dd></div><div><dt>Room</dt><dd>{view.roomLabel??'—'}</dd></div>
   <div><dt>Accepted total</dt><dd>{money(view.total)}</dd></div><div><dt>Collected</dt><dd>{moneyList(view.collected)}</dd></div><div><dt>Revision</dt><dd>{view.revision}</dd></div>
  </dl></section>
  <section className="staff-panel" aria-labelledby="contact-heading"><h2 id="contact-heading">Guest contact</h2>{view.contact?<><dl className="staff-facts"><div><dt>Name</dt><dd>{view.contact.name}</dd></div><div><dt>Email</dt><dd>{view.contact.email}</dd></div><div><dt>Phone</dt><dd>{view.contact.phone??'—'}</dd></div>{view.stayingGuest&&<div><dt>Staying guest</dt><dd>{view.stayingGuest}</dd></div>}</dl>
   <p className="staff-buttons"><Button asChild variant="outline"><a href={'mailto:'+view.contact.email}>Email guest</a></Button>{view.contact.phone&&<Button asChild variant="outline"><a href={'tel:'+view.contact.phone.replace(/[^+\d]/g,'')}>Call guest</a></Button>}</p></>:<p>No contact details are recorded.</p>}</section>
  {operationsAllowed(ctx,'stay')&&<StayActions bookingId={view.id} revision={view.revision} actions={view.allowedActions}/>}
  <CancelBooking bookingId={view.id} revision={view.revision} allowed={view.status==='confirmed'}/>
  <section className="staff-panel" aria-labelledby="payments-heading"><h2 id="payments-heading">Payments</h2>{view.payments.length?<div className="staff-table" role="region" aria-label="Payments" tabIndex={0}><Table><TableHeader><TableRow><TableHead scope="col">Reference</TableHead><TableHead scope="col">Source</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Amount</TableHead><TableHead scope="col">Collected</TableHead></TableRow></TableHeader><TableBody>{view.payments.map(row=><TableRow key={row.id}><TableHead scope="row">{row.providerReference}</TableHead><TableCell>{row.environment==='offline'?'Cash or bank transfer':'Maya '+row.environment}</TableCell><TableCell>{row.status}</TableCell><TableCell>{money(row.amount)}</TableCell><TableCell>{when(row.collectedAt,timezone)}</TableCell></TableRow>)}</TableBody></Table></div>:<p className="staff-empty">No payments are recorded.</p>}
   {collected.filter(row=>row.environment!=='offline').map(row=><div key={row.id} className="staff-check"><p>Maya refunds last checked: {when(row.refundsCheckedAt,timezone)}. Check again before any repayment and after any Maya dashboard action.</p><ActionForm endpoint="/api/operations/refunds" envelope="check" fixed={{paymentId:row.id}} tone="quiet" submitLabel="Check Maya for refunds" successMessage="Maya checked; dashboard refunds were imported"/></div>)}</section>
  <section className="staff-panel" aria-labelledby="refunds-heading"><h2 id="refunds-heading">Refunds</h2>{view.refunds.length?<div className="staff-table" role="region" aria-label="Refunds" tabIndex={0}><Table><TableHeader><TableRow><TableHead scope="col">Requested</TableHead><TableHead scope="col">Method</TableHead><TableHead scope="col">State</TableHead><TableHead scope="col">Reason</TableHead><TableHead scope="col">Amount</TableHead></TableRow></TableHeader><TableBody>{view.refunds.map(row=><TableRow key={row.id}><TableHead scope="row">{when(row.createdAt,timezone)}</TableHead><TableCell>{row.method}{row.origin==='provider'?' (Maya dashboard)':''}</TableCell><TableCell>{row.state}{row.state==='authorized'&&row.origin==='app'&&<ActionForm endpoint="/api/operations/refunds" envelope="withdraw" fixed={{refundId:row.id,reason:'entered-in-error'}} tone="quiet" submitLabel="Withdraw" successMessage="Request withdrawn"/>}</TableCell><TableCell>{row.reason}</TableCell><TableCell>{money(row.amount)}</TableCell></TableRow>)}</TableBody></Table></div>:<p className="staff-empty">No refunds are recorded.</p>}
   {collected.length>0&&<details className="staff-details"><summary>Request a refund</summary><RefundRequestForm revision={view.revision} reductions={view.reductions} paymentIds={collected.map(row=>({id:row.id,label:row.providerReference+' · '+money(row.amount)}))}/></details>}</section>
  {view.issues.length>0&&<section className="staff-panel" aria-labelledby="issues-heading"><h2 id="issues-heading">Payment issues</h2><ul>{view.issues.map(row=><li key={row.id}>{row.reasonCode} · {row.state}{row.resolutionCode?' · '+row.resolutionCode:''} · {when(row.createdAt,timezone)}</li>)}</ul><p><a href="/staff/payments">Open the payments queue</a></p></section>}
  <section className="staff-panel" aria-labelledby="notes-heading"><h2 id="notes-heading">Internal notes</h2>{view.notes.length?<ul className="staff-notes">{view.notes.map(row=><li key={row.id}><p>{row.text}</p><small>{row.staffName} · {when(row.recordedAt,timezone)}</small></li>)}</ul>:<p className="staff-empty">No notes yet.</p>}{operationsAllowed(ctx,'notes')&&<NoteForm bookingId={view.id}/>}</section>
  {view.stayEvents.length>0&&<section className="staff-panel" aria-labelledby="history-heading"><h2 id="history-heading">Stay history</h2><ul>{view.stayEvents.map(row=><li key={row.kind}>{row.kind} · property date {row.propertyDate} · {when(row.occurredAt,timezone)}</li>)}</ul></section>}
 </StaffShell>
}
