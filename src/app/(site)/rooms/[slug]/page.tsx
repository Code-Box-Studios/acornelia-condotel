import {notFound} from 'next/navigation'
import Link from 'next/link'
import {readRoomCatalog} from '@/content/catalog'
import {RoomGallery} from '@/components/RoomGallery'
import {BookingSearch} from '@/components/BookingSearch'
import {propertyToday} from '@/domain/shared/dates'
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const room=(await readRoomCatalog()).find(x=>x.slug===slug);return {title:room?.name||'Room not found',description:room?.description}}
export default async function RoomDetail({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params,room=(await readRoomCatalog()).find(x=>x.slug===slug)
  if(!room)notFound()
  return <main id="main" className="shell section"><div className="detail-heading"><div><Link className="eyebrow" href="/rooms">← All stays</Link><h1>{room.name}</h1></div><div className="room-meta">{room.maxGuests!==null&&<span>Up to {room.maxGuests} guests</span>}{room.bedDescription&&<span>{room.bedDescription}</span>}</div></div><RoomGallery images={room.images} name={room.name}/><div className="detail-copy"><div><h2>A space to settle in.</h2><p>{room.description}</p>{room.amenities.length>0&&<ul className="amenities">{room.amenities.map(label=><li key={label}>{label}</li>)}</ul>}</div><div><h2>Before you arrive.</h2><p>Review the property’s house rules and cancellation terms before confirming your stay.</p><div className="hero-actions"><Link className="text-link" href="/policies/house-rules">House rules ↗</Link><Link className="text-link" href="/policies/cancellation">Cancellation ↗</Link></div></div></div><BookingSearch roomTypeId={room.id} today={propertyToday(process.env.PROPERTY_TIMEZONE||'UTC')}/></main>
}
