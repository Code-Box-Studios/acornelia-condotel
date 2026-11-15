import Link from 'next/link'
import {AccountShell} from '@/components/AccountShell'
import {SignOut} from '@/components/SignOut'
import {customerPageContext} from '@/features/customer/page-context'
import {readMyOffers} from '@/features/customer/offers'
import {formatMoney} from '@/domain/shared/money'
import type {OfferTerms} from '@/domain/offers/types'
export const metadata={title:'My offers',robots:{index:false,follow:false}}
function benefit(terms:OfferTerms){return terms.benefit.kind==='fixed'?formatMoney({minor:terms.benefit.minor,currency:terms.currency})+' off':`${Math.floor(terms.benefit.bps/100)}.${String(terms.benefit.bps%100).padStart(2,'0')}% off`}
export default async function Offers(){
  const ctx=await customerPageContext('/account/offers'),{items,timezone}=await readMyOffers(ctx)
  return <AccountShell title="A little extra for your stays." description="Explore current offers for customers with an Acornelia account. Choose a stay to check its full eligibility.">
    <nav className="account-links" aria-label="Account navigation"><Link href="/account">Your account</Link><Link href="/account/bookings">My bookings</Link><Link href="/rooms">Plan a stay</Link></nav>
    {items.length?<div className="account-offers">{items.map(item=><article className="status-panel offer-card" key={item.id}>
      <p className="eyebrow">Customer account offer{item.synthetic?' · Local example':''}</p><h2>{item.name}</h2><p className="offer-benefit">{benefit(item.terms)}</p>
      <ul className="offer-terms"><li>{item.terms.roomScope==='all'?'Available for eligible stays across room types.':'Available for selected room types.'}</li><li>Full stay from {item.terms.stayFrom}, with check-out by {item.terms.stayUntil}.</li>
      <li>Book before {new Intl.DateTimeFormat('en-PH',{timeZone:timezone!,dateStyle:'medium',timeStyle:'short'}).format(new Date(item.terms.bookingUntil))} ({timezone}).</li>
      <li>Applies to {item.terms.eligibleComponents.map(kind=>kind==='night'?'nightly room charges':kind==='child'?'child charges':'extra-adult charges').join(', ')}.</li>
      {item.terms.minimumSpend.minor!=='0'&&<li>Minimum {item.terms.minimumSpendBasis==='subtotal'?'room and guest subtotal':'eligible charges'}: {formatMoney(item.terms.minimumSpend)}.</li>}
      {item.terms.capMinor!==null&&<li>Maximum discount: {formatMoney({minor:item.terms.capMinor,currency:item.terms.currency})}.</li>}
      {item.terms.perAccountLimit!==null&&<li>Up to {item.terms.perAccountLimit} {item.terms.perAccountLimit===1?'use':'uses'} per account.</li>}
      {item.terms.overallLimit!==null&&<li>Limited to {item.terms.overallLimit} total uses.</li>}
      <li>One offer per checkout. Pending bookings count toward usage limits.</li><li>{item.terms.usage.cancelled==='retain'?'Cancellation does not restore this offer use.':'Offer use can be restored after an effective cancellation.'}</li></ul>
      {item.status==='available'?<Link className="button secondary" href="/rooms">Find a stay</Link>:<p className="offer-status">{item.status==='exhausted'?'This offer has been fully claimed.':'Your usage limit for this offer is reached. Check your current bookings.'}</p>}
    </article>)}</div>:<section className="status-panel"><h2>No current offers.</h2><p>When Acornelia publishes account offers, you’ll find them here.</p><div className="account-links"><Link href="/rooms">Explore our stays ↗</Link></div></section>}
    <p className="history-help">Creating an account does not subscribe you to promotional email or SMS. Offer availability and usage rules apply.</p><SignOut/>
  </AccountShell>
}
