import {headers} from 'next/headers'
import {requestContext} from '@/features/auth/context'
import {readDraftSession} from '@/features/booking/draft-http'
import {resumeCheckoutDraft} from '@/features/booking/draft'
import {redirect} from 'next/navigation'
import Link from 'next/link'
import {getDatabase} from '@/domain/db/payload'
import {AccountShell} from '@/components/AccountShell'
import {SignOut} from '@/components/SignOut'
export const metadata={title:'Your account',robots:{index:false,follow:false}}
export default async function Account(){const request=new Request(process.env.APP_URL!,{headers:await headers()}),payload=await getDatabase(),{user}=await payload.auth({headers:request.headers});if(!user||user.collection!=='customers'||user.deactivated||!user._verified)redirect('/account/login');const ctx=await requestContext(request),session=readDraftSession(request,ctx);let hasDraft=false;if(session?.ref){try{await resumeCheckoutDraft(session.ref,ctx.actor,session);hasDraft=true}catch{/* Unavailable drafts do not appear in the account. */}}return <AccountShell title={`Welcome back, ${user.name}.`} description="A little space for your Acornelia stays."><section className="status-panel"><h2>Your customer account</h2><p>{user.email}</p><div className="account-links"><Link href="/account/bookings">My bookings</Link><Link href="/account/offers">My offers</Link><Link href={hasDraft?"/book":"/rooms"}>{hasDraft?"Continue your saved stay":"Plan a stay"}</Link></div><SignOut/></section></AccountShell>}
