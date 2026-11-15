import {headers} from 'next/headers'
import {AccountForm} from '@/components/AccountForm'
import {AccountShell} from '@/components/AccountShell'
import {safeReturnPath} from '@/features/auth/checkout-handoff'
import {requestContext} from '@/features/auth/context'
import {readDraftSession} from '@/features/booking/draft-http'
import {resumeCheckoutDraft} from '@/features/booking/draft'
export const metadata={title:'Sign in',robots:{index:false,follow:false}}
export default async function Login({searchParams}:{searchParams:Promise<{next?:string}>}){
  const params=await searchParams,returnTo=safeReturnPath(params.next),request=new Request(process.env.APP_URL!,{headers:await headers()}),ctx=await requestContext(request),session=readDraftSession(request,ctx)
  let email=''
  if(session?.ref){try{email=(await resumeCheckoutDraft(session.ref,ctx.actor,session)).contact.email||''}catch{/* A private or expired draft is not exposed. */}}
  return <AccountShell title="A familiar little welcome." description="Sign in with your email and password. Guest checkout remains available."><AccountForm mode="login" returnTo={returnTo} email={email}/></AccountShell>
}
