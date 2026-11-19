import {formatMoney} from '@/domain/shared/money'
import type {ReportResult} from '@/domain/operations/reports'
import {stayLabels,statusLabels} from '@/admin/shared/labels'
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table'
const amount=(minor:string|null,currency:string|null)=>minor&&currency?formatMoney({minor,currency}):'—'
function ReportTable({label,head,rows}:{label:string;head:string[];rows:React.ReactNode[][]}){
 return <div className="staff-table" role="region" aria-label={label} tabIndex={0}><Table><TableHeader><TableRow>{head.map(cell=><TableHead key={cell} scope="col">{cell}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row,index)=><TableRow key={index}>{row.map((cell,column)=>column?<TableCell key={column}>{cell}</TableCell>:<TableHead key={column} scope="row">{cell}</TableHead>)}</TableRow>)}</TableBody></Table></div>
}
/** Booking, collection and refund figures stay separate; each currency is its own row. */
export function ReportTables({report}:{report:ReportResult}){
 return <>
  <section className="staff-panel" aria-labelledby="statuses-heading"><h2 id="statuses-heading">Bookings by status</h2><p>Bookings arriving from {report.range.from} to {report.range.to}.</p>{report.bookings.length?<ReportTable label="Bookings by status" head={['Status','Bookings']} rows={report.bookings.map(row=>[statusLabels[row.status]??row.status,row.count])}/>:<p className="staff-empty">No bookings arrive in this range.</p>}</section>
  <section className="staff-panel" aria-labelledby="collections-heading"><h2 id="collections-heading">Collections</h2><p>Money collected on these property dates ({report.range.timezone}).</p>{report.payments.length?<ReportTable label="Collections" head={['Currency','Collected','Payments']} rows={report.payments.map(row=>[row.currency,amount(row.collectedMinor,row.currency),row.count])}/>:<p className="staff-empty">No collections on these dates.</p>}</section>
  <section className="staff-panel" aria-labelledby="refunded-heading"><h2 id="refunded-heading">Completed refunds</h2>{report.refunds.length?<ReportTable label="Completed refunds" head={['Currency','Returned','Refunds']} rows={report.refunds.map(row=>[row.currency,amount(row.amountMinor,row.currency),row.count])}/>:<p className="staff-empty">No refunds completed on these dates.</p>}</section>
  <section className="staff-panel" aria-labelledby="reserved-heading"><h2 id="reserved-heading">Open refund reservations</h2><p>Current reservations, regardless of dates.</p>{report.openRefunds.length?<ReportTable label="Open refund reservations" head={['Currency','State','Reserved','Refunds']} rows={report.openRefunds.map(row=>[row.currency,row.state,amount(row.amountMinor,row.currency),row.count])}/>:<p className="staff-empty">No refund amounts are reserved.</p>}</section>
  <section className="staff-panel" aria-labelledby="rows-heading"><h2 id="rows-heading">Bookings in range</h2>{report.rows.length?<ReportTable label="Bookings in range" head={['Booking','Guest','Stay','Status','Total','Collected','Refunded']} rows={report.rows.map(row=>[row.bookingCode??'No code',row.guestName??'—',row.arrival+' → '+row.departure,(statusLabels[row.status]??row.status)+' · '+(stayLabels[row.stayState]??row.stayState),amount(row.totalMinor,row.currency),amount(row.collectedMinor,row.currency),amount(row.refundedMinor,row.currency)])}/>:<p className="staff-empty">No bookings.</p>}</section>
 </>
}
