import Link from 'next/link'
import {staffPageContext} from '@/features/staff/page-context'
import {readToday,type TodayView} from '@/domain/operations/read'
import {OperationsAccessError,operationsTimezone} from '@/domain/operations/policy'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {BookingTable} from '@/admin/today/BookingTable'
import {Button} from '@/components/ui/button'
import {DateField} from '@/components/DateField'
export const metadata={title:'Today — staff',robots:{index:false,follow:false}}
export default async function StaffToday({searchParams}:{searchParams:Promise<{date?:string}>}){
 const ctx=await staffPageContext(),params=await searchParams,today=ctx.clock.today(operationsTimezone(ctx)),date=/^\d{4}-\d{2}-\d{2}$/.test(params.date??'')?params.date!:today
 let view:TodayView
 try{view=await readToday(ctx,date)}catch(error){return <StaffShell title="Today" description="Arrivals, departures and money issues for one property date." current="/staff"><StaffUnavailable denied={error instanceof OperationsAccessError}/></StaffShell>}
 return <StaffShell title={date===today?'Today':date} description={`Property date ${view.propertyDate}. Upcoming arrivals cover ${view.range.from} to ${view.range.to} (${view.range.timezone}).`} current="/staff">
  <form className="staff-filter" method="get"><DateField label="Property date" name="date" defaultValue={date} className="min-w-48"/><Button variant="outline" type="submit">Show date</Button></form>
  <section className="staff-alerts" aria-labelledby="attention-heading"><h2 id="attention-heading">Needs attention</h2><ul>
   <li><Link href="/staff/payments">{view.openIssues.length} open payment {view.openIssues.length===1?'issue':'issues'}</Link></li>
   <li><Link href="/staff/payments">{view.uncertainRefunds} uncertain {view.uncertainRefunds===1?'refund':'refunds'}</Link> · {view.pendingOfflineReviews} offline {view.pendingOfflineReviews===1?'reimbursement':'reimbursements'} awaiting review</li>
   <li><Link href="/staff/enquiries">{view.openEnquiries} open {view.openEnquiries===1?'enquiry':'enquiries'}</Link></li>
  </ul></section>
  <section aria-labelledby="arrivals-heading"><h2 id="arrivals-heading">Arrivals</h2><BookingTable caption="Arrivals" rows={view.arrivals} empty="No arrivals on this date."/></section>
  <section aria-labelledby="departures-heading"><h2 id="departures-heading">Departures</h2><BookingTable caption="Departures" rows={view.departures} empty="No departures on this date."/></section>
  <section aria-labelledby="inhouse-heading"><h2 id="inhouse-heading">In house</h2><BookingTable caption="In house" rows={view.inHouse} empty="No checked-in guests on this date."/></section>
  <section aria-labelledby="upcoming-heading"><h2 id="upcoming-heading">Upcoming arrivals</h2><BookingTable caption="Upcoming arrivals" rows={view.upcoming} empty="No confirmed arrivals in this range."/></section>
 </StaffShell>
}
