'use client'
import {navigateToServerPage} from '@/features/auth/navigation'
import {useState} from 'react'
import type {BookingSearchInput} from '@/features/booking/search'
import type {CheckoutDraft} from '@/features/booking/draft'
export function CheckoutContact({stay,initial,customer=false,onSaved}:{stay:BookingSearchInput;initial?:CheckoutDraft|null;customer?:boolean;onSaved?:(contact:CheckoutDraft['contact'],version:number,commandKey:string)=>Promise<void>|void}){
  const [version,setVersion]=useState(initial?.version),[email,setEmail]=useState(initial?.contact.email||''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false)
  async function persist(form:HTMLFormElement,signIn=false){
    setBusy(true);setError('');setSaved(false)
    const fields=new FormData(form)
    const contact={name:String(fields.get('name')||''),email:String(fields.get('email')||''),phone:String(fields.get('phone')||''),stayingGuestName:String(fields.get('stayingGuestName')||''),note:String(fields.get('note')||'')}
    if(!signIn&&stay.roomTypeId&&!contact.phone.trim()){setError('Add a contact phone number before reviewing your booking.');setBusy(false);return}
    try{
      const response=await fetch('/api/checkout/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:{stay,contact},expectedVersion:version})})
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Please try again.')
      setVersion(result.version)
      if(signIn){navigateToServerPage('/account/login?next=%2Fbook');return}
      setSaved(true)
      if(onSaved)await onSaved(contact,result.version,result.commandKey)
    }catch(cause){setError(cause instanceof Error?cause.message:'Please try again.')}finally{setBusy(false)}
  }
  return <form className="status-panel checkout-contact" onSubmit={event=>{event.preventDefault();void persist(event.currentTarget)}}><h2>A little about your stay.</h2><div className="enquiry-fields"><label>Your name<input name="name" autoComplete="name" required maxLength={120} defaultValue={initial?.contact.name||''}/></label><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Phone <span className="muted">{stay.roomTypeId?'(needed to book)':'(optional for now)'}</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={initial?.contact.phone||''}/></label><label>Staying guest name <span className="muted">(if different)</span><input name="stayingGuestName" autoComplete="off" maxLength={120} defaultValue={initial?.contact.stayingGuestName||''}/></label><label className="full-field">Requests <span className="muted">(optional)</span><textarea name="note" maxLength={1000} rows={3} defaultValue={initial?.contact.note||''}/><span className="muted">Requests are subject to availability and confirmation.</span></label></div>{!customer&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&<aside className="account-invitation"><h3>Have an account?</h3><p>Sign in to keep your stay with your account, or continue as a guest. Details are saved for up to 30 minutes.</p><button className="button secondary" type="button" disabled={busy} onClick={event=>{const form=event.currentTarget.form;if(form&&form.reportValidity())void persist(form,true)}}>Sign in and keep my details</button></aside>}{error&&<p className="form-error" role="alert">{error}</p>}{saved&&<div className="draft-saved" role="status"><p>Your details are saved. Availability and the complete price must be confirmed before payment.</p></div>}<button type="submit" className="button" disabled={busy}>{busy?'Saving…':customer?'Continue with your account':'Continue as guest'} <span aria-hidden="true">↗</span></button></form>
}
