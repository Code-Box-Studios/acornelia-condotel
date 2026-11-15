'use client'
import {navigateToServerPage} from '@/features/auth/navigation'
import {useState} from 'react'
export function SignOut(){const [error,setError]=useState('');return <><button className="button secondary" onClick={async()=>{const response=await fetch('/api/identity/customer/logout',{method:'POST'});if(response.ok)navigateToServerPage('/');else setError('We could not sign you out. Please try again.')}}>Sign out</button>{error&&<p className="form-error" role="alert">{error}</p>}</>}
