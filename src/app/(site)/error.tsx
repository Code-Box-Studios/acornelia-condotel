'use client'
import {Button} from '@/components/ui/button'
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main" className="error-surface"><h1>A little interruption.</h1><p>We could not load this page. Please try again.</p><Button onClick={reset}>Try again</Button></main>}
