'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {ArrowUpRight} from 'lucide-react'
import {Button} from '@/components/ui/button'
export function MobileBooking(){const path=usePathname();if(!['/','/rooms'].includes(path)&&!path.startsWith('/rooms/'))return null;return <div className="mobile-booking"><span>Your little escape<br/><small>A stay to look forward to</small></span><Button asChild><Link href="/rooms#find-stay">Plan your stay <ArrowUpRight aria-hidden="true"/></Link></Button></div>}
