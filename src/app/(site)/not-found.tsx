import Link from 'next/link'
import {Button} from '@/components/ui/button'
export default function NotFound(){return <main id="main" className="error-surface"><h1>A little off the path.</h1><p>We could not find that page.</p><Button asChild><Link href="/">Back to Acornelia ↗</Link></Button></main>}
