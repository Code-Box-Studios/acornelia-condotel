'use client'
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {CheckoutContact} from '@/components/CheckoutContact'
import {navigateToServerPage} from '@/features/auth/navigation'
import type {BookingSearchInput} from './search'
import type {CheckoutDraft} from './draft'
import type {QuoteSnapshot} from '@/domain/quotes/types'
import type {CheckoutInput,CheckoutResult} from '@/domain/bookings/types'
import type {AccountOffer} from '@/features/customer/offers'
import {Summary} from './Summary'
import {formatBookingMoney} from './presentation'
const pendingName='acornelia-checkout-pending',lastName='acornelia-last-checkout'
const uuid=/^[a-f0-9-]{36}$/
const failures:Record<string,string>={'quote-expired':'This price has expired. Review a fresh price before continuing.','quote-unavailable':'Review the selected stay and request a fresh price.','unavailable':'That room is no longer available for the whole stay. Choose another room or dates.','offer-unavailable':'That offer changed. Review another offer or request a new price without it.','configuration-unavailable':'Online booking is being prepared. Contact Acornelia for help.','contact-not-allowed':'The approved booking terms require your account email and the booking contact to match.','access-required':'Your checkout session changed. Sign in again or contact Acornelia for help.','invalid-input':'Review your contact details before continuing.'}
export function Checkout({stay,initial,roomName,customer=false,account,paymentConfigured=false}:{stay:BookingSearchInput;initial:CheckoutDraft|null;roomName:string;customer?:boolean;account?:{name:string;email:string}|null;paymentConfigured?:boolean}){
  const [draft,setDraft]=useState<CheckoutDraft|null>(initial),[quote,setQuote]=useState<QuoteSnapshot|null>(null),[key,setKey]=useState(''),[offers,setOffers]=useState<AccountOffer[]>([]),[offer,setOffer]=useState(''),[agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expired,setExpired]=useState(false),[pending,setPending]=useState<string|null>(null)
  const heading=useRef<HTMLHeadingElement>(null),channelRef=useRef<BroadcastChannel|null>(null),navigating=useRef(false),selection=JSON.stringify(stay)
  function remember(name:string,value:unknown){try{if(value===null)sessionStorage.removeItem(name);else sessionStorage.setItem(name,JSON.stringify(value))}catch{/* Server idempotency still protects a submitted command. */}}
  function go(bookingId:string,commandKey:string){if(navigating.current)return;navigating.current=true;remember(pendingName,null);remember(lastName,{bookingId,commandKey,selection});try{channelRef.current?.postMessage({bookingId,commandKey})}catch{/* The scoped server session remains authoritative. */}navigateToServerPage('/book/payment?bookingId='+bookingId)}
  async function recover(commandKey:string){
    const response=await fetch('/api/booking/checkout?commandKey='+encodeURIComponent(commandKey),{cache:'no-store'})
    if(response.ok){const result=await response.json();if(typeof result.bookingId==='string'&&uuid.test(result.bookingId)){go(result.bookingId,commandKey);return true}}
    return false
  }
  useEffect(()=>{
    let active=true
    if(customer)void fetch('/api/customer/offers',{cache:'no-store'}).then(async response=>{if(response.ok){const result=await response.json();if(active&&Array.isArray(result.items))setOffers(result.items)}}).catch(()=>{})
    let stored:unknown
    try{stored=JSON.parse(sessionStorage.getItem(pendingName)||'null')}catch{/* Missing browser continuity does not grant access. */}
    if(stored&&typeof stored==='object'&&'commandKey' in stored&&typeof stored.commandKey==='string'&&uuid.test(stored.commandKey)){
      const commandKey=stored.commandKey
      void fetch('/api/booking/checkout?commandKey='+commandKey,{cache:'no-store'}).then(async response=>{if(!active)return;if(response.ok){const result=await response.json();if(uuid.test(result.bookingId))navigateToServerPage('/book/payment?bookingId='+result.bookingId)}else{setPending(commandKey);setError('Check your saved checkout before starting another payment.')}}).catch(()=>{if(active){setPending(commandKey);setError('Your saved checkout is being checked. Try again shortly.')}})
    }
    return ()=>{active=false}
  },[customer])
  useEffect(()=>{if(quote)heading.current?.focus()},[quote])
  useEffect(()=>{const resume=(event:PageTransitionEvent)=>{if(!event.persisted)return;try{const value=JSON.parse(sessionStorage.getItem(lastName)||'null');if(value?.selection===selection&&uuid.test(value.bookingId))navigateToServerPage('/book/payment?bookingId='+value.bookingId)}catch{/* A browser cache entry never grants private access. */}};window.addEventListener('pageshow',resume);return()=>window.removeEventListener('pageshow',resume)},[selection])
  useEffect(()=>{if(!quote)return;const timer=setTimeout(()=>{setExpired(true);setAgreed(false)},Math.max(0,Date.parse(quote.expiresAt)-Date.now()));return()=>clearTimeout(timer)},[quote])
  useEffect(()=>{
    let channel:BroadcastChannel
    try{channel=new BroadcastChannel('acornelia-checkout');channelRef.current=channel;channel.onmessage=event=>{const value=event.data;if(value?.kind==='signed-out'){remember(pendingName,null);remember(lastName,null);navigateToServerPage('/');return}if(!navigating.current&&value?.commandKey===key&&typeof value.bookingId==='string'&&uuid.test(value.bookingId)){navigating.current=true;navigateToServerPage('/book/payment?bookingId='+value.bookingId)}}}catch{return}
    return ()=>{channel.close();channelRef.current=null}
  },[key])
  async function loadQuote(contact:CheckoutDraft['contact'],version:number,commandKey:string,selectedOffer=offer){
    setDraft({stay,contact,version});setKey(commandKey);setAgreed(false);setExpired(false);setError('')
    if(!stay.roomTypeId){setError('Choose a room to review availability and the complete price. Your details are saved.');return}
    if(!uuid.test(commandKey)){setError('Reload your saved selection before continuing.');return}
    setBusy(true);setQuote(null)
    try{
      const response=await fetch('/api/booking/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stay,...(selectedOffer?{offerVersionId:selectedOffer}:{})})}),result=await response.json()
      if(!response.ok)throw new Error(result.error||'Your price could not be checked yet.')
      setQuote(result)
    }catch(cause){setError(cause instanceof Error?cause.message:'Your price could not be checked yet.')}finally{setBusy(false)}
  }
  async function prepare(){
    if(!quote||!draft||!agreed||expired||busy)return
    const input:CheckoutInput={commandKey:key,quoteId:quote.id,version:quote.version,contact:{name:draft.contact.name??'',email:draft.contact.email??'',phone:draft.contact.phone??'',...(draft.contact.note?{note:draft.contact.note}:{})},...(draft.contact.stayingGuestName?{stayingGuest:draft.contact.stayingGuestName}:{})}
    setBusy(true);setError('')
    try{
      const accepted=await fetch('/api/booking/quotes/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quoteId:quote.id,version:quote.version})})
      if(!accepted.ok){setAgreed(false);throw new Error('This price needs another review. Request a fresh price before booking.')}
      remember(pendingName,{commandKey:key,quoteId:quote.id,version:quote.version})
      const response=await fetch('/api/booking/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),result=await response.json() as CheckoutResult
      if(response.status>=500||response.status===429){if(await recover(key))return;setPending(key);throw new Error('Your original checkout is being checked. Refresh the saved request shortly or contact Acornelia.')}
      if(result.state==='rejected'){
        if(await recover(key))return
        if(['command-conflict','already-prepared'].includes(result.code)){setPending(key);throw new Error('An existing checkout needs to be checked before another payment.')}
        remember(pendingName,null);setAgreed(false);if(result.code==='quote-expired')setExpired(true)
        throw new Error(failures[result.code]||'Your checkout could not be prepared. Contact Acornelia for help.')
      }
      if(!response.ok)throw new Error('Your checkout is being checked.')
      go(result.bookingId,key)
    }catch(cause){
      let saved=false
      try{saved=!!sessionStorage.getItem(pendingName)}catch{/* Access can still be recovered from the server. */}
      if(saved){try{if(await recover(key))return}catch{/* Keep uncertainty until the original command can be read. */}setPending(key)}
      setError(cause instanceof Error?cause.message:'Your saved checkout is being checked.');setBusy(false)
    }
  }
  const offerControl=customer&&offers.length>0?<label className="checkout-offer">Account offer<select value={offer} disabled={busy||!!pending} onChange={event=>{const value=event.target.value;setOffer(value);if(quote&&draft)void loadQuote(draft.contact,draft.version!,key,value)}}><option value="">Continue without an offer</option>{offers.map(item=><option key={item.id} value={item.id} disabled={item.status!=='available'}>{item.name}{item.status!=='available'?' · unavailable':''}</option>)}</select><span className="muted">The complete price is checked again when you choose an offer.</span></label>:null
  return <div className="checkout-layout"><Summary stay={stay} roomName={quote?.roomType.name??roomName} quote={quote}/><div className="checkout-main">{error&&<p className="form-error" role="alert">{error}</p>}{pending?<section className="status-panel"><h2>Check your saved checkout.</h2><p>Your original booking request may already be saved. We will use that request when it is available.</p><button className="button" type="button" disabled={busy} onClick={async()=>{setBusy(true);try{if(!await recover(pending))setError('The saved checkout is not available yet. Check again shortly or contact Acornelia.')}catch{setError('Your saved checkout could not be refreshed yet.')}finally{setBusy(false)}}}>Check saved checkout</button><Link href="/contact">Contact Acornelia</Link></section>:busy&&!quote?<section className="status-panel" aria-busy="true"><h2>Checking your stay.</h2><p>Checking availability and the complete price…</p></section>:quote&&draft?<section className="status-panel checkout-review"><p className="eyebrow">One last look</p><h2 ref={heading} tabIndex={-1}>Review your booking.</h2><dl><dt>Booking account</dt><dd>{account?account.name+' · '+account.email:'Guest checkout'}</dd><dt>Booking contact</dt><dd>{draft.contact.name}<br/>{draft.contact.email}<br/>{draft.contact.phone}</dd><dt>Staying guest</dt><dd>{draft.contact.stayingGuestName||draft.contact.name}</dd></dl>{draft.contact.note&&<p><strong>Your request:</strong> {draft.contact.note}<br/><span className="muted">Requests are subject to availability and confirmation.</span></p>}{offerControl}{quote.terms?<><details className="booking-terms" open><summary>{quote.terms.title}</summary><p>{quote.terms.text}</p></details><p>{quote.total.minor==='0'?<>Complete total: <strong>{formatBookingMoney(quote.total)}</strong>. No payment is required for this accepted quote.</>:<>Full payment: <strong>{formatBookingMoney(quote.total)}</strong>. {quote.terms.holdMinutes} minutes are allowed for payment once your booking is prepared.</>}</p><label className="consent-check"><input type="checkbox" checked={agreed} disabled={busy||expired} onChange={event=>setAgreed(event.target.checked)}/><span>I agree to the booking terms and the complete total shown above.</span></label></>:<p>Booking terms are being prepared. Contact Acornelia before continuing.</p>}{expired&&<p role="status">This review price expired. Request a fresh price to continue.</p>}{quote.total.minor!=='0'&&!paymentConfigured&&<p>Online payment is being prepared. Contact Acornelia for help with your stay.</p>}<div className="account-links"><button className="button" type="button" disabled={busy||!agreed||expired||!quote.terms||quote.total.minor!=='0'&&!paymentConfigured} onClick={()=>void prepare()}>{busy?'Preparing…':quote.total.minor==='0'?'Confirm your stay':'Prepare secure payment'} <span aria-hidden="true">↗</span></button><button className="button secondary" type="button" disabled={busy} onClick={()=>{setQuote(null);setAgreed(false)}}>Edit details</button><button className="button secondary" type="button" disabled={busy} onClick={()=>void loadQuote(draft.contact,draft.version!,key)}>Refresh price</button></div></section>:<>{offerControl}<CheckoutContact stay={stay} initial={draft} customer={customer} onSaved={loadQuote}/></>}</div></div>
}
