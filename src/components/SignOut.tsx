'use client'
import {clearCheckoutBrowserState,navigateToServerPage} from '@/features/auth/navigation'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Alert,AlertDescription} from '@/components/ui/alert'
export function SignOut(){const [error,setError]=useState('');return <><Button variant="outline" onClick={async()=>{const response=await fetch('/api/identity/customer/logout',{method:'POST'});if(response.ok){clearCheckoutBrowserState();navigateToServerPage('/')}else setError('We could not sign you out. Please try again.')}}>Sign out</Button>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}</>}
