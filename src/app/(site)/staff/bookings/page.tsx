import {redirect} from 'next/navigation'
import {staffPageContext} from '@/features/staff/page-context'
import {lookupBooking,searchBookings,type StaffBookingSummary} from '@/domain/operations/read'
import {OperationsAccessError} from '@/domain/operations/policy'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {BookingTable} from '@/admin/today/BookingTable'
export const metadata={title:'Bookings — staff',robots:{index:false,follow:false}}
export default async function StaffBookings({searchParams}:{searchParams:Promise<{code?:string;q?:string;from?:string;to?:string}>}){
 const ctx=await staffPageContext(),params=await searchParams
 let rows:StaffBookingSummary[]|null=null,notFound=false,target:string|null=null
 try{
  if(params.code){const view=await lookupBooking(ctx,params.code);if(view)target='/staff/bookings/'+view.id;else notFound=true}
  else if(params.q||params.from||params.to)rows=await searchBookings(ctx,{text:params.q||undefined,from:params.from||undefined,to:params.to||undefined})
 }catch(error){return <StaffShell title="Bookings" description="Find a reservation by code, guest or dates." current="/staff/bookings"><StaffUnavailable denied={error instanceof OperationsAccessError}/></StaffShell>}
 if(target)redirect(target)
 return <StaffShell title="Bookings" description="Find a reservation by code, guest or dates. A code locates a booking; it does not prove who the guest is." current="/staff/bookings">
  <form className="staff-filter" method="get"><label>Booking code<input name="code" autoComplete="off" spellCheck={false} placeholder="ACN-…" defaultValue={params.code}/></label><button className="button" type="submit">Find code</button></form>
  {notFound&&<p role="alert" className="form-error">No booking has that code.</p>}
  <form className="staff-filter" method="get"><label>Guest name, email or phone<input name="q" defaultValue={params.q}/></label><label>Arrivals from<input type="date" name="from" defaultValue={params.from}/></label><label>Arrivals to<input type="date" name="to" defaultValue={params.to}/></label><button className="button button-quiet" type="submit">Search</button></form>
  {rows&&<section aria-labelledby="results-heading"><h2 id="results-heading">{rows.length} {rows.length===1?'booking':'bookings'}</h2><BookingTable caption="Search results" rows={rows} empty="No bookings match this search."/></section>}
 </StaffShell>
}
