import {z} from 'zod'
import {requestContext} from '@/features/auth/context'
import {readBoundedJson} from '@/http/body'
import {authorizeRefund} from '@/domain/refunds/authorize'
import {attestOfflineReimbursement,reviewOfflineReimbursement} from '@/domain/refunds/offline'
import {resolveUncertainRefund} from '@/domain/refunds/resolve'
import {staffDenied,staffFailure,staffJson} from '@/admin/shared/http'
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('authorize'),input:z.unknown()}).strict(),
 z.object({action:z.literal('attest'),input:z.unknown()}).strict(),
 z.object({action:z.literal('review'),input:z.unknown()}).strict(),
 z.object({action:z.literal('resolve'),input:z.unknown()}).strict(),
])
/** Refund commands keep their own policy, capacity and independence checks. */
export async function POST(request:Request){
 try{
  const ctx=await requestContext(request);if(ctx.actor.kind!=='staff')return staffDenied()
  const value=schema.parse(await readBoundedJson(request))
  if(value.action==='authorize'){const row=await authorizeRefund(ctx,value.input as never);return staffJson({state:row.state,id:row.id},201)}
  if(value.action==='attest'){const row=await attestOfflineReimbursement(ctx,value.input as never);return staffJson({state:row.state,id:row.id},201)}
  if(value.action==='review'){const row=await reviewOfflineReimbursement(ctx,value.input as never);return staffJson({state:row.state})}
  const row=await resolveUncertainRefund(ctx,value.input as never);return staffJson({state:row.state})
 }catch(error){return staffFailure(error)}
}
