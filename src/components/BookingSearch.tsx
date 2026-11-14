'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import {searchParameters} from '@/features/booking/search'
export function BookingSearch({roomTypeId,today}:{roomTypeId?:string;today:string}){
  const router=useRouter(),[error,setError]=useState('')
  return <form id="find-stay" className="booking-search" onSubmit={event=>{
    event.preventDefault();setError('')
    const form=new FormData(event.currentTarget)
    try{const params=searchParameters({roomTypeId,arrival:String(form.get('arrival')),departure:String(form.get('departure')),occupancy:{adults:Number(form.get('adults')),children:Number(form.get('children'))}});router.push(`/book?${params}`)}catch(cause){setError(cause instanceof Error&&cause.message.startsWith('Check out')?cause.message:'Choose valid dates and guest counts.')}
  }}><div className="search-heading"><span className="eyebrow">A little change of scenery</span><span className="search-caption">Let’s find your pause.</span></div><div className="search-fields"><label>Check in<input aria-label="Check in" name="arrival" type="date" min={today} required/></label><label>Check out<input aria-label="Check out" name="departure" type="date" min={today} required/></label><label>Adults<input aria-label="Adults" name="adults" type="number" min="1" max="100" defaultValue="2" required/></label><label>Children<input aria-label="Children" name="children" type="number" min="0" max="100" defaultValue="0" required/></label><button className="button" type="submit">Find my stay <span aria-hidden="true">↗</span></button></div>{error&&<p className="form-error" role="alert">{error}</p>}</form>
}
