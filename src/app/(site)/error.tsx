'use client'
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main" className="error-surface"><h1>A little interruption.</h1><p>We could not load this page. Please try again.</p><button className="button" onClick={reset}>Try again</button></main>}
