import {describe,it,expect} from 'vitest'
import {verifyMayaDelivery} from '@/integrations/maya/signature'
import {config,keys,wrong,payment,headers,bytes,now} from '../support/maya-delivery'
describe('Maya documented RSA webhook boundary',()=>{
  it('authenticates sorted flattened facts using either rotating key without retaining card data',()=>{
    for(const index of [0,1]){
      const delivery=verifyMayaDelivery(bytes(payment),headers(index),config,now)
      expect(delivery.payment).toMatchObject({id:payment.id,reference:'ACN_WEBHOOK',amount:{minor:'12345',currency:'PHP'},status:'PAYMENT_SUCCESS'})
      expect(JSON.stringify(delivery)).not.toMatch(/masked|5555|signature|BEGIN|privateKey/)
    }
  })
  it('rejects tampered values, signatures, wrong keys and environment',()=>{
    expect(()=>verifyMayaDelivery(bytes({...payment,amount:1}),headers(),config,now)).toThrow()
    expect(()=>verifyMayaDelivery(bytes(payment),headers(0,Date.parse(now),wrong.privateKey),config,now)).toThrow()
    expect(()=>verifyMayaDelivery(bytes(payment),headers(),{...config,keyEnvironment:'production'},now)).toThrow()
    const broken=headers();broken.set('x-maya-webhook-signature','nonce=abcdef1234567890abcdef1234567890,v1=0011')
    expect(()=>verifyMayaDelivery(bytes(payment),broken,config,now)).toThrow()
  })
  it('bounds past and future milliseconds and requires an explicit two-key configuration',()=>{
    for(const delta of [-300001,300001])expect(()=>verifyMayaDelivery(bytes(payment),headers(0,Date.parse(now)+delta),config,now)).toThrow()
    expect(()=>verifyMayaDelivery(bytes(payment),headers(0,Math.floor(Date.parse(now)/1000)),config,now)).toThrow()
    expect(()=>verifyMayaDelivery(bytes(payment),headers(),{...config,publicKeys:[keys[0].publicKey]},now)).toThrow()
    expect(()=>verifyMayaDelivery(bytes(payment),headers(),{...config,publicKeys:[keys[0].publicKey,keys[0].publicKey+'\n']},now)).toThrow()
    const duplicate=headers();duplicate.append('x-maya-webhook-timestamp',String(Date.parse(now)))
    expect(()=>verifyMayaDelivery(bytes(payment),duplicate,config,now)).toThrow()
  })
  it('deduplicates facts across freshly signed retries while retaining separate delivery identities',()=>{
    const a=verifyMayaDelivery(bytes(payment),headers(),config,now),b=verifyMayaDelivery(bytes(payment),headers(1,Date.parse(now)+1000),config,now)
    expect(a.semanticKey).toBe(b.semanticKey);expect(a.deliveryKey).not.toBe(b.deliveryKey)
  })
  it('rejects malformed JSON, duplicate keys, flattened-key collisions and oversized requests',()=>{
    for(const raw of ['{','{"id":"one","id":"two"}',JSON.stringify({...payment,'fundSource.type':'card'}),JSON.stringify({...payment,description:'a&status=PAYMENT_SUCCESS'})])expect(()=>verifyMayaDelivery(Buffer.from(raw),headers(),config,now)).toThrow()
    expect(()=>verifyMayaDelivery(Buffer.alloc(65537),headers(),config,now)).toThrow()
    const duplicate=JSON.stringify(payment).replace('"amount":123.45','"amount":123.45,"amount":123.45')
    expect(()=>verifyMayaDelivery(Buffer.from(duplicate),headers(),config,now)).toThrow()
  })
  it('treats insignificant formatting as the same signed object rather than signing raw JSON bytes',()=>{
    const delivery=verifyMayaDelivery(Buffer.from(JSON.stringify(payment,null,2)),headers(),config,now)
    expect(delivery.payment.amount.minor).toBe('12345')
  })
})
