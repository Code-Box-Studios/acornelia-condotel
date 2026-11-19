import {randomUUID} from 'node:crypto'
import type {MigrateUpArgs,MigrateDownArgs} from '@payloadcms/db-postgres'
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {listOwnBookings,readOwnBooking} from '@/features/customer/bookings'
import type {Booking} from '@/payload-types'
import type {Principal} from '@/domain/shared/types'

describe('private customer booking history',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset()})
  afterAll(async()=>{await h?.close()})
  async function customer(email='owner@example.test',verified=true){return h.seed('customers',{name:'Synthetic booker',email,password:'Synthetic-history-passphrase-946!',_verified:verified})}
  const actor=(id:string):Principal=>({kind:'customer',collection:'customers',id})
  async function booking(owner?:string,status:'held'|'confirmed'|'cancelled'|'completed'|'expired'='confirmed'){
    return h.seed('bookings',{ownerCustomer:owner,status,revision:1,arrival:'2027-02-10T00:00:00Z',departure:'2027-02-12T00:00:00Z',acceptedQuote:{total:{minor:'900719925474099312',currency:'PHP'},privateInternal:'must never leave'},contact:{name:'Different contact',email:'shared@example.test',phone:'+630000000000',internalNote:'private staff note'},stayingGuest:'Different staying guest',source:'website'})
  }
  it('shows every booking and payment state only for the immutable booker ID',async()=>{
    const owner=await customer(),other=await customer('other@example.test')
    const own:Booking[]=[]
    for(const status of ['held','confirmed','cancelled','completed','expired'] as const)own.push(await booking(owner.id,status))
    await booking(other.id);await booking()
    for(const [index,state] of ['preparing','ready','unknown','pending','succeeded','closed'].entries()){
      await h.seed('payment-attempts',{booking:own[0].id,merchantReference:'HISTORY-'+index,commandKey:'HISTORY-KEY-'+index,fingerprint:'synthetic',amountMinor:'900719925474099312',currency:'PHP',acceptedContext:{privateSecret:'not public'},purpose:'booking',revision:1,deadline:'2027-02-10T00:00:00Z',state:state as 'pending',checkoutUrl:'https://private.example.test/token'})
    }
    for(const [index,status] of ['pending','authorized','collected','failed','voided'].entries())await h.seed('payment-transactions',{booking:own[0].id,providerPaymentId:'PRIVATE-PAYMENT-'+index,merchantReference:'PRIVATE-REFERENCE-'+index,environment:'sandbox',amountMinor:'1234',currency:'PHP',status:status as 'pending'})
    const page=await listOwnBookings(h.ctx(actor(owner.id)),null)
    expect(page.items.map(item=>item.id).sort()).toEqual(own.map(item=>item.id).sort())
    const item=page.items.find(item=>item.id===own[0].id)!
    expect(item.booker.customerId).toBe(owner.id)
    expect(item.contact.name).toBe('Different contact')
    expect(item.stayingGuest.name).toBe('Different staying guest')
    expect(item.acceptedTotal).toEqual({minor:'900719925474099312',currency:'PHP'})
    expect(item.payments.attempts.map(attempt=>attempt.state).sort()).toEqual(['closed','pending','preparing','ready','succeeded','unknown'])
    expect(item.payments.transactions.map(payment=>payment.status).sort()).toEqual(['authorized','collected','failed','pending','voided'])
    const serialized=JSON.stringify(page)
    for(const privateValue of ['must never leave','private staff note','PRIVATE-PAYMENT','PRIVATE-REFERENCE','privateSecret','private.example.test'])expect(serialized).not.toContain(privateValue)
    expect(await readOwnBooking(h.ctx(actor(other.id)),own[0].id)).toBeNull()
  })
  it('does not inherit guest history from a shared, changed or reused contact email',async()=>{
    const first=await customer('shared@example.test'),owned=await booking(first.id)
    await booking()
    await h.payload.update({collection:'customers',id:first.id,data:{email:'changed@example.test'},overrideAccess:true})
    const replacement=await customer('shared@example.test')
    expect((await listOwnBookings(h.ctx(actor(first.id)),null)).items.map(item=>item.id)).toEqual([owned.id])
    expect((await listOwnBookings(h.ctx(actor(replacement.id)),null)).items).toHaveLength(0)
  })
  it('rejects anonymous, staff, unverified and deactivated history access',async()=>{
    const owner=await customer(),unverified=await customer('unverified@example.test',false)
    await booking(owner.id)
    await expect(listOwnBookings(h.ctx({kind:'anonymous'}),null)).rejects.toThrow()
    await expect(listOwnBookings(h.ctx(actor(unverified.id)),null)).rejects.toThrow()
    const staff=await h.seed('staff-users',{name:'Synthetic staff',email:'staff@example.test',password:'Synthetic-history-passphrase-946!',role:'developer'})
    await expect(listOwnBookings(h.ctx({kind:'staff',collection:'staff-users',id:staff.id,role:'developer'}),null)).rejects.toThrow()
    await h.payload.update({collection:'customers',id:owner.id,data:{deactivated:true},overrideAccess:true})
    await expect(listOwnBookings(h.ctx(actor(owner.id)),null)).rejects.toThrow()
  })
  it('paginates deterministically and refuses invalid or foreign cursors',async()=>{
    const owner=await customer(),other=await customer('other@example.test')
    const own:Booking[]=[];for(let n=0;n<23;n++)own.push(await booking(owner.id))
    const first=await listOwnBookings(h.ctx(actor(owner.id)),null),second=await listOwnBookings(h.ctx(actor(owner.id)),first.nextCursor)
    expect(first.items).toHaveLength(20);expect(second.items).toHaveLength(3)
    expect(new Set([...first.items,...second.items].map(item=>item.id)).size).toBe(23)
    expect(second.nextCursor).toBeNull()
    await expect(listOwnBookings(h.ctx(actor(other.id)),first.nextCursor)).rejects.toThrow()
    await expect(listOwnBookings(h.ctx(actor(owner.id)),'not-a-cursor')).rejects.toThrow()
  })
  it('preserves existing text UUID owners and accepted records during the relationship migration',async()=>{
    const name='acornelia_'+randomUUID().replaceAll('-','')+'_test'
    await h.pool.query(`CREATE DATABASE "${name}" OWNER acornelia`)
    let fresh:TestHarness|undefined
    try{
      const url=new URL(process.env.TEST_DATABASE_URL!);url.pathname='/'+name
      fresh=await createHarness({databaseUrl:url.toString(),migrate:false})
      const imported=await import('@/migrations')
      const migrations=imported.migrations.map(m=>({...m,up:(args:unknown)=>m.up(args as MigrateUpArgs),down:(args:unknown)=>m.down(args as MigrateDownArgs)}))
      await fresh.payload.db.migrate({migrations:migrations.slice(0,migrations.findIndex(m=>m.name==='20261115_182340_customer_history_claims'))})
      // Seed the historical schema with SQL: the current Payload model knows columns that later migrations add.
      const owner=(await fresh.pool.query("INSERT INTO customers(name,email,_verified) VALUES('Existing owner fixture','existing@example.test',true) RETURNING id")).rows[0] as {id:string}
      const inserted=await fresh.pool.query("INSERT INTO bookings(owner_customer_id,status,revision,arrival,departure,accepted_quote,contact,source) VALUES($1,'confirmed',1,'2027-02-10','2027-02-12',$2,$3,'website') RETURNING id",[owner.id,JSON.stringify({total:{minor:'1234',currency:'PHP'}}),JSON.stringify({name:'Preserved fixture'})])
      await fresh.payload.db.migrate({migrations})
      const preserved=(await fresh.rows('bookings'))[0]
      expect(preserved.id).toBe(inserted.rows[0].id)
      expect(preserved.ownerCustomer).toBe(owner.id)
      expect(preserved.acceptedQuote).toEqual({total:{minor:'1234',currency:'PHP'}})
      expect(preserved.contact).toEqual({name:'Preserved fixture'})
      await expect(fresh.pool.query('UPDATE bookings SET owner_customer_id=NULL WHERE id=$1',[preserved.id])).rejects.toThrow()
    }finally{await fresh?.close();await h.pool.query(`DROP DATABASE "${name}"`)}
  })
  it('denies generated relationship expansion and enforces owner immutability in SQL',async()=>{
    const owner=await customer(),other=await customer('other@example.test'),row=await booking(owner.id)
    const user={...owner,collection:'customers' as const}
    await expect(h.payload.findByID({collection:'bookings',id:row.id,user,overrideAccess:false,depth:3})).rejects.toThrow()
    await expect(h.pool.query('UPDATE bookings SET owner_customer_id=$1 WHERE id=$2',[other.id,row.id])).rejects.toThrow()
    await expect(h.pool.query('UPDATE bookings SET owner_customer_id=NULL WHERE id=$1',[row.id])).rejects.toThrow()
    await expect(h.pool.query('DELETE FROM customers WHERE id=$1',[owner.id])).rejects.toThrow()
    expect((await h.rows('bookings'))[0].ownerCustomer).toBe(owner.id)
  })
})
