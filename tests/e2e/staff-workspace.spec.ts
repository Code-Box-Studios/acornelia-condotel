import '../support/env'
import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {createHarness,type TestHarness} from '../support/harness'
import {confirmedOperationsFixture} from '../support/operations-fixtures'
import {propertyToday} from '@/domain/shared/dates'
import type {OperationsOverrides} from '../support/operations-policy'
let h:TestHarness
const origin='http://127.0.0.1:3043',password='Synthetic-front-desk-passphrase-946!'
test.beforeAll(async()=>{h=await createHarness()});test.beforeEach(async()=>{await h.reset();h.clock.set(new Date().toISOString())});test.afterAll(async()=>{await h?.reset();await h?.close()})
async function signedIn(page:Page,options:{role?:'staff'|'developer';operations?:OperationsOverrides;contactName?:string}={}){
 const f=await confirmedOperationsFixture(h,options)
 expect((await page.request.post('/api/staff-users/login',{headers:{origin},data:{email:f.staff.email,password}})).ok()).toBe(true)
 return f
}
/** A confirmed stay arriving on the real property date, so front-desk actions are available in the browser. */
async function arrivingToday(){
 const today=propertyToday('Asia/Manila'),departure=new Date(Date.parse(today+'T00:00:00.000Z')+2*86400000).toISOString().slice(0,10),room=(await h.rows('rooms'))[0]
 const booking=await h.seed('bookings',{code:'ACN-'+randomUUID().replaceAll('-','').slice(0,16).toUpperCase(),status:'confirmed',revision:1,arrival:today+'T00:00:00.000Z',departure:departure+'T00:00:00.000Z',acceptedQuote:{total:{minor:'20000',currency:'PHP'}},contact:{name:'Walk-up arrival',email:'walkup@example.test',phone:'+639170000000'},source:'website'})
 await h.seed('allocations',{room:room.id,booking:booking.id,purpose:'booking',arrival:booking.arrival,departure:booking.departure,released:false})
 return booking
}
test('requires signed-in authorized staff for booking-code lookup',async({page,playwright})=>{
 const f=await signedIn(page),confirmedBooking=f.booking,anonymous=await playwright.request.newContext({baseURL:origin})
 const anonymousLookup=await anonymous.get('/api/operations/bookings?code='+confirmedBooking.code,{headers:{origin}});await anonymous.dispose()
 expect(anonymousLookup.status()).toBe(403)
 const response=await page.request.get('/api/operations/bookings?code='+confirmedBooking.code!.toLowerCase(),{headers:{origin}});expect(response.status()).toBe(200)
 const staffLookup=await response.json();expect(staffLookup.bookingCode).toBe(confirmedBooking.code)
 expect(response.headers()['cache-control']).toContain('no-store')
 expect((await page.request.get('/api/operations/bookings?code=ACN-0000000000000000',{headers:{origin}})).status()).toBe(404)
})
test('finds a booking by code from the workspace and records an internal note with the keyboard',async({page})=>{
 const f=await signedIn(page);await page.goto('/staff/bookings')
 await page.getByLabel('Booking code',{exact:true}).fill(f.booking.code!);await page.getByLabel('Booking code',{exact:true}).press('Enter')
 await expect(page.getByRole('heading',{level:1})).toContainText(f.booking.code!)
 await expect(page.getByText('dispatch-guest@example.test')).toBeVisible();await expect(page.getByRole('link',{name:'Email guest'})).toHaveAttribute('href','mailto:dispatch-guest@example.test')
 await page.getByLabel('Internal note',{exact:true}).fill('Prefers a quiet room away from the lift.');await page.keyboard.press('Tab');await page.keyboard.press('Enter')
 await expect(page.getByRole('status')).toContainText('Note saved');await expect(page.getByText('Prefers a quiet room away from the lift.')).toBeVisible()
 expect(await h.rows('staff-notes',{booking:{equals:f.booking.id}})).toHaveLength(1)
 await page.setViewportSize({width:320,height:780});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('lists today’s arrival and checks the guest in from its booking page',async({page},info)=>{
 await signedIn(page);const booking=await arrivingToday();await page.goto('/staff')
 await expect(page.getByRole('heading',{name:'Arrivals',exact:true})).toBeVisible();await page.getByRole('link',{name:booking.code!}).first().click()
 await page.getByRole('button',{name:'Check in',exact:true}).click()
 await expect(page.getByRole('status')).toContainText('Checked in');await expect(page.locator('.staff-stay-state')).toContainText('In house')
 expect(await h.rows('stay-events',{booking:{equals:booking.id}})).toHaveLength(1)
 await page.screenshot({path:'.local/staff-booking-'+info.project.name+'-light.png',fullPage:true});await page.getByRole('button',{name:'Switch color theme'}).click();await page.screenshot({path:'.local/staff-booking-'+info.project.name+'-dark.png',fullPage:true})
})
test('resolves an open payment issue from the payments queue',async({page})=>{
 const f=await signedIn(page),issue=await h.seed('payment-issues',{issueKey:'browser-'+randomUUID(),reasonCode:'extra-collection',booking:f.booking.id,state:'open'})
 await page.goto('/staff/payments');await expect(page.getByText('extra-collection')).toBeVisible()
 await page.getByLabel('Resolution',{exact:true}).selectOption('no-action-required');await page.getByLabel('Evidence reference',{exact:true}).fill('synthetic-reviewed-statement')
 await page.getByRole('button',{name:'Resolve issue',exact:true}).click();await expect(page.getByRole('status')).toContainText('Issue resolved')
 expect((await h.rows('payment-issues',{id:{equals:issue.id}}))[0]).toMatchObject({state:'resolved',resolutionCode:'no-action-required'})
})
test('exports a report with spreadsheet formulas neutralised only for approved roles',async({page})=>{
 const f=await signedIn(page,{role:'developer',contactName:'=HYPERLINK("https://example.test","open")'})
 await page.goto('/staff/reports?from=2027-05-01&to=2027-05-31');await expect(page.getByRole('heading',{name:'Bookings by status',exact:true})).toBeVisible()
 const csv=await page.request.get('/api/operations/reports?from=2027-05-01&to=2027-05-31&format=csv',{headers:{origin}});expect(csv.status()).toBe(200)
 expect(csv.headers()['content-type']).toContain('text/csv');expect(csv.headers()['content-disposition']).toContain('attachment')
 expect(await csv.text()).toContain('"\'=HYPERLINK(');expect(await h.rows('audit-entries',{action:{equals:'operations:report-exported'}})).toHaveLength(1)
 expect(f.booking.code).toBeTruthy()
})
test('refuses workspace data to customers and to staff roles the policy does not approve',async({page,playwright})=>{
 const f=await signedIn(page,{operations:{roles:{view:['developer'],reports:['developer']}}})
 expect((await page.request.get('/api/operations/bookings?code='+f.booking.code,{headers:{origin}})).status()).toBe(403)
 expect((await page.request.get('/api/operations/reports?from=2027-05-01&to=2027-05-31&format=csv',{headers:{origin}})).status()).toBe(403)
 await page.goto('/staff');await expect(page.getByRole('heading',{name:'This workspace is not available for your role.',exact:true})).toBeVisible()
 const customer=await playwright.request.newContext({baseURL:origin});expect((await customer.post('/api/identity/customer/login',{headers:{origin},data:{email:f.customer.email,password:'Synthetic-dispatch-passphrase-946!'}})).ok()).toBe(true)
 expect((await customer.get('/api/operations/bookings?code='+f.booking.code,{headers:{origin}})).status()).toBe(403);await customer.dispose()
})
test('closes an enquiry, shows stays on the calendar and keeps refund and block routes closed to unapproved callers',async({page,playwright})=>{
 const f=await signedIn(page),enquiry=await h.seed('enquiries',{reference:'ENQ-'+randomUUID(),nonce:randomUUID(),fingerprint:randomUUID(),emailHash:'browser-hash',submittedAt:new Date().toISOString(),contact:{name:'Reception planner',email:'planner@example.test',message:'Do you host a June reception for 80 guests?'},state:'delivered'})
 await page.goto('/staff/enquiries');await expect(page.getByText('Do you host a June reception for 80 guests?')).toBeVisible()
 await page.getByLabel('Outcome',{exact:true}).selectOption('contacted');await page.getByLabel('Follow-up note',{exact:true}).fill('Called back; sent the venue brochure.')
 await page.getByRole('button',{name:'Close enquiry',exact:true}).click();await expect(page.getByRole('status')).toContainText('Enquiry closed')
 expect((await h.rows('enquiries',{id:{equals:enquiry.id}}))[0]).toMatchObject({state:'closed',followUpOutcome:'contacted'})
 await page.goto('/staff/calendar?from=2027-05-09');await expect(page.getByRole('link',{name:f.booking.code!.slice(-4)}).first()).toBeVisible()
 const refund={action:'authorize',input:{commandKey:randomUUID(),paymentId:(await h.rows('payment-transactions'))[0].id,expectedRevision:1,amount:{minor:'5000',currency:'PHP'},method:'refund',reason:'manual-review',evidenceReference:'synthetic'}}
 const block={action:'create',roomId:(await h.rows('rooms'))[0].id,arrival:'2027-06-01',departure:'2027-06-02',reason:'Probe'}
 expect((await page.request.post('/api/operations/refunds',{headers:{origin},data:refund})).ok()).toBe(false)
 expect((await page.request.post('/api/operations/blocks',{headers:{origin},data:block})).ok()).toBe(false)
 const anonymous=await playwright.request.newContext({baseURL:origin})
 for(const [path,data] of [['/api/operations/refunds',refund],['/api/operations/blocks',block],['/api/operations/stay',{}],['/api/operations/notes',{}],['/api/operations/issues',{}],['/api/operations/enquiries',{}]] as const)expect((await anonymous.post(path,{headers:{origin},data})).status()).toBe(403)
 await anonymous.dispose()
 expect(await h.rows('refund-operations')).toHaveLength(0);expect(await h.rows('room-blocks')).toHaveLength(0)
})
