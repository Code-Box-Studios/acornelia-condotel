import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {attachClaim} from '@/domain/claims/attach'
import type {ClaimEvidence} from '@/domain/claims/types'
export async function POST(request:Request){
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}
  try{
    const ctx=await requestContext(request)
    if(ctx.actor.kind!=='customer')return Response.json({error:'Sign in to the reviewed customer account, then reopen this email link.'},{status:401,headers})
    const result=await attachClaim(ctx,await readBoundedJson(request) as ClaimEvidence)
    if(!result.ok)throw new Error('Unavailable')
    return Response.json({state:'claimed'},{headers})
  }catch{return Response.json({error:'This reviewed claim link is unavailable. Contact Acornelia for help.'},{status:409,headers})}
}
