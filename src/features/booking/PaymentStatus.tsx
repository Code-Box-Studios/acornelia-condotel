'use client'
import Link from 'next/link'
import {clearCheckoutBrowserState,navigateToServerPage} from '@/features/auth/navigation'
import {useEffect,useState} from 'react'
import type {CheckoutStatus} from './status'
import {formatBookingDeadline,formatBookingMoney} from './presentation'
export function PaymentStatus({bookingId,returned=false}:{bookingId:string;returned?:boolean}){
  const [status,setStatus]=useState<CheckoutStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[refresh,setRefresh]=useState(0),[resuming,setResuming]=useState(false)
  useEffect(()=>{
    let active=true,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,delay=5000
    async function check(){
      if(document.visibilityState==='hidden')return
      controller?.abort();const current=new AbortController();controller=current;setBusy(true)
      if(timer)clearTimeout(timer)
      let terminal=false
      try{
        const response=await fetch('/api/booking/status?bookingId='+encodeURIComponent(bookingId),{cache:'no-store',signal:AbortSignal.any([current.signal,AbortSignal.timeout(10000)])})
        if(response.status===429){delay=60000;throw new Error('Payment is still being checked. Please wait a moment before refreshing.')}
        if(response.status===401){terminal=true;setStatus(null);throw new Error('This private checkout session is unavailable. Open the original browser or contact Acornelia for help.')}
        if(!response.ok)throw new Error('We could not refresh your checkout yet. Check again shortly.')
        const next=await response.json() as CheckoutStatus
        if(!['preparing','ready','checking','confirmed','closed'].includes(next.state)||next.bookingId!==bookingId)throw new Error('Your checkout is being checked.')
        if(active&&controller===current){setStatus(next);setError('');delay=5000}
        terminal=['confirmed','closed'].includes(next.state)
      }catch(cause){if(active&&controller===current&&!current.signal.aborted){setError(cause instanceof Error?cause.message:'We could not refresh your checkout yet.');delay=Math.min(delay*2,60000)}}
      finally{if(active&&controller===current){setBusy(false);if(!terminal)timer=setTimeout(()=>void check(),delay)}}
    }
    const focus=()=>void check(),visibility=()=>{if(document.visibilityState==='visible')void check();else{if(timer)clearTimeout(timer);controller?.abort()}}
    void check();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility)
    return ()=>{active=false;controller?.abort();if(timer)clearTimeout(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility)}
  },[bookingId,refresh])
  useEffect(()=>{let channel:BroadcastChannel;try{channel=new BroadcastChannel('acornelia-checkout');channel.onmessage=event=>{if(event.data?.kind==='signed-out'){clearCheckoutBrowserState(false);navigateToServerPage('/')}}}catch{return};return()=>channel.close()},[])
  async function resume(){
    if(resuming)return;setResuming(true);setError('')
    try{const response=await fetch('/api/booking/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId})});if(!response.ok)throw new Error('The original payment link cannot be reopened yet. Keep checking or contact Acornelia.');navigateToServerPage('/book/payment?bookingId='+bookingId)}catch(cause){setError(cause instanceof Error?cause.message:'Your original checkout is being checked.');setResuming(false)}
  }
  const state=returned&&status&&!['confirmed','closed'].includes(status.state)?'checking':status?.state??'checking'
  const heading=state==='confirmed'?'Your stay is confirmed.':state==='closed'?'This checkout has closed.':state==='ready'?'Your secure checkout is ready.':state==='preparing'?'Preparing your secure checkout.':'Checking payment.'
  return <section className="status-panel payment-status" aria-busy={busy}><p className="eyebrow">Your Acornelia stay</p><h1>{heading}</h1><div aria-live="polite">{error?<p className="form-error" role="alert">{error}</p>:<p>{state==='confirmed'?'Your reservation is recorded. Keep your booking code for your visit.':state==='closed'?'Contact Acornelia if you need help with this reservation.':state==='ready'?'Continue to Maya to complete your payment.':state==='preparing'?'We are preparing the payment link for your accepted booking. This page will update.':'We will show confirmation after payment is verified. Your original checkout is being checked.'}</p>}</div>{status&&<><h2>{status.roomName}</h2><dl><dt>Check in</dt><dd>{status.arrival}</dd><dt>Check out</dt><dd>{status.departure}</dd><dt>Guests</dt><dd>{status.adults} adults · {status.children} children</dd><dt>Accepted total</dt><dd data-testid="payment-total">{formatBookingMoney(status.total)}</dd>{status.deadline&&<><dt>Payment deadline</dt><dd>{formatBookingDeadline(status.deadline,status.timezone)} ({status.timezone})</dd></>}{status.code&&<><dt>Booking code</dt><dd>{status.code}</dd></>}</dl></>}<div className="account-links">{status?.canPay&&!returned&&<form method="POST" action="/api/booking/handoff"><input type="hidden" name="bookingId" value={bookingId}/><button className="button" type="submit" disabled={busy}>Continue to secure payment ↗</button></form>}{status?.canRequestResume&&<button className="button secondary" type="button" disabled={busy||resuming} onClick={()=>void resume()}>{resuming?'Checking original link…':'Check original payment link'}</button>}<button className="button secondary" type="button" disabled={busy} onClick={()=>setRefresh(value=>value+1)}>{busy?'Checking…':'Check again'}</button><Link href="/contact">Contact Acornelia</Link></div></section>
}
