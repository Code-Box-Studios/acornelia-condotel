import Link from 'next/link'
import {AccountShell} from '@/components/AccountShell'
import {SignOut} from '@/components/SignOut'
import {customerPageContext} from '@/features/customer/page-context'
import {listOwnBookings} from '@/features/customer/bookings'
import {formatMoney} from '@/domain/shared/money'
import {Button} from '@/components/ui/button'
export const metadata={title:'My bookings',robots:{index:false,follow:false}}
export default async function Bookings({searchParams}:{searchParams:Promise<{cursor?:string}>}){
  const ctx=await customerPageContext(),{cursor}=await searchParams
  const page=await listOwnBookings(ctx,cursor??null)
  return <AccountShell title="Your stays, together." description="Your reservations and past stays, kept in one place.">
    <nav className="account-links" aria-label="Account navigation"><Link href="/account">Your account</Link><Link href="/rooms">Plan a stay</Link></nav>
    {page.items.length?<div className="booking-history">{page.items.map(item=><article key={item.id} className="status-panel booking-history-card">
      <div className="booking-history-top"><p className="eyebrow">{item.status}</p><span className="booking-price">{item.acceptedTotal?formatMoney(item.acceptedTotal):'Price details unavailable'}</span></div>
      <h2>{item.code||'Your reservation'}</h2><p>{item.arrival} – {item.departure}</p>
      <Link className="text-link" href={'/account/bookings/'+item.id}>View booking {item.code||'details'} <span aria-hidden="true">↗</span></Link>
    </article>)}</div>:<section className="status-panel"><h2>No bookings yet.</h2><p>When you book with your account, your stays will appear here.</p></section>}
    {page.nextCursor&&<div className="account-links"><Button asChild variant="outline"><Link href={'/account/bookings?cursor='+encodeURIComponent(page.nextCursor)}>Older bookings</Link></Button></div>}
    <aside className="history-help"><h2>Booked as a guest?</h2><p>Earlier guest bookings need a separate ownership review. Matching contact details do not add them to your account. Online claims are not available yet.</p><Link className="text-link" href="/contact">Contact Acornelia ↗</Link></aside>
    <SignOut/>
  </AccountShell>
}
