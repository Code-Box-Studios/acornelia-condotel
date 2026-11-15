import {describe,it,expect} from 'vitest'
import {assertVerifiedDelivery,retrieveMayaDeliveries,retrieveMayaPaymentDelivery} from '@/integrations/maya/signature'
import type {MayaGateway,ProviderPayment} from '@/integrations/maya/types'
const reference='ACN_TRUSTED_GET',now='2026-11-15T10:00:00.000Z'
const payment:ProviderPayment={id:'11111111-1111-4111-8111-111111111111',environment:'sandbox',reference,amount:{minor:'20000',currency:'PHP'},status:'PAYMENT_SUCCESS',method:'card',paidAt:null,canRefund:false,canVoid:false}
function gateway(find:MayaGateway['findPaymentsByReference']):MayaGateway{const unexpected=async()=>{throw new Error('Unexpected money operation')};return {createCheckout:unexpected,retrievePayment:unexpected,findPaymentsByReference:find,voidPayment:unexpected,refundPayment:unexpected}}
describe('trusted retrieval observation boundary',()=>{
  it('seals every actual reference payment only after a successful gateway read',async()=>{
    let calls=0,time=now
    const remote=gateway(async value=>{calls++;expect(value).toBe(reference);time='2026-11-15T10:01:00.000Z';return [payment,{...payment,id:'22222222-2222-4222-8222-222222222222'}]})
    const deliveries=await retrieveMayaDeliveries(remote,reference,'sandbox',()=>time)
    expect(calls).toBe(1);expect(deliveries).toHaveLength(2)
    expect(new Set(deliveries.map(value=>value.semanticKey)).size).toBe(2)
    for(const delivery of deliveries){assertVerifiedDelivery(delivery);expect(delivery.source).toBe('retrieval');expect(delivery.receivedAt).toBe(time)}
    expect(()=>assertVerifiedDelivery({...deliveries[0]})).toThrow()
  })
  it('does not turn failed or contradictory retrieval into authenticated empty or payable evidence',async()=>{
    await expect(retrieveMayaDeliveries(gateway(async()=>{throw new Error('Unavailable')}),reference,'sandbox',()=>now)).rejects.toThrow()
    for(const changed of [{environment:'production'},{reference:'DIFFERENT'},{amount:{minor:'1.5',currency:'PHP'}}]){
      await expect(retrieveMayaDeliveries(gateway(async()=>[{...payment,...changed} as ProviderPayment]),reference,'sandbox',()=>now)).rejects.toThrow()
    }
  })
  it('recovers reference authority through a merchant payment-id read and refuses a different returned identity',async()=>{
    const remote={...gateway(async()=>{throw new Error('Unexpected reference lookup')}),retrievePayment:async()=>payment}
    const delivery=await retrieveMayaPaymentDelivery(remote,payment.id,'sandbox',()=>now)
    assertVerifiedDelivery(delivery);expect(delivery.payment.reference).toBe(reference)
    await expect(retrieveMayaPaymentDelivery(remote,'22222222-2222-4222-8222-222222222222','sandbox',()=>now)).rejects.toThrow()
  })
})
