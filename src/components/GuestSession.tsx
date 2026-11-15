'use client'
import {clearCheckoutBrowserState,navigateToServerPage} from '@/features/auth/navigation'
import {useState} from 'react'
import {searchParameters,type BookingSearchInput} from '@/features/booking/search'
export function GuestSession({stay}:{stay:BookingSearchInput}){const [error,setError]=useState('');return <><button type="button" className="button secondary" onClick={async()=>{const response=await fetch('/api/identity/customer/logout',{method:'POST'});if(response.ok){clearCheckoutBrowserState();navigateToServerPage('/book?'+searchParameters(stay))}else setError('Please try again shortly.')}}>Continue as guest</button>{error&&<p className="form-error" role="alert">{error}</p>}</>}
