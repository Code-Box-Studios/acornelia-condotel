import {fenced} from '@/http/fence'
import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {authorizeRefund} from '@/domain/refunds/authorize'
import {attestOfflineReimbursement,reviewOfflineReimbursement} from '@/domain/refunds/offline'
import {resolveUncertainRefund} from '@/domain/refunds/resolve'
import {withdrawRefund} from '@/domain/refunds/withdraw'
import {checkPaymentRefunds} from '@/domain/refunds/check'
import {configuredMayaGateway} from '@/integrations/maya/configured'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('authorize'),input:z.unknown()}).strict(),
 z.object({action:z.literal('attest'),input:z.unknown()}).strict(),
 z.object({action:z.literal('review'),input:z.unknown()}).strict(),
 z.object({action:z.literal('resolve'),input:z.unknown()}).strict(),
 z.object({action:z.literal('withdraw'),input:z.unknown()}).strict(),
 z.object({action:z.literal('check'),input:z.object({paymentId:z.uuid()}).strict()}).strict(),
])
/** Refund commands keep their own policy, capacity and independence checks. */
async function handlePOST(request:Request){
 try{
  const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied()
  const value=schema.parse(await readBoundedJson(request))
  if(value.action==='authorize'){const row=await authorizeRefund(ctx,value.input as never);return staffJson({state:row.state,id:row.id},201)}
  if(value.action==='attest'){const row=await attestOfflineReimbursement(ctx,value.input as never);return staffJson({state:row.state,id:row.id},201)}
  if(value.action==='review'){const row=await reviewOfflineReimbursement(ctx,value.input as never);return staffJson({state:row.state})}
  if(value.action==='withdraw'){const row=await withdrawRefund(ctx,value.input as never);return staffJson({state:row.state})}
  if(value.action==='check'){
   const gateway=configuredMayaGateway(ctx.policy,{requireCheckout:false})
   if(!gateway)return staffJson({error:'Maya merchant checks are not configured for this environment.'},409)
   const result=await checkPaymentRefunds(ctx,value.input.paymentId,gateway);return staffJson(result)
  }
  const row=await resolveUncertainRefund(ctx,value.input as never);return staffJson({state:row.state})
 }catch(error){return staffFailure(error)}
}
export const POST=fenced('authentication',handlePOST)
