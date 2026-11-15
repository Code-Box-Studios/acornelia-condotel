import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {enqueue} from '@/domain/work/enqueue'
import {claimWork,beginWork} from '@/domain/work/claim'
import {completeWork,replayWork,listFailedWork} from '@/domain/work/complete'
import {runWorkBatch} from '@/integrations/work-runner'
import type {WorkIntent} from '@/domain/work/types'
import type {CommandContext} from '@/domain/db/types'
const attemptId='11111111-1111-4111-8111-111111111111'
describe('durable outbox leases and guarded effects',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset();h.clock.set('2026-11-15T04:00:00Z');vi.stubEnv('APP_OPERATION_MODE','normal')})
  afterEach(()=>vi.unstubAllEnvs())
  afterAll(async()=>{await h?.close()})
  function context():CommandContext{const ctx=h.ctx({kind:'system',purpose:'work'});ctx.policy.approvedSections=['work'];ctx.policy.sections.work={leaseSeconds:30,maxAttempts:2,maxBatch:5,backoffSeconds:[1,5],runSeconds:10};return ctx}
  function intent(key='check:fixture',kind:WorkIntent['kind']='reconcile-payment'):WorkIntent{return {semanticKey:key,kind,payload:{attemptId},availableAt:h.clock.now()}}
  async function add(value=intent()){return h.uow.run({kind:'system',purpose:'work'},tx=>enqueue(tx,value))}
  it('fences a stale worker after lease takeover',async()=>{
    const ctx=context(),id=await add(),oldLease=(await claimWork(ctx,'reconcile-payment'))!
    h.clock.set('2026-11-15T04:00:30Z')
    const newLease=(await claimWork(ctx,'reconcile-payment'))!,successResult={state:'done' as const}
    await expect(completeWork(ctx,oldLease,successResult)).rejects.toThrow()
    const currentWork=(await h.rows('work-items',{id:{equals:id}}))[0]
    expect(currentWork.generation).toBe(newLease.generation)
    expect(newLease.generation).toBe(oldLease.generation+1)
    await completeWork(ctx,newLease,successResult)
    expect((await h.rows('work-items'))[0].state).toBe('done')
  })
  it('deduplicates matching intents and rejects a changed payload for the same semantic key',async()=>{
    const original=await add(),duplicate=await add({...intent(),availableAt:'2026-11-15T05:00:00Z'})
    expect(duplicate).toBe(original);expect(await h.rows('work-items')).toHaveLength(1)
    await expect(add({...intent(),payload:{attemptId:'22222222-2222-4222-8222-222222222222'}})).rejects.toThrow()
  })
  it('reuses the same durable intent from concurrent producer transactions',async()=>{
    const results=await Promise.all([add(),add()])
    expect(results[0]).toBe(results[1]);expect(await h.rows('work-items')).toHaveLength(1)
  })
  it('gives only one of two workers a live lease',async()=>{
    await add();const ctx=context(),leases=await Promise.all([claimWork(ctx,'reconcile-payment'),claimWork(ctx,'reconcile-payment')])
    expect(leases.filter(Boolean)).toHaveLength(1)
    const row=(await h.rows('work-items'))[0]
    expect(row.attempts).toBe(1);expect(row.generation).toBe(1)
    expect(JSON.stringify(row)).not.toContain(leases.find(Boolean)!.owner)
  })
  it('rejects a forged lease credential and protects intent through direct SQL',async()=>{
    const ctx=context(),id=await add(),lease=(await claimWork(ctx,'reconcile-payment'))!
    await expect(completeWork(ctx,{...lease,owner:'forged'},{state:'done'})).rejects.toThrow('Work lease is stale')
    await expect(h.pool.query("UPDATE work_items SET payload='{}' WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'})
    await expect(h.pool.query('UPDATE work_items SET generation=0 WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'})
    await completeWork(ctx,lease,{state:'done'})
    await expect(h.pool.query("UPDATE work_items SET state='ready' WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'})
    await expect(h.pool.query('DELETE FROM work_items WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'})
  })
  it('requires approved limits before claiming and leaves unconfigured transports undispatched',async()=>{
    await add();const ctx=context();ctx.policy.sections.work={}
    await expect(claimWork(ctx,'reconcile-payment')).rejects.toThrow()
    expect((await h.rows('work-items'))[0].state).toBe('ready')
    await expect(runWorkBatch(context(),{})).rejects.toThrow('Work transport is not configured')
    expect((await h.rows('work-items'))[0].state).toBe('ready')
  })
  it('keeps committed intent across a fresh application context and loses rolled-back intent',async()=>{
    const id=await add();await h.close();h=await createHarness();h.clock.set('2026-11-15T04:00:00Z')
    expect((await claimWork(context(),'reconcile-payment'))?.id).toBe(id)
    await expect(h.uow.run({kind:'system',purpose:'work'},async tx=>{await enqueue(tx,intent('rolled-back'));throw new Error('injected producer failure')})).rejects.toThrow()
    expect(await h.rows('work-items')).toHaveLength(1)
  })
  it('never replays a possibly dispatched money request after a crash or timeout',async()=>{
    const ctx=context(),id=await add(intent('checkout:fixture','create-checkout')),lease=(await claimWork(ctx,'create-checkout'))!
    await beginWork(ctx,lease)
    h.clock.set('2026-11-15T04:00:30Z')
    expect(await claimWork(ctx,'create-checkout')).toBeNull()
    expect((await h.rows('work-items',{id:{equals:id}}))[0].state).toBe('uncertain')
    await expect(completeWork(ctx,lease,{state:'done'})).rejects.toThrow()
    const other=await add(intent('checkout:timeout','create-checkout')),fresh=(await claimWork(ctx,'create-checkout'))!
    await beginWork(ctx,fresh)
    await completeWork(ctx,fresh,{state:'retry',reason:'timeout'})
    expect((await h.rows('work-items',{id:{equals:other}}))[0].state).toBe('uncertain')
  })
  it('bounds retries, exposes failed work and permits only an authorized safe replay',async()=>{
    const ctx=context(),id=await add(),first=(await claimWork(ctx,'reconcile-payment'))!
    await completeWork(ctx,first,{state:'retry',reason:'provider-unavailable'})
    expect(await claimWork(ctx,'reconcile-payment')).toBeNull()
    h.clock.set('2026-11-15T04:00:01Z')
    const second=(await claimWork(ctx,'reconcile-payment'))!
    await completeWork(ctx,second,{state:'retry',reason:'provider-unavailable'})
    expect((await h.rows('work-items'))[0].state).toBe('failed')
    const staff=await h.seed('staff-users',{name:'Work operator',email:'work@example.test',password:'Synthetic-work-passphrase-946!',role:'developer'})
    const operator={...ctx,actor:{kind:'staff' as const,collection:'staff-users' as const,id:staff.id,role:'developer' as const}}
    expect((await listFailedWork(operator)).items.map(row=>row.id)).toEqual([id])
    await expect(replayWork(ctx,id)).rejects.toThrow()
    await replayWork(operator,id)
    const replay=(await claimWork(ctx,'reconcile-payment'))!
    expect(replay.generation).toBeGreaterThan(second.generation)
    expect(replay.attempts).toBe(1)
  })
  it('does not execute stale completion callbacks and rolls back callback effects on audit failure',async()=>{
    const ctx=context();await add()
    const counter=await h.seed('work-items',{semanticKey:'effect-counter',kind:'reconcile-payment',payload:{attemptId},state:'ready',generation:0,attempts:0,availableAt:'2100-01-01T00:00:00Z'})
    const old=(await claimWork(ctx,'reconcile-payment'))!
    h.clock.set('2026-11-15T04:00:30Z');const current=(await claimWork(ctx,'reconcile-payment'))!
    const result={state:'done' as const,apply:async(tx:Parameters<Parameters<typeof h.uow.run>[1]>[0])=>{await tx.payload.update({collection:'work-items',id:counter.id,data:{attempts:1},req:tx.req,overrideAccess:false})}}
    await expect(completeWork(ctx,old,result)).rejects.toThrow()
    expect((await h.rows('work-items',{id:{equals:counter.id}}))[0].attempts).toBe(0)
    await h.pool.query("CREATE FUNCTION reject_work_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='work:completed' THEN RAISE EXCEPTION 'injected work audit failure'; END IF; RETURN NEW; END $$")
    await h.pool.query('CREATE TRIGGER reject_work_audit BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION reject_work_audit()')
    try{await expect(completeWork(ctx,current,result)).rejects.toThrow()}finally{await h.pool.query('DROP TRIGGER reject_work_audit ON audit_entries');await h.pool.query('DROP FUNCTION reject_work_audit()')}
    expect((await h.rows('work-items',{id:{equals:counter.id}}))[0].attempts).toBe(0)
    await completeWork(ctx,current,result)
    expect((await h.rows('work-items',{id:{equals:counter.id}}))[0].attempts).toBe(1)
  })
  it('runs awaited effects outside transactions, in bounded batches, and rechecks recovery mode',async()=>{
    const original=context();let inside=0,calls=0
    const ctx={...original,uow:{run:async<T>(actor:CommandContext['actor'],work:Parameters<typeof h.uow.run<T>>[1])=>{inside++;try{return await h.uow.run(actor,work)}finally{inside--}}}}
    for(let n=0;n<3;n++)await add(intent('batch:'+n))
    const stats=await runWorkBatch(ctx,{'reconcile-payment':{execute:async()=>{expect(inside).toBe(0);calls++;return {state:'done'}}}},{maxJobs:2})
    expect(calls).toBe(2);expect(stats.completed).toBe(2)
    const lease=(await claimWork(ctx,'reconcile-payment'))!
    vi.stubEnv('APP_OPERATION_MODE','quarantine')
    await expect(beginWork(ctx,lease)).rejects.toThrow()
    await expect(completeWork(ctx,lease,{state:'done'})).rejects.toThrow()
    expect((await h.rows('work-items')).filter(row=>row.state==='leased')).toHaveLength(1)
  })
})
