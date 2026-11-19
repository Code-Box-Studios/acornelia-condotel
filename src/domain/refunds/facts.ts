import {z} from 'zod'
import {privateDigest} from '@/domain/security/private-state'
import type {CommandContext,DbTx} from '@/domain/db/types'
import type {PaymentTransaction,RefundEvidence} from '@/payload-types'
import type {MayaGateway,ProviderMoneyRequest,ProviderMoneyResult} from '@/integrations/maya/types'
import {parseEnvironment} from '@/config/env'
import {relationshipId} from '@/features/customer/bookings'
import {appendAudit} from '@/domain/audit/append'
import {systemModeAllowed} from '@/config/operation-mode'
export type RefundFact=Readonly<{paymentId:string;operationId:string|null;environment:'sandbox'|'production';kind:'refund'|'void';providerOperationId:string|null;providerPaymentId:string;amountMinor:string;currency:string;providerStatus:string;source:'merchant-get'|'merchant-post';observedAt:string;workGeneration:number|null;reason:string|null}>
const witnesses=new WeakSet<object>()
function seal(value:RefundFact):RefundFact{const fact=Object.freeze({...value});witnesses.add(fact);return fact}
/** Seals the synchronous merchant POST response. It is the only proof binding a provider operation ID to the local operation. */
export function postedRefundFact(input:{paymentId:string;operationId:string;kind:'refund'|'void';request:ProviderMoneyRequest;outcome:ProviderMoneyResult;observedAt:string;workGeneration:number}):RefundFact|null{
 const {outcome,request}=input
 if(outcome.kind!=='verified'||!z.uuid().safeParse(outcome.id).success||outcome.paymentId!==request.paymentId||outcome.amount.minor!==request.amount.minor||outcome.amount.currency!==request.amount.currency||!['SUCCESS','FAILED'].includes(outcome.status))return null
 return seal({paymentId:input.paymentId,operationId:input.operationId,environment:outcome.environment,kind:input.kind,providerOperationId:outcome.id,providerPaymentId:outcome.paymentId,amountMinor:outcome.amount.minor,currency:outcome.amount.currency,providerStatus:outcome.status,source:'merchant-post',observedAt:input.observedAt,workGeneration:input.workGeneration,reason:null})
}
export function refundSystem(ctx:CommandContext,allowWork=true){if(ctx.actor.kind!=='system'||!['payments','recovery',...(allowWork?['work']:[])].includes(ctx.actor.purpose)||!systemModeAllowed(ctx.actor.purpose))throw new Error('Refund evidence authority required')}
export async function ownedRefundPayment(tx:DbTx,paymentId:string):Promise<PaymentTransaction>{
 const payment=await tx.payload.findByID({collection:'payment-transactions',id:paymentId,depth:0,req:tx.req,overrideAccess:false})
 if(payment.status!=='collected'||payment.environment==='offline'||payment.environment!==parseEnvironment(process.env).mayaEnvironment||!relationshipId(payment.booking)||!payment.merchantReference)throw new Error('A merchant-owned collection is required')
 const proof=await tx.payload.count({collection:'payment-inbox',where:{and:[{source:{equals:'retrieval'}},{environment:{equals:payment.environment}},{providerPaymentId:{equals:payment.providerPaymentId}},{providerStatus:{equals:'PAYMENT_SUCCESS'}},{amountMinor:{equals:payment.amountMinor}},{currency:{equals:payment.currency}}]},req:tx.req,overrideAccess:false})
 if(!proof.totalDocs)throw new Error('Original merchant collection proof is required')
 return payment
}
const remote=z.object({id:z.uuid(),paymentId:z.uuid(),status:z.string().regex(/^[A-Z_]{1,50}$/),amount:z.object({minor:z.string().regex(/^[1-9]\d*$/).max(60),currency:z.string().regex(/^[A-Z]{3}$/)}).strict(),reason:z.string().max(500).nullable()}).strict()
export async function retrieveRefundFacts(ctx:CommandContext,paymentId:string,gateway:MayaGateway,signal?:AbortSignal){
 refundSystem(ctx);z.uuid().parse(paymentId)
 const payment=await ctx.uow.run(ctx.actor,tx=>ownedRefundPayment(tx,paymentId)),environment=payment.environment as 'sandbox'|'production',facts:RefundFact[]=[]
 const [root,list]=await Promise.allSettled([gateway.retrievePayment(payment.providerPaymentId,signal),gateway.retrieveRefunds?gateway.retrieveRefunds(payment.providerPaymentId,signal):Promise.reject(new Error('Refund retrieval is unavailable'))])
 let complete=root.status==='fulfilled'&&list.status==='fulfilled'
 if(root.status==='fulfilled'){
  const value=root.value
  if(value.id!==payment.providerPaymentId||value.reference!==payment.merchantReference||value.environment!==environment||value.amount.minor!==payment.amountMinor||value.amount.currency!==payment.currency)complete=false
  else if(value.status==='VOIDED')facts.push(seal({paymentId:payment.id,operationId:null,environment,kind:'void',providerOperationId:null,providerPaymentId:payment.providerPaymentId,amountMinor:payment.amountMinor,currency:payment.currency,providerStatus:'VOIDED',source:'merchant-get',observedAt:ctx.clock.now(),workGeneration:null,reason:null}))
 }
 if(list.status==='fulfilled'){
  const ids=new Set<string>()
  for(const input of list.value){
   const parsed=remote.safeParse(input)
   if(!parsed.success||parsed.data.paymentId!==payment.providerPaymentId||ids.has(parsed.data.id)){complete=false;continue}
   const row=parsed.data;ids.add(row.id)
   facts.push(seal({paymentId:payment.id,operationId:null,environment,kind:'refund',providerOperationId:row.id,providerPaymentId:row.paymentId,amountMinor:row.amount.minor,currency:row.amount.currency,providerStatus:row.status,source:'merchant-get',observedAt:ctx.clock.now(),workGeneration:null,reason:row.reason}))
  }
 }
 return {facts,complete,payment}
}
export async function admitRefundFact(tx:DbTx,ctx:CommandContext,fact:RefundFact):Promise<RefundEvidence>{
 refundSystem(ctx)
 if(!witnesses.has(fact))throw new Error('Verified refund witness required')
 const semanticKey=privateDigest(JSON.stringify({payment:fact.paymentId,operation:fact.operationId,environment:fact.environment,kind:fact.kind,id:fact.providerOperationId,status:fact.providerStatus,minor:fact.amountMinor,currency:fact.currency,source:fact.source})),previous=(await tx.payload.find({collection:'refund-evidence',where:{semanticKey:{equals:semanticKey}},limit:1,depth:0,req:tx.req,overrideAccess:false})).docs[0]
 if(previous)return previous
 const row=await tx.payload.create({collection:'refund-evidence',data:{semanticKey,payment:fact.paymentId,operation:fact.operationId,environment:fact.environment,kind:fact.kind,providerOperationId:fact.providerOperationId,providerPaymentId:fact.providerPaymentId,amountMinor:fact.amountMinor,currency:fact.currency,providerStatus:fact.providerStatus,source:fact.source,observedAt:fact.observedAt,workGeneration:fact.workGeneration,proof:{version:1,reason:fact.reason},state:'pending'},req:tx.req,overrideAccess:false})
 const payment=await tx.payload.findByID({collection:'payment-transactions',id:fact.paymentId,depth:0,req:tx.req,overrideAccess:false})
 // Serialize new financial evidence against local reservation decisions.
 await tx.payload.update({collection:'payment-transactions',id:payment.id,data:{lastObservedAt:payment.lastObservedAt??ctx.clock.now()},req:tx.req,overrideAccess:false})
 await appendAudit(tx,{action:'refund:evidence-stored',recordType:'refund-evidence',recordId:row.id,outcome:'success',safeChanges:{amountMinor:row.amountMinor,currency:row.currency}})
 return row
}
