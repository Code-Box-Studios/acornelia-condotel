import {redirect} from 'next/navigation'
import {staffPageContext} from '@/features/staff/page-context'
import {lookupBooking,searchBookings,type StaffBookingSummary} from '@/domain/operations/read'
import {OperationsAccessError} from '@/domain/operations/policy'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {BookingTable} from '@/admin/today/BookingTable'
import {Button} from '@/components/ui/button'
import {Alert,AlertDescription} from '@/components/ui/alert'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
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
  <form className="staff-filter" method="get"><Label>Booking code<Input name="code" autoComplete="off" spellCheck={false} placeholder="ACN-…" defaultValue={params.code}/></Label><Button type="submit">Find code</Button></form>
  {notFound&&<Alert variant="destructive"><AlertDescription>No booking has that code.</AlertDescription></Alert>}
  <form className="staff-filter" method="get"><Label>Guest name, email or phone<Input name="q" defaultValue={params.q}/></Label><Label>Arrivals from<Input type="date" name="from" defaultValue={params.from}/></Label><Label>Arrivals to<Input type="date" name="to" defaultValue={params.to}/></Label><Button variant="outline" type="submit">Search</Button></form>
  {rows&&<section aria-labelledby="results-heading"><h2 id="results-heading">{rows.length} {rows.length===1?'booking':'bookings'}</h2><BookingTable caption="Search results" rows={rows} empty="No bookings match this search."/></section>}
 </StaffShell>
}
