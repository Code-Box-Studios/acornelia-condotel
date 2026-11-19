import Link from 'next/link'
import type {BookingSearchInput} from './search'
import type {QuoteSnapshot} from '@/domain/quotes/types'
import {formatBookingMoney,formatBookingDeadline} from './presentation'
import {Button} from '@/components/ui/button'
export function Summary({stay,roomName,quote}:{stay:BookingSearchInput;roomName:string;quote?:QuoteSnapshot|null}){
  return <section className="status-panel stay-summary"><p className="eyebrow">Your selected stay</p><h2>{roomName}</h2><dl><dt>Check in</dt><dd>{stay.arrival}</dd><dt>Check out</dt><dd>{stay.departure}</dd><dt>Guests</dt><dd>{stay.occupancy.adults} adults · {stay.occupancy.children} children</dd></dl>{quote?<><div className="quote-lines">{quote.components.map((line,index)=><div key={index}><span>{line.label}{line.date?' · '+line.date:''}</span><span>{line.kind==='discount'?'−':''}{formatBookingMoney(line.amount)}</span></div>)}</div><div className="quote-total"><span>Complete total</span><strong data-testid="quote-total">{formatBookingMoney(quote.total)}</strong></div><p className="muted">Price held for review until {formatBookingDeadline(quote.expiresAt,quote.terms?.timezone??'Asia/Manila')}. Availability is confirmed when your booking is prepared.</p>{quote.synthetic&&<p className="fixture-notice">Local example only. These are test rates and terms.</p>}</>:<p>Your complete price appears after we check the selected room, dates and guests.</p>}<Button asChild variant="outline"><Link href="/rooms#find-stay">Change your selection ↗</Link></Button></section>
}
