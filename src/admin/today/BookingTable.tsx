import Link from 'next/link'
import type {StaffBookingSummary} from '@/domain/operations/read'
import {money,stayLabels,statusLabels} from '@/admin/shared/labels'
export function BookingTable({caption,rows,empty}:{caption:string;rows:StaffBookingSummary[];empty:string}){
 if(!rows.length)return <p className="staff-empty">{empty}</p>
 return <div className="staff-table" role="region" aria-label={caption} tabIndex={0}><table><caption className="visually-hidden">{caption}</caption>
  <thead><tr><th scope="col">Booking</th><th scope="col">Guest</th><th scope="col">Stay</th><th scope="col">Room</th><th scope="col">Status</th><th scope="col">Total</th></tr></thead>
  <tbody>{rows.map(row=><tr key={row.id}><th scope="row"><Link href={'/staff/bookings/'+row.id}>{row.bookingCode??'No code yet'}</Link></th><td>{row.guestName??'—'}</td><td>{row.arrival} → {row.departure}</td><td>{row.roomLabel??'—'}</td><td>{statusLabels[row.status]??row.status} · {stayLabels[row.stayState]??row.stayState}</td><td>{money(row.total)}</td></tr>)}</tbody>
 </table></div>
}
