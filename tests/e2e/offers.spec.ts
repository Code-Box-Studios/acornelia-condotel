import '../support/env'
import {test,expect} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
import {syntheticOfferTerms} from '../support/offer-fixtures'
import {publishOffer,withdrawOffer} from '@/domain/offers/publication'
import {policyFromRecord} from '@/domain/policy/current'
let h:TestHarness
const origin='http://127.0.0.1:3043',password='Synthetic-offer-browser-passphrase-946!'
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async()=>{await h.reset()})
test.afterAll(async()=>{await h?.reset();await h?.close()})
test('shows a clear empty account-offer state without creating a signup gift or promotional work',async({page})=>{
  await h.seed('customers',{name:'Offer account fixture',email:'empty-offers@example.test',password,_verified:true})
  expect((await page.request.post('/api/identity/customer/login',{headers:{origin},data:{email:'empty-offers@example.test',password}})).ok()).toBe(true)
  const response=await page.goto('/account/offers');expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading',{name:'No current offers.',exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'My bookings',exact:true})).toBeVisible()
  expect(await h.rows('offers')).toHaveLength(0)
  expect(await h.rows('work-items')).toHaveLength(0)
})
test('shows published all-account terms privately and withdraws them on reload in both themes',async({page})=>{
  const policy=await h.seed('policy-versions',{revision:1,approved:true,active:true,synthetic:true,approvalReference:'synthetic-offer-browser-policy',approvedSections:['stay','pricing','offers'],sections:{stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:'unavailable'},offers:{enabled:true,accountScope:'all-customers',discountOrder:'before-fees-and-tax'}}})
  const developer=await h.seed('staff-users',{name:'Offer editor fixture',email:'offer-editor@example.test',password,role:'developer'})
  const ctx={...h.ctx({kind:'staff',collection:'staff-users',id:developer.id,role:'developer'}),policy:policyFromRecord(policy)}
  const version=await publishOffer(ctx,{name:'A little extra for your stay',terms:syntheticOfferTerms({overallLimit:10}),approvalReference:'synthetic-offer-browser-review'})
  await h.seed('customers',{name:'Offer account fixture',email:'offers@example.test',password,_verified:true})
  expect((await page.request.post('/api/identity/customer/login',{headers:{origin},data:{email:'offers@example.test',password}})).ok()).toBe(true)
  await page.goto('/account');await page.getByRole('link',{name:'My offers',exact:true}).click()
  await expect(page.getByRole('heading',{name:'A little extra for your stay',exact:true})).toBeVisible()
  await expect(page.locator('main')).toContainText('₱15.00')
  await expect(page.locator('main')).toContainText('per account')
  const api=await page.request.get('/api/customer/offers',{headers:{origin}})
  expect(api.headers()['cache-control']).toContain('no-store')
  expect((await api.json()).items).toHaveLength(1)
  expect((await page.request.get('/api/customer/offers?customerId=foreign',{headers:{origin}})).status()).toBe(400)
  expect((await page.request.get('/api/offer-versions?depth=4',{headers:{origin}})).ok()).toBe(false)
  await page.setViewportSize({width:320,height:780})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.getByRole('button',{name:'Switch color theme'}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'.local/account-offer-'+test.info().project.name+'.png',fullPage:true})
  await withdrawOffer(ctx,version.offerId);await page.reload()
  await expect(page.getByRole('heading',{name:'No current offers.',exact:true})).toBeVisible()
  expect(await h.rows('work-items')).toHaveLength(0)
})
test('quotes the selected account offer through the shared calculator and reports withdrawal without repricing acceptance',async({request,playwright})=>{
  const policy=await h.seed('policy-versions',{revision:1,approved:true,active:true,synthetic:true,approvalReference:'synthetic-offer-api-policy',approvedSections:['stay','pricing','offers'],sections:{stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:'unavailable'},offers:{enabled:true,accountScope:'all-customers',discountOrder:'before-fees-and-tax'}}})
  const developer=await h.seed('staff-users',{name:'Offer API editor',email:'offer-api-editor@example.test',password,role:'developer'})
  const ctx={...h.ctx({kind:'staff',collection:'staff-users',id:developer.id,role:'developer'}),policy:policyFromRecord(policy)}
  const version=await publishOffer(ctx,{name:'API account offer',terms:syntheticOfferTerms({overallLimit:10}),approvalReference:'synthetic-offer-api-review'})
  const type=await h.seed('room-types',{name:'Offer API room',slug:'offer-api-room',maxGuests:2,onSale:true,_status:'published'})
  await h.seed('rooms',{label:'PRIVATE-OFFER-API-ROOM',roomType:type.id,onSale:true})
  await h.seed('rate-plans',{roomType:type.id,policyVersion:policy.id,revision:1,rules:{currency:'PHP',nightMinor:'10000',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[],taxes:[],taxBasis:'room-after-discount',rounding:'half-up-per-line'},validFrom:'2026-11-01T00:00:00Z',validUntil:'2028-01-01T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-offer-api-rate'})
  const body={stay:{roomTypeId:type.id,arrival:'2027-02-10',departure:'2027-02-11',occupancy:{adults:2,children:0}},offerVersionId:version.id}
  const guest=await playwright.request.newContext({baseURL:origin})
  try{expect((await guest.post('/api/booking/quotes',{headers:{origin},data:body})).status()).toBe(401)}finally{await guest.dispose()}
  await h.seed('customers',{name:'Offer API customer',email:'offer-api@example.test',password,_verified:true})
  expect((await request.post('/api/identity/customer/login',{headers:{origin},data:{email:'offer-api@example.test',password}})).ok()).toBe(true)
  const issued=await request.post('/api/booking/quotes',{headers:{origin},data:body})
  expect(issued.status()).toBe(201)
  const quote=await issued.json();expect(quote.total).toEqual({minor:'8500',currency:'PHP'})
  expect(quote.offerVersionId).toBe(version.id)
  expect((await request.post('/api/booking/quotes/accept',{headers:{origin},data:{quoteId:quote.id,version:quote.version}})).ok()).toBe(true)
  expect((await request.post('/api/booking/quotes',{headers:{origin},data:{...body,discountMinor:'999999'}})).status()).toBe(400)
  await withdrawOffer(ctx,version.offerId)
  expect((await request.post('/api/booking/quotes',{headers:{origin},data:body})).status()).toBe(409)
  const original=await request.post('/api/booking/quotes/accept',{headers:{origin},data:{quoteId:quote.id,version:quote.version}})
  expect((await original.json()).quote.total).toEqual(quote.total)
  expect(await h.rows('offer-allocations')).toHaveLength(0)
  expect(await h.rows('payment-attempts')).toHaveLength(0)
})
