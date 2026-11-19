'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import {ArrowUpRight} from 'lucide-react'
import {searchParameters} from '@/features/booking/search'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Alert,AlertDescription} from '@/components/ui/alert'
export function BookingSearch({roomTypeId,today}:{roomTypeId?:string;today:string}){
  const router=useRouter(),[error,setError]=useState('')
  return <form id="find-stay" className="booking-search" onSubmit={event=>{
    event.preventDefault();setError('')
    const form=new FormData(event.currentTarget)
    try{const params=searchParameters({roomTypeId,arrival:String(form.get('arrival')),departure:String(form.get('departure')),occupancy:{adults:Number(form.get('adults')),children:Number(form.get('children'))}});router.push(`/book?${params}`)}catch(cause){setError(cause instanceof Error&&cause.message.startsWith('Check out')?cause.message:'Choose valid dates and guest counts.')}
  }}><div className="search-heading"><span className="eyebrow">A little change of scenery</span><span className="search-caption">Let’s find your pause.</span></div><div className="search-fields"><Label>Check in<Input aria-label="Check in" name="arrival" type="date" min={today} required/></Label><Label>Check out<Input aria-label="Check out" name="departure" type="date" min={today} required/></Label><Label>Adults<Input aria-label="Adults" name="adults" type="number" min="1" max="100" defaultValue="2" required/></Label><Label>Children<Input aria-label="Children" name="children" type="number" min="0" max="100" defaultValue="0" required/></Label><Button type="submit" className="max-[800px]:col-span-full">Find my stay <ArrowUpRight aria-hidden="true"/></Button></div>{error&&<Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}</form>
}
