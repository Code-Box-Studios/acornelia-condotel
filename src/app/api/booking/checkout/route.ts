import {fenced} from '@/http/fence'
import {checkoutInputSchema} from '@/domain/bookings/validation'
import {startCheckout} from '@/domain/bookings/start-checkout'
import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {setCheckoutAccess} from '@/features/booking/status-http'
import {checkoutByCommand} from '@/features/booking/status'
import {clearDraftCookies} from '@/features/booking/draft-http'
import {configuredMayaGateway} from '@/integrations/maya/configured'
import {acceptedQuote,quoteIdentity} from '@/domain/quotes/validation'
import {CheckoutAccessUnavailable,CheckoutPollLimited} from '@/features/booking/status'
async function handlePOST(request:Request){
  let input
  try{input=checkoutInputSchema.parse(await readBoundedJson(request))}catch{return Response.json({state:'rejected',code:'invalid-input'},{status:400})}
  try{
    const ctx=await requestContext(request)
    if(process.env.APP_ENV!=='test'&&!configuredMayaGateway(ctx.policy)&&!await checkoutByCommand(ctx,input.commandKey)){
      const zero=await ctx.uow.run(ctx.actor,async tx=>{const quote=await tx.payload.findByID({collection:'quotes',id:input.quoteId,depth:0,req:tx.req,overrideAccess:false});await quoteIdentity(tx,ctx,quote);return acceptedQuote(quote).total.minor==='0'})
      if(!zero)return Response.json({state:'rejected',code:'configuration-unavailable'},{status:503})
    }
    const result=await startCheckout(ctx,input)
    const status=result.state==='rejected'?(result.code==='access-required'?401:result.code==='configuration-unavailable'?503:409):result.state==='preparing'?202:200
    const response=Response.json(result,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
    if(result.state!=='rejected'){await setCheckoutAccess(response.headers,ctx,result.bookingId);clearDraftCookies(response.headers)}
    return response
  }catch(error){return Response.json({state:'rejected',code:error instanceof CheckoutAccessUnavailable?'access-required':'temporarily-unavailable'},{status:error instanceof CheckoutAccessUnavailable?401:error instanceof CheckoutPollLimited?429:503,headers:{'Cache-Control':'private, no-store',...(error instanceof CheckoutPollLimited?{'Retry-After':'60'}:{})}})}
}
async function handleGET(request:Request){
  try{
    const url=new URL(request.url)
    if([...url.searchParams.keys()].length!==1||url.searchParams.getAll('commandKey').length!==1)return Response.json({error:'Invalid checkout reference.'},{status:400})
    const ctx=await requestContext(request),receipt=await checkoutByCommand(ctx,url.searchParams.get('commandKey')!)
    if(!receipt)return Response.json({error:'No saved checkout was found yet.'},{status:404})
    const response=Response.json(receipt,{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
    await setCheckoutAccess(response.headers,ctx,receipt.bookingId)
    return response
  }catch(error){return Response.json({error:error instanceof CheckoutPollLimited?'Wait before checking payment again.':'Private checkout access is unavailable.'},{status:error instanceof CheckoutPollLimited?429:401,headers:{'Cache-Control':'private, no-store',...(error instanceof CheckoutPollLimited?{'Retry-After':'60'}:{})}})}
}
export const POST=fenced('business-write',handlePOST)
export const GET=fenced('business-write',handleGET)
