import '../support/env'
import {randomUUID} from 'node:crypto'
import {test,expect} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
let h:TestHarness
const origin='http://127.0.0.1:3043'
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async()=>{await h.reset()})
test.afterAll(async()=>{await h?.reset();await h?.close()})
test('prepares a private guest booking once and refuses financial tampering or a foreign browser',async({request,playwright})=>{
  const policy=await h.seed('policy-versions',{revision:1,active:true,approved:true,synthetic:true,approvalReference:'synthetic-checkout-browser',approvedSections:['stay','pricing','checkout'],sections:{stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:'unavailable'},checkout:{payment:'full',holdMinutes:15,thirdPartyBookings:false}}})
  const room=await h.seed('room-types',{name:'Checkout browser fixture',slug:'checkout-browser',maxGuests:2,onSale:true,_status:'published'})
  await h.seed('rooms',{label:'PRIVATE-CHECKOUT-BROWSER',roomType:room.id,onSale:true})
  await h.seed('rate-plans',{roomType:room.id,policyVersion:policy.id,revision:1,rules:{currency:'PHP',nightMinor:'12345',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[],taxes:[],taxBasis:'room-and-fees-after-discount',rounding:'half-up-per-line'},validFrom:'2026-01-01T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-checkout-browser-rate'})
  const headers={origin},issued=await request.post('/api/booking/quotes',{headers,data:{stay:{roomTypeId:room.id,arrival:'2027-05-10',departure:'2027-05-12',occupancy:{adults:2,children:0}}}}),quote=await issued.json()
  expect(issued.status()).toBe(201)
  const input={commandKey:randomUUID(),quoteId:quote.id,version:quote.version,contact:{name:'Browser guest',email:'checkout-browser@example.test'}}
  expect((await request.post('/api/booking/quotes/accept',{headers,data:{quoteId:quote.id,version:quote.version}})).ok()).toBe(true)
  expect((await request.post('/api/booking/checkout',{headers,data:{...input,totalMinor:'1'}})).status()).toBe(400)
  const prepared=await request.post('/api/booking/checkout',{headers,data:input}),receipt=await prepared.json()
  expect(prepared.status()).toBe(202);expect(prepared.headers()['cache-control']).toContain('no-store')
  expect(receipt.state).toBe('preparing');expect(receipt.total).toEqual({minor:'24690',currency:'PHP'})
  expect(JSON.stringify(receipt)).not.toMatch(/checkout-browser@example|merchantReference|checkoutUrl|PRIVATE-CHECKOUT/)
  expect(await (await request.post('/api/booking/checkout',{headers,data:input})).json()).toEqual(receipt)
  const outsider=await playwright.request.newContext({baseURL:origin})
  try{expect((await outsider.post('/api/booking/checkout',{headers,data:input})).status()).toBe(401)}finally{await outsider.dispose()}
  expect(await h.rows('bookings')).toHaveLength(1);expect((await h.rows('bookings'))[0].ownerCustomer).toBeNull()
  expect(await h.rows('payment-attempts')).toHaveLength(1);expect(await h.rows('work-items')).toHaveLength(1)
})
