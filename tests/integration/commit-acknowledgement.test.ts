import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
describe('database commit acknowledgements',()=>{
  let h:TestHarness
  beforeAll(async()=>{h=await createHarness()})
  beforeEach(async()=>{await h.reset()})
  afterAll(async()=>{await h?.close()})
  it('never acknowledges a transaction that was already rolled back',async()=>{
    await expect(h.uow.run({kind:'system',purpose:'work'},async tx=>{
      await h.payload.create({collection:'rooms',data:{label:'Rolled-back fixture'},req:tx.req,overrideAccess:true})
      await h.payload.db.rollbackTransaction(tx.req.transactionID!)
      return 'must-not-be-acknowledged'
    })).rejects.toThrow('inactive transaction')
    expect(await h.rows('rooms')).toHaveLength(0)
  })
  it('retries a serialization failure raised at COMMIT and acknowledges only persisted results',async()=>{
    // PostgreSQL deferred constraint triggers run at COMMIT, after the callback returns.
    await h.pool.query(`CREATE SEQUENCE commit_fixture_sequence; CREATE FUNCTION commit_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('commit_fixture_sequence')=1 THEN RAISE EXCEPTION 'injected commit serialization conflict' USING ERRCODE='40001'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER commit_fixture_failure AFTER INSERT ON rooms DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION commit_fixture_failure();`)
    let calls=0
    try{
      const result=await h.uow.run({kind:'system',purpose:'work'},async tx=>{calls++;return h.payload.create({collection:'rooms',data:{label:'Committed fixture'},req:tx.req,overrideAccess:true})})
      const records=await h.rows('rooms')
      expect(records.map(x=>x.id)).toContain(result.id)
      expect(records).toHaveLength(1)
      expect(calls).toBe(2)
    }finally{await h.pool.query('DROP TRIGGER commit_fixture_failure ON rooms; DROP FUNCTION commit_fixture_failure(); DROP SEQUENCE commit_fixture_sequence;')}
  })
})
