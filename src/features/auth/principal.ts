import type {Principal} from '@/domain/shared/types'
import {getDatabase} from '@/domain/db/payload'
import type {Payload} from 'payload'
export async function principalFromHeaders(headers:Headers,payload:Payload):Promise<Principal>{
  const {user}=await payload.auth({headers})
  if(!user||('deactivated' in user&&user.deactivated))return {kind:'anonymous'}
  if(user.collection==='customers')return {kind:'customer',collection:'customers',id:user.id}
  if(user.collection==='staff-users'&&['staff','developer'].includes(user.role))return {kind:'staff',collection:'staff-users',id:user.id,role:user.role}
  return {kind:'anonymous'}
}
export async function resolvePrincipal(request:Request):Promise<Principal>{return principalFromHeaders(request.headers,await getDatabase())}
