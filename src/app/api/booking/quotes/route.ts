import {readBoundedJson} from '@/http/body'
import {requestContext} from '@/features/auth/context'
import {validateBookingSearch} from '@/features/booking/search'
import {readQuoteBrowser,setQuoteBrowser} from '@/features/booking/quote-session'
import {quoteStay} from '@/domain/quotes/issue'
import {quoteRequestSchema} from '@/domain/quotes/validation'
import {InventoryInputError} from '@/domain/inventory/policy'
export async function POST(request:Request){
  let input
  try{input=quoteRequestSchema.parse(await readBoundedJson(request));validateBookingSearch(input.stay)}catch{return Response.json({error:'Review the stay dates and guest count.'},{status:400})}
  try{
    const ctx=await requestContext(request)
    if(ctx.actor.kind==='staff')return Response.json({error:'Use a customer or guest session for personal checkout.'},{status:403})
    ctx.browserKey=readQuoteBrowser(request,true)!
    const quote=await quoteStay(ctx,input),response=Response.json(quote,{status:201})
    setQuoteBrowser(response.headers,ctx.browserKey)
    return response
  }catch(error){return Response.json({error:error instanceof InventoryInputError?'Review the stay dates and guest count.':'Pricing is being prepared. Please contact Acornelia.'},{status:error instanceof InventoryInputError?400:503})}
}
