import {assertOperationAllowed} from '@/config/operation-mode'
import {currentFence} from '@/domain/recovery/fence'
import {getDatabase} from '@/domain/db/payload'
import {headers} from 'next/headers'
import {redirect} from 'next/navigation'
import {requestContext} from '@/features/auth/context'
export async function staffPageContext(){
  // Fence first: no session is read from a restored or unreconciled database.
  assertOperationAllowed('authentication',await currentFence(await getDatabase()))
  const ctx=await requestContext(new Request(process.env.APP_URL!,{headers:await headers()}))
  if(ctx.actor.kind!=='staff')redirect('/admin/login')
  return ctx
}
