import {staffPageContext} from '@/features/staff/page-context'
import {readEnquiries,type EnquiryRow} from '@/domain/operations/read'
import {OperationsAccessError,operationsTimezone} from '@/domain/operations/policy'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {EnquiryActions} from '@/admin/enquiries/EnquiryActions'
import {when} from '@/admin/shared/labels'
export const metadata={title:'Enquiries — staff',robots:{index:false,follow:false}}
export default async function StaffEnquiries(){
 const ctx=await staffPageContext();let rows:{open:EnquiryRow[];recent:EnquiryRow[]}
 try{rows=await readEnquiries(ctx)}catch(error){return <StaffShell title="Enquiries" description="Event and general enquiries." current="/staff/enquiries"><StaffUnavailable denied={error instanceof OperationsAccessError}/></StaffShell>}
 const timezone=operationsTimezone(ctx)
 return <StaffShell title="Enquiries" description="Event and general enquiries. An enquiry never reserves a room or venue." current="/staff/enquiries">
  <section className="staff-panel" aria-labelledby="open-heading"><h2 id="open-heading">Open enquiries</h2><EnquiryActions open={rows.open}/></section>
  {rows.recent.length>0&&<section className="staff-panel" aria-labelledby="recent-heading"><h2 id="recent-heading">Recently closed</h2><ul>{rows.recent.map(row=><li key={row.id}>{row.contact?.name??'Unknown sender'} · {row.followUpOutcome} · {when(row.closedAt,timezone)}</li>)}</ul></section>}
 </StaffShell>
}
