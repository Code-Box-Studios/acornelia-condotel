import type {Metadata} from 'next'
import Script from 'next/script'
import {readPublicProperty} from '@/content/public-property'
import {SiteHeader} from '@/components/SiteHeader'
import {SiteFooter} from '@/components/SiteFooter'
import {MobileBooking} from '@/components/MobileBooking'
import '@/styles/site.css'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:{default:'Acornelia · Your own little pause',template:'%s · Acornelia'},description:'A little room to slow down. Explore stays, stories and gatherings at Acornelia.',robots:{index:process.env.APP_ENV==='production'&&process.env.INDEX_PUBLIC_SITE==='true',follow:process.env.APP_ENV==='production'&&process.env.INDEX_PUBLIC_SITE==='true'}}
const themeScript="try{var t=localStorage.getItem('acornelia-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme='light'}"
export default async function SiteLayout({children}:{children:React.ReactNode}){
  const property=await readPublicProperty()
  return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><head><Script id="acornelia-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><SiteHeader name={property?.name||'Acornelia'}/>{property?.synthetic&&<aside className="preview-note" aria-label="Local preview">Local design preview · Sample rooms and imagery · Booking and payments are not live</aside>}{children}<SiteFooter property={property}/><MobileBooking/></body></html>
}
