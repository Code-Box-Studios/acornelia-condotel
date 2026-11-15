import {checkoutInputSchema} from '@/domain/bookings/validation'
import {startCheckout} from '@/domain/bookings/start-checkout'
import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
export async function POST(request:Request){
  let input
  try{input=checkoutInputSchema.parse(await readBoundedJson(request))}catch{return Response.json({state:'rejected',code:'invalid-input'},{status:400})}
  try{
    const result=await startCheckout(await requestContext(request),input)
    const status=result.state==='rejected'?(result.code==='access-required'?401:result.code==='configuration-unavailable'?503:409):result.state==='preparing'?202:200
    return Response.json(result,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
  }catch{return Response.json({state:'rejected',code:'temporarily-unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}})}
}
