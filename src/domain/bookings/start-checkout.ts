import {randomBytes} from 'node:crypto'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {Booking} from '@/payload-types'
import type {CheckoutInput,CheckoutResult} from './types'
import {checkoutInputSchema,checkoutPolicySchema,CheckoutRefused,sqlError} from './validation'
import {parseEnvironment} from '@/config/env'
import {acceptedQuote,pricingPolicySchema,quoteIdentity} from '@/domain/quotes/validation'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {allocate,InventoryConflict} from '@/domain/inventory/allocate'
import {InventoryInputError} from '@/domain/inventory/policy'
import {privateDigest,matchesPrivateDigest} from '@/domain/security/private-state'
import {CustomerAccessError,relationshipId,requireCustomer} from '@/features/customer/bookings'
import {dateToStorage} from '@/domain/shared/dates'
import {reserveOffer,consumeOffer} from '@/domain/offers/reserve'
import {OfferUnavailable} from '@/domain/offers/storage'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {parseMoney} from '@/domain/shared/money'
function assertCheckoutMode(){if(parseEnvironment(process.env).operationMode!=='normal')throw new CheckoutRefused('configuration-unavailable')}
async function existingResult(tx:DbTx,ctx:CommandContext,booking:Booking,fingerprint:string):Promise<CheckoutResult>{
  if(!ctx.browserKey||!matchesPrivateDigest('checkout-browser\0'+ctx.browserKey,booking.checkoutBrowserHash||''))throw new CheckoutRefused('access-required')
  const owner=relationshipId(booking.ownerCustomer)
  if(owner&&(ctx.actor.kind!=='customer'||owner!==ctx.actor.id))throw new CheckoutRefused('access-required')
  if(booking.checkoutFingerprint!==fingerprint)throw new CheckoutRefused('command-conflict')
  const rows=await tx.payload.find({collection:'payment-attempts',where:{commandKey:{equals:booking.checkoutKey!}},limit:2,depth:0,req:tx.req,overrideAccess:false})
  if(rows.docs.length>1)throw new Error('Checkout requires operator review')
  if(['cancelled','expired','completed'].includes(booking.status))throw new CheckoutRefused('already-prepared')
  const attempt=rows.docs[0],snapshot=booking.acceptedQuote as {total?:unknown},total=parseMoney(snapshot.total)
  if(booking.status==='confirmed')return {state:'confirmed',bookingId:booking.id,attemptId:attempt?.id??null,revision:attempt?.revision??booking.revision,deadline:attempt?.deadline??null,total}
  if(!attempt||relationshipId(attempt.booking)!==booking.id)throw new Error('Prepared checkout has no matching attempt')
  if(attempt.state==='closed')throw new CheckoutRefused('already-prepared')
  // A retry reads the frozen original. Public quote/offer expiry never edits it.
  return {state:attempt.state==='preparing'?'preparing':attempt.state==='ready'?'ready':'checking',bookingId:booking.id,attemptId:attempt.id,revision:attempt.revision,deadline:attempt.deadline,total:{minor:attempt.amountMinor,currency:attempt.currency}}
}
export async function startCheckout(ctx:CommandContext,input:CheckoutInput):Promise<CheckoutResult>{
  const parsed=checkoutInputSchema.safeParse(input)
  if(!parsed.success)return {state:'rejected',code:'invalid-input'}
  if(!['anonymous','customer'].includes(ctx.actor.kind))return {state:'rejected',code:'access-required'}
  const value=parsed.data,fingerprint=privateDigest('checkout-command\0'+JSON.stringify(value))
  try{
    assertCheckoutMode()
    // Exclusion/command-key races require a fresh whole transaction, never a query in an aborted one.
    for(let conflict=0;conflict<4;conflict++){
      try{return await ctx.uow.run(ctx.actor,async tx=>{
        assertCheckoutMode()
        if(ctx.actor.kind==='customer')await requireCustomer(tx)
        const previous=(await tx.payload.find({collection:'bookings',where:{checkoutKey:{equals:value.commandKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
        if(previous)return existingResult(tx,ctx,previous,fingerprint)
        const quote=(await tx.payload.find({collection:'quotes',where:{id:{equals:value.quoteId}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
        if(!quote)throw new CheckoutRefused('quote-unavailable')
        try{await quoteIdentity(tx,ctx,quote)}catch{throw new CheckoutRefused('access-required')}
        if(quote.version!==value.version||!quote.acceptedAt)throw new CheckoutRefused('quote-unavailable')
        if(relationshipId(quote.consumedByBooking))throw new CheckoutRefused('already-prepared')
        const now=ctx.clock.now()
        if(Date.parse(quote.expiresAt)<=Date.parse(now))throw new CheckoutRefused('quote-expired')
        const saved=acceptedQuote(quote)
        let terms
        try{
          const current=await requireCurrentPolicy(tx,ctx,['stay','pricing','checkout',...(saved.offerVersionId?['offers']:[])])
          if(current.id!==saved.policyVersionId||current.revision!==saved.policyRevision)throw new Error('Policy changed')
          terms=checkoutPolicySchema.parse(current.sections.checkout)
        }catch{throw new CheckoutRefused('configuration-unavailable')}
        const stayingGuest=value.stayingGuest??value.contact.name
        if(!terms.thirdPartyBookings&&(stayingGuest.toLowerCase()!==value.contact.name.toLowerCase()||ctx.actor.kind==='customer'&&tx.req.user?.email.toLowerCase()!==value.contact.email))throw new CheckoutRefused('contact-not-allowed')
        const zero=saved.total.minor==='0'
        if(zero&&pricingPolicySchema.parse(saved.policySnapshot.sections.pricing).zeroTotal!=='confirm-without-payment')throw new CheckoutRefused('configuration-unavailable')
        const deadline=new Date(Date.parse(now)+terms.holdMinutes*60000).toISOString()
        const booking=await tx.payload.create({collection:'bookings',data:{ownerCustomer:ctx.actor.kind==='customer'?ctx.actor.id:undefined,checkoutKey:value.commandKey,checkoutFingerprint:fingerprint,checkoutBrowserHash:privateDigest('checkout-browser\0'+ctx.browserKey),checkoutQuote:saved.id,preparedAt:now,status:zero?'confirmed':'held',revision:1,arrival:dateToStorage(saved.stay.arrival),departure:dateToStorage(saved.stay.departure),acceptedQuote:saved,contact:value.contact,stayingGuest,source:'website',...(zero?{code:'ACN-'+randomBytes(8).toString('hex').toUpperCase()}:{})},req:tx.req,overrideAccess:false})
        await tx.payload.update({collection:'quotes',id:quote.id,data:{consumedByBooking:booking.id},req:tx.req,overrideAccess:false})
        await allocate(tx,{purpose:zero?'booking':'hold',bookingId:booking.id,stay:saved.stay,policy:saved.policySnapshot,now,...(!zero?{deadline}:{})})
        const usage=saved.offerVersionId?await reserveOffer(tx,saved,now):null
        let attemptId:string|null=null
        if(zero){
          if(usage)await consumeOffer(tx,usage.id,now)
          await enqueue(tx,{semanticKey:`booking-confirmation:${booking.id}:1`,kind:'email',payload:{category:'booking',bookingId:booking.id,revision:1},availableAt:now})
        }else{
          const attempt=await tx.payload.create({collection:'payment-attempts',data:{booking:booking.id,merchantReference:'ACN'+randomBytes(12).toString('hex'),commandKey:value.commandKey,fingerprint,amountMinor:saved.total.minor,currency:saved.total.currency,acceptedContext:{quote:saved,ownerCustomerId:ctx.actor.kind==='customer'?ctx.actor.id:null,contact:value.contact,stayingGuest,deadline,purpose:'booking',revision:1},purpose:'booking',revision:1,state:'preparing',deadline},req:tx.req,overrideAccess:false})
          attemptId=attempt.id
          await enqueue(tx,{semanticKey:'checkout:'+attempt.id,kind:'create-checkout',payload:{attemptId:attempt.id},availableAt:now})
        }
        await appendAudit(tx,{action:'checkout:prepared',recordType:'bookings',recordId:booking.id,outcome:'success',safeChanges:{amountMinor:saved.total.minor,currency:saved.total.currency,revision:1,status:booking.status}})
        if(zero)return {state:'confirmed',bookingId:booking.id,attemptId:null,revision:1,deadline:null,total:saved.total}
        return {state:'preparing',bookingId:booking.id,attemptId:attemptId!,revision:1,deadline,total:saved.total}
      })}catch(error){
        const sql=sqlError(error),retry=error instanceof InventoryConflict||sql.code==='23505'&&['bookings_checkout_key_idx','payment_attempts_command_key_idx','work_items_semantic_key_idx','payment_attempts_merchant_reference_idx','bookings_code_idx'].includes(sql.constraint||'')
        if(retry&&conflict<3)continue
        throw error
      }
    }
    throw new Error('Checkout conflict retries exhausted')
  }catch(error){
    if(error instanceof CheckoutRefused)return {state:'rejected',code:error.code}
    if(error instanceof CustomerAccessError)return {state:'rejected',code:'access-required'}
    if(error instanceof InventoryConflict||error instanceof InventoryInputError)return {state:'rejected',code:'unavailable'}
    if(error instanceof OfferUnavailable)return {state:'rejected',code:'offer-unavailable'}
    throw error
  }
}
