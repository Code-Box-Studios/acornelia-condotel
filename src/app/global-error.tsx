'use client'
import '@/styles/site.css'
import {Button} from '@/components/ui/button'
export default function GlobalError({reset}:{reset:()=>void}){return <html lang="en"><body><main className="error-surface"><h1>A little interruption.</h1><p>Acornelia is temporarily unavailable. Please try again shortly.</p><Button onClick={reset}>Try again</Button></main></body></html>}
