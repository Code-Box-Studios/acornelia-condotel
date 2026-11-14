import Link from 'next/link'
import {readPublicProperty} from '@/content/public-property'
export const metadata={title:'Our story'}
export default async function About(){const property=await readPublicProperty();return <main id="main" className="shell section copy-page"><p className="eyebrow">A little about us</p><h1>Somewhere that<br/>feels like yours.</h1><p>{property?.pages.about||'Our story is being prepared. Visit again soon to learn more about Acornelia.'}</p><Link className="button" href="/rooms">Explore our stays <span aria-hidden="true">↗</span></Link></main>}
