'use client'
import {useState} from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {ArrowUpRight,Menu} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Sheet,SheetContent,SheetTitle,SheetTrigger} from '@/components/ui/sheet'
import {ThemeToggle} from './ThemeToggle'
const links=[['/','Home'],['/rooms','Our stays'],['/updates','Stories & events'],['/about','Our story'],['/contact','Contact'],['/account','My account']]
export function SiteHeader({name}:{name:string}){
  const path=usePathname(),[open,setOpen]=useState(false)
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand" aria-label={`${name} home`}><Image src="/brand/logo.jpg" width={46} height={46} alt="" className="brand-mark"/><span>{name}<small>CONDOTEL & EVENTS PLACE</small></span></Link>
      <nav aria-label="Main navigation" className="desktop-nav">{links.map(([href,label])=><Link key={href} href={href} aria-current={path===href?'page':undefined}>{label}</Link>)}</nav>
      <div className="header-actions"><ThemeToggle/>
        <Button asChild size="sm" className="max-[1100px]:hidden"><Link href="/rooms">Find your stay <ArrowUpRight aria-hidden="true"/></Link></Button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild><Button variant="outline" size="icon" className="hidden max-[800px]:inline-flex" aria-label="Open navigation"><Menu aria-hidden="true"/></Button></SheetTrigger>
          <SheetContent side="right" className="w-[min(90vw,380px)] gap-0 p-6 pt-5" aria-describedby={undefined}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <p className="eyebrow mobile-nav-intro">A little exploring</p>
            <nav aria-label="Mobile navigation" className="mobile-nav">{links.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)} aria-current={path===href?'page':undefined}>{label}<ArrowUpRight aria-hidden="true"/></Link>)}</nav>
          </SheetContent>
        </Sheet>
      </div>
    </div></header>
  </>
}
