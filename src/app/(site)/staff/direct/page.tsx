import Link from 'next/link'
import {AccountShell} from '@/components/AccountShell'
import {staffPageContext} from '@/features/staff/page-context'
import {directPolicySchema,directStaffAllowed} from '@/domain/bookings/direct-policy'
import {readRoomCatalog} from '@/content/catalog'
import {DirectBookingForm} from '@/admin/direct-booking/DirectBookingForm'
export const metadata={title:'Phone and walk-in bookings',robots:{index:false,follow:false}}
export default async function DirectBooking(){
  const ctx=await staffPageContext(),enabled=directStaffAllowed(ctx),rooms=enabled?await readRoomCatalog():[],rule=enabled?directPolicySchema.parse(ctx.policy.sections.directBookings):null,today=ctx.clock.today((ctx.policy.sections.stay as {timezone?:string}|undefined)?.timezone??'Asia/Manila')
  return <AccountShell eyebrow="Acornelia staff" title="Phone & walk-in bookings." description="Record the agreed stay and payment using the same room availability as website bookings."><div className="account-links"><Link href="/admin">Staff workspace</Link></div>{enabled&&rule&&ctx.actor.kind==='staff'?<DirectBookingForm subject={ctx.actor.id} rooms={rooms.map(room=>({id:room.id,name:room.name}))} methods={rule.methods} today={today}/>:<section className="status-panel"><h2>Direct booking is not enabled.</h2><p>The property operator must approve the payment rules and staff permissions before this action is available.</p></section>}</AccountShell>
}
