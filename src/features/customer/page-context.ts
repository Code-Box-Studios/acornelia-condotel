import {headers} from 'next/headers'
import {redirect} from 'next/navigation'
import {getDatabase} from '@/domain/db/payload'
import {requestContext} from '@/features/auth/context'
export async function customerPageContext(returnTo:'/account/bookings'|'/account/offers'='/account/bookings'){
  const request=new Request(process.env.APP_URL!,{headers:await headers()})
  const {user}=await (await getDatabase()).auth({headers:request.headers})
  if(!user||user.collection!=='customers'||user.deactivated||!user._verified)redirect('/account/login?next='+encodeURIComponent(returnTo))
  return requestContext(request)
}
