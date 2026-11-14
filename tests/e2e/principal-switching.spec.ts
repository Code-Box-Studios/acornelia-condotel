import '../support/env'
import {test,expect,type Page} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
const origin='http://127.0.0.1:3043'
const password='Synthetic-browser-passphrase-824!'
let h:TestHarness
async function identity(page:Page){return page.evaluate(async()=>{
  const response=await fetch('/api/identity/me')
  return {body:await response.json(),cache:response.headers.get('cache-control')}
})}
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async({page})=>{await h.reset();await page.goto('/')})
test.afterAll(async()=>{await h?.reset();await h?.close()})

test('refuses anonymous first-admin registration even when the database has no staff',async({page})=>{
  for(const path of ['/api/staff-users/first-register','/api/staff-users/first%2Dregister','/api/customers/first-register']){
    const response=await page.request.post(path,{headers:{origin},data:{email:'first@example.test',password,name:'Unauthorized First User'}})
    expect(response.status()).toBeGreaterThanOrEqual(400)
    expect(await h.rows('staff-users')).toHaveLength(0)
    expect(await h.rows('customers')).toHaveLength(0)
  }
})

test('rejects cross-origin login and keeps API responses private',async({page})=>{
  await h.seed('staff-users',{email:'staff@example.test',password,name:'Synthetic Staff',role:'staff'})
  const refused=await page.request.post('/api/staff-users/login',{headers:{origin:'https://unrelated.example.test'},data:{email:'staff@example.test',password}})
  expect(refused.status()).toBe(403)
  const login=await page.request.post('/api/staff-users/login',{headers:{origin},data:{email:'staff@example.test',password}})
  expect(login.ok()).toBe(true)
  expect(Object.hasOwn(await login.json(),'token')).toBe(false)
  const native=await page.request.get('/api/staff-users/me',{headers:{origin}})
  expect(native.headers()['cache-control']).toContain('no-store')
})

test('switches one browser from staff to customer without retaining staff access',async({page,context})=>{
  const staff=await h.seed('staff-users',{email:'staff@example.test',password,name:'Synthetic Staff',role:'staff'})
  const customer=await h.seed('customers',{email:'customer@example.test',password,name:'Synthetic Customer',_verified:true})
  expect((await page.request.post('/api/staff-users/login',{headers:{origin},data:{email:staff.email,password}})).ok()).toBe(true)
  expect((await identity(page)).body.principal.kind).toBe('staff')
  expect((await page.request.post('/api/customers/login',{headers:{origin},data:{email:customer.email,password}})).ok()).toBe(true)
  const current=await identity(page)
  expect(current.body.principal).toEqual({kind:'customer',collection:'customers',id:customer.id})
  expect(current.cache).toContain('no-store')
  const cookies=(await context.cookies()).filter(x=>x.name==='acornelia-token')
  expect(cookies.length).toBe(1)
  expect(Boolean(cookies[0]?.httpOnly)).toBe(true)
  expect((await page.request.get('/api/bookings',{headers:{origin}})).status()).toBe(403)
  const graph=await page.request.post('/api/graphql',{headers:{origin},data:{query:'{ Bookings { docs { id contact } } }'}})
  expect(graph.ok()).toBe(false)
})

test('revokes the cookie session on logout and deactivation',async({page,context})=>{
  const customer=await h.seed('customers',{email:'customer@example.test',password,name:'Synthetic Customer',_verified:true})
  expect((await page.request.post('/api/customers/login',{headers:{origin},data:{email:customer.email,password}})).ok()).toBe(true)
  const saved=(await context.cookies()).find(x=>x.name==='acornelia-token')!
  expect((await identity(page)).body.principal.kind).toBe('customer')
  expect((await page.request.post('/api/customers/logout',{headers:{origin}})).ok()).toBe(true)
  const replay=await page.request.get('/api/identity/me',{headers:{origin,cookie:`${saved.name}=${saved.value}`}})
  expect((await replay.json()).principal.kind).toBe('anonymous')
  expect((await page.request.post('/api/customers/login',{headers:{origin},data:{email:customer.email,password}})).ok()).toBe(true)
  await h.payload.update({collection:'customers',id:customer.id,data:{deactivated:true},overrideAccess:true})
  expect((await identity(page)).body.principal.kind).toBe('anonymous')
  const native=await page.request.get('/api/customers/me',{headers:{origin}})
  expect((await native.json()).user).toBeNull()
})
