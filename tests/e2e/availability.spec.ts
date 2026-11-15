import '../support/env'
import {createHarness,type TestHarness} from '../support/harness'
import {test,expect} from '@playwright/test'
let h:TestHarness
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async()=>{await h.reset()})
test.afterAll(async()=>{await h?.reset();await h?.close()})
test('keeps public availability private and unavailable until an approved stay policy is configured',async({request})=>{
  const response=await request.get('/api/booking/availability?arrival=2027-05-10&departure=2027-05-12&adults=2&children=0')
  expect(response.status()).toBe(503)
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(await response.json()).toEqual({error:'Availability is being prepared. Please contact Acornelia.'})
  expect((await request.get('/api/booking/availability?arrival=2027-02-29&departure=2027-03-02&adults=2&children=0')).status()).toBe(400)
  expect((await request.get('/api/booking/availability?arrival=2027-05-10&departure=2027-05-12&adults=2&children=0&ownerCustomer=foreign')).status()).toBe(400)
})
