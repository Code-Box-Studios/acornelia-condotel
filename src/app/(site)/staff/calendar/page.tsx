import Link from 'next/link'
import {staffPageContext} from '@/features/staff/page-context'
import {addDays,readCalendar,type CalendarView} from '@/domain/operations/read'
import {OperationsAccessError,operationsTimezone} from '@/domain/operations/policy'
import {StaffShell,StaffUnavailable} from '@/admin/shared/StaffShell'
import {BlockActions} from '@/admin/calendar/BlockActions'
export const metadata={title:'Calendar — staff',robots:{index:false,follow:false}}
export default async function StaffCalendar({searchParams}:{searchParams:Promise<{from?:string}>}){
 const ctx=await staffPageContext(),params=await searchParams,today=ctx.clock.today(operationsTimezone(ctx)),from=/^\d{4}-\d{2}-\d{2}$/.test(params.from??'')?params.from!:today
 let view:CalendarView
 try{view=await readCalendar(ctx,{from,days:14})}catch(error){return <StaffShell title="Room calendar" description="Stays, holds and blocks by physical room." current="/staff/calendar"><StaffUnavailable denied={error instanceof OperationsAccessError}/></StaffShell>}
 const cell=(roomId:string,date:string)=>view.entries.find(entry=>entry.roomId===roomId&&entry.from<=date&&date<entry.to)
 const blocks=view.entries.filter(entry=>entry.kind==='block'&&entry.blockId).map(entry=>({id:entry.blockId!,label:(view.rooms.find(room=>room.id===entry.roomId)?.label??'Room')+' · '+entry.from+' → '+entry.to+' · '+entry.label}))
 return <StaffShell title="Room calendar" description={`Each cell is one night. Showing ${view.days[0]} to ${view.days[view.days.length-1]}.`} current="/staff/calendar">
  <nav className="staff-buttons" aria-label="Calendar dates"><Link className="button button-quiet" href={'/staff/calendar?from='+addDays(from,-14)}>Previous two weeks</Link><Link className="button button-quiet" href={'/staff/calendar?from='+addDays(from,14)}>Next two weeks</Link></nav>
  <div className="staff-table staff-calendar" role="region" aria-label="Room calendar" tabIndex={0}><table><thead><tr><th scope="col">Room</th>{view.days.map(date=><th key={date} scope="col">{date.slice(5)}</th>)}</tr></thead>
   <tbody>{view.rooms.map(room=><tr key={room.id}><th scope="row">{room.label}</th>{view.days.map(date=>{const entry=cell(room.id,date);return <td key={date} className={entry?'staff-night staff-night-'+entry.kind:'staff-night'}>{entry?entry.kind==='booking'&&entry.bookingId?<Link href={'/staff/bookings/'+entry.bookingId}>{entry.bookingCode?.slice(-4)??'Stay'}</Link>:entry.kind==='hold'?'Hold':'Blocked':<span className="visually-hidden">Free</span>}</td>})}</tr>)}</tbody></table></div>
  {ctx.actor.kind==='staff'&&ctx.actor.role==='developer'&&<BlockActions rooms={view.rooms} blocks={blocks}/>}
 </StaffShell>
}
