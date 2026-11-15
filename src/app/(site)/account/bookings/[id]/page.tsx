import Link from 'next/link'
import {notFound} from 'next/navigation'
import {AccountShell} from '@/components/AccountShell'
import {customerPageContext} from '@/features/customer/page-context'
import {readOwnBooking} from '@/features/customer/bookings'
import {formatMoney} from '@/domain/shared/money'
export const metadata={title:'Booking details',robots:{index:false,follow:false}}
export default async function BookingDetail({params}:{params:Promise<{id:string}>}){
  const ctx=await customerPageContext(),item=await readOwnBooking(ctx,(await params).id)
  if(!item)notFound()
  return <AccountShell title={item.code||'Your reservation'} description="Your reservation details and recorded payment activity.">
    <div className="account-links"><Link href="/account/bookings">← My bookings</Link></div>
    <section className="status-panel booking-detail"><p className="eyebrow">{item.status}</p><h2>Your stay</h2><dl><dt>Arrival</dt><dd>{item.arrival}</dd><dt>Departure</dt><dd>{item.departure}</dd><dt>Accepted total</dt><dd>{item.acceptedTotal?formatMoney(item.acceptedTotal):'Price details unavailable'}</dd><dt>Booker</dt><dd>Your customer account</dd><dt>Booking contact</dt><dd>{[item.contact.name,item.contact.email,item.contact.phone].filter(Boolean).join(' · ')||'Not recorded'}</dd><dt>Staying guest</dt><dd>{item.stayingGuest.name||'Not separately recorded'}</dd></dl></section>
    <section className="status-panel booking-detail"><h2>Payment activity</h2>{!item.payments.attempts.length&&!item.payments.transactions.length?<p>No payment activity is recorded.</p>:<ul className="payment-activity">{item.payments.attempts.map(attempt=><li key={attempt.id}><span>Checkout · {attempt.state}</span><strong>{formatMoney(attempt.amount)}</strong></li>)}{item.payments.transactions.map(payment=><li key={payment.id}><span>Payment · {payment.status}</span><strong>{formatMoney(payment.amount)}</strong></li>)}</ul>}</section>
    <p className="history-help">Need help with this booking?{' '}<Link href="/contact">Contact Acornelia.</Link></p>
  </AccountShell>
}
