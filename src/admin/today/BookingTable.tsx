import Link from 'next/link'
import type {StaffBookingSummary} from '@/domain/operations/read'
import {money,stayLabels,stayTones,statusLabels,statusTones} from '@/admin/shared/labels'
import {Badge} from '@/components/ui/badge'
import {Table,TableBody,TableCaption,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table'
export function BookingTable({caption,rows,empty}:{caption:string;rows:StaffBookingSummary[];empty:string}){
 if(!rows.length)return <p className="staff-empty">{empty}</p>
 return <div className="staff-table" role="region" aria-label={caption} tabIndex={0}><Table><TableCaption className="sr-only">{caption}</TableCaption>
  <TableHeader><TableRow><TableHead scope="col">Booking</TableHead><TableHead scope="col">Guest</TableHead><TableHead scope="col">Stay</TableHead><TableHead scope="col">Room</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Total</TableHead></TableRow></TableHeader>
  <TableBody>{rows.map(row=><TableRow key={row.id}><TableHead scope="row"><Link href={'/staff/bookings/'+row.id}>{row.bookingCode??'No code yet'}</Link></TableHead><TableCell>{row.guestName??'—'}</TableCell><TableCell>{row.arrival} → {row.departure}</TableCell><TableCell>{row.roomLabel??'—'}</TableCell><TableCell><span className="inline-flex flex-wrap gap-1.5"><Badge variant={statusTones[row.status]??'outline'}>{statusLabels[row.status]??row.status}</Badge><Badge variant={stayTones[row.stayState]??'outline'}>{stayLabels[row.stayState]??row.stayState}</Badge></span></TableCell><TableCell>{money(row.total)}</TableCell></TableRow>)}</TableBody>
 </Table></div>
}
