'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {Button} from '@/components/ui/button'
import {Alert,AlertDescription} from '@/components/ui/alert'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
export function StaffResetForm(){
  const token=useRef(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false)
  useEffect(()=>{if(!token.current){token.current=new URLSearchParams(location.hash.slice(1)).get('token')||'';history.replaceState(null,'',location.pathname)}setReady(!!token.current);if(!token.current)setError('This staff recovery link is invalid or has expired.')},[])
  if(success)return <section className="status-panel" role="status"><h2>Your staff password has been updated.</h2><p>Earlier sessions have been revoked.</p><Link href="/admin">Open staff workspace</Link></section>
  return <form className="account-form status-panel" onSubmit={async event=>{
    event.preventDefault();setError('');const form=new FormData(event.currentTarget),password=String(form.get('password')||'')
    if(password!==form.get('confirmation')){setError('The passwords do not match.');return}
    setBusy(true)
    try{const response=await fetch('/api/staff-users/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.current,password})});if(!response.ok)throw new Error('This staff recovery link is invalid or has expired. Request a new link from staff sign-in.');token.current='';setSuccess(true)}
    catch(cause){setError(cause instanceof Error?cause.message:'Please try again shortly.')}
    finally{setBusy(false)}
  }}><div className="enquiry-fields"><Label>New password<Input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required/></Label><Label>Confirm password<Input type="password" name="confirmation" autoComplete="new-password" minLength={12} maxLength={128} required/></Label></div>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button type="submit" disabled={!ready||busy}>{busy?'Updating…':'Update staff password'}</Button><Link href="/admin/forgot">Staff account recovery</Link></form>
}
