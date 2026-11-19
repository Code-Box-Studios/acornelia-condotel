'use client'
import {navigateToServerPage} from '@/features/auth/navigation'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {safeReturnPath} from '@/features/auth/checkout-handoff'
import {Button} from '@/components/ui/button'
import {ArrowUpRight} from 'lucide-react'
import {Alert,AlertDescription} from '@/components/ui/alert'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
type Mode='login'|'register'|'recover'|'activate'|'reset'
const labels:Record<Mode,string>={login:'Sign in',register:'Create account',recover:'Send recovery link',activate:'Activate account',reset:'Update password'}
export function AccountForm({mode,returnTo='/account',email=''}:{mode:Mode;returnTo?:string;email?:string}){
  const token=useRef(''),[ready,setReady]=useState(!['activate','reset'].includes(mode)),[error,setError]=useState(''),[busy,setBusy]=useState(false),[success,setSuccess]=useState('')
  const next=safeReturnPath(returnTo),query='?next='+encodeURIComponent(next)
  useEffect(()=>{
    if(!['activate','reset'].includes(mode))return
    if(!token.current){token.current=new URLSearchParams(window.location.hash.slice(1)).get('token')||'';history.replaceState(null,'',window.location.pathname+window.location.search)}
    setReady(!!token.current)
    if(!token.current)setError('This link is invalid or has expired. Request a new link.')
  },[mode])
  if(success)return <section className="status-panel" role="status"><h2>{mode==='activate'?'Your account is ready.':mode==='reset'?'Your password has been updated.':'Check your email.'}</h2><p>{success}</p><div className="account-links"><Link href={'/account/login'+query}>Sign in</Link>{next==='/book'&&<Link href="/book">Continue as guest</Link>}</div></section>
  return <form className="account-form status-panel" onSubmit={async event=>{
    event.preventDefault();setBusy(true);setError('')
    const form=new FormData(event.currentTarget),data:Record<string,unknown>={}
    if(mode==='register'||mode==='activate')data.name=form.get('name')
    if(['login','register','recover'].includes(mode))data.email=form.get('email')
    if(['login','activate','reset'].includes(mode))data.password=form.get('password')
    if(mode==='activate'||mode==='reset'){
      data.token=token.current
      if(data.password!==form.get('confirmation')){setError('The passwords do not match.');setBusy(false);return}
    }
    try{
      const response=await fetch('/api/identity/customer/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      const result=await response.json()
      if(!response.ok)throw new Error(result.error||'Please try again shortly.')
      if(mode==='login'){navigateToServerPage(next);return}
      setSuccess(mode==='activate'?'Your account is ready. Sign in to continue.':mode==='reset'?'Your password has been updated. Sign in with your new password.':result.message)
    }catch(cause){setError(cause instanceof Error?cause.message:'Please try again shortly.')}finally{setBusy(false)}
  }}><div className="enquiry-fields">
    {(mode==='register'||mode==='activate')&&<Label>Your name<Input name="name" autoComplete="name" required maxLength={120}/></Label>}
    {['login','register','recover'].includes(mode)&&<Label>Email address<Input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={email}/></Label>}
    {mode==='login'&&<Label>Password<Input name="password" type="password" autoComplete="current-password" required maxLength={128}/></Label>}
    {(mode==='activate'||mode==='reset')&&<><Label>New password<Input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></Label><Label>Confirm password<Input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></Label><p className="enquiry-note">Use at least 12 characters.</p></>}
  </div>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button disabled={busy||!ready} type="submit">{busy?'Please wait…':labels[mode]} <ArrowUpRight aria-hidden="true"/></Button><div className="account-links">{mode==='login'&&<><Link href={'/account/recover'+query}>Forgot your password?</Link><Link href={'/account/register'+query}>Create an account</Link></>}{mode==='register'&&<Link href={'/account/login'+query}>Already have an account? Sign in</Link>}{mode==='recover'&&<Link href={'/account/login'+query}>Back to sign in</Link>}{['activate','reset'].includes(mode)&&<Link href={mode==='reset'?'/account/recover':'/account/register'}>Request a new link</Link>}{next==='/book'&&<Link href="/book">Continue as guest</Link>}</div></form>
}
