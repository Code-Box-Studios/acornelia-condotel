import Link from 'next/link'
import {validateBookingSearch} from '@/features/booking/search'
import {readRoomCatalog} from '@/content/catalog'
export const metadata={title:'Your stay',robots:{index:false,follow:false}}
export default async function Book({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const params=await searchParams
  let stay
  try{stay=validateBookingSearch({roomTypeId:params.roomTypeId,arrival:params.arrival,departure:params.departure,occupancy:{adults:Number(params.adults),children:Number(params.children||0)}})}catch{return <main id="main" className="shell section copy-page"><p className="eyebrow">Let’s plan your stay</p><h1>A fresh start.</h1><p>Choose valid arrival and departure dates to begin.</p><Link className="button" href="/rooms#find-stay">Choose your dates ↗</Link></main>}
  const room=stay.roomTypeId?(await readRoomCatalog()).find(x=>x.id===stay.roomTypeId):null
  return <main id="main" className="shell section copy-page"><p className="eyebrow">A little closer to your escape</p><h1>Your selected stay</h1><section className="status-panel"><h2>{room?.name||'Your Acornelia stay'}</h2><dl><dt>Check in</dt><dd>{stay.arrival}</dd><dt>Check out</dt><dd>{stay.departure}</dd><dt>Guests</dt><dd>{stay.occupancy.adults} adults · {stay.occupancy.children} children</dd></dl><p>Online booking is being prepared. Availability and the complete price must be confirmed before payment.</p><Link href="/rooms#find-stay" className="button secondary">Change your selection ↗</Link></section></main>
}
