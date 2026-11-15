import '../support/env'
import {randomUUID} from 'node:crypto'
import {test,expect} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import {claimWork,beginWork} from '@/domain/work/claim'
import {completeWork} from '@/domain/work/complete'
import {dispatchCheckout} from '@/domain/payments/create-checkout'
import type {MayaGateway} from '@/integrations/maya/types'
import {publishOffer} from '@/domain/offers/publication'
import {syntheticOfferTerms} from '../support/offer-fixtures'
import {signedObservation} from '../support/payment-observation'
import {applyPaymentObservation} from '@/domain/payments/observe'
import {mkdir} from 'node:fs/promises'
let h:TestHarness
const origin='http://127.0.0.1:3043'
test.beforeAll(async()=>{h=await createHarness()})
test.beforeEach(async()=>{await h.reset()})
test.afterAll(async()=>{await h?.reset();await h?.close()})
test('prepares a private guest booking once and refuses financial tampering or a foreign browser',async({request,playwright})=>{
  const policy=await h.seed('policy-versions',{revision:1,active:true,approved:true,synthetic:true,approvalReference:'synthetic-checkout-browser',approvedSections:['stay','pricing','checkout','bookingTerms','checkoutStatus'],sections:{stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},pricing:{currency:'PHP',quoteMinutes:15,zeroTotal:'unavailable'},checkout:{payment:'full',holdMinutes:15,thirdPartyBookings:false},bookingTerms:{title:'Synthetic booking terms',text:'Local browser test policy only.'},checkoutStatus:{minutes:120,pollPerMinute:60}}})
  const room=await h.seed('room-types',{name:'Checkout browser fixture',slug:'checkout-browser',maxGuests:2,onSale:true,_status:'published'})
  await h.seed('rooms',{label:'PRIVATE-CHECKOUT-BROWSER',roomType:room.id,onSale:true})
  await h.seed('rate-plans',{roomType:room.id,policyVersion:policy.id,revision:1,rules:{currency:'PHP',nightMinor:'12345',weekendDays:[],weekendNightMinor:null,specialNights:[],includedAdults:2,extraAdultNightMinor:'0',childNightMinor:'0',fees:[],taxes:[],taxBasis:'room-and-fees-after-discount',rounding:'half-up-per-line'},validFrom:'2026-01-01T00:00:00Z',validUntil:'2028-12-31T00:00:00Z',approved:true,synthetic:true,approvalReference:'synthetic-checkout-browser-rate'})
  const headers={origin},issued=await request.post('/api/booking/quotes',{headers,data:{stay:{roomTypeId:room.id,arrival:'2027-05-10',departure:'2027-05-12',occupancy:{adults:2,children:0}}}}),quote=await issued.json()
  expect(issued.status()).toBe(201)
  const input={commandKey:randomUUID(),quoteId:quote.id,version:quote.version,contact:{name:'Browser guest',email:'checkout-browser@example.test',phone:'+639171234567'}}
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


test('keeps redirect return unconfirmed without verified server payment',async({page})=>{
  h.clock.set(new Date().toISOString())
  const fixture=await checkoutFixture(h)
  await page.context().addCookies([{name:'acornelia-quote-browser',value:fixture.ctx.browserKey!,url:origin,httpOnly:true,sameSite:'Lax'}])
  const prepared=await page.request.post('/api/booking/checkout',{headers:{origin},data:fixture.input})
  expect(prepared.status()).toBe(202)
  await page.goto('/book/payment?bookingId='+fixture.receipt.bookingId+'&outcome=success')
  await expect(page.getByRole('heading',{name:/checking payment/i})).toBeVisible({timeout:3000})
  await expect(page.getByTestId('payment-total')).toHaveText('₱200.00')
  expect((await h.rows('bookings'))[0].status).toBe('held')
  expect(await h.rows('payment-transactions')).toHaveLength(0)
})


test('completes an approved zero-total guest booking with explicit terms and required contact details',async({page})=>{
  h.clock.set(new Date().toISOString())
  const fixture=await checkoutFixture(h,{zero:true})
  await h.seed('rooms',{label:'PRIVATE-ZERO-UI-ROOM',roomType:fixture.type.id,onSale:true})
  await page.goto('/book?roomTypeId='+fixture.type.id+'&arrival=2027-05-10&departure=2027-05-12&adults=2&children=0')
  await page.getByLabel('Your name',{exact:true}).fill('Guest UI fixture')
  await page.getByLabel('Email address',{exact:true}).fill(fixture.customer.email)
  await expect(page.getByRole('button',{name:'Sign in and keep my details'})).toBeVisible()
  await page.getByRole('button',{name:'Continue as guest',exact:true}).click()
  await expect(page.locator('main').getByRole('alert')).toContainText('contact phone')
  await page.getByLabel(/^Phone/).fill('+639171234567')
  await page.getByLabel(/^Requests/).fill('A quiet room if available.')
  await page.getByRole('button',{name:'Continue as guest',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Review your booking.'})).toBeVisible()
  await expect(page.getByTestId('quote-total')).toHaveText('₱0.00')
  await expect(page.getByText('Synthetic booking terms',{exact:true})).toBeVisible()
  const confirm=page.getByRole('button',{name:'Confirm your stay'})
  await expect(confirm).toBeDisabled()
  await page.getByRole('checkbox',{name:/I agree to the booking terms/}).check()
  await confirm.click()
  await expect(page).toHaveURL(/\/book\/payment\?bookingId=/)
  await expect(page.getByRole('heading',{name:'Your stay is confirmed.'})).toBeVisible()
  await expect(page.getByTestId('payment-total')).toHaveText('₱0.00')
  const bookings=await h.rows('bookings'),created=bookings.find(row=>row.id!==fixture.receipt.bookingId)!
  expect(bookings).toHaveLength(2);expect(created.ownerCustomer).toBeNull()
  expect(created.contact).toMatchObject({name:'Guest UI fixture',email:fixture.customer.email,phone:'+639171234567',note:'A quiet room if available.'})
  expect(await h.rows('payment-attempts')).toHaveLength(0)
  await page.reload();await expect(page.getByRole('heading',{name:'Your stay is confirmed.'})).toBeVisible()
})


test('hands off the original ready checkout and keeps a cancellation return checking',async({page})=>{
  h.clock.set(new Date().toISOString())
  const fixture=await checkoutFixture(h),providerId='99999999-9999-4999-8999-999999999999'
  let creates=0,handoffs=0
  const unavailable=async()=>{throw new Error('Unexpected provider operation')}
  const gateway:MayaGateway={createCheckout:async()=>{creates++;return {kind:'created',environment:'sandbox',checkoutId:providerId,checkoutUrl:'https://payments-web-sandbox.paymaya.com/v2/checkout?id='+providerId}},retrievePayment:unavailable,findPaymentsByReference:unavailable,voidPayment:unavailable,refundPayment:unavailable}
  const lease=(await claimWork(fixture.worker,'create-checkout'))!
  await beginWork(fixture.worker,lease)
  await completeWork(fixture.worker,lease,await dispatchCheckout(fixture.worker,lease,gateway))
  await page.context().addCookies([{name:'acornelia-quote-browser',value:fixture.ctx.browserKey!,url:origin,httpOnly:true,sameSite:'Lax'}])
  expect((await page.request.post('/api/booking/checkout',{headers:{origin},data:fixture.input})).ok()).toBe(true)
  // Playwright routes only the initial request in a redirect chain. Intercept the
  // local handoff and inspect its real 303 without following an external URL.
  await page.route('**/api/booking/handoff',async route=>{
    const response=await route.fetch({maxRedirects:0})
    expect(response.status()).toBe(303)
    expect(response.headers().location).toBe('https://payments-web-sandbox.paymaya.com/v2/checkout?id='+providerId)
    expect(response.headers()['referrer-policy']).toBe('no-referrer')
    handoffs++
    await route.fulfill({status:200,contentType:'text/html',body:'<h1>Synthetic Maya checkout</h1>'})
  })
  await page.goto('/book/payment?bookingId='+fixture.receipt.bookingId)
  await expect(page.getByRole('heading',{name:'Your secure checkout is ready.'})).toBeVisible()
  await page.getByRole('button',{name:/Continue to secure payment/}).click()
  await expect(page.getByRole('heading',{name:'Synthetic Maya checkout'})).toBeVisible()
  expect((await h.rows('payment-attempts'))[0].state).toBe('pending')
  expect((await h.rows('bookings'))[0].status).toBe('held')
  await page.goto(origin+'/book/payment?bookingId='+fixture.receipt.bookingId+'&outcome=cancel')
  await expect(page.getByRole('heading',{name:'Checking payment.'})).toBeVisible()
  await expect(page.getByTestId('payment-total')).toHaveText('₱200.00')
  await expect(page.getByRole('button',{name:/Continue to secure payment/})).toHaveCount(0)
  const repeat=await page.request.post('/api/booking/handoff',{headers:{origin},form:{bookingId:fixture.receipt.bookingId},maxRedirects:0})
  expect(repeat.status()).toBe(303);expect(repeat.headers().location).toContain('/book/payment?')
  expect(creates).toBe(1);expect(handoffs).toBe(1)
})

test('recovers the same booking after losing the preparation response',async({page},testInfo)=>{
  h.clock.set(new Date().toISOString())
  const fixture=await checkoutFixture(h,{zero:true})
  await h.seed('rooms',{label:'PRIVATE-LOST-RESPONSE-ROOM',roomType:fixture.type.id,onSale:true})
  await page.setViewportSize({width:testInfo.project.name==='mobile'?320:1440,height:900})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/book?roomTypeId='+fixture.type.id+'&arrival=2027-05-10&departure=2027-05-12&adults=2&children=0')
  await page.getByLabel('Your name',{exact:true}).fill('Response recovery fixture')
  await page.getByLabel('Email address',{exact:true}).fill('lost-response@example.test')
  await page.getByLabel(/^Phone/).fill('+639171234567')
  await page.getByRole('button',{name:'Continue as guest',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Review your booking.'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Review your booking.'})).toBeFocused()
  await mkdir('.local/task-16',{recursive:true})
  for(const theme of ['light','dark']){
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;localStorage.setItem('acornelia-theme',value);window.scrollTo(0,0)},theme)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:'.local/task-16/checkout-'+testInfo.project.name+'-'+theme+'.png',fullPage:true})
  }
  let preparations=0,preparedId=''
  await page.route('**/api/booking/checkout',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return}
    const response=await route.fetch({maxRedirects:0});preparations++
    expect(response.status()).toBe(200)
    preparedId=(await response.json()).bookingId
    await route.abort('failed')
  })
  await page.getByRole('checkbox',{name:/I agree to the booking terms/}).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button',{name:'Confirm your stay'})).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading',{name:'Your stay is confirmed.'})).toBeVisible()
  expect(preparations).toBe(1)
  await expect(page).toHaveURL(new RegExp('/book/payment\\?bookingId='+preparedId))
  expect(await h.rows('bookings')).toHaveLength(2)
  expect(await h.rows('payment-attempts')).toHaveLength(0)
  await page.screenshot({path:'.local/task-16/confirmed-'+testInfo.project.name+'-dark.png',fullPage:true})
})


