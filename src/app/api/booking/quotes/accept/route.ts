import {fenced} from '@/http/fence'
import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {acceptQuote} from '@/domain/quotes/accept'
import {toPublicQuote} from '@/domain/quotes/validation'
async function handlePOST(request:Request){
  try{
    const input=z.object({quoteId:z.uuid(),version:z.number().int().positive()}).strict().parse(await readBoundedJson(request)),ctx=await requestContext(request)
    if(ctx.actor.kind==='staff')return Response.json({error:'Use a customer or guest session for personal checkout.'},{status:403})
    const quote=await acceptQuote(ctx,input.quoteId,input.version)
    return Response.json({quote:toPublicQuote(quote),acceptedAt:quote.acceptedAt})
  }catch{return Response.json({error:'This quote is unavailable or expired. Request a fresh price.'},{status:400})}
}
export const POST=fenced('business-write',handlePOST)
