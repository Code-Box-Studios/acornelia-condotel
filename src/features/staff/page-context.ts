import {assertOperationAllowed} from '@/config/operation-mode'
import {currentFence} from '@/domain/recovery/fence'
import {getDatabase} from '@/domain/db/payload'
import {headers} from 'next/headers'
import {redirect} from 'next/navigation'
import {requestContext} from '@/features/auth/context'
export async function staffPageContext(){
  const ctx=await requestContext(new Request(process.env.APP_URL!,{headers:await headers()}))
  assertOperationAllowed('authentication',await currentFence(await getDatabase()))
  if(ctx.actor.kind!=='staff')redirect('/admin/login')
  return ctx
}
