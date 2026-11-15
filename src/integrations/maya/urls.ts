import {z} from 'zod'
import type {MayaEnvironment} from './types'
export function approvedCheckoutUrl(environment:MayaEnvironment,id:string,value:string):string{
  z.uuid().parse(id)
  const url=new URL(z.url().parse(value)),hosts=environment==='sandbox'?['payments-web-sandbox.paymaya.com']:['payments.maya.ph','payments.paymaya.com']
  if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.port||url.username||url.password||url.hash||!['/checkout','/v2/checkout'].includes(url.pathname)||url.searchParams.get('id')!==id)throw new Error('Checkout URL mismatch')
  return url.href
}
