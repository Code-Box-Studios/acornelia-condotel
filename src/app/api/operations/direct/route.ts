import {z,ZodError} from 'zod'
import {readBoundedJson} from '@/http/body'
import {requestContext} from '@/features/auth/context'
import {readQuoteBrowser,setQuoteBrowser} from '@/features/booking/quote-session'
import {quoteStay} from '@/domain/quotes/issue'
import {acceptQuote} from '@/domain/quotes/accept'
import {quoteRequestSchema,toPublicQuote} from '@/domain/quotes/validation'
import {assertDirectStaff,requireDirectPolicy} from '@/domain/bookings/direct-policy'
import {createDirectBooking,directInputSchema} from '@/domain/bookings/direct'
import {closeDirectCommand,readDirectResult} from '@/domain/bookings/direct-recovery'
import {recordOfflineCollection} from '@/domain/payments/offline'
import {offlineCollectionSchema} from '@/domain/payments/offline-validation'
import {directSummary} from '@/admin/direct-booking/read'
import {relationshipId} from '@/features/customer/bookings'
const inputSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('quote'),stay:quoteRequestSchema.shape.stay}).strict(),
  z.object({action:z.literal('accept'),quoteId:z.uuid(),version:z.number().int().positive()}).strict(),
  z.object({action:z.literal('create'),input:directInputSchema}).strict(),
  z.object({action:z.literal('receipt'),input:offlineCollectionSchema}).strict(),
  z.object({action:z.literal('close'),quoteId:z.uuid(),commandKey:z.uuid()}).strict(),
])
function response(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})}
export async function POST(request:Request){
  try{
    const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return response({error:'Staff access required.'},401)
    const staffId=ctx.actor.id,value=inputSchema.parse(await readBoundedJson(request))
    if(value.action==='close'){const result=await closeDirectCommand(ctx,value.quoteId,value.commandKey);return response(result.state==='saved'?{state:'saved',booking:await directSummary(ctx,result.booking)}:result)}
    if(value.action==='receipt'){const payment=await recordOfflineCollection(ctx,value.input);return response({state:'recorded',id:payment.id,applied:payment.appliedRevision!=null},201)}
    if(value.action==='create')return response({state:'saved',booking:await directSummary(ctx,await createDirectBooking(ctx,value.input))},201)
    await ctx.uow.run(ctx.actor,tx=>requireDirectPolicy(tx,ctx,true))
    if(value.action==='accept'){
      const owned=await ctx.uow.run(ctx.actor,async tx=>{const quote=await tx.payload.findByID({collection:'quotes',id:value.quoteId,depth:0,req:tx.req,overrideAccess:false});return quote.scope==='staff-direct'&&relationshipId(quote.issuerStaff)===staffId})
      if(!owned)throw new Error('Staff quote required')
      await acceptQuote(ctx,value.quoteId,value.version);return response({state:'accepted'})
    }
    ctx.browserKey=readQuoteBrowser(request,true)!
    const quote=await quoteStay(ctx,{stay:value.stay}),commandKey=await ctx.uow.run(ctx.actor,async tx=>(await tx.payload.findByID({collection:'quotes',id:quote.id,depth:0,req:tx.req,overrideAccess:false})).directCommandKey)
    const result=response({quote:toPublicQuote(quote),commandKey},201);setQuoteBrowser(result.headers,ctx.browserKey);return result
  }catch(error){return response({error:error instanceof ZodError||error instanceof SyntaxError?'Review the booking and receipt fields.':'The entry could not be completed. Check its saved result and review the original receipt before starting again.'},error instanceof ZodError||error instanceof SyntaxError?400:409)}
}
export async function GET(request:Request){
  try{
    const ctx=await requestContext(request);assertDirectStaff(ctx)
    const {commandKey}=z.object({commandKey:z.uuid()}).strict().parse(Object.fromEntries(new URL(request.url).searchParams)),booking=await readDirectResult(ctx,commandKey)
    if(booking)return response({state:'saved',booking:await directSummary(ctx,booking)})
    const closed=await ctx.uow.run(ctx.actor,tx=>tx.payload.count({collection:'direct-command-closures',where:{and:[{commandKey:{equals:commandKey}},{staff:{equals:ctx.actor.kind==='staff'?ctx.actor.id:''}}]},req:tx.req,overrideAccess:false}))
    return response({state:closed.totalDocs?'closed':'checking'})
  }catch{return response({error:'The original staff entry is unavailable.'},404)}
}
