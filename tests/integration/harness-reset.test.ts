import pg from 'pg'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
let h:TestHarness
beforeAll(async()=>{h=await createHarness()})
afterAll(async()=>{await h?.close()})
// The browser server can still be finishing a request from the previous test when the next test resets the
// database. Its transaction locks tables in its own order, so PostgreSQL may abort the reset as a deadlock victim.
it('retries the test reset when a lingering server transaction deadlocks with it',async()=>{
 const tables=(await h.pool.query("select tablename from pg_tables where schemaname='public' and tablename<>'payload_migrations' order by tablename")).rows.map((row:{tablename:string})=>row.tablename)
 const [first,last]=[tables[0],tables.at(-1)!]
 const server=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await server.connect()
 try{
  await server.query('BEGIN');await server.query(`SELECT 1 FROM "${last}" LIMIT 1`)
  const resetting=h.reset()
  // Wait until the reset holds the first table and waits for the last one.
  for(let tries=0;;tries++){
   const waiting=await h.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'TRUNCATE%'")
   if(waiting.rows[0].n===1)break
   if(tries>200)throw new Error('The reset never waited for the lingering transaction')
   await new Promise(resolve=>setTimeout(resolve,10))
  }
  // Requesting the first table closes the cycle; PostgreSQL aborts the reset, which waited first.
  await server.query(`SELECT 1 FROM "${first}" LIMIT 1`)
  await server.query('COMMIT')
  await expect(resetting).resolves.toBeUndefined()
 }finally{await server.end()}
})
