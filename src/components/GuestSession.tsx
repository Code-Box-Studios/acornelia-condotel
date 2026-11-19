'use client'
import {clearCheckoutBrowserState,navigateToServerPage} from '@/features/auth/navigation'
import {useState} from 'react'
import {searchParameters,type BookingSearchInput} from '@/features/booking/search'
import {Button} from '@/components/ui/button'
import {Alert,AlertDescription} from '@/components/ui/alert'
export function GuestSession({stay}:{stay:BookingSearchInput}){const [error,setError]=useState('');return <><Button variant="outline" type="button"  onClick={async()=>{const response=await fetch('/api/identity/customer/logout',{method:'POST'});if(response.ok){clearCheckoutBrowserState();navigateToServerPage('/book?'+searchParameters(stay))}else setError('Please try again shortly.')}}>Continue as guest</Button>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}</>}
