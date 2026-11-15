import {z} from 'zod'
import type {ProviderMoneyRequest,ProviderMoneyResult} from './types'
import {decimalAmount,parseProviderAmount,type MayaTransport} from './http'
import {retrievePayment} from './transactions'
import {propertyToday} from '@/domain/shared/dates'
const amount=z.object({minor:z.string().regex(/^[1-9]\d*$/).max(30),currency:z.literal('PHP')}).strict()
const requestSchema=z.object({operationId:z.uuid(),paymentId:z.uuid(),reference:z.string().regex(/^[A-Za-z0-9_-]{1,36}$/),amount,reason:z.enum(['guest-cancellation','stay-change','duplicate-payment','late-payment','manual-review'])}).strict()
const resultSchema=z.object({id:z.uuid(),payment:z.uuid(),status:z.enum(['SUCCESS','FAILED']),amount:z.union([z.string(),z.number()]).optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional()})
export async function moneyOperation(transport:MayaTransport,kind:'void'|'refund',input:ProviderMoneyRequest,signal?:AbortSignal):Promise<ProviderMoneyResult>{
  const parsed=requestSchema.safeParse(input),{config}=transport
  if(!parsed.success)return {kind:'refused',reason:'invalid-input'}
  const request=parsed.data,refused=(reason:'configuration'|'unsupported-method'|'ineligible'|'reconciliation-required'):ProviderMoneyResult=>({kind:'refused',reason})
  if(!(kind==='void'?config.capabilities.voidEnabled:config.capabilities.refundEnabled)||BigInt(request.amount.minor)>BigInt(config.capabilities.maxAmountMinor))return refused('configuration')
  try{
    const payment=await retrievePayment(transport,request.paymentId,signal)
    if(payment.reference!==request.reference||payment.amount.currency!==request.amount.currency||payment.status!=='PAYMENT_SUCCESS'||!payment.paidAt)return refused('ineligible')
    if(!payment.method||!config.capabilities.moneyMethods.includes(payment.method))return refused('unsupported-method')
    const now=transport.dependencies.now(),paid=Date.parse(payment.paidAt),today=propertyToday('Asia/Manila',new Date(now)),paidDate=propertyToday('Asia/Manila',new Date(paid)),days=(Date.parse(today)-Date.parse(paidDate))/86400000
    if(paid>Date.parse(now)||days<0||BigInt(request.amount.minor)>BigInt(payment.amount.minor))return refused('ineligible')
    if(kind==='void'&&(!payment.canVoid||days!==0||request.amount.minor!==payment.amount.minor))return refused('ineligible')
    if(kind==='refund'){
      if(!payment.canRefund||days<1||days>180||Date.parse(now)-paid>180*86400000||!config.capabilities.partialRefunds&&request.amount.minor!==payment.amount.minor)return refused('ineligible')
      const prior=await transport.request('GET','/payments/v1/payments/'+request.paymentId+'/refunds','secret',undefined,signal)
      if(prior.kind==='unknown'||prior.status!==200)return refused('reconciliation-required')
      const records=z.array(z.object({id:z.uuid(),payment:z.uuid(),status:z.string().regex(/^[A-Z_]{1,50}$/),amount:z.union([z.string(),z.number()]),currency:z.string().regex(/^[A-Z]{3}$/)})).max(500).parse(prior.data)
      const ids=new Set<string>();let reserved=0n
      for(const record of records){if(record.payment!==request.paymentId||record.currency!==request.amount.currency||ids.has(record.id))return refused('reconciliation-required');ids.add(record.id);if(record.status!=='FAILED')reserved+=BigInt(parseProviderAmount(record.amount))}
      if(reserved+BigInt(request.amount.minor)>BigInt(payment.amount.minor))return refused('ineligible')
    }
  }catch{return refused('reconciliation-required')}
  const reason=JSON.stringify('ACN '+request.operationId+' '+request.reason)
  const body=kind==='void'?'{"reason":'+reason+'}':'{"reason":'+reason+',"totalAmount":{"amount":'+decimalAmount(request.amount.minor)+',"currency":"PHP"}}'
  const response=await transport.request('POST','/payments/v1/payments/'+request.paymentId+'/'+(kind==='void'?'voids':'refunds'),'secret',body,signal),unknown:ProviderMoneyResult={kind:'unknown',environment:config.environment,paymentId:request.paymentId,operationId:request.operationId}
  if(response.kind==='unknown')return unknown
  if([401,403].includes(response.status))return {kind:'refused',reason:'provider-authentication'}
  if(response.status!==200&&response.status!==201)return unknown
  try{
    const record=resultSchema.parse(response.data)
    if(record.payment!==request.paymentId||kind==='refund'&&(parseProviderAmount(record.amount)!==request.amount.minor||record.currency!==request.amount.currency))return unknown
    return {kind:'verified',environment:config.environment,id:record.id,paymentId:record.payment,status:record.status,amount:request.amount}
  }catch{return unknown}
}
