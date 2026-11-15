import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createHarness,type TestHarness} from '../support/harness'
import type {Principal} from '@/domain/shared/types'
import type {MigrateUpArgs,MigrateDownArgs} from '@payloadcms/db-postgres'
import type {DbTx} from '@/domain/db/types'
const actor:Principal={kind:'system',purpose:'payments'}
const stay={arrival:'2026-11-20T00:00:00.000Z',departure:'2026-11-22T00:00:00.000Z'}
const bookingData={status:'held' as const,revision:1,source:'website' as const,...stay,acceptedQuote:{total:{minor:'9007199254740993',currency:'PHP'}},contact:{email:'fixture@example.test'}}
describe('real PostgreSQL transaction and constraints',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset()})
  afterAll(async()=>{await h?.close()})
  async function writeReservation(tx:DbTx,roomId:string,faultAfter?:string){
    const {payload,req}=tx
    const fail=(step:string)=>{if(step===faultAfter)throw new Error('injected rollback fault')}
    const booking=await payload.create({collection:'bookings',data:bookingData,req,overrideAccess:false});fail('booking')
    await payload.create({collection:'allocations',data:{room:roomId,booking:booking.id,...stay,purpose:'hold',released:false},req,overrideAccess:false});fail('allocation')
    await payload.create({collection:'offer-allocations',data:{booking:booking.id,offerVersionId:'fixture-v1',customerId:randomUUID(),allocationKey:randomUUID(),state:'reserved'},req,overrideAccess:false});fail('offer')
    await payload.create({collection:'payment-attempts',data:{booking:booking.id,merchantReference:randomUUID(),commandKey:randomUUID(),fingerprint:'fixture',amountMinor:'9007199254740993',currency:'PHP',acceptedContext:{fixture:true},purpose:'booking',revision:1,state:'preparing',deadline:'2026-11-13T05:00:00.000Z'},req,overrideAccess:false});fail('attempt')
    await payload.create({collection:'audit-entries',data:{actor,action:'fixture:created',recordType:'booking',recordId:booking.id,outcome:'success'},req,overrideAccess:false});fail('audit')
    await payload.create({collection:'work-items',data:{semanticKey:randomUUID(),kind:'create-checkout',state:'ready',generation:0,attempts:0,payload:{bookingId:booking.id},availableAt:'2026-11-13T04:00:00.000Z'},req,overrideAccess:false});fail('work')
    return booking.id
  }
  it.each(['booking','allocation','offer','attempt','audit','work'])('rolls back all dependent writes after %s fails',async step=>{
    const room=await h.seed('rooms',{label:'R1'})
    await expect(h.uow.run(actor,tx=>writeReservation(tx,room.id,step))).rejects.toThrow('injected rollback fault')
    for(const collection of ['bookings','allocations','offer-allocations','payment-attempts','audit-entries','work-items'] as const){expect(await h.rows(collection)).toHaveLength(0)}
  })
  it('commits exact amounts, room and work together',async()=>{
    const room=await h.seed('rooms',{label:'R1'})
    await h.uow.run(actor,tx=>writeReservation(tx,room.id))
    expect(await h.rows('bookings')).toHaveLength(1)
    expect((await h.rows('payment-attempts'))[0].amountMinor).toBe('9007199254740993')
    expect(await h.rows('allocations')).toHaveLength(1)
    expect(await h.rows('work-items')).toHaveLength(1)
  })
  it('rejects direct overlapping writes but allows adjacent stays',async()=>{
    const room=await h.seed('rooms',{label:'R1'})
    await h.pool.query('insert into allocations(room_id,arrival,departure) values($1,$2,$3)',[room.id,stay.arrival,stay.departure])
    await expect(h.pool.query('insert into allocations(room_id,arrival,departure) values($1,$2,$3)',[room.id,stay.arrival,stay.departure])).rejects.toMatchObject({code:'23P01'})
    await h.pool.query('insert into allocations(room_id,arrival,departure) values($1,$2,$3)',[room.id,stay.departure,'2026-11-24T00:00:00.000Z'])
    expect(await h.rows('allocations')).toHaveLength(2)
  })
  it('permits only one simultaneous reservation for the last physical room',async()=>{
    const room=await h.seed('rooms',{label:'R1'})
    const results=await Promise.allSettled([h.uow.run(actor,tx=>writeReservation(tx,room.id)),h.uow.run(actor,tx=>writeReservation(tx,room.id))])
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect(await h.rows('bookings')).toHaveLength(1)
    expect(await h.rows('allocations')).toHaveLength(1)
    expect(await h.rows('offer-allocations')).toHaveLength(1)
  })
  it('rejects malformed money and non-calendar intervals even through SQL',async()=>{
    const room=await h.seed('rooms',{label:'R1'})
    await expect(h.pool.query('insert into allocations(room_id,arrival,departure) values($1,$2,$3)',[room.id,'2026-11-20T01:00:00Z',stay.departure])).rejects.toMatchObject({code:'23514'})
    const booking=await h.seed('bookings',bookingData)
    await expect(h.pool.query(`insert into payment_attempts(booking_id,merchant_reference,command_key,fingerprint,amount_minor,currency,accepted_context,revision,deadline) values($1,'ref','key','f','1.5','PHP','{}',1,now())`,[booking.id])).rejects.toMatchObject({code:'23514'})
  })
  it('migrates a fresh database and upgrades existing records without removing overlap guards',async()=>{
    const name=`acornelia_${randomUUID().replaceAll('-','')}_test`
    await h.pool.query(`CREATE DATABASE "${name}" OWNER acornelia`)
    let fresh:TestHarness|undefined
    try{
      const url=new URL(process.env.TEST_DATABASE_URL!);url.pathname='/'+name
      fresh=await createHarness({databaseUrl:url.toString(),migrate:false})
      const imported=await import('@/migrations')
      const migrations=imported.migrations.map(m=>({...m,up:(args:unknown)=>m.up(args as MigrateUpArgs),down:(args:unknown)=>m.down(args as MigrateDownArgs)}))
      await fresh.payload.db.migrate({migrations:migrations.slice(0,1)})
      // Seed the historical schema directly; the current Payload model includes later columns.
      const room=(await fresh.pool.query("INSERT INTO rooms(label) VALUES('Opening fixture') RETURNING id")).rows[0] as {id:string}
      await fresh.pool.query("INSERT INTO bookings(status,revision,arrival,departure,accepted_quote,contact,source) VALUES('held',1,$1,$2,$3,$4,'website')",[bookingData.arrival,bookingData.departure,JSON.stringify(bookingData.acceptedQuote),JSON.stringify(bookingData.contact)])
      await fresh.payload.db.migrate({migrations})
      expect(await fresh.rows('bookings')).toHaveLength(1)
      await fresh.pool.query('insert into allocations(room_id,arrival,departure) values($1,$2,$3)',[room.id,stay.arrival,stay.departure])
      await expect(fresh.pool.query('insert into allocations(room_id,arrival,departure) values($1,$2,$3)',[room.id,stay.arrival,stay.departure])).rejects.toMatchObject({code:'23P01'})
      await fresh.payload.db.migrate({migrations})
      expect(await fresh.rows('bookings')).toHaveLength(1)
    }finally{
      await fresh?.close()
      await h.pool.query(`DROP DATABASE "${name}"`)
    }
  })
  it('retries a conflicting serializable transition without losing increments or duplicating writes',async()=>{
    const work=await h.seed('work-items',{semanticKey:'counter',kind:'reconcile-payment',state:'ready',generation:0,attempts:0,payload:{},availableAt:'2026-11-13T04:00:00Z'})
    let entered=0
    let release:()=>void
    const barrier=new Promise<void>(resolve=>{release=resolve})
    const increment=()=>h.uow.run(actor,async({payload,req})=>{
      const current=await payload.findByID({collection:'work-items',id:work.id,req,overrideAccess:true})
      if(++entered<=2){if(entered===2)release();await barrier}
      await payload.update({collection:'work-items',id:work.id,data:{attempts:current.attempts+1},req,overrideAccess:false})
      await payload.create({collection:'bookings',data:bookingData,req,overrideAccess:false})
    })
    await Promise.all([increment(),increment()])
    expect((await h.rows('work-items'))[0].attempts).toBe(2)
    expect(await h.rows('bookings')).toHaveLength(2)
    expect(entered).toBeGreaterThan(2)
  })
})
