import {randomUUID} from 'node:crypto'
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {confirmedOperationsFixture} from '../support/operations-fixtures'
import {loginCustomer} from '@/features/auth/login'
import {principalFromHeaders} from '@/features/auth/principal'
import {relationshipId} from '@/features/customer/bookings'
import {privateDigest} from '@/domain/security/private-state'
import {applyAccountLifecycle} from '@/domain/privacy/lifecycle'
import {GET as customerBookings} from '@/app/api/customer/bookings/route'
import type {CommandContext} from '@/domain/db/types'
import {issueClaim} from '@/domain/claims/issue'
import {attachClaim} from '@/domain/claims/attach'
let h:TestHarness
const password='Synthetic-dispatch-passphrase-946!'
beforeAll(async()=>{h=await createHarness()});beforeEach(async()=>{await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')});afterAll(async()=>{await h?.reset();await h?.close()})
async function setup(lifecycle:{selfService?:{deactivate:boolean;anonymize:boolean};staffRoles?:('staff'|'developer')[];staffRemoval?:boolean}={}){
 const f=await confirmedOperationsFixture(h,{customer:true,role:'developer',lifecycle:{selfService:{deactivate:true,anonymize:true},staffRoles:['developer'],staffRemoval:true,...lifecycle}})
 const guest:CommandContext={...f.ctx,actor:{kind:'anonymous'}},customerCtx:CommandContext={...f.ctx,actor:{kind:'customer',collection:'customers',id:f.customer.id}}
 const login=await loginCustomer(guest,h.payload,{email:f.customer.email,password},new Headers()),cookie=login.cookie.split(';')[0]
 const account=async()=>h.payload.findByID({collection:'customers',id:f.customer.id,overrideAccess:true,showHiddenFields:true})
 return {...f,guest,customerCtx,cookie,account}
}
const request=(cookie:string)=>new Request(process.env.APP_URL+'/api/customer/bookings',{headers:{cookie,origin:process.env.APP_URL!}})
it('revokes prior access without transferring booking ownership',async()=>{
 const f=await setup(),originalOwnerId=f.customer.id
 expect((await customerBookings(request(f.cookie))).status).toBe(200)
 const before=await f.account()
 await applyAccountLifecycle(f.ctx,f.customer.id,before.securityRevision,{kind:'change-email',email:'Renamed.Guest@Example.test',evidenceReference:'synthetic-identity-check'})
 const oldSessionResponse=await customerBookings(request(f.cookie))
 expect(oldSessionResponse.status).toBe(401)
 const bookingAfter={ownerCustomerId:relationshipId((await h.rows('bookings',{id:{equals:f.booking.id}}))[0].ownerCustomer)}
 expect(bookingAfter.ownerCustomerId).toBe(originalOwnerId)
 const after=await f.account();expect(after.email).toBe('renamed.guest@example.test');expect(after.securityRevision).toBe(before.securityRevision+1)
 const recreated=await h.seed('customers',{name:'Same old email',email:f.customer.email,password,_verified:true})
 const fresh=await loginCustomer(f.guest,h.payload,{email:recreated.email,password},new Headers()),page=await (await customerBookings(request(fresh.cookie.split(';')[0]))).json()
 expect(page.items??page.bookings??[]).toHaveLength(0)
})
it('deactivates a customer and revokes sessions, reset tokens, claims and private views while keeping paid stays',async()=>{
 const f=await setup(),staff=f.staff,expires='2026-11-20T04:00:00.000Z'
 const view=await h.seed('booking-views',{booking:f.booking.id,tokenHash:privateDigest('view'+randomUUID()),purpose:'checkout-status',browserHash:privateDigest('browser'+randomUUID()),customer:f.customer.id,expiresAt:expires})
 const contactLink=await h.seed('booking-views',{booking:f.booking.id,tokenHash:privateDigest('contact'+randomUUID()),purpose:'booking-view',expiresAt:expires})
 const reset=await h.seed('auth-tokens',{tokenHash:privateDigest('reset'+randomUUID()),purpose:'reset',account:f.customer.id,emailHash:privateDigest(f.customer.email),securityRevision:1,expiresAt:expires})
 const claim=await h.seed('booking-claims',{booking:f.booking.id,customer:f.customer.id,reviewer:staff.id,purpose:'booking-claim',tokenHash:privateDigest('claim'+randomUUID()),proof:{version:1},policyId:f.policy.id,policyRevision:1,securityRevision:1,expiresAt:expires})
 await applyAccountLifecycle(f.customerCtx,f.customer.id,1,{kind:'deactivate',reason:'customer-request'})
 expect((await principalFromHeaders(new Headers({cookie:f.cookie,origin:process.env.APP_URL!}),h.payload)).kind).toBe('anonymous')
 expect((await h.rows('booking-views',{id:{equals:view.id}}))[0].revokedAt).toBeTruthy()
 expect((await h.rows('booking-views',{id:{equals:contactLink.id}}))[0].revokedAt??null).toBeNull()
 expect((await h.rows('auth-tokens',{id:{equals:reset.id}}))[0].usedAt).toBeTruthy()
 expect((await h.rows('booking-claims',{id:{equals:claim.id}}))[0].revokedAt).toBeTruthy()
 expect((await h.rows('bookings',{id:{equals:f.booking.id}}))[0]).toMatchObject({status:'confirmed'})
 await expect(loginCustomer(f.guest,h.payload,{email:f.customer.email,password},new Headers())).rejects.toThrow()
 await expect(applyAccountLifecycle(f.ctx,f.customer.id,2,{kind:'update-name',name:'Revived'})).rejects.toThrow()
})
it('anonymizes an account on request without deleting financial or audit evidence',async()=>{
 const f=await setup(),payments=(await h.rows('payment-transactions')).length,audit=(await h.rows('audit-entries')).length
 const link=await h.seed('booking-views',{booking:f.booking.id,tokenHash:privateDigest('contact'+randomUUID()),purpose:'booking-view',expiresAt:'2026-11-20T04:00:00.000Z'})
 const result=await applyAccountLifecycle(f.customerCtx,f.customer.id,1,{kind:'anonymize',reason:'customer-request'})
 expect(result).toMatchObject({state:'anonymized',securityRevision:2})
 const after=await f.account();expect(after.email).not.toContain('dispatch');expect(after.name).toBe('Deleted account');expect(after.deactivated).toBe(true)
 const booking=(await h.rows('bookings',{id:{equals:f.booking.id}}))[0];expect(relationshipId(booking.ownerCustomer)).toBe(f.customer.id);expect(booking.contact).toMatchObject({email:'dispatch-guest@example.test'})
 expect((await h.rows('booking-views',{id:{equals:link.id}}))[0].revokedAt).toBeTruthy()
 expect(await h.rows('payment-transactions')).toHaveLength(payments);expect((await h.rows('audit-entries')).length).toBeGreaterThan(audit)
 expect(JSON.stringify(await h.rows('audit-entries',{action:{equals:'account:anonymized'}}))).not.toContain(f.customer.email)
 await expect(applyAccountLifecycle(f.ctx,f.customer.id,2,{kind:'change-email',email:'back@example.test',evidenceReference:'synthetic'})).rejects.toThrow()
})
it('removes a staff member without restoring or raising any role and keeps one active developer',async()=>{
 const f=await setup(),front=await h.seed('staff-users',{name:'Front desk to remove',email:'remove-me@example.test',password:'Synthetic-removed-staff-passphrase-946!',role:'staff'})
 const frontCtx:CommandContext={...f.ctx,actor:{kind:'staff',collection:'staff-users',id:front.id,role:'staff'}}
 await expect(applyAccountLifecycle(frontCtx,f.staff.id,1,{kind:'remove-staff',reason:'left-the-property'})).rejects.toThrow()
 await expect(applyAccountLifecycle(f.ctx,f.staff.id,1,{kind:'remove-staff',reason:'self'})).rejects.toThrow()
 await expect(applyAccountLifecycle(f.ctx,front.id,1,{kind:'remove-staff',reason:'left-the-property'})).resolves.toMatchObject({state:'removed'})
 const removed=await h.payload.findByID({collection:'staff-users',id:front.id,overrideAccess:true,showHiddenFields:true});expect(removed).toMatchObject({deactivated:true,role:'staff'})
 await expect(h.payload.login({collection:'staff-users',data:{email:front.email,password:'Synthetic-removed-staff-passphrase-946!'}})).rejects.toThrow()
 await expect(applyAccountLifecycle(f.ctx,f.customer.id,1,{kind:'reactivate'} as never)).rejects.toThrow()
})
it('lets only one of two concurrent lifecycle actions win and refuses stale revisions and foreign accounts',async()=>{
 const f=await setup(),results=await Promise.allSettled([applyAccountLifecycle(f.ctx,f.customer.id,1,{kind:'update-name',name:'First'}),applyAccountLifecycle(f.ctx,f.customer.id,1,{kind:'deactivate',reason:'staff-review'})])
 expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1)
 const other=await h.seed('customers',{name:'Other account',email:'other@example.test',password,_verified:true})
 await expect(applyAccountLifecycle(f.customerCtx,other.id,1,{kind:'deactivate',reason:'customer-request'})).rejects.toThrow()
 expect((await h.payload.findByID({collection:'customers',id:other.id,overrideAccess:true})).deactivated).toBe(false)
})
it('refuses lifecycle actions the approved policy does not allow',async()=>{
 const f=await setup({selfService:{deactivate:false,anonymize:false},staffRoles:['developer'],staffRemoval:false})
 await expect(applyAccountLifecycle(f.customerCtx,f.customer.id,1,{kind:'deactivate',reason:'customer-request'})).rejects.toThrow()
 await expect(applyAccountLifecycle(f.customerCtx,f.customer.id,1,{kind:'anonymize',reason:'customer-request'})).rejects.toThrow()
 const front=await h.seed('staff-users',{name:'Remaining staff',email:'remaining@example.test',password:'Synthetic-remaining-staff-passphrase-946!',role:'staff'})
 await expect(applyAccountLifecycle(f.ctx,front.id,1,{kind:'remove-staff',reason:'left-the-property'})).rejects.toThrow()
 expect((await f.account()).deactivated).toBe(false)
})
it('never lets a historical claim attach after its account was deactivated',async()=>{
 for(let round=0;round<3;round++){
  await h.reset();h.clock.set('2026-11-16T04:00:00.000Z')
  const f=await setup(),unowned=await h.seed('bookings',{code:'ACN-'+randomUUID().replaceAll('-','').slice(0,16).toUpperCase(),status:'confirmed',revision:1,arrival:'2027-02-10T00:00:00Z',departure:'2027-02-12T00:00:00Z',acceptedQuote:{total:{minor:'1234',currency:'PHP'}},contact:{name:'Historical guest',email:'dispatch-account@example.test'},source:'website'})
  const policy={...f.ctx.policy,approvedSections:[...f.ctx.policy.approvedSections,'historical-claims'],sections:{...f.ctx.policy.sections,'historical-claims':{method:'staff-reviewed-original-evidence',tokenMinutes:15}}}
  const grant=await issueClaim({...f.ctx,policy},{bookingId:unowned.id,customerId:f.customer.id,proof:{method:'staff-reviewed-original-evidence',reviewReference:randomUUID()}})
  await Promise.allSettled([attachClaim({...f.customerCtx,policy},grant),applyAccountLifecycle(f.ctx,f.customer.id,1,{kind:'deactivate',reason:'staff-review'})])
  const owned=relationshipId((await h.rows('bookings',{id:{equals:unowned.id}}))[0].ownerCustomer)===f.customer.id,claim=(await h.rows('booking-claims'))[0]
  expect(owned).toBe(!claim.revokedAt)
 }
})
