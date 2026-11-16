import '../support/env'
import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {createHarness,type TestHarness} from '../support/harness'
import {checkoutFixture} from '../support/checkout-fixtures'
let h:TestHarness
const origin='http://127.0.0.1:3043',password='Synthetic-direct-browser-passphrase-946!'
test.beforeAll(async()=>{h=await createHarness()});test.beforeEach(async()=>{await h.reset();h.clock.set(new Date().toISOString())});test.afterAll(async()=>{await h?.reset();await h?.close()})
async function setup(page:Page,restricted=false){
 const f=await checkoutFixture(h,{rooms:2,direct:restricted?{roles:['developer']}:{}}),staff=await h.seed('staff-users',{name:'Direct browser operator',email:'direct-browser@example.test',password,role:'staff'})
 expect((await page.request.post('/api/staff-users/login',{headers:{origin},data:{email:staff.email,password}})).ok()).toBe(true)
 return {...f,staff}
}
async function review(page:Page,roomTypeId:string,receipt:string){
 await page.goto('/staff/direct');await page.getByLabel('Room type',{exact:true}).selectOption(roomTypeId);await page.getByLabel('Arrival',{exact:true}).fill('2027-05-10');await page.getByLabel('Departure',{exact:true}).fill('2027-05-12');await page.getByLabel('Adults',{exact:true}).fill('2');await page.getByRole('button',{name:'Check stay price',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Stay price',exact:true})).toBeVisible();await expect(page.locator('.direct-price')).toContainText('₱200.00')
 await page.getByLabel('Booking contact name',{exact:true}).fill('Direct browser contact');await page.getByLabel('Booking contact email',{exact:true}).fill('dispatch-account@example.test');await page.getByLabel('Booking contact phone',{exact:true}).fill('+639171234567');await page.getByLabel('Staying guest name (if different)',{exact:true}).fill('Separate browser guest')
 await page.getByLabel('Amount received',{exact:true}).fill('200.00');await page.getByLabel('Receipt reference',{exact:true}).fill(receipt);await page.getByLabel('Payment evidence reference',{exact:true}).fill('synthetic-cashbook-review');await page.getByLabel('Guest agreement reference',{exact:true}).fill('synthetic-phone-agreement');await page.getByRole('checkbox').check()
}
test('records a walk-in using shared prices and inventory with a separately recorded offline collection',async({page},info)=>{
 const f=await setup(page);await review(page,f.type.id,'CASH-'+randomUUID());await page.getByRole('button',{name:'Save direct booking',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Booking confirmed',exact:true})).toBeVisible();await expect(page.locator('main')).toContainText('Assigned room')
 const booking=(await h.rows('bookings',{source:{equals:'walk-in'}}))[0];expect(booking.ownerCustomer??null).toBeNull()
 expect(await h.rows('payment-attempts',{booking:{equals:booking.id}})).toHaveLength(0)
 expect((await h.rows('payment-transactions',{booking:{equals:booking.id}}))[0]).toMatchObject({environment:'offline',status:'collected',appliedRevision:1})
 expect((await page.request.post('/api/booking/quotes',{headers:{origin},data:{stay:f.quote.stay}})).status()).toBe(403)
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:320,height:780});await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();scrollTo({top:0,behavior:'instant'})});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:'.local/direct-result-'+info.project.name+'-light.png',fullPage:true});await page.getByRole('button',{name:'Switch color theme'}).click();await page.screenshot({path:'.local/direct-result-'+info.project.name+'-dark.png',fullPage:true})
 expect(await page.locator('.mobile-booking').count()).toBe(0)
})
test('recovers a lost save response after reload without storing guest or receipt data in browser continuity',async({page})=>{
 const f=await setup(page),receipt='LOST-'+randomUUID();await review(page,f.type.id,receipt)
 let creates=0;await page.route('**/api/operations/direct',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='create'){creates++;const result=await route.fetch({maxRedirects:0});expect(result.status()).toBe(201);await route.abort()}else await route.continue()})
 await page.getByRole('button',{name:'Save direct booking',exact:true}).click();await expect(page.getByRole('heading',{name:'Check the original entry.',exact:true})).toBeVisible()
 const stored=await page.evaluate(()=>JSON.stringify({...sessionStorage}));expect(stored).not.toContain('dispatch-account');expect(stored).not.toContain(receipt);expect(stored).not.toContain('Direct browser contact')
 await page.unrouteAll({behavior:'wait'});await page.reload();await expect(page.getByRole('heading',{name:'Booking confirmed',exact:true})).toBeVisible()
 expect(creates).toBe(1);expect(await h.rows('payment-transactions',{environment:{equals:'offline'}})).toHaveLength(1)
})
test('closes an unsaved entry safely and rejects a late request for that same server command',async({page})=>{
 const f=await setup(page);await review(page,f.type.id,'CLOSED-'+randomUUID());let original:unknown
 await page.route('**/api/operations/direct',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().action==='create'){original=route.request().postDataJSON();await route.abort()}else await route.continue()})
 await page.getByRole('button',{name:'Save direct booking',exact:true}).click();await expect(page.getByRole('heading',{name:'Check the original entry.',exact:true})).toBeVisible();await page.unrouteAll({behavior:'wait'});await page.reload()
 await page.getByRole('button',{name:'Close unfinished entry',exact:true}).click();await expect(page.getByRole('button',{name:'Check stay price',exact:true})).toBeVisible()
 expect((await page.request.post('/api/operations/direct',{headers:{origin},data:original})).status()).toBe(409)
 expect(await h.rows('direct-command-closures')).toHaveLength(1);expect(await h.rows('bookings',{source:{in:['phone','walk-in']}})).toHaveLength(0)
})
test('keeps valid cash as a paid exception when a room is lost before the staff save',async({page})=>{
 const f=await setup(page);await review(page,f.type.id,'RACE-'+randomUUID())
 const used=new Set((await h.rows('allocations',{released:{equals:false}})).map(value=>value.room)),free=(await h.rows('rooms')).find(room=>!used.has(room.id))!
 await h.seed('allocations',{room:free.id,arrival:'2027-05-10T00:00:00Z',departure:'2027-05-12T00:00:00Z',purpose:'block',released:false})
 await page.getByRole('button',{name:'Save direct booking',exact:true}).click();await expect(page.getByRole('heading',{name:'Payment recorded. Booking needs review.',exact:true})).toBeVisible()
 expect(await h.rows('payment-transactions',{environment:{equals:'offline'}})).toHaveLength(1);expect(await h.rows('payment-issues')).toHaveLength(1)
 expect(await h.rows('bookings',{source:{equals:'walk-in'},status:{equals:'confirmed'}})).toHaveLength(0)
})
test('requires approved staff authority and denies customer and cross-origin direct actions',async({page,playwright})=>{
 const f=await setup(page,true);await page.goto('/staff/direct');await expect(page.getByRole('heading',{name:'Direct booking is not enabled.',exact:true})).toBeVisible()
 expect((await page.request.post('/api/operations/direct',{headers:{origin},data:{action:'quote',stay:f.quote.stay}})).ok()).toBe(false)
 expect((await page.request.post('/api/operations/direct',{headers:{origin:'https://foreign.example.test'},data:{action:'quote',stay:f.quote.stay}})).status()).toBe(403)
 const guest=await playwright.request.newContext({baseURL:origin});expect((await guest.post('/api/operations/direct',{headers:{origin},data:{action:'quote',stay:f.quote.stay}})).status()).toBe(401);await guest.dispose()
 expect((await page.request.post('/api/identity/customer/login',{headers:{origin},data:{email:f.customer.email,password:'Synthetic-dispatch-passphrase-946!'}})).ok()).toBe(true)
 expect((await page.request.post('/api/operations/direct',{headers:{origin},data:{action:'quote',stay:f.quote.stay}})).status()).toBe(401)
})
