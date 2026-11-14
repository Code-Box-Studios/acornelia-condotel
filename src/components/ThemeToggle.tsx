'use client'
export function ThemeToggle(){
  return <button className="icon-button theme-toggle" type="button" aria-label="Switch color theme" onClick={()=>{
    const theme=document.documentElement.dataset.theme==='dark'?'light':'dark'
    document.documentElement.dataset.theme=theme
    try{localStorage.setItem('acornelia-theme',theme)}catch{/* A blocked storage preference does not prevent switching themes. */}
  }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20.8 14.2A9 9 0 0 1 9.8 3.1 9 9 0 1 0 20.8 14.2Z"/></svg></button>
}
