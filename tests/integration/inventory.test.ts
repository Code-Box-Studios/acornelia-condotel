import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {findAvailability} from '@/domain/inventory/availability'
import {allocate,release} from '@/domain/inventory/allocate'
import {createRoomBlock,releaseRoomBlock,previewOpeningInventory} from '@/domain/inventory/blocks'
import type {CommandContext} from '@/domain/db/types'
import type {StayRequest} from '@/domain/inventory/types'

describe('shared physical-room inventory',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-15T04:00:00Z')})
  afterAll(async()=>{await h?.close()})
  function context():CommandContext{const ctx=h.ctx({kind:'anonymous'});ctx.policy.approvedSections=['stay','inventory-operations'];ctx.policy.sections={stay:{timezone:'Asia/Manila',minNights:1,maxNights:30,minLeadDays:0,maxAdvanceDays:730,sameDayCutoff:'18:00',turnover:'same-day'},'inventory-operations':{blocks:true,openingPreview:true}};return ctx}
  const stay=(roomTypeId:string,arrival='2027-02-10',departure='2027-02-12'):StayRequest=>({roomTypeId,arrival,departure,occupancy:{adults:2,children:0}})
  async function setup(units=1){
    const roomType=await h.seed('room-types',{name:'Inventory fixture',slug:'inventory-fixture',maxGuests:3,onSale:true,_status:'published'})
    const rooms=[];for(let i=0;i<units;i++)rooms.push(await h.seed('rooms',{label:'PRIVATE-ROOM-'+i,roomType:roomType.id,onSale:true}))
    const developer=await h.seed('staff-users',{name:'Inventory developer',email:'inventory@example.test',password:'Synthetic-inventory-passphrase-724!',role:'developer'})
    const ctx=context(),staffCtx={...ctx,actor:{kind:'staff' as const,collection:'staff-users' as const,id:developer.id,role:'developer' as const}}
    return {roomType,rooms,ctx,staffCtx}
  }
  async function reserve(ctx:CommandContext,selection:StayRequest,purpose:'hold'|'booking'='hold'){
    return ctx.uow.run(ctx.actor,async tx=>{
      const booking=await tx.payload.create({collection:'bookings',data:{status:purpose==='hold'?'held':'confirmed',revision:1,arrival:selection.arrival+'T00:00:00Z',departure:selection.departure+'T00:00:00Z',acceptedQuote:{fixture:true},contact:{name:'PRIVATE-GUEST',email:'private@example.test'},source:'website'},req:tx.req,overrideAccess:false})
      return allocate(tx,{purpose,bookingId:booking.id,stay:selection,policy:ctx.policy,now:ctx.clock.now(),...(purpose==='hold'?{deadline:'2026-11-15T04:15:00Z'}:{})})
    })
  }
  it('allows adjacent nights but only one overlapping allocation',async()=>{
    const {roomType,ctx}=await setup()
    const adjacentAllocations=[await reserve(ctx,stay(roomType.id)),await reserve(ctx,stay(roomType.id,'2027-02-12','2027-02-14'),'booking')]
    expect(adjacentAllocations).toHaveLength(2)
    const racing=await Promise.allSettled([reserve(ctx,stay(roomType.id,'2027-02-20','2027-02-22')),reserve(ctx,stay(roomType.id,'2027-02-20','2027-02-22'))])
    const overlappingSuccesses=racing.filter(result=>result.status==='fulfilled')
    expect(overlappingSuccesses).toHaveLength(1)
    expect(await h.rows('allocations')).toHaveLength(3)
    expect(await h.rows('bookings')).toHaveLength(3)
  })
  it('requires a single physical room free for the entire stay and leaks no identities',async()=>{
    const {roomType,rooms,ctx,staffCtx}=await setup(2)
    await createRoomBlock(staffCtx,{roomId:rooms[0].id,arrival:'2027-02-10',departure:'2027-02-11',reason:'PRIVATE-MAINTENANCE'})
    await createRoomBlock(staffCtx,{roomId:rooms[1].id,arrival:'2027-02-11',departure:'2027-02-12',reason:'PRIVATE-OWNER-BLOCK'})
    expect(await findAvailability(ctx,stay(roomType.id))).toHaveLength(0)
    const short=await findAvailability(ctx,stay(roomType.id,'2027-02-10','2027-02-11'))
    expect(short).toEqual([{id:roomType.id,name:'Inventory fixture',slug:'inventory-fixture',maxGuests:3,availableUnits:1}])
    for(const value of ['PRIVATE-ROOM','PRIVATE-MAINTENANCE','PRIVATE-OWNER',rooms[0].id,rooms[1].id])expect(JSON.stringify(short)).not.toContain(value)
  })
  it('keeps expired unreleased holds occupied until a real release transition',async()=>{
    const {roomType,ctx,staffCtx}=await setup(),allocation=await reserve(ctx,stay(roomType.id))
    h.clock.set('2026-11-15T05:00:00Z')
    expect(await findAvailability(ctx,stay(roomType.id))).toHaveLength(0)
    await staffCtx.uow.run(staffCtx.actor,async tx=>{
      await tx.payload.update({collection:'bookings',id:typeof allocation.booking==='string'?allocation.booking:allocation.booking!.id,data:{status:'expired'},req:tx.req,overrideAccess:false})
      await release(tx,allocation.id)
    })
    expect((await findAvailability(ctx,stay(roomType.id)))[0].availableUnits).toBe(1)
    await expect(h.pool.query('UPDATE allocations SET released=false WHERE id=$1',[allocation.id])).rejects.toThrow()
    await expect(h.pool.query('DELETE FROM allocations WHERE id=$1',[allocation.id])).rejects.toThrow()
  })
  it('refuses inventory release by an email-only system principal',async()=>{
    const {roomType,ctx}=await setup(),allocation=await reserve(ctx,stay(roomType.id))
    await h.payload.update({collection:'bookings',id:typeof allocation.booking==='string'?allocation.booking:allocation.booking!.id,data:{status:'expired'},overrideAccess:true})
    await expect(h.uow.run({kind:'system',purpose:'email'},tx=>release(tx,allocation.id))).rejects.toThrow()
    expect((await h.rows('allocations'))[0].released).toBe(false)
  })
  it('blocks maintenance against held or confirmed stays and releases blocks atomically with audit',async()=>{
    const {roomType,rooms,ctx,staffCtx}=await setup(),allocation=await reserve(ctx,stay(roomType.id),'booking')
    await expect(createRoomBlock(staffCtx,{roomId:rooms[0].id,arrival:'2027-02-11',departure:'2027-02-13',reason:'Conflicting maintenance'})).rejects.toThrow()
    const block=await createRoomBlock(staffCtx,{roomId:rooms[0].id,arrival:'2027-03-01',departure:'2027-03-04',reason:'Synthetic maintenance'})
    expect(await findAvailability(ctx,stay(roomType.id,'2027-03-01','2027-03-04'))).toHaveLength(0)
    await releaseRoomBlock(staffCtx,block.id)
    expect((await findAvailability(ctx,stay(roomType.id,'2027-03-01','2027-03-04')))[0].availableUnits).toBe(1)
    expect((await h.rows('allocations',{id:{equals:allocation.id}}))[0].released).toBe(false)
    expect((await h.rows('room-blocks'))[0].state).toBe('released')
    expect((await h.rows('audit-entries',{action:{equals:'inventory:block-released'}}))).toHaveLength(1)
  })
  it('rolls back block creation and release when the required audit insert fails',async()=>{
    const {rooms,staffCtx}=await setup()
    await h.pool.query("CREATE FUNCTION reject_inventory_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('inventory:block-created','inventory:block-released') THEN RAISE EXCEPTION 'injected inventory audit failure'; END IF; RETURN NEW; END $$")
    await h.pool.query('CREATE TRIGGER reject_inventory_audit BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_inventory_audit()')
    try{await expect(createRoomBlock(staffCtx,{roomId:rooms[0].id,arrival:'2027-04-01',departure:'2027-04-02',reason:'Rollback fixture'})).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_inventory_audit ON audit_entries')}
    expect(await h.rows('allocations')).toHaveLength(0);expect(await h.rows('room-blocks')).toHaveLength(0)
    const block=await createRoomBlock(staffCtx,{roomId:rooms[0].id,arrival:'2027-04-01',departure:'2027-04-02',reason:'Rollback fixture'})
    await h.pool.query('CREATE TRIGGER reject_inventory_audit BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_inventory_audit()')
    try{await expect(releaseRoomBlock(staffCtx,block.id)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_inventory_audit ON audit_entries');await h.pool.query('DROP FUNCTION reject_inventory_audit()')}
    expect((await h.rows('room-blocks'))[0].state).toBe('active')
    expect((await h.rows('allocations'))[0].released).toBe(false)
  })
  it('preserves existing reservations when a room or type goes off sale',async()=>{
    const {roomType,rooms,ctx}=await setup(),allocation=await reserve(ctx,stay(roomType.id),'booking')
    await h.payload.update({collection:'rooms',id:rooms[0].id,data:{onSale:false},overrideAccess:true})
    expect(await findAvailability(ctx,stay(roomType.id,'2027-04-01','2027-04-02'))).toHaveLength(0)
    await h.payload.update({collection:'rooms',id:rooms[0].id,data:{onSale:true},overrideAccess:true})
    await h.payload.update({collection:'room-types',id:roomType.id,data:{onSale:false},overrideAccess:true})
    expect(await findAvailability(ctx,stay(roomType.id,'2027-04-01','2027-04-02'))).toHaveLength(0)
    expect((await h.rows('allocations'))[0].id).toBe(allocation.id)
    expect((await h.rows('bookings'))[0].status).toBe('confirmed')
  })
  it('validates approved timezone, lead time, cutoff, capacity and calendar boundaries',async()=>{
    const {roomType,ctx}=await setup()
    for(const [arrival,departure] of [['2028-02-28','2028-03-01'],['2026-12-31','2027-01-02'],['2027-01-31','2027-02-01']])expect(await findAvailability(ctx,stay(roomType.id,arrival,departure))).toHaveLength(1)
    await expect(findAvailability(ctx,stay(roomType.id,'2027-02-29','2027-03-01'))).rejects.toThrow()
    await expect(findAvailability(ctx,stay(roomType.id,'2026-11-14','2026-11-15'))).rejects.toThrow()
    await expect(findAvailability(ctx,stay(roomType.id,'2027-01-01','2027-02-01'))).rejects.toThrow()
    await expect(findAvailability(ctx,{...stay(roomType.id),occupancy:{adults:3,children:1}})).rejects.toThrow()
    h.clock.set('2026-11-15T10:00:00Z')
    await expect(findAvailability(ctx,stay(roomType.id,'2026-11-15','2026-11-16'))).rejects.toThrow()
    h.clock.set('2026-11-15T16:01:00Z')
    expect(await findAvailability(ctx,stay(roomType.id,'2026-11-16','2026-11-17'))).toHaveLength(1)
    await expect(findAvailability({...ctx,policy:{...ctx.policy,approvedSections:[]}},stay(roomType.id))).rejects.toThrow()
  })
  it('prevents direct SQL, generated API or staff commands from bypassing the shared exclusion',async()=>{
    const {roomType,rooms,ctx,staffCtx}=await setup(),allocation=await reserve(ctx,stay(roomType.id),'booking')
    await expect(h.pool.query("INSERT INTO allocations(room_id,arrival,departure,purpose,released) VALUES($1,'2027-02-11','2027-02-12','block',false)",[rooms[0].id])).rejects.toMatchObject({code:'23P01'})
    await expect(h.pool.query("UPDATE allocations SET departure='2027-02-13' WHERE id=$1",[allocation.id])).rejects.toThrow()
    await expect(createRoomBlock(ctx,{roomId:rooms[0].id,arrival:'2027-02-11',departure:'2027-02-12',reason:'Denied anonymous block'})).rejects.toThrow()
    await expect(h.payload.create({collection:'room-blocks',data:{room:rooms[0].id,allocation:allocation.id,arrival:'2027-02-10T00:00:00Z',departure:'2027-02-12T00:00:00Z',reason:'Raw API denied',state:'active'},overrideAccess:false,user:{...(await h.payload.findByID({collection:'staff-users',id:staffCtx.actor.kind==='staff'?staffCtx.actor.id:'',overrideAccess:true})),collection:'staff-users'}})).rejects.toThrow()
  })
  it('previews opening inventory conflicts without applying or overriding reservations',async()=>{
    const {roomType,rooms,ctx,staffCtx}=await setup(),allocation=await reserve(ctx,stay(roomType.id),'booking')
    const base={roomId:rooms[0].id,kind:'booking' as const,externalReference:'external-fixture'}
    const invalid=await previewOpeningInventory(staffCtx,[{...base,arrival:'2027-02-11',departure:'2027-02-12'},{...base,roomId:randomUUID(),arrival:'2027-03-01',departure:'2027-03-02'}])
    expect(invalid.valid).toBe(false)
    expect(invalid.issues.map(issue=>issue.code)).toEqual(expect.arrayContaining(['overlap','duplicate-reference','unknown-room']))
    expect(await previewOpeningInventory(staffCtx,[{...base,arrival:'2027-02-12',departure:'2027-02-14'}])).toEqual({valid:true,issues:[]})
    expect(await h.rows('allocations')).toHaveLength(1)
    expect((await h.rows('allocations'))[0].id).toBe(allocation.id)
  })
})
