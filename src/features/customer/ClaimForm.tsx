'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import type {ClaimEvidence} from '@/domain/claims/types'
import {Button} from '@/components/ui/button'
import {Alert,AlertDescription} from '@/components/ui/alert'
export function ClaimForm(){
  const evidence=useRef<ClaimEvidence|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[claimed,setClaimed]=useState(false)
  useEffect(()=>{if(!evidence.current){const params=new URLSearchParams(location.hash.slice(1));evidence.current={purpose:'booking-claim',approvalId:params.get('approvalId')||'',token:params.get('token')||''};history.replaceState(null,'',location.pathname)}setReady(!!evidence.current.token);if(!evidence.current.token)setError('This reviewed claim link is invalid or has expired.')},[])
  if(claimed)return <section className="status-panel" role="status"><h2>Your reviewed booking is now linked.</h2><Link href="/account/bookings">My bookings</Link></section>
  return <section className="status-panel"><p>Only the customer account named in the completed independent review can claim this booking. A matching email or confirmation copy is insufficient.</p>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button type="button"  disabled={!ready||busy} onClick={async()=>{
    setBusy(true);setError('')
    try{const response=await fetch('/api/customer/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence.current)});if(!response.ok)throw new Error(response.status===401?'Sign in to the reviewed customer account, then reopen this email link.':'This reviewed claim link is unavailable. Contact Acornelia for help.');evidence.current=null;setClaimed(true)}catch(cause){setError(cause instanceof Error?cause.message:'Please try again shortly.')}finally{setBusy(false)}
  }}>{busy?'Checking review…':'Link reviewed booking'}</Button><div className="account-links"><Link href="/account/login">Sign in</Link><Link href="/contact">Contact Acornelia</Link></div></section>
}
