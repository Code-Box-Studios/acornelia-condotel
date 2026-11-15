import {sign} from 'node:crypto'
import type {CommandContext} from '@/domain/db/types'
import {config,keys} from './maya-delivery'
import type {MayaGateway} from '@/integrations/maya/types'
import {normalizePaymentFacts} from '@/integrations/maya/transactions'
import {retrieveMayaPaymentDelivery,verifyMayaDelivery} from '@/integrations/maya/signature'
import {ingestMayaDelivery} from '@/domain/payments/inbox'
// A test producer signs independently supplied provider facts using the documented algorithm.
export async function signedObservation(ctx:CommandContext,packet:Record<string,unknown>,options:{merchantVerified?:boolean}={}){
  const pairs:string[]=[]
  function flatten(value:Record<string,unknown>,prefix=''){for(const [key,item] of Object.entries(value)){const name=prefix?prefix+'.'+key:key;if(item===null||item===''||typeof item==='object'&&!Object.keys(item).length)continue;if(typeof item==='object')flatten(item as Record<string,unknown>,name);else pairs.push(name+'='+String(item))}}
  flatten(packet)
  const nonce='abcdef1234567890abcdef1234567890',signature=sign('RSA-SHA256',Buffer.from(pairs.sort().join('&')+'&nonce='+nonce),keys[0].privateKey).toString('hex')
  const headers=new Headers({'x-maya-webhook-timestamp':String(Date.parse(ctx.clock.now())),'x-maya-webhook-signature':'nonce='+nonce+',v1='+signature})
  const inboxId=await ingestMayaDelivery(ctx,verifyMayaDelivery(Buffer.from(JSON.stringify(packet)),headers,config,ctx.clock.now()))
  if(options.merchantVerified===false)return {inboxId}
  const read=await retrieveMayaPaymentDelivery(merchantGatewayFor(packet),String(packet.id),'sandbox',ctx.clock.now)
  return {inboxId:await ingestMayaDelivery(ctx,read)}
}

export function merchantGatewayFor(packet:Record<string,unknown>):MayaGateway{
  const payment=normalizePaymentFacts('sandbox',packet)
  if(!payment.reference)throw new Error('A merchant read fixture requires its reference')
  const owned={...payment,reference:payment.reference},unavailable=async()=>{throw new Error('Unexpected outbound money operation')}
  return {createCheckout:unavailable,voidPayment:unavailable,refundPayment:unavailable,retrievePayment:async id=>{if(id!==owned.id)throw new Error('Payment does not belong to this merchant');return owned},findPaymentsByReference:async reference=>reference===owned.reference?[owned]:[]}
}
