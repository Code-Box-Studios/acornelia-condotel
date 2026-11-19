import {staffPageContext} from '@/features/staff/page-context'
import {runReport,type ReportResult} from '@/domain/operations/reports'
import {OperationsAccessError,operationsAllowed,operationsTimezone} from '@/domain/operations/policy'
import {addDays} from '@/domain/operations/read'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {ReportTables} from '@/admin/reports/ReportTables'
export const metadata={title:'Reports — staff',robots:{index:false,follow:false}}
const day=/^\d{4}-\d{2}-\d{2}$/
export default async function StaffReports({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}){
 const ctx=await staffPageContext(),params=await searchParams,today=ctx.clock.today(operationsTimezone(ctx)),from=day.test(params.from??'')?params.from!:addDays(today,-30),to=day.test(params.to??'')?params.to!:today
 let report:ReportResult|null=null,failure:'denied'|'invalid'|null=null
 try{report=await runReport(ctx,{from,to})}catch(error){failure=error instanceof OperationsAccessError?'denied':'invalid'}
 const csv='/api/operations/reports?'+new URLSearchParams({from,to,format:'csv'})
 return <StaffShell title="Reports" description="Bookings, collections and refunds for a date range, using the property's time zone." current="/staff/reports">
  <form className="staff-filter" method="get"><label>From<input type="date" name="from" defaultValue={from}/></label><label>To<input type="date" name="to" defaultValue={to}/></label><button className="button button-quiet" type="submit">Run report</button></form>
  {failure==='denied'?<StaffUnavailable denied/>:failure==='invalid'?<p role="alert" className="form-error">Choose a valid range within the approved report limit.</p>:report&&<>{operationsAllowed(ctx,'exports')&&<p className="staff-buttons"><a className="button" href={csv} download>Download CSV</a></p>}<ReportTables report={report}/></>}
 </StaffShell>
}
