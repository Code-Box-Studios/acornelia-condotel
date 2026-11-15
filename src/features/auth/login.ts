import {createLocalReq,loginOperation,logoutOperation,type Payload} from 'payload'
import {generatePayloadCookie,generateExpiredPayloadCookie} from 'payload/shared'
import {z} from 'zod'
import type {CommandContext} from '@/domain/db/types'
import type {Principal} from '@/domain/shared/types'
import {recordRefusedAttempt} from '@/domain/audit/events'
import {normalizedEmail,dummyPasswordWork,assertCustomerAuthAvailable} from './actions'
const credentials=z.object({email:normalizedEmail,password:z.string().min(1).max(128)}).strict()
export async function loginCustomer(ctx:CommandContext,payload:Payload,input:unknown,headers:Headers):Promise<{cookie:string;principal:Principal}>{
  assertCustomerAuthAvailable(ctx)
  const parsed=credentials.parse(input),collection=payload.collections.customers,auth=collection.config.auth
  if(!auth)throw new Error('Customer access is unavailable')
  const found=(await payload.find({collection:'customers',where:{email:{equals:parsed.email}},limit:1,overrideAccess:true})).docs[0]
  const refused=()=>recordRefusedAttempt(payload,ctx.actor,{action:'customer:login',recordType:'customers',outcome:'refused',safeChanges:{reasonCode:'invalid-credentials'}})
  if(!found||found.lockUntil&&Date.parse(found.lockUntil)>Date.now()){
    await dummyPasswordWork(payload,parsed.password)
    await refused()
    throw new Error('Email or password is incorrect')
  }
  const current=await payload.auth({headers}),req=await createLocalReq({user:current.user??undefined,req:{headers}},payload)
  try{
    const result=await loginOperation({collection,data:parsed,req,overrideAccess:false})
    if(!result.user||!result.token)throw new Error('Authentication did not produce a session')
    return {cookie:generatePayloadCookie({collectionAuthConfig:auth,cookiePrefix:payload.config.cookiePrefix,token:result.token!}),principal:{kind:'customer',collection:'customers',id:result.user.id}}
  }catch{await refused();throw new Error('Email or password is incorrect')}
}
export async function logoutCustomer(payload:Payload,headers:Headers):Promise<string>{
  const current=await payload.auth({headers})
  const slug=current.user?.collection||'customers',collection=payload.collections[slug]
  if(current.user){const req=await createLocalReq({user:current.user,req:{headers}},payload);await logoutOperation({collection,req,allSessions:false})}
  const auth=collection.config.auth
  if(!auth)throw new Error('Account access is unavailable')
  return generateExpiredPayloadCookie({collectionAuthConfig:auth,cookiePrefix:payload.config.cookiePrefix})
}
