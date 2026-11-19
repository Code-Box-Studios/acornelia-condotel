import {staffPageContext} from '@/features/staff/page-context'
import {readBooking,type StaffBookingView} from '@/domain/operations/read'
import {OperationsAccessError,operationsAllowed,operationsTimezone} from '@/domain/operations/policy'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {StayActions} from '@/admin/bookings/StayActions'
import {CancelBooking} from '@/admin/bookings/CancelBooking'
import {NoteForm,RefundRequestForm} from '@/admin/bookings/BookingForms'
import {ActionForm} from '@/admin/shared/ActionForm'
import {money,moneyList,stayLabels,statusLabels,when} from '@/admin/shared/labels'
export const metadata={title:'Booking — staff',robots:{index:false,follow:false}}
export default async function StaffBooking({params}:{params:Promise<{id:string}>}){
 const ctx=await staffPageContext(),{id}=await params,timezone=operationsTimezone(ctx)
 let view:StaffBookingView
 try{view=await readBooking(ctx,id)}catch(error){return <StaffShell title="Booking" description="Reservation details." current="/staff/bookings"><StaffUnavailable denied={error instanceof OperationsAccessError}/></StaffShell>}
 const collected=view.payments.filter(row=>row.status==='collected')
 return <StaffShell title={view.bookingCode??'Booking without code'} description={`${view.guestName??'Guest'} · ${view.arrival} to ${view.departure}`} current="/staff/bookings">
  <section className="staff-panel" aria-labelledby="summary-heading"><h2 id="summary-heading">Summary</h2><dl className="staff-facts">
   <div><dt>Booking status</dt><dd>{statusLabels[view.status]??view.status}</dd></div><div><dt>Stay</dt><dd className="staff-stay-state">{stayLabels[view.stayState]??view.stayState}</dd></div>
   <div><dt>Source</dt><dd>{view.source}</dd></div><div><dt>Room</dt><dd>{view.roomLabel??'—'}</dd></div>
   <div><dt>Accepted total</dt><dd>{money(view.total)}</dd></div><div><dt>Collected</dt><dd>{moneyList(view.collected)}</dd></div><div><dt>Revision</dt><dd>{view.revision}</dd></div>
  </dl></section>
  <section className="staff-panel" aria-labelledby="contact-heading"><h2 id="contact-heading">Guest contact</h2>{view.contact?<><dl className="staff-facts"><div><dt>Name</dt><dd>{view.contact.name}</dd></div><div><dt>Email</dt><dd>{view.contact.email}</dd></div><div><dt>Phone</dt><dd>{view.contact.phone??'—'}</dd></div>{view.stayingGuest&&<div><dt>Staying guest</dt><dd>{view.stayingGuest}</dd></div>}</dl>
   <p className="staff-buttons"><a className="button button-quiet" href={'mailto:'+view.contact.email}>Email guest</a>{view.contact.phone&&<a className="button button-quiet" href={'tel:'+view.contact.phone.replace(/[^+\d]/g,'')}>Call guest</a>}</p></>:<p>No contact details are recorded.</p>}</section>
  {operationsAllowed(ctx,'stay')&&<StayActions bookingId={view.id} revision={view.revision} actions={view.allowedActions}/>}
  <CancelBooking bookingId={view.id} revision={view.revision} allowed={view.status==='confirmed'}/>
  <section className="staff-panel" aria-labelledby="payments-heading"><h2 id="payments-heading">Payments</h2>{view.payments.length?<div className="staff-table" role="region" aria-label="Payments" tabIndex={0}><table><thead><tr><th scope="col">Reference</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Amount</th><th scope="col">Collected</th></tr></thead><tbody>{view.payments.map(row=><tr key={row.id}><th scope="row">{row.providerReference}</th><td>{row.environment==='offline'?'Cash or bank transfer':'Maya '+row.environment}</td><td>{row.status}</td><td>{money(row.amount)}</td><td>{when(row.collectedAt,timezone)}</td></tr>)}</tbody></table></div>:<p className="staff-empty">No payments are recorded.</p>}
   {collected.filter(row=>row.environment!=='offline').map(row=><div key={row.id} className="staff-check"><p>Maya refunds last checked: {when(row.refundsCheckedAt,timezone)}. Check again before any repayment and after any Maya dashboard action.</p><ActionForm endpoint="/api/operations/refunds" envelope="check" fixed={{paymentId:row.id}} tone="quiet" submitLabel="Check Maya for refunds" successMessage="Maya checked; dashboard refunds were imported"/></div>)}</section>
  <section className="staff-panel" aria-labelledby="refunds-heading"><h2 id="refunds-heading">Refunds</h2>{view.refunds.length?<div className="staff-table" role="region" aria-label="Refunds" tabIndex={0}><table><thead><tr><th scope="col">Requested</th><th scope="col">Method</th><th scope="col">State</th><th scope="col">Reason</th><th scope="col">Amount</th></tr></thead><tbody>{view.refunds.map(row=><tr key={row.id}><th scope="row">{when(row.createdAt,timezone)}</th><td>{row.method}{row.origin==='provider'?' (Maya dashboard)':''}</td><td>{row.state}{row.state==='authorized'&&row.origin==='app'&&<ActionForm endpoint="/api/operations/refunds" envelope="withdraw" fixed={{refundId:row.id,reason:'entered-in-error'}} tone="quiet" submitLabel="Withdraw" successMessage="Request withdrawn"/>}</td><td>{row.reason}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div>:<p className="staff-empty">No refunds are recorded.</p>}
   {collected.length>0&&<details className="staff-details"><summary>Request a refund</summary><RefundRequestForm revision={view.revision} reductions={view.reductions} paymentIds={collected.map(row=>({id:row.id,label:row.providerReference+' · '+money(row.amount)}))}/></details>}</section>
  {view.issues.length>0&&<section className="staff-panel" aria-labelledby="issues-heading"><h2 id="issues-heading">Payment issues</h2><ul>{view.issues.map(row=><li key={row.id}>{row.reasonCode} · {row.state}{row.resolutionCode?' · '+row.resolutionCode:''} · {when(row.createdAt,timezone)}</li>)}</ul><p><a href="/staff/payments">Open the payments queue</a></p></section>}
  <section className="staff-panel" aria-labelledby="notes-heading"><h2 id="notes-heading">Internal notes</h2>{view.notes.length?<ul className="staff-notes">{view.notes.map(row=><li key={row.id}><p>{row.text}</p><small>{row.staffName} · {when(row.recordedAt,timezone)}</small></li>)}</ul>:<p className="staff-empty">No notes yet.</p>}{operationsAllowed(ctx,'notes')&&<NoteForm bookingId={view.id}/>}</section>
  {view.stayEvents.length>0&&<section className="staff-panel" aria-labelledby="history-heading"><h2 id="history-heading">Stay history</h2><ul>{view.stayEvents.map(row=><li key={row.kind}>{row.kind} · property date {row.propertyDate} · {when(row.occurredAt,timezone)}</li>)}</ul></section>}
 </StaffShell>
}
