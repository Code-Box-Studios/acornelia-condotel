import {headers} from 'next/headers'
import Link from 'next/link'
import {validateBookingSearch} from '@/features/booking/search'
import {readRoomCatalog} from '@/content/catalog'
import {requestContext} from '@/features/auth/context'
import {readDraftSession} from '@/features/booking/draft-http'
import {resumeCheckoutDraft,type CheckoutDraft} from '@/features/booking/draft'
import {CheckoutContact} from '@/components/CheckoutContact'
import {GuestSession} from '@/components/GuestSession'
export const metadata={title:'Your stay',robots:{index:false,follow:false}}
export default async function Book({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const params=await searchParams,request=new Request(process.env.APP_URL!,{headers:await headers()}),ctx=await requestContext(request),session=readDraftSession(request,ctx)
  let initial:CheckoutDraft|null=null
  if(session?.ref){try{initial=await resumeCheckoutDraft(session.ref,ctx.actor,session)}catch{/* Private, expired and revoked drafts are not exposed. */}}
  let stay
  try{stay=params.arrival?validateBookingSearch({roomTypeId:params.roomTypeId,arrival:params.arrival,departure:params.departure,occupancy:{adults:Number(params.adults),children:Number(params.children||0)}}):initial?.stay;if(!stay)throw new Error('Choose your dates')}catch{return <main id="main" className="shell section copy-page"><p className="eyebrow">Let’s plan your stay</p><h1>A fresh start.</h1><p>Choose valid arrival and departure dates to begin.</p><Link className="button" href="/rooms#find-stay">Choose your dates ↗</Link></main>}
  const room=stay.roomTypeId?(await readRoomCatalog()).find(x=>x.id===stay.roomTypeId):null
  return <main id="main" className="shell section booking-page"><p className="eyebrow">A little closer to your escape</p><h1>Your selected stay</h1><div className="checkout-layout"><section className="status-panel stay-summary"><h2>{room?.name||'Your Acornelia stay'}</h2><dl><dt>Check in</dt><dd>{stay.arrival}</dd><dt>Check out</dt><dd>{stay.departure}</dd><dt>Guests</dt><dd>{stay.occupancy.adults} adults · {stay.occupancy.children} children</dd></dl><p>Online booking is being prepared. Availability and the complete price must be confirmed before payment.</p><Link href="/rooms#find-stay" className="button secondary">Change your selection ↗</Link></section>{ctx.actor.kind==='staff'?<section className="status-panel"><h2>A customer booking.</h2><p>You are signed in with staff access. Use a customer account or start a guest session to book a personal stay.</p><div className="account-links"><Link href="/account/login?next=%2Fbook">Use a customer account</Link></div><GuestSession stay={stay}/></section>:<CheckoutContact stay={stay} initial={initial} customer={ctx.actor.kind==='customer'}/>}</div></main>
}
