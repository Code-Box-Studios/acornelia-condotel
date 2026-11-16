import '../support/env'
import {randomUUID} from 'node:crypto'
import {test,expect} from '@playwright/test'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
import type {TransactionalMessage} from '@/email/types'
import {emailHandler} from '@/email/deliver'
import {runWorkBatch} from '@/integrations/work-runner'
import {issueClaim} from '@/domain/claims/issue'
let h:TestHarness
const origin='http://127.0.0.1:3043',password='Synthetic-email-browser-passphrase-946!'
const previousAppUrl=process.env.APP_URL
test.beforeAll(async()=>{process.env.APP_URL=origin;h=await createHarness()})
test.beforeEach(async()=>{await h.reset();h.clock.set(new Date().toISOString())})
test.afterAll(async()=>{await h?.reset();await h?.close();if(previousAppUrl===undefined)delete process.env.APP_URL;else process.env.APP_URL=previousAppUrl})
function capture(){const messages:TransactionalMessage[]=[];return {messages,handler:emailHandler({send:async message=>{messages.push(message);return {kind:'accepted',providerMessageId:'<synthetic@example.test>'}}})}}
function link(message:TransactionalMessage){return message.text.split('\n').find(value=>value.startsWith('http'))!}
test('opens an emailed booking view privately without an account or ownership change',async({page},info)=>{
 const f=await checkoutFixture(h,{zero:true,email:{}}),mail=capture();await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 const url=link(mail.messages.find(message=>message.kind==='booking-view')!),token=new URLSearchParams(new URL(url).hash.slice(1)).get('token')!,requests:string[]=[]
 page.on('request',request=>requests.push(request.url()))
 const response=await page.goto(url);expect(response?.headers()['cache-control']).toContain('no-store');expect(response?.headers()['referrer-policy']).toBe('no-referrer')
 await expect(page).toHaveURL(origin+'/booking/view');await page.getByRole('button',{name:'Open private booking',exact:true}).focus();await page.keyboard.press('Enter')
 await expect(page.getByRole('heading',{name:/^ACN-/})).toBeVisible();await expect(page.locator('main')).toContainText('₱0.00')
 expect(requests.every(value=>!value.includes(token))).toBe(true)
 expect((await page.request.get('/api/customer/bookings')).status()).toBe(401)
 expect((await h.rows('bookings'))[0].ownerCustomer??null).toBeNull()
 await page.setViewportSize({width:320,height:780});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:'.local/email-private-view-'+info.project.name+'-light.png',fullPage:true})
 await page.getByRole('button',{name:'Switch color theme'}).click();await page.screenshot({path:'.local/email-private-view-'+info.project.name+'-dark.png',fullPage:true})
 const cap=Object.fromEntries(new URLSearchParams(new URL(url).hash.slice(1)))
 const invalid=await page.request.post('/api/booking/view',{headers:{origin},data:{...cap,token:'A'.repeat(43)}});expect(invalid.status()).toBe(401)
 expect(JSON.stringify(await invalid.json())).not.toContain('dispatch-guest')
 expect((await page.request.get('/api/email-messages?depth=5')).ok()).toBe(false)
})
test('completes native staff recovery through its private fragment without sending real email',async({page})=>{
 const f=await checkoutFixture(h,{zero:true,email:{}}),staff=await h.seed('staff-users',{name:'Email browser staff',email:'email-staff@example.test',password,role:'developer'})
 await h.payload.forgotPassword({collection:'staff-users',data:{email:staff.email}});h.clock.set(new Date().toISOString())
 const mail=capture();await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5})
 const message=mail.messages.find(value=>value.kind==='staff-reset')!;expect(message.cc).toEqual([])
 await page.goto(link(message));await expect(page).toHaveURL(origin+'/staff/reset')
 await page.getByLabel('New password',{exact:true}).fill(password+'changed');await page.getByLabel('Confirm password',{exact:true}).fill(password+'changed');await page.getByRole('button',{name:'Update staff password',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Your staff password has been updated.',exact:true})).toBeVisible()
 const me=await page.request.get('/api/staff-users/me',{headers:{origin}});expect((await me.json()).user.id).toBe(staff.id)
})
test('requires the reviewed account and separate claim capability, then consumes that claim once',async({page,playwright})=>{
 const f=await checkoutFixture(h,{zero:true,email:{claimDelivery:'reviewed-account'},claims:true}),staff=await h.seed('staff-users',{name:'Email claim reviewer',email:'email-claim-reviewer@example.test',password,role:'developer'})
 await issueClaim({...f.ctx,actor:{kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}},{bookingId:f.receipt.bookingId,customerId:f.customer.id,proof:{method:'staff-reviewed-original-evidence',reviewReference:randomUUID()}})
 const mail=capture();await runWorkBatch(f.worker,{email:mail.handler},{kind:'email',maxJobs:5});const url=link(mail.messages.find(value=>value.kind==='claim')!)
 await page.goto(url);await expect(page).toHaveURL(origin+'/account/claim');await page.getByRole('button',{name:'Link reviewed booking',exact:true}).click();await expect(page.locator('main [role=alert]')).toContainText('Sign in to the reviewed customer account')
 const outsider=await playwright.request.newContext({baseURL:origin});const evidence={purpose:'booking-claim',...Object.fromEntries(new URLSearchParams(new URL(url).hash.slice(1)))}
 expect((await outsider.post('/api/customer/claim',{headers:{origin},data:evidence})).status()).toBe(401);await outsider.dispose()
 expect((await page.request.post('/api/identity/customer/login',{headers:{origin},data:{email:f.customer.email,password:'Synthetic-dispatch-passphrase-946!'}})).ok()).toBe(true)
 await page.goto(url);await page.getByRole('button',{name:'Link reviewed booking',exact:true}).click();await expect(page.getByRole('heading',{name:'Your reviewed booking is now linked.',exact:true})).toBeVisible()
 expect((await h.rows('bookings'))[0].ownerCustomer).toBe(f.customer.id)
 expect((await page.request.post('/api/customer/claim',{headers:{origin},data:evidence})).status()).toBe(409)
})
