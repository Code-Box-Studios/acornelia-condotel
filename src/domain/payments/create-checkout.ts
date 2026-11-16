import {prepareChangeCheckout,changeStillPayable} from '@/domain/changes/dispatch'
import type {CommandContext} from '@/domain/db/types'
import type {WorkLease,WorkResult} from '@/domain/work/types'
import type {MayaGateway} from '@/integrations/maya/types'
import {isDeepStrictEqual} from 'node:util'
import {z} from 'zod'
import {parseEnvironment} from '@/config/env'
import {assertWorker,fencedRow,workPolicy} from '@/domain/work/validation'
import {requireCurrentPolicy} from '@/domain/policy/current'
import {acceptedQuote} from '@/domain/quotes/validation'
import {relationshipId} from '@/features/customer/bookings'
import {enqueue} from '@/domain/work/enqueue'
import {appendAudit} from '@/domain/audit/append'
import {approvedCheckoutUrl} from '@/integrations/maya/urls'
import type {CreateCheckoutResult} from '@/integrations/maya/types'
import {recoveryPolicy} from './recovery-policy'
export async function dispatchCheckout(ctx:CommandContext,lease:WorkLease,gateway:MayaGateway,signal?:AbortSignal):Promise<WorkResult>{
  assertWorker(ctx)
  const prepared=await ctx.uow.run(ctx.actor,async tx=>{
    const work=await fencedRow(tx,lease,ctx.clock.now()),limits=await workPolicy(ctx,tx)
    const currentPolicy=await requireCurrentPolicy(tx,ctx,['work','maya','paymentRecovery'])
    if(work.kind!=='create-checkout'||!work.dispatchStarted)throw new Error('Checkout dispatch requires its started work lease')
    const {attemptId}=z.object({attemptId:z.uuid()}).strict().parse(work.payload)
    const attempt=await tx.payload.findByID({collection:'payment-attempts',id:attemptId,depth:0,req:tx.req,overrideAccess:false})
    if(attempt.purpose==='change')return prepareChangeCheckout(tx,ctx,attempt,limits.backoffSeconds[0])
    const bookingId=relationshipId(attempt.booking)!,booking=await tx.payload.findByID({collection:'bookings',id:bookingId,depth:0,req:tx.req,overrideAccess:false})
    const context=z.object({quote:z.unknown(),ownerCustomerId:z.uuid().nullable(),contact:z.unknown(),stayingGuest:z.string(),deadline:z.string(),purpose:z.literal('booking'),revision:z.number().int().positive()}).strict().parse(attempt.acceptedContext)
    const quoteId=relationshipId(booking.checkoutQuote)
    if(!quoteId)throw new Error('Accepted checkout context is missing')
    const quoteRow=await tx.payload.findByID({collection:'quotes',id:quoteId,depth:0,req:tx.req,overrideAccess:false}),quote=acceptedQuote(quoteRow)
    const environment=z.enum(['sandbox','production']).parse((quote.policySnapshot.sections.maya as {environment?:unknown})?.environment)
    if(!quote.policySnapshot.approvedSections.includes('maya')||attempt.state!=='preparing'||booking.status!=='held'||attempt.purpose!=='booking'||attempt.revision!==booking.revision||attempt.commandKey!==booking.checkoutKey||attempt.fingerprint!==booking.checkoutFingerprint||relationshipId(quoteRow.consumedByBooking)!==bookingId||context.ownerCustomerId!==relationshipId(booking.ownerCustomer)||!isDeepStrictEqual(context.quote,quote)||!isDeepStrictEqual(booking.acceptedQuote,quote)||!isDeepStrictEqual(context.contact,booking.contact)||context.stayingGuest!==booking.stayingGuest||context.deadline!==attempt.deadline||context.revision!==attempt.revision||attempt.amountMinor!==quote.total.minor||attempt.currency!==quote.total.currency)throw new Error('Checkout operation no longer owns dispatch')
    const holds=await tx.payload.count({collection:'allocations',where:{and:[{booking:{equals:bookingId}},{purpose:{equals:'hold'}},{released:{equals:false}}]},req:tx.req,overrideAccess:false})
    if(holds.totalDocs!==1)throw new Error('Checkout has no exclusive room hold')
    const window=recoveryPolicy(currentPolicy).providerWindowMinutes*60000,timeout=z.number().int().positive().parse((currentPolicy.sections.maya as {timeoutMs?:unknown}).timeoutMs)
    if(Date.parse(attempt.deadline)-Date.parse(ctx.clock.now())<=window+timeout)return {kind:'window-refused' as const,attemptId:attempt.id}
    // Persist uncertainty and reconciliation before the one external create request.
    await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'unknown'},req:tx.req,overrideAccess:false})
    await enqueue(tx,{semanticKey:'reconcile-payment:'+attempt.id+':dispatch',kind:'reconcile-payment',payload:{attemptId:attempt.id},availableAt:new Date(Date.parse(ctx.clock.now())+limits.backoffSeconds[0]*1000).toISOString()})
    await appendAudit(tx,{action:'checkout:dispatch-owned',recordType:'payment-attempts',recordId:attempt.id,outcome:'unknown'})
    return {kind:'dispatch' as const,attempt:{id:attempt.id,bookingId,merchantReference:attempt.merchantReference,amount:{minor:attempt.amountMinor,currency:attempt.currency},revision:attempt.revision,deadline:attempt.deadline,synthetic:quote.synthetic},environment}
  })
  if(prepared.kind==='window-refused')return {state:'done',apply:async tx=>{
    const attempt=await tx.payload.findByID({collection:'payment-attempts',id:prepared.attemptId,depth:0,req:tx.req,overrideAccess:false})
    if(attempt.state!=='preparing')return
    await tx.payload.update({collection:'payment-attempts',id:attempt.id,data:{state:'closed',createOutcome:'refused',createRefusalCode:'code' in prepared?prepared.code:'window-too-short',createObservedAt:ctx.clock.now()},req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'checkout:not-dispatched',recordType:'payment-attempts',recordId:attempt.id,outcome:'refused',safeChanges:{reasonCode:'code' in prepared?prepared.code:'window-too-short'}})
  }}
  assertWorker(ctx)
  if(signal?.aborted||Date.parse(lease.expiresAt)<=Date.parse(ctx.clock.now())||Date.parse(prepared.attempt.deadline)<=Date.parse(ctx.clock.now()))throw new Error('Checkout dispatch deadline passed')
  if(prepared.environment!==parseEnvironment(process.env).mayaEnvironment)throw new Error('Checkout environment changed')
  const stillOwned=await ctx.uow.run(ctx.actor,async tx=>{
    await fencedRow(tx,lease,ctx.clock.now())
    const attempt=await tx.payload.findByID({collection:'payment-attempts',id:prepared.attempt.id,depth:0,req:tx.req,overrideAccess:false})
    const booking=await tx.payload.findByID({collection:'bookings',id:prepared.attempt.bookingId,depth:0,req:tx.req,overrideAccess:false})
    const observations=await tx.payload.count({collection:'payment-transactions',where:{attempt:{equals:attempt.id}},req:tx.req,overrideAccess:false})
    const evidence=await tx.payload.count({collection:'payment-inbox',where:{and:[{merchantReference:{equals:attempt.merchantReference}},{environment:{equals:prepared.environment}},{source:{equals:'retrieval'}}]},req:tx.req,overrideAccess:false})
    return attempt.state==='unknown'&&(attempt.purpose==='change'?await changeStillPayable(tx,booking,attempt):booking.status==='held')&&!observations.totalDocs&&!evidence.totalDocs
  })
  if(!stillOwned)return {state:'done'}
  assertWorker(ctx)
  if(signal?.aborted||Date.parse(lease.expiresAt)<=Date.parse(ctx.clock.now())||Date.parse(prepared.attempt.deadline)<=Date.parse(ctx.clock.now()))throw new Error('Checkout dispatch deadline passed')
  let result:CreateCheckoutResult
  try{result=await gateway.createCheckout(prepared.attempt,signal)}catch{result={kind:'unknown',environment:prepared.environment,reference:prepared.attempt.merchantReference}}
  if(result.kind==='created'){
    try{if(result.environment!==prepared.environment)throw new Error('Environment changed');approvedCheckoutUrl(result.environment,result.checkoutId,result.checkoutUrl)}catch{result={kind:'unknown',environment:prepared.environment,reference:prepared.attempt.merchantReference}}
  }
  const outcome=result
  return {state:outcome.kind==='unknown'?'uncertain':'done',...(outcome.kind==='unknown'?{reason:'timeout' as const}:{}),apply:async tx=>{
    const current=await tx.payload.findByID({collection:'payment-attempts',id:prepared.attempt.id,depth:0,req:tx.req,overrideAccess:false})
    const booking=await tx.payload.findByID({collection:'bookings',id:prepared.attempt.bookingId,depth:0,req:tx.req,overrideAccess:false})
    if(current.state!=='unknown')return
    const creation={createOutcome:outcome.kind,createObservedAt:ctx.clock.now()}
    if(outcome.kind==='created')await tx.payload.update({collection:'payment-attempts',id:current.id,data:{...creation,providerCheckoutId:outcome.checkoutId,providerEnvironment:outcome.environment,checkoutUrl:outcome.checkoutUrl,state:(current.purpose==='change'?await changeStillPayable(tx,booking,current):booking.status==='held')&&Date.parse(current.deadline)>Date.parse(ctx.clock.now())?'ready':'unknown'},req:tx.req,overrideAccess:false})
    if(outcome.kind==='refused')await tx.payload.update({collection:'payment-attempts',id:current.id,data:{...creation,state:'closed',createRefusalCode:outcome.reason},req:tx.req,overrideAccess:false})
    if(outcome.kind==='unknown')await tx.payload.update({collection:'payment-attempts',id:current.id,data:creation,req:tx.req,overrideAccess:false})
    await appendAudit(tx,{action:'checkout:dispatch-result',recordType:'payment-attempts',recordId:current.id,outcome:outcome.kind==='created'?'success':outcome.kind==='unknown'?'unknown':'refused',safeChanges:{state:outcome.kind==='created'?'ready':outcome.kind==='unknown'?'unknown':'closed'}})
  }}
}

export async function checkoutPreflight(ctx:CommandContext,lease:WorkLease):Promise<WorkResult|null>{
  assertWorker(ctx)
  return ctx.uow.run(ctx.actor,async tx=>{
    const work=await fencedRow(tx,lease,ctx.clock.now())
    if(work.kind!=='create-checkout')throw new Error('Invalid checkout work')
    const {attemptId}=z.object({attemptId:z.uuid()}).strict().parse(work.payload)
    const attempt=await tx.payload.findByID({collection:'payment-attempts',id:attemptId,depth:0,req:tx.req,overrideAccess:false})
    return attempt.state==='preparing'?null:{state:'done'}
  })
}
