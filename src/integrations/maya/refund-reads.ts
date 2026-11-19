import {z} from 'zod'
import type {ProviderRefund} from './types'
import {parseProviderAmount,type MayaTransport} from './http'
import {MayaReadUnavailable} from './transactions'
const record=z.object({id:z.uuid(),payment:z.uuid(),status:z.string().regex(/^[A-Z_]{1,50}$/),amount:z.union([z.string(),z.number()]),currency:z.string().regex(/^[A-Z]{3}$/),reason:z.string().max(500).nullish()})
/** A completed read is evidence of listed records, never proof an unknown POST did not happen. */
export async function retrieveRefunds(transport:MayaTransport,paymentId:string,signal?:AbortSignal):Promise<ProviderRefund[]>{
 try{
  z.uuid().parse(paymentId)
  const response=await transport.request('GET','/payments/v1/payments/'+paymentId+'/refunds','secret',undefined,signal)
  if(response.kind==='unknown'||response.status!==200)throw new MayaReadUnavailable()
  const rows=z.array(record).max(499).parse(response.data),ids=new Set<string>()
  return rows.map(row=>{
   const minor=parseProviderAmount(row.amount)
   if(row.payment!==paymentId||ids.has(row.id)||minor==='0')throw new MayaReadUnavailable()
   ids.add(row.id)
   return {id:row.id,paymentId,status:row.status,amount:{minor,currency:row.currency},reason:row.reason??null}
  })
 }catch{throw new MayaReadUnavailable()}
}
