import {describe,it,expect} from 'vitest'
import {createMayaGateway} from '@/integrations/maya/http'
import type {MayaConfig} from '@/integrations/maya/types'
const paymentId='11111111-1111-4111-8111-111111111111',refundId='22222222-2222-4222-8222-222222222222',secondId='33333333-3333-4333-8333-333333333333'
const config:MayaConfig={environment:'sandbox',appEnv:'test',appUrl:'https://acornelia.example.test',publicKey:'pk-synthetic-refund-contract',secretKey:'sk-synthetic-refund-contract',timeoutMs:50,capabilities:{environment:'sandbox',approvalReference:'synthetic-refund-capabilities',checkoutEnabled:false,kountEnabled:false,voidEnabled:true,refundEnabled:true,partialRefunds:true,moneyMethods:['card'],maxAmountMinor:'1000000'}}
const record={id:refundId,payment:paymentId,status:'SUCCESS',amount:'500.00',currency:'PHP',reason:'External dashboard refund'}
function gateway(data:unknown,status=200){return createMayaGateway(config,{fetch:async(input,init)=>{expect(String(input)).toBe('https://pg-sandbox.paymaya.com/payments/v1/payments/'+paymentId+'/refunds');expect(init?.method).toBe('GET');expect(new Headers(init?.headers).get('authorization')).toBe('Basic '+Buffer.from(config.secretKey+':').toString('base64'));return Response.json(data,{status})}})}
describe('merchant refund retrieval with synthetic provider responses',()=>{
 it('retrieves every refund using the merchant secret and exact amounts',async()=>{
  const source=gateway([record,{...record,id:secondId,status:'PENDING',amount:'100.01',reason:null}]);expect(source.retrieveRefunds).toBeTypeOf('function')
  expect(await source.retrieveRefunds!(paymentId)).toEqual([{id:refundId,paymentId,status:'SUCCESS',amount:{minor:'50000',currency:'PHP'},reason:record.reason},{id:secondId,paymentId,status:'PENDING',amount:{minor:'10001',currency:'PHP'},reason:null}])
 })
 it('refuses duplicate operation identities and foreign parent payments',async()=>{
  for(const data of [[record,record],[{...record,payment:secondId}]]){const source=gateway(data);expect(source.retrieveRefunds).toBeTypeOf('function');await expect(source.retrieveRefunds!(paymentId)).rejects.toThrow()}
 })
 it('preserves unfamiliar pending statuses without claiming completed repayment',async()=>{
  const source=gateway([{...record,status:'UNDER_REVIEW'}]);expect(source.retrieveRefunds).toBeTypeOf('function');expect((await source.retrieveRefunds!(paymentId))[0].status).toBe('UNDER_REVIEW')
 })
 it('treats unavailable or malformed financial reads as uncertainty',async()=>{
  for(const source of [gateway({},200),gateway([record],401),gateway([{...record,amount:'invalid'}])]){expect(source.retrieveRefunds).toBeTypeOf('function');await expect(source.retrieveRefunds!(paymentId)).rejects.toThrow()}
 })
})
