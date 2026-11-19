'use client'
import {useRef,useState} from 'react'
import Link from 'next/link'
import {Button} from '@/components/ui/button'
import {ArrowUpRight} from 'lucide-react'
import {Alert,AlertDescription} from '@/components/ui/alert'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
export function EnquiryForm({postId,title}:{postId?:string;title?:string}){
  const nonce=useRef<string|null>(null),[state,setState]=useState<'idle'|'sending'|'received'|'failed'>('idle'),[error,setError]=useState('')
  if(state==='received')return <section className="status-panel" role="status"><h2>A little hello, received.</h2><p>Your enquiry has been received. Our team will review it.</p><p>An enquiry does not reserve a room or confirm an event.</p></section>
  return <form className="enquiry-form status-panel" onChange={()=>{nonce.current=null}} onSubmit={async event=>{
    event.preventDefault();setState('sending');setError('')
    const data=new FormData(event.currentTarget)
    nonce.current??=crypto.randomUUID()
    try{
      const response=await fetch('/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce:nonce.current,postId,name:data.get('name'),email:data.get('email'),phone:data.get('phone')||undefined,message:data.get('message'),consent:data.get('consent')==='on',website:data.get('website')||''})})
      if(!response.ok){const result=await response.json();throw new Error(result.error||'We could not receive your enquiry. Please try again.')}
      setState('received')
    }catch(cause){setState('failed');setError(cause instanceof Error?cause.message:'Please try again shortly.')}
  }}><h2>{title?'Ask about this event.':'A little hello.'}</h2>{title&&<p className="enquiry-context">About: {title}</p>}<div className="enquiry-fields"><Label>Your name<Input name="name" autoComplete="name" required maxLength={120}/></Label><Label>Email address<Input name="email" type="email" autoComplete="email" required maxLength={254}/></Label><Label>Phone <span className="muted">(optional)</span><Input name="phone" type="tel" autoComplete="tel" maxLength={40}/></Label><Label>Your message<Textarea name="message" rows={5} minLength={5} maxLength={3000} required/></Label><div className="honeypot" aria-hidden="true"><Label>Website<Input name="website" tabIndex={-1} autoComplete="off"/></Label></div><label className="consent"><input type="checkbox" name="consent" required/><span>I agree to the privacy notice and the use of these details to answer my enquiry. <Link href="/policies/privacy">Read privacy notice</Link>.</span></label></div><p className="enquiry-note">This sends an enquiry. It does not reserve a room or take payment.</p>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button type="submit"  disabled={state==='sending'}>{state==='sending'?'Sending…':'Send enquiry'} <ArrowUpRight aria-hidden="true"/></Button></form>
}