test('shares one preparation key between two review tabs and saves one new booking',async({page})=>{
  h.clock.set(new Date().toISOString())
  const fixture=await checkoutFixture(h,{zero:true})
  await h.seed('rooms',{label:'PRIVATE-TWO-TAB-UI-ROOM',roomType:fixture.type.id,onSale:true})
  await page.goto('/book?roomTypeId='+fixture.type.id+'&arrival=2027-05-10&departure=2027-05-12&adults=2&children=0')
  await page.getByLabel('Your name',{exact:true}).fill('Two tab guest')
  await page.getByLabel('Email address',{exact:true}).fill('two-tab@example.test')
  await page.getByLabel(/^Phone/).fill('+639171234567')
  await page.getByRole('button',{name:'Continue as guest',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Review your booking.'})).toBeVisible()
  const second=await page.context().newPage()
  await second.goto('/book')
  await expect(second.getByLabel('Your name',{exact:true})).toHaveValue('Two tab guest')
  await second.getByRole('button',{name:'Continue as guest',exact:true}).click()
  await expect(second.getByRole('heading',{name:'Review your booking.'})).toBeVisible()
  await page.getByRole('checkbox',{name:/I agree to the booking terms/}).check()
  await second.getByRole('checkbox',{name:/I agree to the booking terms/}).check()
  let requests=0,release:()=>void=()=>{}
  const barrier=new Promise<void>(resolve=>{release=resolve})
  await page.context().route('**/api/booking/checkout',async route=>{if(route.request().method()==='POST'){requests++;if(requests===2)release();await barrier};await route.continue()})
  await Promise.all([page.getByRole('button',{name:'Confirm your stay'}).click(),second.getByRole('button',{name:'Confirm your stay'}).click()])
  await expect(page.getByRole('heading',{name:'Your stay is confirmed.'})).toBeVisible()
  await expect(second.getByRole('heading',{name:'Your stay is confirmed.'})).toBeVisible()
  expect(new URL(page.url()).searchParams.get('bookingId')).toBe(new URL(second.url()).searchParams.get('bookingId'))
  expect(await h.rows('bookings')).toHaveLength(2)
  expect(await h.rows('payment-attempts')).toHaveLength(0)
})

test('shows a lost room during final preparation without creating partial booking work',async({page})=>{
  h.clock.set(new Date().toISOString())
  const fixture=await checkoutFixture(h,{zero:true}),unit=await h.seed('rooms',{label:'PRIVATE-RACE-UI-ROOM',roomType:fixture.type.id,onSale:true})
  await page.goto('/book?roomTypeId='+fixture.type.id+'&arrival=2027-05-10&departure=2027-05-12&adults=2&children=0')
  await page.getByLabel('Your name',{exact:true}).fill('Availability guest')
  await page.getByLabel('Email address',{exact:true}).fill('availability@example.test')
  await page.getByLabel(/^Phone/).fill('+639171234567')
  await page.getByRole('button',{name:'Continue as guest',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Review your booking.'})).toBeVisible()
  await h.pool.query("INSERT INTO allocations(room_id,arrival,departure,purpose,released) VALUES($1,'2027-05-10T00:00:00Z','2027-05-12T00:00:00Z','block',false)",[unit.id])
  await page.getByRole('checkbox',{name:/I agree to the booking terms/}).check()
  await page.getByRole('button',{name:'Confirm your stay'}).click()
  await expect(page.locator('main').getByRole('alert')).toContainText('no longer available')
  expect(await h.rows('bookings')).toHaveLength(1)
  expect(await h.rows('payment-attempts')).toHaveLength(0)
  expect(await h.rows('work-items')).toHaveLength(1)
})

test('reprices a chosen account offer and keeps account, contact and staying guest separate',async({page})=>{
  h.clock.set(new Date().toISOString())
  const fixture=await checkoutFixture(h,{customer:true,allowZero:true})
  await h.seed('rooms',{label:'PRIVATE-OFFER-UI-ROOM',roomType:fixture.type.id,onSale:true})
  const staff=await h.seed('staff-users',{name:'Offer UI operator',email:'offer-ui-operator@example.test',password:'Synthetic-offer-ui-passphrase-946!',role:'developer'})
  const offer=await publishOffer({...fixture.ctx,actor:{kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}},{name:'Synthetic full-stay benefit',terms:syntheticOfferTerms({benefit:{kind:'fixed',minor:'20000'}}),approvalReference:'synthetic-offer-ui'})
  expect((await page.request.post('/api/identity/customer/login',{headers:{origin},data:{email:fixture.customer.email,password:'Synthetic-dispatch-passphrase-946!'}})).ok()).toBe(true)
  await page.goto('/book?roomTypeId='+fixture.type.id+'&arrival=2027-05-10&departure=2027-05-12&adults=2&children=0')
  await page.getByLabel('Your name',{exact:true}).fill('Booking contact fixture')
  await page.getByLabel('Email address',{exact:true}).fill('different-contact@example.test')
  await page.getByLabel(/^Phone/).fill('+639171234567')
  await page.getByLabel(/^Staying guest name/).fill('Staying guest fixture')
  await page.getByRole('button',{name:'Continue with your account',exact:true}).click()
  await expect(page.getByTestId('quote-total')).toHaveText('₱200.00')
  await expect(page.locator('main')).toContainText(fixture.customer.email)
  await expect(page.locator('main')).toContainText('different-contact@example.test')
  await page.getByRole('checkbox',{name:/I agree to the booking terms/}).check()
  await page.getByLabel('Account offer',{exact:false}).selectOption(offer.id)
  await expect(page.getByTestId('quote-total')).toHaveText('₱0.00')
  await expect(page.getByRole('checkbox',{name:/I agree to the booking terms/})).not.toBeChecked()
  await page.getByRole('checkbox',{name:/I agree to the booking terms/}).check()
  await page.getByRole('button',{name:'Confirm your stay'}).click()
  await expect(page.getByRole('heading',{name:'Your stay is confirmed.'})).toBeVisible()
  const created=(await h.rows('bookings')).find(row=>row.id!==fixture.receipt.bookingId)!
  expect(created.ownerCustomer).toBe(fixture.customer.id)
  expect(created.contact).toMatchObject({email:'different-contact@example.test'})
  expect(created.stayingGuest).toBe('Staying guest fixture')
  expect((await h.rows('offer-allocations'))[0].state).toBe('consumed')
  expect(await h.rows('payment-attempts')).toHaveLength(1)
})

test('shows paid confirmation only after the original verified collection is applied',async({page,playwright})=>{
  h.clock.set(new Date().toISOString())
  const fixture=await checkoutFixture(h)
  const attempt=(await h.rows('payment-attempts'))[0]
  await page.context().addCookies([{name:'acornelia-quote-browser',value:fixture.ctx.browserKey!,url:origin,httpOnly:true,sameSite:'Lax'}])
  expect((await page.request.post('/api/booking/checkout',{headers:{origin},data:fixture.input})).ok()).toBe(true)
  await page.goto('/book/payment?bookingId='+fixture.receipt.bookingId+'&outcome=success')
  await expect(page.getByRole('heading',{name:'Checking payment.'})).toBeVisible()
  const ctx={...fixture.worker,actor:{kind:'system' as const,purpose:'payments' as const}}
  await applyPaymentObservation(ctx,await signedObservation(ctx,{id:randomUUID(),requestReferenceNumber:attempt.merchantReference,status:'PAYMENT_SUCCESS',amount:'200.00',currency:'PHP'}))
  await expect(page.getByRole('button',{name:'Check again',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'Check again',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Your stay is confirmed.'})).toBeVisible()
  await expect(page.getByTestId('payment-total')).toHaveText('₱200.00')
  expect((await h.rows('payment-transactions'))[0].appliedRevision).toBe(1)
  const outsider=await playwright.request.newContext({baseURL:origin})
  try{expect((await outsider.get('/api/booking/status?bookingId='+fixture.receipt.bookingId)).status()).toBe(401)}finally{await outsider.dispose()}
})
