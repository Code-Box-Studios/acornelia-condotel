'use client'
import {Moon} from 'lucide-react'
import {Button} from '@/components/ui/button'
export function ThemeToggle(){
  return <Button variant="outline" size="icon" aria-label="Switch color theme" onClick={()=>{
    const theme=document.documentElement.dataset.theme==='dark'?'light':'dark'
    document.documentElement.dataset.theme=theme
    try{localStorage.setItem('acornelia-theme',theme)}catch{/* A blocked storage preference does not prevent switching themes. */}
  }}><Moon aria-hidden="true"/></Button>
}
