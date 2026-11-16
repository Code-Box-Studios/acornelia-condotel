import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readStatusCookie} from '@/features/booking/status-http'
import {CheckoutAccessUnavailable,CheckoutPollLimited,requestCheckoutResume} from '@/features/booking/status'
import {readBoundedJson} from '@/http/body'
export async function POST(request:Request){
  try{
    const {bookingId}=z.object({bookingId:z.uuid()}).strict().parse(await readBoundedJson(request))
    const capability=readStatusCookie(request,bookingId)
    if(!capability)throw new CheckoutAccessUnavailable()
    await requestCheckoutResume(await requestContext(request),capability,bookingId)
    return Response.json({state:'checking'},{status:202,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
  }catch(error){return Response.json({error:error instanceof CheckoutPollLimited?'Wait before checking payment again.':'The original checkout cannot be reopened yet. Keep checking or contact Acornelia.'},{status:error instanceof CheckoutAccessUnavailable?401:error instanceof CheckoutPollLimited?429:409,headers:{'Cache-Control':'private, no-store',...(error instanceof CheckoutPollLimited?{'Retry-After':'60'}:{})}})}
}
