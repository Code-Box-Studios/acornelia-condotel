import {z} from 'zod'
import type {CheckoutAttempt,CreateCheckoutResult} from './types'
import {decimalAmount,type MayaTransport} from './http'
const schema=z.object({id:z.uuid(),bookingId:z.uuid(),merchantReference:z.string().regex(/^[A-Za-z0-9_-]{1,36}$/),amount:z.object({minor:z.string().regex(/^[1-9]\d*$/).max(30),currency:z.literal('PHP')}).strict(),revision:z.number().int().positive(),deadline:z.iso.datetime({offset:true}),synthetic:z.boolean()}).strict()
export async function createCheckout(transport:MayaTransport,input:CheckoutAttempt,signal?:AbortSignal):Promise<CreateCheckoutResult>{
  const {config}=transport,parsed=schema.safeParse(input)
  if(!parsed.success)return {kind:'refused',reason:'invalid-input'}
  const attempt=parsed.data
  if(!config.capabilities.checkoutEnabled||config.capabilities.kountEnabled||attempt.synthetic&&!(config.appEnv==='test'||config.appEnv==='development'&&process.env.DEVELOPMENT_FIXTURES==='true')||BigInt(attempt.amount.minor)>BigInt(config.capabilities.maxAmountMinor))return {kind:'refused',reason:'configuration'}
  if(Date.parse(attempt.deadline)<=Date.parse(transport.dependencies.now()))return {kind:'refused',reason:'ineligible'}
  const returns=Object.fromEntries(['success','failure','cancel'].map(outcome=>[outcome,config.appUrl+'/book/payment?booking='+attempt.bookingId+'&outcome='+outcome]))
  // Emit a validated decimal JSON number token directly; never round money through a JavaScript number.
  const body='{"totalAmount":{"value":'+decimalAmount(attempt.amount.minor)+',"currency":"PHP"},"requestReferenceNumber":'+JSON.stringify(attempt.merchantReference)+',"redirectUrl":'+JSON.stringify(returns)+'}'
  const result=await transport.request('POST','/checkout/v1/checkouts','public',body,signal),unknown:CreateCheckoutResult={kind:'unknown',environment:config.environment,reference:attempt.merchantReference}
  if(result.kind==='unknown')return unknown
  if([401,403].includes(result.status))return {kind:'refused',reason:'provider-authentication'}
  if(result.status!==200&&result.status!==201)return unknown
  try{
    const response=z.object({checkoutId:z.uuid(),redirectUrl:z.url()}).parse(result.data),url=new URL(response.redirectUrl),hosts=config.environment==='sandbox'?['payments-web-sandbox.paymaya.com']:['payments.maya.ph','payments.paymaya.com']
    if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.port||url.username||url.password||url.hash||!['/checkout','/v2/checkout'].includes(url.pathname)||url.searchParams.get('id')!==response.checkoutId)throw new Error('Checkout URL mismatch')
    return {kind:'created',environment:config.environment,checkoutId:response.checkoutId,checkoutUrl:url.href}
  }catch{return unknown}
}
