import {headers} from 'next/headers'
import {redirect} from 'next/navigation'
import {getDatabase} from '@/domain/db/payload'
import {requestContext} from '@/features/auth/context'
export async function customerPageContext(){
  const request=new Request(process.env.APP_URL!,{headers:await headers()})
  const {user}=await (await getDatabase()).auth({headers:request.headers})
  if(!user||user.collection!=='customers'||user.deactivated||!user._verified)redirect('/account/login?next=%2Faccount%2Fbookings')
  return requestContext(request)
}
