import '../support/env'
import {test,expect} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
let h:TestHarness
const origin='http://127.0.0.1:3043'
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async()=>{await h.reset()})
test.afterAll(async()=>{await h?.reset();await h?.close()})
test('issues private exact quotes and rejects altered totals, foreign browsers and stale acceptance',async({request,playwright})=>{
  const policy=await h.seed('policy-versions',{revision:1,approved:true,active:true,synthetic:true,approvalReference:'synthetic-browser-review',approvedSections:['stay','pricing'],sections:{stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:'unavailable'}}})
  const room=await h.seed('room-types',{name:'Quote browser fixture',slug:'quote-browser',maxGuests:2,onSale:true,_status:'published'})
  await h.seed('rooms',{label:'PRIVATE-BROWSER-ROOM',roomType:room.id,onSale:true})
  await h.seed('rate-plans',{roomType:room.id,policyVersion:policy.id,revision:1,rules:{currency:'PHP',nightMinor:'12345',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[],taxes:[],taxBasis:'room-and-fees-after-discount',rounding:'half-up-per-line'},validFrom:'2026-01-01T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-rate-browser-review'})
  const input={stay:{roomTypeId:room.id,arrival:'2027-05-10',departure:'2027-05-12',occupancy:{adults:2,children:0}}}
  const issued=await request.post('/api/booking/quotes',{headers:{origin},data:input})
  expect(issued.status()).toBe(201);expect(issued.headers()['cache-control']).toContain('no-store')
  const quote=await issued.json();expect(quote.total).toEqual({minor:'24690',currency:'PHP'})
  expect(quote.synthetic).toBe(true);expect(quote.policySnapshot).toBeUndefined();expect(quote.rateSnapshot).toBeUndefined()
  expect((await request.storageState()).cookies.find(cookie=>cookie.name==='acornelia-quote-browser')?.httpOnly).toBe(true)
  const outsider=await playwright.request.newContext({baseURL:origin})
  try{expect((await outsider.post('/api/booking/quotes/accept',{headers:{origin},data:{quoteId:quote.id,version:quote.version}})).ok()).toBe(false)}finally{await outsider.dispose()}
  expect((await request.post('/api/booking/quotes',{headers:{origin},data:{...input,totalMinor:'1'}})).status()).toBe(400)
  expect((await request.post('/api/booking/quotes/accept',{headers:{origin},data:{quoteId:quote.id,version:quote.version,totalMinor:'1'}})).status()).toBe(400)
  expect((await request.post('/api/booking/quotes/accept',{headers:{origin},data:{quoteId:quote.id,version:quote.version+1}})).ok()).toBe(false)
  const accepted=await request.post('/api/booking/quotes/accept',{headers:{origin},data:{quoteId:quote.id,version:quote.version}})
  expect(accepted.ok()).toBe(true);expect((await accepted.json()).quote.total).toEqual(quote.total)
  expect((await request.get('/api/quotes?depth=5',{headers:{origin}})).ok()).toBe(false)
  await request.post('/api/identity/customer/logout',{headers:{origin}})
  expect((await request.post('/api/booking/quotes/accept',{headers:{origin},data:{quoteId:quote.id,version:quote.version}})).ok()).toBe(false)
  expect(await h.rows('payment-attempts')).toHaveLength(0)
  expect(await h.rows('allocations')).toHaveLength(0)
})
