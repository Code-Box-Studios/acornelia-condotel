import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {registerCustomer,requestCustomerRecovery,activateCustomer,resetCustomerPassword,AUTH_ACK} from '@/features/auth/actions'
import {loginCustomer} from '@/features/auth/login'
import {principalFromHeaders} from '@/features/auth/principal'
import {decryptPrivateState} from '@/domain/security/private-state'
const password='Synthetic-new-customer-passphrase-825!'
describe('customer email/password candidate and private recovery',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-14T04:00:00Z')})
  afterAll(async()=>{await h?.close()})
  const guest=()=>h.ctx({kind:'anonymous'})
  async function delivery(purpose:string){const messages=await h.rows('auth-deliveries',{purpose:{equals:purpose}});expect(messages.length).toBeGreaterThan(0);const record=messages[0];return decryptPrivateState(record.encryptedState,'auth-delivery:'+record.id) as {token:string;recipient:string}}
  it('keeps registration generic, creates an unverified customer and activates only with a one-use email token and chosen password',async()=>{
    expect(await registerCustomer(guest(),{name:'Customer fixture',email:'  New.Customer@Example.test  '})).toEqual(AUTH_ACK)
    const account=(await h.rows('customers'))[0]
    expect(account.email).toBe('new.customer@example.test')
    expect(account._verified).toBe(false)
    expect((await h.payload.findByID({collection:'customers',id:account.id,overrideAccess:true,showHiddenFields:true}))._verificationToken===null).toBe(true)
    const message=await delivery('verify')
    expect(JSON.stringify(await h.rows('auth-tokens'))).not.toContain(message.token)
    expect(JSON.stringify(await h.rows('audit-entries'))).not.toContain(message.token)
    await activateCustomer(guest(),message.token,{name:'Verified fixture',password})
    const verified=await h.payload.findByID({collection:'customers',id:account.id,overrideAccess:true})
    expect(verified._verified).toBe(true)
    expect(verified.name).toBe('Verified fixture')
    const login=await loginCustomer(guest(),h.payload,{email:account.email,password},new Headers())
    const actor=await principalFromHeaders(new Headers({cookie:login.cookie.split(';')[0],origin:process.env.APP_URL!}),h.payload)
    expect(actor.kind).toBe('customer')
    await expect(activateCustomer(guest(),message.token,{name:'Reused fixture',password})).rejects.toThrow()
    const before=(await h.rows('auth-deliveries')).length
    expect(await registerCustomer(guest(),{name:'Overwrite attempt',email:account.email})).toEqual(AUTH_ACK)
    expect((await h.rows('auth-deliveries')).length).toBe(before)
    expect((await h.rows('customers'))[0].name).toBe('Verified fixture')
  })
  it('makes known, missing, deactivated and throttled recovery responses identical',async()=>{
    await h.seed('customers',{name:'Known fixture',email:'known@example.test',password,_verified:true})
    await h.seed('customers',{name:'Inactive fixture',email:'inactive@example.test',password,_verified:true,deactivated:true})
    for(const email of ['known@example.test','missing@example.test','inactive@example.test','known@example.test','known@example.test','known@example.test'])expect(await requestCustomerRecovery(guest(),email)).toEqual(AUTH_ACK)
    const messages=await h.rows('auth-deliveries')
    expect(messages).toHaveLength(3)
    for(const record of messages){const message=decryptPrivateState(record.encryptedState,'auth-delivery:'+record.id) as {recipient:string};expect(message.recipient).toBe('known@example.test')}
  })
  it('expires tokens, separates purposes and resets without reviving sessions or changing account ownership',async()=>{
    const account=await h.seed('customers',{name:'Reset fixture',email:'reset@example.test',password,_verified:true})
    await requestCustomerRecovery(guest(),account.email)
    const message=await delivery('reset')
    await expect(activateCustomer(guest(),message.token,{name:'Wrong purpose',password})).rejects.toThrow()
    await resetCustomerPassword(guest(),message.token,'Another-synthetic-passphrase-924!')
    const result=await h.payload.findByID({collection:'customers',id:account.id,overrideAccess:true})
    expect(result.id).toBe(account.id)
    expect(result.sessions||[]).toHaveLength(0)
    expect(result.securityRevision).toBe(2)
    await expect(resetCustomerPassword(guest(),message.token,password)).rejects.toThrow()
    await requestCustomerRecovery(guest(),account.email)
    const expired=await delivery('reset')
    h.clock.set('2026-11-14T06:00:00Z')
    await expect(resetCustomerPassword(guest(),expired.token,password)).rejects.toThrow()
    expect(await h.rows('bookings')).toHaveLength(0)
  })
  it('keeps concurrent registration generic without duplicating accounts or bypassing the request cap',async()=>{
    const results=await Promise.all(Array.from({length:4},()=>registerCustomer(guest(),{name:'Concurrent fixture',email:'concurrent@example.test'})))
    for(const result of results)expect(result).toEqual(AUTH_ACK)
    expect(await h.rows('customers')).toHaveLength(1)
    expect(await h.rows('auth-deliveries')).toHaveLength(3)
  })
  it('consumes a recovery token once under concurrency',async()=>{
    const account=await h.seed('customers',{name:'Concurrent reset fixture',email:'parallel-reset@example.test',password,_verified:true})
    await requestCustomerRecovery(guest(),account.email)
    const message=await delivery('reset')
    const results=await Promise.allSettled([resetCustomerPassword(guest(),message.token,password),resetCustomerPassword(guest(),message.token,password)])
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
    expect((await h.rows('customers'))[0].securityRevision).toBe(2)
  })
  it('records customer sign-in in the native authentication transaction',async()=>{
    const user=await h.seed('customers',{name:'Login fixture',email:'login@example.test',password,_verified:true})
    await h.payload.login({collection:'customers',data:{email:user.email,password}})
    const logs=await h.rows('audit-entries')
    expect(logs.some(entry=>entry.action==='customer:login'&&entry.recordId===user.id)).toBe(true)
  })
  it('does not accept public token or auth-delivery reads',async()=>{
    await registerCustomer(guest(),{name:'Privacy fixture',email:'privacy@example.test'})
    for(const collection of ['auth-tokens','auth-deliveries','auth-throttles'] as const)await expect(h.payload.find({collection,overrideAccess:false})).rejects.toThrow()
  })
})
