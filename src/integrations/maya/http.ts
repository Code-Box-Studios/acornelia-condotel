import {retrieveRefunds} from './refund-reads'
import {z} from 'zod'
import type {MayaConfig,MayaDependencies,MayaGateway} from './types'
import {createCheckout} from './checkout'
import {findPaymentsByReference,retrievePayment} from './transactions'
import {moneyOperation} from './refunds'
const minor=z.string().regex(/^(0|[1-9]\d*)$/).max(30)
const configSchema=z.object({environment:z.enum(['sandbox','production']),appEnv:z.enum(['development','test','preview','production']),appUrl:z.url(),publicKey:z.string().regex(/^pk-[A-Za-z0-9_+/=-]{8,200}$/),secretKey:z.string().regex(/^sk-[A-Za-z0-9_+/=-]{8,200}$/),timeoutMs:z.number().int().min(10).max(60000),capabilities:z.object({environment:z.enum(['sandbox','production']),approvalReference:z.string().trim().min(1).max(240),checkoutEnabled:z.boolean(),kountEnabled:z.boolean(),voidEnabled:z.boolean(),refundEnabled:z.boolean(),partialRefunds:z.boolean(),moneyMethods:z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).max(30),maxAmountMinor:minor}).strict()}).strict()
export type TransportResponse={kind:'response';status:number;data:unknown}|{kind:'unknown'}
export type MayaTransport={config:MayaConfig;dependencies:MayaDependencies;request:(method:'GET'|'POST',path:string,key:'public'|'secret',body?:string,signal?:AbortSignal)=>Promise<TransportResponse>}
async function readJson(response:Response){
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing response')
  let size=0;const chunks:Uint8Array[]=[]
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>262144){void reader.cancel();throw new Error('Response exceeds limit')};chunks.push(next.value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown
}
export function createMayaGateway(input:MayaConfig,overrides:Partial<MayaDependencies>={}):MayaGateway{
  if(typeof window!=='undefined')throw new Error('Maya requires a server runtime')
  let config:MayaConfig
  try{
    config=configSchema.parse(input)
    const url=new URL(config.appUrl)
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(config.appEnv==='test'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))||config.environment==='production'&&config.appEnv!=='production'||config.capabilities.environment!==config.environment)throw new Error('Invalid configuration')
    config.appUrl=url.origin
  }catch{throw new Error('Maya configuration is invalid')}
  const dependencies:MayaDependencies={fetch:overrides.fetch??globalThis.fetch,now:overrides.now??(()=>new Date().toISOString())}
  const base=config.environment==='sandbox'?'https://pg-sandbox.paymaya.com':'https://pg.maya.ph'
  const transport:MayaTransport={config,dependencies,async request(method,path,key,body,signal){
    if(!/^\/(?:checkout\/v1\/checkouts|payments\/v1\/(?:payment-rrns\/[A-Za-z0-9_-]{1,36}|payments\/[A-Fa-f0-9-]{36}(?:\/(?:voids|refunds))?))$/.test(path))throw new Error('Maya endpoint is not allowed')
    const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,config.timeoutMs)
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
    try{
      const result=await Promise.race([
        (async()=>{if(controller.signal.aborted)throw new Error('Request cancelled');const response=await dependencies.fetch(base+path,{method,headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{}),Authorization:'Basic '+Buffer.from((key==='public'?config.publicKey:config.secretKey)+':').toString('base64')},body,signal:controller.signal,redirect:'manual',cache:'no-store',credentials:'omit'});return {kind:'response' as const,status:response.status,data:await readJson(response)}})(),
        new Promise<never>((_resolve,reject)=>{if(controller.signal.aborted)reject(new Error('Request cancelled'));else controller.signal.addEventListener('abort',()=>reject(new Error('Request cancelled')),{once:true})}),
      ])
      return result
    }catch{return {kind:'unknown'}}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
  }}
  return {
    createCheckout:(attempt,signal)=>createCheckout(transport,attempt,signal),
    retrieveRefunds:(id,signal)=>retrieveRefunds(transport,id,signal),
    retrievePayment:(id,signal)=>retrievePayment(transport,id,signal),
    findPaymentsByReference:(reference,signal)=>findPaymentsByReference(transport,reference,signal),
    voidPayment:(request,signal)=>moneyOperation(transport,'void',request,signal),
    refundPayment:(request,signal)=>moneyOperation(transport,'refund',request,signal),
  }
}
export function decimalAmount(minorValue:string){minor.parse(minorValue);const value=minorValue.padStart(3,'0');return value.slice(0,-2)+'.'+value.slice(-2)}
export function parseProviderAmount(value:unknown):string{
  if(typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&(!Number.isFinite(value)||value<0))throw new Error('Invalid amount')
  const text=String(value),match=/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text)
  if(!match||text.length>33)throw new Error('Invalid amount')
  const result=BigInt(match[1])*100n+BigInt((match[2]??'').padEnd(2,'0'))
  if(typeof value==='number'&&result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Unsafe numeric amount')
  return result.toString()
}
