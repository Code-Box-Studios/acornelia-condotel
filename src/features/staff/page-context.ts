import {headers} from 'next/headers'
import {redirect} from 'next/navigation'
import {requestContext} from '@/features/auth/context'
export async function staffPageContext(){
  const ctx=await requestContext(new Request(process.env.APP_URL!,{headers:await headers()}))
  if(ctx.actor.kind!=='staff')redirect('/admin/login')
  return ctx
}
