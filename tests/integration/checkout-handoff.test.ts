import {randomBytes,randomUUID} from 'node:crypto'
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {saveCheckoutDraft,resumeCheckoutDraft,type CheckoutDraft} from '@/features/booking/draft'
const saved:CheckoutDraft={stay:{arrival:'2027-02-10',departure:'2027-02-13',occupancy:{adults:2,children:1}},contact:{name:'Synthetic guest',email:'guest@example.test',phone:'+630000000000'}}
describe('private checkout and account handoff',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-14T04:00:00.000Z')})
  afterAll(async()=>{await h?.close()})
  function session(){return {ctx:h.ctx({kind:'anonymous'}),browserKey:randomBytes(32).toString('base64url')}}
  it('preserves guest draft after cancelled login without repricing',async()=>{
    const access=session(),ref=await saveCheckoutDraft(saved,access)
    const booking=await h.seed('bookings',{status:'held',revision:1,arrival:'2027-02-10T00:00:00Z',departure:'2027-02-13T00:00:00Z',acceptedQuote:{fixture:true},contact:{fixture:true},stayingGuest:'Synthetic staying guest',source:'website'})
    const attempt=await h.seed('payment-attempts',{booking:booking.id,merchantReference:'DRAFT-FIXTURE-IMMUTABLE',commandKey:'DRAFT-FIXTURE-KEY',fingerprint:'fixture',amountMinor:'123456',currency:'PHP',acceptedContext:{fixture:true},purpose:'booking',revision:1,deadline:'2026-11-14T05:00:00Z',state:'pending'})
    const resumed=await resumeCheckoutDraft(ref,{kind:'anonymous'},access)
    expect(resumed.stay).toEqual(saved.stay)
    expect(resumed.contact).toEqual(saved.contact)
    const after=await h.payload.findByID({collection:'payment-attempts',id:attempt.id,overrideAccess:true})
    expect(after.amountMinor).toBe(attempt.amountMinor)
    expect(after.acceptedContext).toEqual(attempt.acceptedContext)
    expect(JSON.stringify(await h.rows('checkout-drafts'))).not.toContain(saved.contact.email)
  })
  it('requires both the opaque reference and original browser binding and expires access',async()=>{
    const access=session(),ref=await saveCheckoutDraft(saved,access)
    await expect(resumeCheckoutDraft({...ref,secret:randomBytes(32).toString('base64url')},{kind:'anonymous'},access)).rejects.toThrow()
    await expect(resumeCheckoutDraft(ref,{kind:'anonymous'},{...access,browserKey:randomBytes(32).toString('base64url')})).rejects.toThrow()
    await expect(h.payload.findByID({collection:'checkout-drafts',id:ref.id,overrideAccess:false})).rejects.toThrow()
    h.clock.set('2026-11-14T05:00:00Z')
    await expect(resumeCheckoutDraft(ref,{kind:'anonymous'},access)).rejects.toThrow()
  })
  it('binds a prospective draft on customer save and refuses another account',async()=>{
    const access=session(),ref=await saveCheckoutDraft(saved,access)
    const first=await h.seed('customers',{name:'First customer',email:'first@example.test',password:'Synthetic-handoff-passphrase-892!',_verified:true})
    const second=await h.seed('customers',{name:'Second customer',email:'second@example.test',password:'Synthetic-handoff-passphrase-892!',_verified:true})
    const actor={kind:'customer' as const,collection:'customers' as const,id:first.id}
    const bound=await saveCheckoutDraft(saved,{...access,ctx:h.ctx(actor),ref,expectedVersion:ref.version})
    expect((await resumeCheckoutDraft(bound,actor,{...access,ctx:h.ctx(actor)})).contact).toEqual(saved.contact)
    const other={kind:'customer' as const,collection:'customers' as const,id:second.id}
    await expect(resumeCheckoutDraft(bound,other,{...access,ctx:h.ctx(other)})).rejects.toThrow()
    await expect(resumeCheckoutDraft(bound,{kind:'anonymous'},access)).rejects.toThrow()
    expect(await h.rows('bookings')).toHaveLength(0)
  })
  it('rejects stale tab updates and client-supplied accepted payment fields',async()=>{
    const access=session(),ref=await saveCheckoutDraft(saved,access)
    await saveCheckoutDraft({...saved,contact:{...saved.contact,name:'Updated fixture'}},{...access,ref,expectedVersion:ref.version})
    await expect(saveCheckoutDraft(saved,{...access,ref,expectedVersion:ref.version})).rejects.toThrow('changed in another tab')
    await expect(saveCheckoutDraft({...saved,totalMinor:'1'} as CheckoutDraft,session())).rejects.toThrow()
    await expect(saveCheckoutDraft({...saved,paymentAttemptId:'not-owned'} as CheckoutDraft,session())).rejects.toThrow()
  })
  it('keeps one server-minted preparation key across revisions and resumed tabs',async()=>{
    const access=session(),first=await saveCheckoutDraft(saved,access)
    expect(first.commandKey).toMatch(/^[a-f0-9-]{36}$/)
    const next=await saveCheckoutDraft(saved,{...access,ref:first,expectedVersion:first.version})
    expect(next.commandKey).toBe(first.commandKey)
    expect((await h.rows('checkout-drafts'))[0].commandKey).toBe(first.commandKey)
    await expect(h.pool.query('UPDATE checkout_drafts SET command_key=$1 WHERE id=$2',[randomUUID(),first.id])).rejects.toMatchObject({code:'23514'})
  })
})
