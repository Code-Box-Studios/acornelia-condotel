import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createLocalReq} from 'payload'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createHarness,type TestHarness} from '../support/harness'
import {authorize} from '@/features/auth/authorization'
import {principalFromHeaders} from '@/features/auth/principal'
const password='Synthetic-test-passphrase-946!'
describe('customer and staff authorization boundaries',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset()})
  afterAll(async()=>{await h?.close()})
  async function customer(name='Fixture Customer'){
    return h.seed('customers',{email:`${randomUUID()}@example.test`,name,password,_verified:true})
  }
  async function staff(role:'staff'|'developer'='staff'){
    return h.seed('staff-users',{email:`${randomUUID()}@example.test`,name:'Fixture Staff',password,role})
  }
  it('allows guest booking creation without granting private booking access',()=>{
    expect(()=>authorize({kind:'anonymous'},'booking:create',{kind:'booking'})).not.toThrow()
    expect(()=>authorize({kind:'anonymous'},'booking:read',{kind:'booking'})).toThrow()
  })
  it('allows only the owning customer to read a booking',()=>{
    const actor={kind:'customer' as const,collection:'customers' as const,id:'owner'}
    expect(()=>authorize(actor,'booking:read',{kind:'booking',ownerCustomerId:'owner'})).not.toThrow()
    expect(()=>authorize(actor,'booking:read',{kind:'booking',ownerCustomerId:'other'})).toThrow()
    expect(()=>authorize(actor,'admin:enter',{kind:'admin'})).toThrow()
    expect(()=>authorize(actor,'audit:read',{kind:'audit'})).toThrow()
  })
  it('allows every customer account to read offers and prevents offer mutation',()=>{
    const actor={kind:'customer' as const,collection:'customers' as const,id:'owner'}
    expect(()=>authorize(actor,'offer:read',{kind:'offer'})).not.toThrow()
    expect(()=>authorize(actor,'offer:write',{kind:'offer'})).toThrow()
    expect(()=>authorize({kind:'anonymous'},'offer:read',{kind:'offer'})).toThrow()
  })
  it('rejects forged principal headers rather than treating typed claims as authentication',async()=>{
    expect(await principalFromHeaders(new Headers({Authorization:'JWT forged-admin-claims'}),h.payload)).toEqual({kind:'anonymous'})
  })
  it('allows a customer to read only their own account through Local API',async()=>{
    const own=await customer(),other=await customer()
    const user={...own,collection:'customers' as const}
    const result=await h.payload.find({collection:'customers',user,overrideAccess:false,depth:0})
    expect(result.docs.map(x=>x.id)).toEqual([own.id])
    await expect(h.payload.findByID({collection:'customers',id:other.id,user,overrideAccess:false})).rejects.toThrow()
    const req=await createLocalReq({user},h.payload)
    expect(await h.payload.collections.customers.config.access.admin({req})).toBe(false)
    await expect(h.payload.find({collection:'bookings',user,overrideAccess:false})).rejects.toThrow()
  })
  it('does not treat matching UUIDs in different identity collections as the same owner',async()=>{
    const record=await staff()
    await h.pool.query('insert into customers(id,name,email,_verified,deactivated) values($1,$2,$3,true,false)',[record.id,'Different collection fixture','same-id@example.test'])
    const user={...record,collection:'staff-users' as const}
    await expect(h.payload.find({collection:'customers',user,overrideAccess:false})).rejects.toThrow()
  })
  it('refuses direct registration with protected verification or role fields',async()=>{
    await expect(h.payload.create({collection:'customers',data:{name:'Attacker',email:'attacker@example.test',password,_verified:true},overrideAccess:false})).rejects.toThrow()
    expect(await h.rows('customers')).toHaveLength(0)
  })
  it('never lets a normal staff account grant developer role or read protected logs',async()=>{
    const record=await staff()
    const user={...record,collection:'staff-users' as const}
    expect(()=>authorize({kind:'staff',collection:'staff-users',id:record.id,role:'staff'},'staff:grant-developer',{kind:'staff-user'})).toThrow()
    await expect(h.payload.update({collection:'staff-users',id:record.id,data:{role:'developer'},user,overrideAccess:false})).rejects.toThrow()
    expect((await h.payload.findByID({collection:'staff-users',id:record.id,overrideAccess:true})).role).toBe('staff')
    await expect(h.payload.find({collection:'audit-entries',user,overrideAccess:false})).rejects.toThrow()
  })
  it('rejects a deactivated customer even with a previously valid token',async()=>{
    const record=await customer()
    await h.payload.login({collection:'customers',data:{email:record.email,password}})
    await h.payload.update({collection:'customers',id:record.id,data:{deactivated:true},overrideAccess:true})
    const stored=await h.payload.findByID({collection:'customers',id:record.id,overrideAccess:true,showHiddenFields:true})
    expect(stored.sessions??[]).toHaveLength(0)
    await expect(h.payload.login({collection:'customers',data:{email:record.email,password}})).rejects.toThrow()
  })
  it('bootstraps one local operator atomically and refuses reuse or a hosted target',async()=>{
    const command=[fileURLToPath(import.meta.resolve('tsx/cli')),'scripts/bootstrap-staff.ts']
    const env={...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,APP_ENV:'test',BOOTSTRAP_ADMIN_EMAIL:'operator@example.test',BOOTSTRAP_ADMIN_PASSWORD:password}
    const first=spawnSync(process.execPath,command,{env,encoding:'utf8',timeout:30000})
    expect(first.status).toBe(0)
    expect((await h.rows('staff-users')).map(x=>x.role)).toEqual(['developer'])
    expect((await h.rows('audit-entries')).map(x=>x.action)).toEqual(['staff:bootstrap'])
    expect(spawnSync(process.execPath,command,{env,encoding:'utf8',timeout:30000}).status).not.toBe(0)
    const refused=spawnSync(process.execPath,command,{env:{...env,APP_ENV:'production',DATABASE_URL:'postgresql://fixture:unused@hosted.example.test/acornelia'},encoding:'utf8',timeout:10000})
    expect(refused.status).not.toBe(0)
    expect(await h.rows('staff-users')).toHaveLength(1)
  })
  it('requires verification before authenticating a new customer',async()=>{
    const record=await h.seed('customers',{name:'Unverified',email:'unverified@example.test',password,_verified:false})
    await expect(h.payload.login({collection:'customers',data:{email:record.email,password}})).rejects.toThrow()
  })
})
