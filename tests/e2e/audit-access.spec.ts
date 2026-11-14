import '../support/env'
import {test,expect} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
const origin='http://127.0.0.1:3043',password='Synthetic-audit-browser-935!'
let h:TestHarness
const marker='Protected action fixture 4205'
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async({page})=>{
  await h.reset();await page.goto('/')
  await h.seed('audit-entries',{actor:{kind:'system',purpose:'payments'},action:'fixture:protected',recordType:'booking',outcome:'success',safeChanges:{title:marker}})
})
test.afterAll(async()=>{await h?.reset();await h?.close()})

test('ordinary staff cannot read, count, version or export protected action logs',async({page})=>{
  await h.seed('staff-users',{name:'Staff fixture',email:'staff@example.test',password,role:'staff'})
  expect((await page.request.post('/api/staff-users/login',{headers:{origin},data:{email:'staff@example.test',password}})).ok()).toBe(true)
  for(const path of ['/api/audit-entries','/api/audit-entries/count','/api/audit-entries/versions','/api/developer/audit?format=csv']){
    const response=await page.request.get(path,{headers:{origin}})
    expect(response.ok()).toBe(false)
    expect(await response.text()).not.toContain(marker)
  }
  expect((await h.rows('audit-entries')).some(x=>x.outcome==='refused')).toBe(true)
})

test('a signed-in developer can read and export a filtered page while old entries stay immutable',async({page})=>{
  await h.seed('staff-users',{name:'Developer fixture',email:'developer@example.test',password,role:'developer'})
  expect((await page.request.post('/api/staff-users/login',{headers:{origin},data:{email:'developer@example.test',password}})).ok()).toBe(true)
  const response=await page.request.get('/api/developer/audit?action=fixture:protected',{headers:{origin}})
  expect(response.ok()).toBe(true)
  const data=await response.json()
  expect(data.items.length).toBe(1)
  const csv=await page.request.get('/api/developer/audit?format=csv&action=fixture:protected',{headers:{origin}})
  expect(csv.ok()).toBe(true)
  expect(csv.headers()['content-type']).toContain('text/csv')
  expect(csv.headers()['cache-control']).toContain('no-store')
  expect(await csv.text()).toContain(marker)
  expect((await h.rows('audit-entries')).some(x=>x.action==='audit:export')).toBe(true)
  const altered=await page.request.patch(`/api/audit-entries/${data.items[0].id}`,{headers:{origin},data:{action:'rewritten'}})
  expect(altered.ok()).toBe(false)
})

test('gateway refusals are recorded without copying raw credentials',async({page})=>{
  await page.request.post('/api/staff-users/first-register',{headers:{origin},data:{name:'Blocked',email:'blocked@example.test',password}})
  const logs=await h.rows('audit-entries')
  expect(logs.some(x=>x.action==='gateway:refused'&&x.outcome==='refused')).toBe(true)
  expect(JSON.stringify(logs)).not.toContain(password)
  expect(JSON.stringify(logs)).not.toContain('blocked@example.test')
})
