import {staffPageContext} from '@/features/staff/page-context'
import {runReport,type ReportResult} from '@/domain/operations/reports'
import {OperationsAccessError,operationsAllowed,operationsTimezone} from '@/domain/operations/policy'
import {addDays} from '@/domain/operations/read'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {ReportTables} from '@/admin/reports/ReportTables'
import {Button} from '@/components/ui/button'
import {Alert,AlertDescription} from '@/components/ui/alert'
import {DateField} from '@/components/DateField'
export const metadata={title:'Reports — staff',robots:{index:false,follow:false}}
const day=/^\d{4}-\d{2}-\d{2}$/
export default async function StaffReports({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}){
 const ctx=await staffPageContext(),params=await searchParams,today=ctx.clock.today(operationsTimezone(ctx)),from=day.test(params.from??'')?params.from!:addDays(today,-30),to=day.test(params.to??'')?params.to!:today
 let report:ReportResult|null=null,failure:'denied'|'invalid'|null=null
 try{report=await runReport(ctx,{from,to})}catch(error){failure=error instanceof OperationsAccessError?'denied':'invalid'}
 const csv='/api/operations/reports?'+new URLSearchParams({from,to,format:'csv'})
 return <StaffShell title="Reports" description="Bookings, collections and refunds for a date range, using the property's time zone." current="/staff/reports">
  <form className="staff-filter" method="get"><DateField label="From" name="from" defaultValue={from} className="min-w-48"/><DateField label="To" name="to" defaultValue={to} className="min-w-48"/><Button variant="outline" type="submit">Run report</Button></form>
  {failure==='denied'?<StaffUnavailable denied/>:failure==='invalid'?<Alert variant="destructive"><AlertDescription>Choose a valid range within the approved report limit.</AlertDescription></Alert>:report&&<>{operationsAllowed(ctx,'exports')&&<p className="staff-buttons"><Button asChild><a href={csv} download>Download CSV</a></Button></p>}<ReportTables report={report}/></>}
 </StaffShell>
}
