'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {formatMoney} from '@/domain/shared/money'
import type {BookingViewRef} from './view-access'
import type {Money} from '@/domain/shared/types'
import {Button} from '@/components/ui/button'
import {Alert,AlertDescription} from '@/components/ui/alert'
export type PrivateBookingSummary={code:string|null;status:string;arrival:string;departure:string;acceptedTotal:Money|null;contactName:string|null;stayingGuest:string|null}
export function PrivateBookingView(){
  const capability=useRef<BookingViewRef|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[booking,setBooking]=useState<PrivateBookingSummary|null>(null)
  useEffect(()=>{
    if(!capability.current){const params=new URLSearchParams(location.hash.slice(1));capability.current={id:params.get('id')||'',bookingId:params.get('bookingId')||'',token:params.get('token')||''};history.replaceState(null,'',location.pathname)}
    setReady(!!capability.current.token)
    if(!capability.current.token)setError('This private link is invalid or has expired. Contact Acornelia for help.')
  },[])
  if(booking)return <section className="status-panel booking-detail" aria-live="polite"><p className="eyebrow">{booking.status}</p><h2>{booking.code||'Your reservation'}</h2><dl><dt>Arrival</dt><dd>{booking.arrival}</dd><dt>Departure</dt><dd>{booking.departure}</dd><dt>Accepted stay total</dt><dd>{booking.acceptedTotal?formatMoney(booking.acceptedTotal):'Unavailable'}</dd><dt>Booking contact</dt><dd>{booking.contactName||'Not recorded'}</dd><dt>Staying guest</dt><dd>{booking.stayingGuest||'Not separately recorded'}</dd></dl><p>This private view does not add a booking to a customer account.</p><Link href="/contact">Contact Acornelia</Link></section>
  return <section className="status-panel"><p>Open the reservation shared with you. Keep this link private.</p>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button type="button"  disabled={!ready||busy} onClick={async()=>{
    setBusy(true);setError('')
    try{const response=await fetch('/api/booking/view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(capability.current)});if(!response.ok)throw new Error('This private link is invalid or has expired. Contact Acornelia for help.');setBooking(await response.json());capability.current=null}
    catch(cause){setError(cause instanceof Error?cause.message:'Please try again shortly.')}
    finally{setBusy(false)}
  }}>{busy?'Opening…':'Open private booking'}</Button></section>
}
