import {z} from 'zod'
import type {MayaEnvironment,ProviderPayment} from './types'
import {parseProviderAmount,type MayaTransport} from './http'
export class MayaReadUnavailable extends Error{constructor(){super('Maya response could not be verified')}}
const instant=z.iso.datetime({offset:true}),status=z.string().regex(/^[A-Z_]{1,50}$/),reference=z.string().regex(/^[A-Za-z0-9_-]{1,36}$/)
const paymentStatuses=new Set(['PENDING_TOKEN','PENDING_PAYMENT','FOR_AUTHENTICATION','AUTHENTICATING','AUTH_SUCCESS','AUTH_FAILED','PAYMENT_EXPIRED','PAYMENT_PROCESSING','PAYMENT_SUCCESS','PAYMENT_FAILED','PAYMENT_CANCELLED','VOIDED','REFUNDED','AUTHORIZED','CAPTURED','DONE','CAPTURE_HOLD_EXPIRED'])
const paymentSchema=z.object({id:z.uuid(),requestReferenceNumber:reference.optional(),amount:z.union([z.string(),z.number()]).optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),totalAmount:z.object({value:z.union([z.string(),z.number()]),currency:z.string().regex(/^[A-Z]{3}$/)}).optional(),status:status.optional(),paymentStatus:status.optional(),fundSource:z.object({type:z.string().max(80)}).nullish(),paymentAt:instant.nullish(),paymentDetails:z.object({paymentAt:instant.nullish()}).nullish(),canVoid:z.boolean().optional(),canRefund:z.boolean().optional(),environment:z.enum(['sandbox','production']).optional()})
export type MayaPaymentFacts=Omit<ProviderPayment,'reference'>&{reference:string|null}
export function normalizePaymentFacts(environment:MayaEnvironment,input:unknown):MayaPaymentFacts{
  const row=paymentSchema.parse(input),amount=row.totalAmount?{minor:parseProviderAmount(row.totalAmount.value),currency:row.totalAmount.currency}:{minor:parseProviderAmount(row.amount),currency:row.currency!}
  if(!amount.currency||!row.paymentStatus&&!row.status||row.environment&&row.environment!==environment)throw new MayaReadUnavailable()
  if(row.status&&row.paymentStatus&&paymentStatuses.has(row.status)&&row.status!==row.paymentStatus)throw new MayaReadUnavailable()
  if(row.totalAmount&&row.amount!==undefined&&(parseProviderAmount(row.amount)!==amount.minor||row.currency&&row.currency!==amount.currency))throw new MayaReadUnavailable()
  return {id:row.id,environment:environment,reference:row.requestReferenceNumber??null,amount,status:row.paymentStatus??row.status!,method:row.fundSource?.type??null,paidAt:row.paymentDetails?.paymentAt??row.paymentAt??null,canVoid:row.canVoid??false,canRefund:row.canRefund??false}
}
export function normalizePayment(transport:MayaTransport,input:unknown):ProviderPayment{
  const facts=normalizePaymentFacts(transport.config.environment,input)
  if(!facts.reference)throw new MayaReadUnavailable()
  return {...facts,reference:facts.reference}
}
export async function retrievePayment(transport:MayaTransport,id:string,signal?:AbortSignal):Promise<ProviderPayment>{
  try{
    z.uuid().parse(id)
    const response=await transport.request('GET','/payments/v1/payments/'+id,'secret',undefined,signal)
    if(response.kind==='unknown'||response.status!==200)throw new MayaReadUnavailable()
    const payment=normalizePayment(transport,response.data)
    if(payment.id!==id)throw new MayaReadUnavailable()
    return payment
  }catch{throw new MayaReadUnavailable()}
}
export async function findPaymentsByReference(transport:MayaTransport,value:string,signal?:AbortSignal):Promise<ProviderPayment[]>{
  try{
    reference.parse(value)
    const response=await transport.request('GET','/payments/v1/payment-rrns/'+value,'secret',undefined,signal)
    if(response.kind==='unknown'||response.status!==200)throw new MayaReadUnavailable()
    const payments=z.array(z.unknown()).max(500).parse(response.data).map(row=>normalizePayment(transport,row))
    if(payments.some(payment=>payment.reference!==value))throw new MayaReadUnavailable()
    return payments
  }catch{throw new MayaReadUnavailable()}
}
