import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {issueClaim} from '@/domain/claims/issue'
import {attachClaim} from '@/domain/claims/attach'
import {listOwnBookings} from '@/features/customer/bookings'
import {createBookingView,verifyBookingView,revokeBookingView} from '@/features/booking/view-access'

describe('approved booking-specific claims and separate view access',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-15T04:00:00Z')})
  afterAll(async()=>{await h?.close()})
  async function setup(){
    const staff=await h.seed('staff-users',{name:'Evidence reviewer',email:'reviewer@example.test',password:'Synthetic-claims-passphrase-982!',role:'developer'})
    const accounts=[];for(const suffix of ['one','two'])accounts.push(await h.seed('customers',{name:'Synthetic customer',email:suffix+'@example.test',password:'Synthetic-claims-passphrase-982!',_verified:true}))
    const booking=await h.seed('bookings',{code:'PUBLIC-CODE-NOT-SECRET',status:'confirmed',revision:1,arrival:'2027-02-10T00:00:00Z',departure:'2027-02-12T00:00:00Z',acceptedQuote:{total:{minor:'1234',currency:'PHP'}},contact:{name:'Shared mailbox contact',email:'one@example.test'},source:'website'})
    const staffCtx=h.ctx({kind:'staff',collection:'staff-users',id:staff.id,role:'developer'})
    staffCtx.policy.approvedSections=['historical-claims'];staffCtx.policy.sections['historical-claims']={method:'staff-reviewed-original-evidence',tokenMinutes:15}
    const contexts=accounts.map(account=>({...h.ctx({kind:'customer',collection:'customers',id:account.id}),policy:staffCtx.policy}))
    return {booking,accounts,staffCtx,contexts}
  }
  const proof=()=>({method:'staff-reviewed-original-evidence' as const,reviewReference:randomUUID()})
  it('allows one approved historical claimant and no email inheritance',async()=>{
    const {booking,accounts,staffCtx,contexts}=await setup()
    const grants=await Promise.all(accounts.map(account=>issueClaim(staffCtx,{bookingId:booking.id,customerId:account.id,proof:proof()})))
    const claims=await Promise.all(grants.map((grant,index)=>attachClaim(contexts[index],grant)))
    const successfulClaims=claims.filter(result=>result.ok)
    expect(successfulClaims).toHaveLength(1)
    expect(claims.filter(result=>!result.ok).map(result=>result.code)).toEqual(['conflict'])
    const winner=claims.findIndex(result=>result.ok)
    await h.payload.update({collection:'customers',id:accounts[winner].id,data:{email:'changed@example.test'},overrideAccess:true})
    const recreated=await h.seed('customers',{name:'New mailbox holder',email:accounts[winner].email,password:'Synthetic-claims-passphrase-982!',_verified:true})
    const recreatedAccountHistory=await listOwnBookings(h.ctx({kind:'customer',collection:'customers',id:recreated.id}),null)
    expect(recreatedAccountHistory.items).toHaveLength(0)
    expect((await h.rows('bookings'))[0].ownerCustomer).toBe(accounts[winner].id)
    expect((await h.rows('audit-entries',{action:{equals:'booking:claimed'}}))).toHaveLength(1)
  })
  it('fails closed without approved independent evidence, even with a matching email or public code',async()=>{
    const {booking,accounts,staffCtx,contexts}=await setup()
    const closed={...staffCtx,policy:{...staffCtx.policy,approvedSections:[]}}
    await expect(issueClaim(closed,{bookingId:booking.id,customerId:accounts[0].id,proof:proof()})).rejects.toThrow()
    await expect(issueClaim(contexts[0],{bookingId:booking.id,customerId:accounts[0].id,proof:proof()})).rejects.toThrow()
    expect(await attachClaim(contexts[0],{purpose:'booking-claim',approvalId:randomUUID(),token:booking.code!})).toEqual({ok:false,code:'insufficient-evidence'})
    const grant=await issueClaim(staffCtx,{bookingId:booking.id,customerId:accounts[0].id,proof:proof()})
    expect(await attachClaim({...contexts[0],policy:closed.policy},grant)).toEqual({ok:false,code:'insufficient-evidence'})
    expect((await h.rows('bookings'))[0].ownerCustomer).toBeFalsy()
  })
  it('binds tokens to one customer, purpose, revision and one explicit use',async()=>{
    const {booking,accounts,staffCtx,contexts}=await setup(),grant=await issueClaim(staffCtx,{bookingId:booking.id,customerId:accounts[0].id,proof:proof()})
    expect(await attachClaim(contexts[1],grant)).toEqual({ok:false,code:'insufficient-evidence'})
    expect(await attachClaim(contexts[0],{...grant,purpose:'reset'} as unknown as typeof grant)).toEqual({ok:false,code:'insufficient-evidence'})
    const duplicates=await Promise.all([attachClaim(contexts[0],grant),attachClaim(contexts[0],grant)])
    expect(duplicates.filter(result=>result.ok)).toHaveLength(1)
    expect(duplicates.filter(result=>!result.ok).map(result=>result.code)).toEqual(['used'])
    expect(JSON.stringify(await h.rows('booking-claims'))).not.toContain(grant.token)
    expect(JSON.stringify(await h.rows('audit-entries'))).not.toContain(grant.token)
  })
  it('expires grants and invalidates them after account security changes',async()=>{
    const {booking,accounts,staffCtx,contexts}=await setup(),grant=await issueClaim(staffCtx,{bookingId:booking.id,customerId:accounts[0].id,proof:proof()})
    h.clock.set('2026-11-15T04:15:00Z')
    expect(await attachClaim(contexts[0],grant)).toEqual({ok:false,code:'expired'})
    h.clock.set('2026-11-15T04:00:00Z')
    await h.payload.update({collection:'customers',id:accounts[0].id,data:{securityRevision:2},overrideAccess:true})
    expect(await attachClaim(contexts[0],grant)).toEqual({ok:false,code:'insufficient-evidence'})
  })
  it('keeps copied booking-view links separate, scoped, expiring and revocable',async()=>{
    const {booking,accounts,staffCtx,contexts}=await setup()
    const view=await h.uow.run(staffCtx.actor,tx=>createBookingView(tx,booking.id,'2026-11-15T05:00:00Z'))
    expect((await verifyBookingView(h.ctx({kind:'anonymous'}),view))?.id).toBe(booking.id)
    expect(await verifyBookingView(h.ctx({kind:'anonymous'}),{...view,bookingId:randomUUID()})).toBeNull()
    const grant=await issueClaim(staffCtx,{bookingId:booking.id,customerId:accounts[0].id,proof:proof()})
    expect(await attachClaim(contexts[0],{purpose:'booking-claim',approvalId:view.id,token:view.token})).toEqual({ok:false,code:'insufficient-evidence'})
    expect(await verifyBookingView(h.ctx({kind:'anonymous'}),{...view,token:grant.token})).toBeNull()
    await revokeBookingView(staffCtx,view.id)
    expect(await verifyBookingView(h.ctx({kind:'anonymous'}),view)).toBeNull()
    const expiring=await h.uow.run(staffCtx.actor,tx=>createBookingView(tx,booking.id,'2026-11-15T04:01:00Z'))
    h.clock.set('2026-11-15T04:01:00Z');expect(await verifyBookingView(h.ctx({kind:'anonymous'}),expiring)).toBeNull()
  })
  it('rolls back claim consumption and ownership if the required audit fails',async()=>{
    const {booking,accounts,staffCtx,contexts}=await setup(),grant=await issueClaim(staffCtx,{bookingId:booking.id,customerId:accounts[0].id,proof:proof()})
    await h.pool.query("CREATE FUNCTION reject_claim_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='booking:claimed' THEN RAISE EXCEPTION 'injected claim audit failure'; END IF; RETURN NEW; END $$")
    await h.pool.query('CREATE TRIGGER reject_claim_audit BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_claim_audit()')
    try{await expect(attachClaim(contexts[0],grant)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_claim_audit ON audit_entries');await h.pool.query('DROP FUNCTION reject_claim_audit()')}
    expect((await h.rows('bookings'))[0].ownerCustomer).toBeFalsy()
    expect((await h.rows('booking-claims'))[0].usedAt).toBeFalsy()
    expect((await attachClaim(contexts[0],grant)).ok).toBe(true)
  })
})
