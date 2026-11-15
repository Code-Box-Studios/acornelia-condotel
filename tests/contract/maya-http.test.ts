import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import paymentFixtures from '../fixtures/maya/payments.json'
import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {createMayaGateway} from '@/integrations/maya/http'
import type {CheckoutAttempt,MayaConfig,ProviderMoneyRequest} from '@/integrations/maya/types'
const reference='ACNfixtureReference123456789',paymentId=paymentFixtures[0].id
const config:MayaConfig={environment:'sandbox',appEnv:'test',appUrl:'https://acornelia.example.test',publicKey:'pk-synthetic-contract-key',secretKey:'sk-synthetic-contract-key',timeoutMs:30,capabilities:{environment:'sandbox',approvalReference:'synthetic-provider-contract',checkoutEnabled:true,kountEnabled:false,voidEnabled:true,refundEnabled:true,partialRefunds:true,moneyMethods:['card'],maxAmountMinor:'999999999999999999999999'}}
const attempt:CheckoutAttempt={id:'33333333-3333-4333-8333-333333333333',bookingId:'44444444-4444-4444-8444-444444444444',merchantReference:reference,amount:{minor:'12345',currency:'PHP'},revision:1,deadline:'2026-11-15T04:15:00Z',synthetic:true}
const request:ProviderMoneyRequest={operationId:'55555555-5555-4555-8555-555555555555',paymentId,reference,amount:{minor:'12345',currency:'PHP'},reason:'guest-cancellation'}
const checkout={checkoutId:paymentId,redirectUrl:'https://payments-web-sandbox.paymaya.com/v2/checkout?id='+paymentId}
function response(data:unknown,status=200){return Response.json(data,{status})}
function transport(handler:(url:URL,init:RequestInit)=>Promise<Response>|Response){return vi.fn<typeof fetch>(async(input,init)=>handler(new URL(String(input)),init!))}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-15T04:00:00Z'))})
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
describe('Maya HTTP contract with synthetic local responses',()=>{
  it('retains multiple collections and never retries an unknown POST',async()=>{
    let createHttpRequests=0
    const fetcher=transport((_url,init)=>{if(init.method==='POST'){createHttpRequests++;throw new Error('submitted but response lost')};return response(paymentFixtures)})
    const gateway=createMayaGateway(config,{fetch:fetcher}),createResult=await gateway.createCheckout(attempt),foundPayments=await gateway.findPaymentsByReference(reference)
    expect(foundPayments).toHaveLength(2);expect(new Set(foundPayments.map(p=>p.id)).size).toBe(2)
    expect(createHttpRequests).toBe(1);expect(createResult.kind).toBe('unknown')
  })
  it('sends the verified contract through a real loopback HTTP connection',async()=>{
    const received:{path:string;body:string;authorization:string|undefined}[]=[]
    const server=createServer(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk))
      received.push({path:req.url!,body:Buffer.concat(chunks).toString(),authorization:req.headers.authorization})
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.method==='POST'?checkout:paymentFixtures))
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    const port=(server.address() as AddressInfo).port
    const localFetch:typeof fetch=(input,init)=>{
      const url=new URL(String(input));expect(url.origin).toBe('https://pg-sandbox.paymaya.com')
      return globalThis.fetch('http://127.0.0.1:'+port+url.pathname,init)
    }
    try{
      const gateway=createMayaGateway({...config,timeoutMs:1000},{fetch:localFetch})
      expect((await gateway.createCheckout(attempt)).kind).toBe('created')
      expect(await gateway.findPaymentsByReference(reference)).toHaveLength(2)
      expect(received).toHaveLength(2);expect(received[0].body).toContain('"value":123.45')
      expect(received[0].authorization).toBe('Basic '+Buffer.from(config.publicKey+':').toString('base64'))
      expect(received[1].authorization).toBe('Basic '+Buffer.from(config.secretKey+':').toString('base64'))
    }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
  })
  it('maps exact cents, key class, reference and private return paths without sending guest profiles',async()=>{
    const fetcher=transport((url,init)=>{
      expect(url.href).toBe('https://pg-sandbox.paymaya.com/checkout/v1/checkouts')
      const headers=new Headers(init.headers)
      expect(headers.get('authorization')).toBe('Basic '+Buffer.from(config.publicKey+':').toString('base64'))
      expect(init.redirect).toBe('manual');expect(init.cache).toBe('no-store')
      const body=JSON.parse(init.body as string)
      expect(body.totalAmount).toEqual({value:123.45,currency:'PHP'});expect(body.requestReferenceNumber).toBe(reference)
      expect(body.redirectUrl.success).toContain(config.appUrl+'/book/payment?')
      expect(Object.keys(body).sort()).toEqual(['redirectUrl','requestReferenceNumber','totalAmount'])
      expect(headers.has('x-idempotency-key')).toBe(false)
      return response(checkout)
    })
    expect((await createMayaGateway(config,{fetch:fetcher}).createCheckout(attempt)).kind).toBe('created')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([{host:'payments.maya.ph',kind:'created'},{host:'payments.paymaya.com',kind:'created'},{host:'payments-web.paymaya.com',kind:'unknown'}])('uses current production API and checkout hosts for $host',async({host,kind})=>{
    const fetcher=transport(()=>response({...checkout,redirectUrl:'https://'+host+'/v2/checkout?id='+paymentId}))
    const production={...config,appEnv:'production' as const,environment:'production' as const,capabilities:{...config.capabilities,environment:'production' as const}}
    expect((await createMayaGateway(production,{fetch:fetcher}).createCheckout({...attempt,synthetic:false})).kind).toBe(kind)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(new URL(String(fetcher.mock.calls[0][0])).origin).toBe('https://pg.maya.ph')
  })
  it('serializes large outgoing amounts exactly and refuses unsafe numeric provider amounts',async()=>{
    const fetcher=transport((_url,init)=>{expect(init.body).toContain('90071992547409.93');return response(checkout)})
    expect((await createMayaGateway(config,{fetch:fetcher}).createCheckout({...attempt,amount:{minor:'9007199254740993',currency:'PHP'}})).kind).toBe('created')
    const invalid=transport(()=>response({...paymentFixtures[0],amount:9007199254740993}))
    await expect(createMayaGateway(config,{fetch:invalid}).retrievePayment(paymentId)).rejects.toThrow('Maya response could not be verified')
  })
  it.each([{}, {...checkout,redirectUrl:'https://attacker.example.test/pay'}, {...checkout,redirectUrl:'http://payments-web-sandbox.paymaya.com/pay'}])('retains uncertainty after malformed checkout success %j',async body=>{
    const fetcher=transport(()=>response(body)),result=await createMayaGateway(config,{fetch:fetcher}).createCheckout(attempt)
    expect(result.kind).toBe('unknown');expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('bounds response waits and never converts a timeout or server failure into a safe retry',async()=>{
    const fetcher=transport((_url,init)=>new Promise((_resolve,reject)=>{init.signal?.addEventListener('abort',()=>reject(new Error('aborted')), {once:true})}))
    expect((await createMayaGateway(config,{fetch:fetcher}).createCheckout(attempt)).kind).toBe('unknown');expect(fetcher).toHaveBeenCalledTimes(1)
    const broken=transport(()=>response({message:config.secretKey},500))
    const result=await createMayaGateway(config,{fetch:broken}).createCheckout(attempt)
    expect(result.kind).toBe('unknown');expect(JSON.stringify(result)).not.toContain(config.secretKey)
  })
  it('rejects wrong keys, arbitrary hosts, capability environment swaps and production fixtures before HTTP',async()=>{
    const fetcher=transport(()=>response(checkout))
    expect(()=>createMayaGateway({...config,publicKey:config.secretKey},{fetch:fetcher})).toThrow()
    expect(()=>createMayaGateway({...config,baseUrl:'https://attacker.example.test'} as MayaConfig,{fetch:fetcher})).toThrow()
    expect(()=>createMayaGateway({...config,capabilities:{...config.capabilities,environment:'production'}},{fetch:fetcher})).toThrow()
    expect(()=>createMayaGateway({...config,appEnv:'preview',environment:'production'},{fetch:fetcher})).toThrow()
    expect((await createMayaGateway({...config,appEnv:'production',environment:'production',capabilities:{...config.capabilities,environment:'production'}},{fetch:fetcher}).createCheckout(attempt)).kind).toBe('refused')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('refuses unsupported Kount or unapproved checkout and treats provider authentication as a known refusal',async()=>{
    const fetcher=transport(()=>response({message:'not disclosed'},401))
    const kount=createMayaGateway({...config,capabilities:{...config.capabilities,kountEnabled:true}},{fetch:fetcher})
    expect((await kount.createCheckout(attempt)).kind).toBe('refused');expect(fetcher).not.toHaveBeenCalled()
    expect((await createMayaGateway(config,{fetch:fetcher}).createCheckout(attempt))).toEqual({kind:'refused',reason:'provider-authentication'})
  })
  it('keeps retrieval failures and reference mismatches distinct from an empty verified result',async()=>{
    const missing=transport(()=>response({code:'PY0009'},404))
    await expect(createMayaGateway(config,{fetch:missing}).findPaymentsByReference(reference)).rejects.toThrow()
    const wrong=transport(()=>response([{...paymentFixtures[0],requestReferenceNumber:'wrong'}]))
    await expect(createMayaGateway(config,{fetch:wrong}).findPaymentsByReference(reference)).rejects.toThrow()
    expect(await createMayaGateway(config,{fetch:transport(()=>response([]))}).findPaymentsByReference(reference)).toEqual([])
    const contradictory=transport(()=>response({...paymentFixtures[0],status:'PAYMENT_FAILED',paymentStatus:'PAYMENT_SUCCESS'}))
    await expect(createMayaGateway(config,{fetch:contradictory}).retrievePayment(paymentId)).rejects.toThrow()
  })
  it('uses full-only voids and exact refund request fields with fresh provider capability checks',async()=>{
    const calls:{url:string;body:unknown}[]=[]
    const fetcher=transport((url,init)=>{
      if(init.method==='GET')return response(url.pathname.endsWith('/refunds')?[]:paymentFixtures[0])
      calls.push({url:url.pathname,body:JSON.parse(init.body as string)})
      return response({id:'66666666-6666-4666-8666-666666666666',payment:paymentId,status:'SUCCESS',amount:'123.45',currency:'PHP'})
    })
    const gateway=createMayaGateway(config,{fetch:fetcher,now:()=> '2026-11-15T04:00:00Z'})
    expect((await gateway.voidPayment({...request,amount:{minor:'1',currency:'PHP'}})).kind).toBe('refused')
    expect((await gateway.voidPayment(request)).kind).toBe('verified')
    expect(calls).toHaveLength(1);expect(calls[0].url).toBe('/payments/v1/payments/'+paymentId+'/voids')
    const refundFetcher=transport((url,init)=>{
      if(init.method==='GET')return response(url.pathname.endsWith('/refunds')?[]:{...paymentFixtures[0],canVoid:false,canRefund:true})
      const body=JSON.parse(init.body as string);expect(body.totalAmount).toEqual({amount:1.23,currency:'PHP'})
      return response({id:'77777777-7777-4777-8777-777777777777',payment:paymentId,status:'SUCCESS',amount:'1.23',currency:'PHP'})
    })
    expect((await createMayaGateway(config,{fetch:refundFetcher,now:()=> '2026-11-16T04:00:00Z'}).refundPayment({...request,amount:{minor:'123',currency:'PHP'}})).kind).toBe('verified')
  })
  it('rejects unsupported money methods, elapsed windows and external refunded balances without POST',async()=>{
    let posts=0
    const fetcher=transport((url,init)=>{if(init.method==='POST'){posts++;return response({})};return response(url.pathname.endsWith('/refunds')?[{id:'88888888-8888-4888-8888-888888888888',payment:paymentId,status:'SUCCESS',amount:'123.44',currency:'PHP'}]:{...paymentFixtures[0],canVoid:false,canRefund:true})})
    const gateway=createMayaGateway(config,{fetch:fetcher,now:()=> '2026-11-16T04:00:00Z'})
    expect((await gateway.refundPayment({...request,amount:{minor:'2',currency:'PHP'}})).kind).toBe('refused')
    expect((await gateway.voidPayment(request)).kind).toBe('refused')
    const disabled=createMayaGateway({...config,capabilities:{...config.capabilities,moneyMethods:[]}},{fetch:fetcher,now:()=> '2026-11-16T04:00:00Z'})
    expect((await disabled.refundPayment(request)).kind).toBe('refused');expect(posts).toBe(0)
  })
  it.each(['void','refund'] as const)('preserves one unknown %s operation after response loss',async kind=>{
    let posts=0
    const fetcher=transport((url,init)=>{
      if(init.method==='GET')return response(url.pathname.endsWith('/refunds')?[]:{...paymentFixtures[0],canVoid:kind==='void',canRefund:kind==='refund'})
      posts++;throw new Error('Provider may have received the operation')
    })
    const gateway=createMayaGateway(config,{fetch:fetcher,now:()=>kind==='void'?'2026-11-15T04:00:00Z':'2026-11-16T04:00:00Z'})
    const result=await (kind==='void'?gateway.voidPayment(request):gateway.refundPayment(request))
    expect(result).toEqual({kind:'unknown',environment:'sandbox',paymentId,operationId:request.operationId})
    expect(posts).toBe(1)
  })
  it('refuses a refund one instant beyond 180 elapsed days even on the same property calendar day',async()=>{
    let posts=0
    const fetcher=transport((url,init)=>{if(init.method==='POST'){posts++;return response({})};return response(url.pathname.endsWith('/refunds')?[]:{...paymentFixtures[0],canVoid:false,canRefund:true})})
    const now=new Date(Date.parse(paymentFixtures[0].paymentAt)+180*86400000+1).toISOString()
    const result=await createMayaGateway(config,{fetch:fetcher,now:()=>now}).refundPayment(request)
    expect(result).toEqual({kind:'refused',reason:'ineligible'});expect(posts).toBe(0)
  })
})
