import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {sandboxTarget} from '../support/sandbox'
import {createMayaGateway} from '@/integrations/maya/http'
import {configuredMayaSignature} from '@/integrations/maya/signature-config'
import {propertyToday} from '@/domain/shared/dates'
import type {MayaConfig} from '@/integrations/maya/types'
// Creates real Maya sandbox records against an authorized preview. Nothing here runs without SANDBOX_AUTHORIZED=yes.
// The paid-payment check also needs SANDBOX_PAID_PAYMENT_ID: a sandbox checkout an operator paid with a Maya test card.
const sandbox=sandboxTarget(['MAYA_PUBLIC_KEY','MAYA_SECRET_KEY','MAYA_WEBHOOK_KEY_ENVIRONMENT','MAYA_WEBHOOK_PUBLIC_KEY_1','MAYA_WEBHOOK_PUBLIC_KEY_2'])
function gateway(moneyMethods:string[]=[]){
 if(!sandbox.enabled)throw new Error('Sandbox checks are not authorized')
 const config:MayaConfig={environment:'sandbox',appEnv:'preview',appUrl:sandbox.target.origin,publicKey:sandbox.values.MAYA_PUBLIC_KEY,secretKey:sandbox.values.MAYA_SECRET_KEY,timeoutMs:15000,capabilities:{environment:'sandbox',approvalReference:'sandbox-contract-check',checkoutEnabled:true,kountEnabled:false,voidEnabled:true,refundEnabled:true,partialRefunds:false,moneyMethods,maxAmountMinor:'1000000'}}
 return createMayaGateway(config)
}
describe.skipIf(!sandbox.enabled)('Maya sandbox contract',()=>{
 it('accepts the configured sandbox webhook keys as two distinct RSA keys',()=>{
  expect(configuredMayaSignature()).toMatchObject({environment:'sandbox',keyEnvironment:'sandbox'})
 })
 it('creates a checkout on the sandbox host whose ID reads back as the payment by ID and by reference',async()=>{
  const reference='SBX'+randomUUID().replaceAll('-','').slice(0,24)
  const created=await gateway().createCheckout({id:randomUUID(),bookingId:randomUUID(),merchantReference:reference,amount:{minor:'10000',currency:'PHP'},revision:1,deadline:new Date(Date.now()+30*60000).toISOString(),synthetic:false})
  expect(created).toMatchObject({kind:'created',environment:'sandbox'})
  if(created.kind!=='created')return
  expect(new URL(created.checkoutUrl).hostname).toBe('payments-web-sandbox.paymaya.com')
  const payment=await gateway().retrievePayment(created.checkoutId)
  expect(payment).toMatchObject({id:created.checkoutId,reference,amount:{minor:'10000',currency:'PHP'}})
  expect(payment.status).not.toBe('PAYMENT_SUCCESS')
  expect((await gateway().findPaymentsByReference(reference)).map(row=>row.id)).toContain(created.checkoutId)
 })
 it.runIf(Boolean(process.env.SANDBOX_PAID_PAYMENT_ID))('voids a same-day paid payment or refunds an older one exactly once',async()=>{
  const paid=await gateway().retrievePayment(process.env.SANDBOX_PAID_PAYMENT_ID!)
  expect(paid.status).toBe('PAYMENT_SUCCESS');expect(paid.method).toBeTruthy();expect(paid.paidAt).toBeTruthy()
  const money=gateway([paid.method!]),sameDay=propertyToday('Asia/Manila',new Date(paid.paidAt!))===propertyToday('Asia/Manila')
  const request={operationId:randomUUID(),paymentId:paid.id,reference:paid.reference,amount:paid.amount,reason:'manual-review' as const}
  const first=sameDay?await money.voidPayment(request):await money.refundPayment(request)
  expect(first).toMatchObject({kind:'verified',paymentId:paid.id,status:'SUCCESS'})
  if(sameDay)expect((await money.retrievePayment(paid.id)).status).toBe('VOIDED')
  else expect((await money.retrieveRefunds!(paid.id)).map(row=>row.id)).toContain(first.kind==='verified'?first.id:'')
  const second={...request,operationId:randomUUID()}
  expect(sameDay?await money.voidPayment(second):await money.refundPayment(second)).toEqual({kind:'refused',reason:'ineligible'})
 })
 it.todo('records the hosted checkout expiry and the payment methods it offers')
 it.todo('stores an authenticated Maya webhook for the paid sandbox payment on the preview')
})
