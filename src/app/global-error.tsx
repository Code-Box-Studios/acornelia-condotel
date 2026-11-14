'use client'
import '@/styles/site.css'
export default function GlobalError({reset}:{reset:()=>void}){return <html lang="en"><body><main className="error-surface"><h1>A little interruption.</h1><p>Acornelia is temporarily unavailable. Please try again shortly.</p><button className="button" onClick={reset}>Try again</button></main></body></html>}
