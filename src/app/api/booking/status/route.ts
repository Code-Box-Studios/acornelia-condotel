import {fenced} from '@/http/fence'
import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readStatusCookie} from '@/features/booking/status-http'
import {CheckoutPollLimited,readCheckoutStatus} from '@/features/booking/status'
async function handleGET(request:Request){
  try{
    const url=new URL(request.url)
    if([...url.searchParams.keys()].length!==1||url.searchParams.getAll('bookingId').length!==1)return Response.json({error:'Invalid checkout reference.'},{status:400})
    const bookingId=z.uuid().parse(url.searchParams.get('bookingId')),capability=readStatusCookie(request,bookingId)
    if(!capability)return Response.json({error:'Private checkout access is unavailable.'},{status:401})
    const result=await readCheckoutStatus(await requestContext(request),capability)
    if(result.bookingId!==bookingId)return Response.json({error:'Private checkout access is unavailable.'},{status:401})
    return Response.json(result,{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
  }catch(error){return Response.json({error:error instanceof CheckoutPollLimited?'Wait before checking payment again.':'Private checkout access is unavailable.'},{status:error instanceof CheckoutPollLimited?429:401,headers:{'Cache-Control':'private, no-store',...(error instanceof CheckoutPollLimited?{'Retry-After':'60'}:{})}})}
}
export const GET=fenced('private-link',handleGET)
