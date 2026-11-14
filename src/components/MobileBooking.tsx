'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
export function MobileBooking(){const path=usePathname();if(!['/','/rooms'].includes(path)&&!path.startsWith('/rooms/'))return null;return <div className="mobile-booking"><span>Your little escape<br/><small>A stay to look forward to</small></span><Link href="/rooms#find-stay" className="button">Plan your stay <span aria-hidden="true">↗</span></Link></div>}
