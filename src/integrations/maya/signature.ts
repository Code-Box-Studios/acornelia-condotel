import {createHash,createPublicKey,verify} from 'node:crypto'
import {z} from 'zod'
import {normalizePaymentFacts,type MayaPaymentFacts} from './transactions'
export type MayaSignatureConfig={environment:'sandbox'|'production';keyEnvironment:'sandbox'|'production';publicKeys:string[];toleranceMs:number}
export type VerifiedDelivery={payment:MayaPaymentFacts;semanticKey:string;deliveryKey:string;receivedAt:string}
export class MayaDeliveryRejected extends Error{constructor(){super('Maya delivery could not be authenticated')}}
const registry=globalThis as typeof globalThis&{__acorneliaMayaDeliveries?:WeakSet<object>}
const verified=registry.__acorneliaMayaDeliveries??=new WeakSet<object>()
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
function parseBody(raw:Uint8Array):Record<string,unknown>{
  if(raw.byteLength===0||raw.byteLength>65536)throw new MayaDeliveryRejected()
  const text=new TextDecoder('utf-8',{fatal:true}).decode(raw),body:unknown=JSON.parse(text)
  if(!body||typeof body!=='object'||Array.isArray(body))throw new MayaDeliveryRejected()
  // JSON.parse discards duplicate object keys; reject them before using its result.
  const tokens=text.match(/"(?:[^"\\]|\\.)*"|[^\s{}[\]:,]+|[{}[\]:,]/g)??[]
  const stack:{object:boolean;key:boolean;keys:Set<string>}[]=[]
  for(const token of tokens){
    if(token==='{'||token==='['){stack.push({object:token==='{',key:token==='{',keys:new Set()});if(stack.length>24)throw new MayaDeliveryRejected()}
    else if(token==='}'||token===']')stack.pop()
    else if(token===','){if(stack.at(-1)?.object)stack.at(-1)!.key=true}
    else if(token.startsWith('"')&&stack.at(-1)?.object&&stack.at(-1)!.key){const top=stack.at(-1)!,key=JSON.parse(token) as string;if(top.keys.has(key))throw new MayaDeliveryRejected();top.keys.add(key);top.key=false}
  }
  return body as Record<string,unknown>
}
function flatten(value:Record<string,unknown>|unknown[],prefix='',output:string[]=[]):string[]{
  for(const [key,item] of Object.entries(value)){
    if(!/^[A-Za-z0-9_-]+$/.test(key))throw new MayaDeliveryRejected()
    const full=prefix?prefix+'.'+key:key
    if(item===null||item===''||typeof item==='object'&&Object.keys(item).length===0)continue
    if(typeof item==='object')flatten(item as Record<string,unknown>,full,output)
    else{
      // Maya's delimiter format is not escaped. Refuse ambiguous values and recover by retrieval.
      if(typeof item==='string'&&/[&\u0000]/.test(item))throw new MayaDeliveryRejected()
      if(typeof item==='number'&&!Number.isFinite(item))throw new MayaDeliveryRejected()
      output.push(full+'='+String(item))
    }
  }
  return output
}
export function assertVerifiedDelivery(input:VerifiedDelivery):void{if(!verified.has(input))throw new MayaDeliveryRejected()}
export function verifyMayaDelivery(rawBody:Uint8Array,headers:Headers,config:MayaSignatureConfig,now:string):VerifiedDelivery{
  try{
    z.enum(['sandbox','production']).parse(config.environment)
    if(config.environment!==config.keyEnvironment||config.publicKeys.length!==2||new Set(config.publicKeys).size!==2||!Number.isInteger(config.toleranceMs)||config.toleranceMs<1000||config.toleranceMs>300000)throw new MayaDeliveryRejected()
    const timestamp=headers.get('x-maya-webhook-timestamp')||'',signature=headers.get('x-maya-webhook-signature')||''
    if(!/^\d{13}$/.test(timestamp)||!Number.isFinite(Date.parse(now))||Math.abs(Date.parse(now)-Number(timestamp))>config.toleranceMs)throw new MayaDeliveryRejected()
    if(signature.length>4096)throw new MayaDeliveryRejected()
    const entries=signature.split(',').map(item=>item.trim().split('='))
    if(entries.length!==2||entries.some(item=>item.length!==2)||new Set(entries.map(item=>item[0])).size!==2)throw new MayaDeliveryRejected()
    const parts=Object.fromEntries(entries)
    if(!/^[A-Za-z0-9_-]{16,128}$/.test(parts.nonce||'')||!/^([0-9a-fA-F]{2}){256,512}$/.test(parts.v1||'')||Object.keys(parts).some(key=>!['nonce','v1'].includes(key)))throw new MayaDeliveryRejected()
    const body=parseBody(rawBody),signed=flatten(body).sort().join('&')+'&nonce='+parts.nonce
    const keys=config.publicKeys.map(value=>{const key=createPublicKey(value);if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<2048)throw new MayaDeliveryRejected();return key})
    if(new Set(keys.map(key=>key.export({format:'der',type:'spki'}).toString('hex'))).size!==2)throw new MayaDeliveryRejected()
    if(!keys.some(key=>verify('RSA-SHA256',Buffer.from(signed),key,Buffer.from(parts.v1,'hex'))))throw new MayaDeliveryRejected()
    const payment=normalizePaymentFacts(config.environment,body)
    const semanticKey=digest(JSON.stringify({environment:payment.environment,id:payment.id,reference:payment.reference,amount:payment.amount,status:payment.status,paidAt:payment.paidAt}))
    Object.freeze(payment.amount);Object.freeze(payment)
    const delivery=Object.freeze({payment,semanticKey,deliveryKey:digest(timestamp+':'+signature),receivedAt:now})
    verified.add(delivery)
    return delivery
  }catch{throw new MayaDeliveryRejected()}
}
