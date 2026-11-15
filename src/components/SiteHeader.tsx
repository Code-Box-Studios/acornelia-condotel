'use client'
import {useRef,useState} from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {ThemeToggle} from './ThemeToggle'
const links=[['/','Home'],['/rooms','Our stays'],['/updates','Stories & events'],['/about','Our story'],['/contact','Contact'],['/account','My account']]
export function SiteHeader({name}:{name:string}){
  const path=usePathname(),dialog=useRef<HTMLDialogElement>(null),[open,setOpen]=useState(false)
  function close(){dialog.current?.close();setOpen(false)}
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand" aria-label={`${name} home`}><Image src="/brand/logo.jpg" width={46} height={46} alt="" className="brand-mark"/><span>{name}<small>CONDOTEL & EVENTS PLACE</small></span></Link>
      <nav aria-label="Main navigation" className="desktop-nav">{links.map(([href,label])=><Link key={href} href={href} aria-current={path===href?'page':undefined}>{label}</Link>)}</nav>
      <div className="header-actions"><ThemeToggle/><Link className="button small header-book" href="/rooms">Find your stay <span aria-hidden="true">↗</span></Link><button type="button" className="icon-button menu-toggle" aria-label="Open navigation" aria-expanded={open} aria-controls="site-navigation" onClick={()=>{dialog.current?.showModal();setOpen(true)}}><svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div>
    </div></header>
    <dialog ref={dialog} id="site-navigation" className="navigation-dialog" aria-label="Navigation" onClose={()=>setOpen(false)} onCancel={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)close()}}><div className="dialog-top"><span className="eyebrow">A little exploring</span><button className="icon-button" type="button" aria-label="Close navigation" onClick={close}>×</button></div><nav aria-label="Mobile navigation">{links.map(([href,label])=><Link key={href} href={href} onClick={close} aria-current={path===href?'page':undefined}>{label}<span aria-hidden="true">↗</span></Link>)}</nav></dialog>
  </>
}
