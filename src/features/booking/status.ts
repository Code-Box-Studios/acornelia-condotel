import {z} from 'zod'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking} from '@/payload-types'
import {parseEnvironment} from '@/config/env'
import {parseRuntimePolicy} from '@/domain/policy/parse'
import {acceptedQuote,pricingPolicySchema} from '@/domain/quotes/validation'
import {relationshipId,requireCustomer} from '@/features/customer/bookings'
import {matchesPrivateDigest,opaqueSecret,privateDigest} from '@/domain/security/private-state'
import {appendAudit} from '@/domain/audit/append'
import {approvedCheckoutUrl} from '@/integrations/maya/urls'
import {parseMoney} from '@/domain/shared/money'
import {checkoutStatusPolicySchema,sqlError} from '@/domain/bookings/validation'
import {enqueue} from '@/domain/work/enqueue'
export type CheckoutStatus={bookingId:string;state:'preparing'|'ready'|'checking'|'confirmed'|'closed';canPay:boolean;total:{minor:string;currency:string};deadline:string|null;code:string|null;roomName:string;arrival:string;departure:string;adults:number;children:number;timezone:string}
export class CheckoutAccessUnavailable extends Error{constructor(){super('Private checkout access is unavailable')}}
export class CheckoutPollLimited extends Error{constructor(){super('Wait before checking payment again')}}
const capabilitySchema=z.string().regex(/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/)
function privateMode(ctx:CommandContext){if(parseEnvironment(process.env).operationMode!=='normal'||!['anonymous','customer'].includes(ctx.actor.kind)||!ctx.browserKey||!/^[A-Za-z0-9_-]{43}$/.test(ctx.browserKey))throw new CheckoutAccessUnavailable()}
async function ownBooking(tx:DbTx,ctx:CommandContext,booking:Booking){
  if(ctx.actor.kind==='customer')await requireCustomer(tx)
  if(!ctx.browserKey||!matchesPrivateDigest('checkout-browser\0'+ctx.browserKey,booking.checkoutBrowserHash||''))throw new CheckoutAccessUnavailable()
  const owner=relationshipId(booking.ownerCustomer)
  if(owner&&(ctx.actor.kind!=='customer'||ctx.actor.id!==owner))throw new CheckoutAccessUnavailable()
}
async function originalQuote(tx:DbTx,booking:Booking){
  const id=relationshipId(booking.checkoutQuote);if(!id)throw new CheckoutAccessUnavailable()
  return acceptedQuote(await tx.payload.findByID({collection:'quotes',id,depth:0,req:tx.req,overrideAccess:false}))
}
async function limits(tx:DbTx,booking:Booking){const quote=await originalQuote(tx,booking),policy=parseRuntimePolicy(quote.policySnapshot,['checkoutStatus']);return checkoutStatusPolicySchema.parse(policy.sections.checkoutStatus)}
async function counter(tx:DbTx,ctx:CommandContext,identity:string,limit:number){
  const window=Math.floor(Date.parse(ctx.clock.now())/60000),key=privateDigest('checkout-poll\0'+identity+'\0'+window)
  const row=(await tx.payload.find({collection:'auth-throttles',where:{key:{equals:key}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(row){if(row.count>=limit)throw new CheckoutPollLimited();await tx.payload.update({collection:'auth-throttles',id:row.id,data:{count:row.count+1},req:tx.req,overrideAccess:false})}
  else await tx.payload.create({collection:'auth-throttles',data:{key,count:1,expiresAt:new Date((window+1)*60000).toISOString()},req:tx.req,overrideAccess:false})
}
async function command<T>(ctx:CommandContext,callback:(tx:DbTx)=>Promise<T>):Promise<T>{
  privateMode(ctx)
  for(let retry=0;;retry++)try{return await ctx.uow.run(ctx.actor,callback)}catch(error){
    const row=error as {name?:string;data?:{errors?:{path?:string}[]}},sql=sqlError(error)
    if(retry<3&&(sql.code==='23505'&&sql.constraint==='auth_throttles_key_idx'||row.name==='ValidationError'&&row.data?.errors?.some(field=>field.path==='key')))continue
    throw error
  }
}
export async function issueCheckoutAccess(ctx:CommandContext,bookingId:string):Promise<{capability:string;expiresAt:string}>{
  z.uuid().parse(bookingId)
  return command(ctx,async tx=>{
    const booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
    await ownBooking(tx,ctx,booking)
    const config=await limits(tx,booking)
    if(!booking.preparedAt)throw new CheckoutAccessUnavailable()
    const expiresAt=new Date(Date.parse(booking.preparedAt)+config.minutes*60000).toISOString()
    if(Date.parse(expiresAt)<=Date.parse(ctx.clock.now()))throw new CheckoutAccessUnavailable()
    await counter(tx,ctx,'grant\0'+bookingId+'\0'+ctx.browserKey,10)
    const token=opaqueSecret(),row=await tx.payload.create({collection:'booking-views',data:{booking:bookingId,purpose:'checkout-status',browserHash:privateDigest('checkout-status-browser\0'+ctx.browserKey),customer:ctx.actor.kind==='customer'?ctx.actor.id:undefined,tokenHash:privateDigest('checkout-status\0'+token),expiresAt},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'checkout:status-access-issued',recordType:'booking-views',recordId:row.id,outcome:'success'})
    return {capability:row.id+'.'+token,expiresAt}
  })
}
export async function checkoutByCommand(ctx:CommandContext,key:string):Promise<{bookingId:string}|null>{
  z.uuid().parse(key)
  return command(ctx,async tx=>{
    const booking=(await tx.payload.find({collection:'bookings',where:{checkoutKey:{equals:key}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(!booking)return null
    await ownBooking(tx,ctx,booking)
    return {bookingId:booking.id}
  })
}
async function verifyAccess(tx:DbTx,ctx:CommandContext,capability:string){
  capabilitySchema.parse(capability);const [id,token]=capability.split('.')
  const view=(await tx.payload.find({collection:'booking-views',where:{id:{equals:id}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
  if(!view||view.purpose!=='checkout-status'||view.revokedAt||Date.parse(view.expiresAt)<=Date.parse(ctx.clock.now())||!matchesPrivateDigest('checkout-status\0'+token,view.tokenHash)||!matchesPrivateDigest('checkout-status-browser\0'+ctx.browserKey,view.browserHash||''))throw new CheckoutAccessUnavailable()
  const customer=relationshipId(view.customer)
  if(customer&&(ctx.actor.kind!=='customer'||ctx.actor.id!==customer))throw new CheckoutAccessUnavailable()
  const booking=await tx.payload.findByID({collection:'bookings',id:relationshipId(view.booking)!,depth:0,req:tx.req,overrideAccess:false})
  await ownBooking(tx,ctx,booking)
  return booking
}
async function projection(tx:DbTx,ctx:CommandContext,booking:Booking):Promise<{status:CheckoutStatus;destination:string|null}>{
  const quote=await originalQuote(tx,booking),total=quote.total
  const attempts=(await tx.payload.find({collection:'payment-attempts',where:{commandKey:{equals:booking.checkoutKey!}},limit:2,depth:0,req:tx.req,overrideAccess:false})).docs
  if(attempts.length>1)throw new CheckoutAccessUnavailable()
  const attempt=attempts[0]
  let state:CheckoutStatus['state']='checking',destination:string|null=null
  if(['cancelled','expired','completed'].includes(booking.status))state='closed'
  else if(booking.status==='confirmed'){
    const zero=total.minor==='0'&&pricingPolicySchema.parse(quote.policySnapshot.sections.pricing).zeroTotal==='confirm-without-payment'
    const money=zero?null:await tx.payload.find({collection:'payment-transactions',where:{and:[{booking:{equals:booking.id}},{status:{equals:'collected'}},{appliedRevision:{equals:booking.revision}},{amountMinor:{equals:total.minor}},{currency:{equals:total.currency}}]},limit:1,depth:0,req:tx.req,overrideAccess:false})
    if(zero||money?.docs.length)state='confirmed'
  }else if(attempt?.state==='closed')state='closed'
  else if(attempt&&Date.parse(attempt.deadline)>Date.parse(ctx.clock.now())){
    if(attempt.state==='preparing')state='preparing'
    if(attempt.state==='ready'&&attempt.providerCheckoutId&&attempt.checkoutUrl&&attempt.providerEnvironment){
      try{destination=approvedCheckoutUrl(attempt.providerEnvironment,attempt.providerCheckoutId,attempt.checkoutUrl);state='ready'}catch{/* Keep checking an unverified provider association. */}
    }
  }
  if(attempt&&(attempt.amountMinor!==total.minor||attempt.currency!==total.currency||relationshipId(attempt.booking)!==booking.id))throw new CheckoutAccessUnavailable()
  return {status:{bookingId:booking.id,state,canPay:state==='ready'&&!!destination,total:parseMoney(total),deadline:attempt?.deadline??null,code:state==='confirmed'?booking.code??null:null,roomName:quote.roomType.name,arrival:quote.stay.arrival,departure:quote.stay.departure,adults:quote.stay.occupancy.adults,children:quote.stay.occupancy.children,timezone:(quote.policySnapshot.sections.stay as {timezone:string}).timezone},destination}
}
export async function readCheckoutStatus(ctx:CommandContext,capability:string):Promise<CheckoutStatus>{
  return command(ctx,async tx=>{const booking=await verifyAccess(tx,ctx,capability),config=await limits(tx,booking);await counter(tx,ctx,booking.id+'\0'+ctx.browserKey,config.pollPerMinute);return (await projection(tx,ctx,booking)).status})
}
export async function checkoutDestination(ctx:CommandContext,capability:string,bookingId:string):Promise<string>{
  return command(ctx,async tx=>{
    const booking=await verifyAccess(tx,ctx,capability)
    if(booking.id!==bookingId)throw new CheckoutAccessUnavailable()
    await counter(tx,ctx,'handoff\0'+booking.id+'\0'+ctx.browserKey,10)
    const result=await projection(tx,ctx,booking)
    if(!result.status.canPay||!result.destination)throw new CheckoutAccessUnavailable()
    privateMode(ctx)
    const attempt=(await tx.payload.find({collection:'payment-attempts',where:{commandKey:{equals:booking.checkoutKey!}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
    if(!attempt||attempt.state!=='ready')throw new CheckoutAccessUnavailable()
    await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'pending'},req:tx.req,overrideAccess:false})
    await enqueue(tx,{semanticKey:'reconcile-payment:'+attempt.id+':handoff',kind:'reconcile-payment',payload:{attemptId:attempt.id},availableAt:ctx.clock.now()})
    await appendAudit(tx,{action:'checkout:handed-off',recordType:'payment-attempts',recordId:attempt.id,outcome:'success',safeChanges:{state:'pending'}})
    return result.destination
  })
}
