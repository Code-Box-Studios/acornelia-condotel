import type {Where} from 'payload'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {RecoveryPolicy} from '@/domain/payments/recovery-policy'
import {privateDigest} from '@/domain/security/private-state'
export async function checkoutHoldAllowed(tx:DbTx,ctx:CommandContext,policy:RecoveryPolicy):Promise<boolean>{
  const identity:Where[]=[{checkoutBrowserHash:{equals:privateDigest('checkout-browser\0'+ctx.browserKey)}}]
  if(ctx.actor.kind==='customer')identity.push({ownerCustomer:{equals:ctx.actor.id}})
  const base:Where={and:[{source:{equals:'website'}},{or:identity}]}
  const open=await tx.payload.count({collection:'bookings',where:{and:[base,{status:{equals:'held'}}]},req:tx.req,overrideAccess:false})
  const recent=await tx.payload.count({collection:'bookings',where:{and:[base,{preparedAt:{greater_than_equal:new Date(Date.parse(ctx.clock.now())-policy.holdWindowMinutes*60000).toISOString()}}]},req:tx.req,overrideAccess:false})
  return open.totalDocs<policy.maxOpenHolds&&recent.totalDocs<policy.maxNewHolds
}
