import '../support/env'
import {test,expect} from '@playwright/test'
test('requires runner credentials and never accepts browser identity or arbitrary handlers',async({request})=>{
  const route='/api/internal/work'
  expect((await request.post(route,{data:{}})).status()).toBe(401)
  expect((await request.post(route,{headers:{authorization:'Bearer wrong'},data:{}})).status()).toBe(401)
  const headers={authorization:'Bearer synthetic-browser-runner-secret-not-for-production'}
  expect((await request.post(route,{headers,data:{kind:'email',maxJobs:101}})).status()).toBe(400)
  expect((await request.post(route,{headers,data:{handler:'create-checkout'}})).status()).toBe(400)
  const unavailable=await request.post(route,{headers,data:{maxJobs:1}})
  expect(unavailable.status()).toBe(503)
  expect(unavailable.headers()['cache-control']).toContain('no-store')
  expect(await unavailable.json()).toEqual({error:'Work transport is not configured.'})
  expect(await unavailable.text()).not.toContain('synthetic-browser-runner-secret')
})
