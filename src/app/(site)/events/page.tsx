import Link from 'next/link'
import {EnquiryForm} from '@/components/EnquiryForm'
import {Button} from '@/components/ui/button'
import {ArrowUpRight} from 'lucide-react'
export const metadata={title:'Gatherings & events'}
export default function Events(){return <main id="main" className="shell section"><header className="page-heading"><p className="eyebrow">A little time together</p><h1>Make a little<br/>occasion of it.</h1><p>Planning a gathering? Tell us what you have in mind. Venue details, capacity and any package terms must be confirmed by the team.</p></header><div className="event-layout"><section className="copy-page"><h2>Something to look forward to.</h2><p>Visit our Stories & events for published announcements and upcoming dates.</p><Button asChild variant="outline"><Link href="/updates">Stories & events <ArrowUpRight aria-hidden="true"/></Link></Button></section><EnquiryForm/></div></main>}
