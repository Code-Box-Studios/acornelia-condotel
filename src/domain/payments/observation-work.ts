import {z} from 'zod'
import type {MayaGateway} from '@/integrations/maya/types'
import type {WorkHandler} from '@/domain/work/types'
import {assertWorker,fencedRow} from '@/domain/work/validation'
import {parseEnvironment} from '@/config/env'
import {retrieveMayaDeliveries,retrieveMayaPaymentDelivery} from '@/integrations/maya/signature'
import {ingestMayaDeliveryTx} from './inbox'
import {applyPaymentObservationTx} from './observe'
export function paymentObservationHandler(gateway:MayaGateway):WorkHandler{return {execute:async(ctx,lease,signal)=>{
  assertWorker(ctx)
  const observation=z.object({inboxId:z.uuid()}).strict().parse(lease.payload)
  const inbox=await ctx.uow.run(ctx.actor,async tx=>{
    const work=await fencedRow(tx,lease,ctx.clock.now())
    if(work.kind!=='payment-observation'||!work.dispatchStarted)throw new Error('Payment observation requires started work ownership')
    return tx.payload.findByID({collection:'payment-inbox',id:observation.inboxId,depth:0,req:tx.req,overrideAccess:false})
  })
  if(inbox.state!=='pending')return {state:'done'}
  if(inbox.environment!==parseEnvironment(process.env).mayaEnvironment)return {state:'failed',reason:'invalid-work'}
  if(inbox.source==='retrieval')return {state:'done',apply:async tx=>{await applyPaymentObservationTx(tx,ctx,observation)}}
  try{
    // A valid platform signature is a wake-up signal. Confirm money through this merchant's secret-key GET.
    const deliveries=inbox.merchantReference?await retrieveMayaDeliveries(gateway,inbox.merchantReference,inbox.environment,ctx.clock.now,signal):[await retrieveMayaPaymentDelivery(gateway,inbox.providerPaymentId,inbox.environment,ctx.clock.now,signal)]
    if(!deliveries.length)return {state:'retry',reason:'provider-unavailable'}
    const needsRetry=inbox.providerStatus==='PAYMENT_SUCCESS'&&!deliveries.some(delivery=>delivery.payment.status==='PAYMENT_SUCCESS')
    return {state:needsRetry?'retry':'done',...(needsRetry?{reason:'provider-unavailable' as const}:{}),apply:async tx=>{
      for(const delivery of deliveries){const inboxId=await ingestMayaDeliveryTx(tx,delivery,ctx.clock.now());await applyPaymentObservationTx(tx,ctx,{inboxId})}
      const current=await tx.payload.findByID({collection:'payment-inbox',id:inbox.id,depth:0,req:tx.req,overrideAccess:false})
      if(!needsRetry&&current.state==='pending')await tx.payload.update({collection:'payment-inbox',id:inbox.id,data:{state:'processed',processedAt:ctx.clock.now(),reasonCode:'merchant-retrieval-applied'},req:tx.req,overrideAccess:false})
    }}
  }catch{return {state:'retry',reason:'provider-unavailable'}}
}}}
