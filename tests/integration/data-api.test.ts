import {afterAll,beforeAll,expect,it} from 'vitest'
import {createHarness,type TestHarness} from '../support/harness'
import {up as restrictDataApi} from '@/migrations/20261119_150000_restrict_data_api'
// Supabase's Data API reaches tables through these roles. Payload owns every table and uses none of them.
const apiRoles=['anon','authenticated','service_role'] as const
let h:TestHarness
beforeAll(async()=>{h=await createHarness()})
afterAll(async()=>{await h?.close()})
const owned="relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)"
it('keeps row level security on every application table, including tables added by later migrations',async()=>{
 const missing=await h.pool.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.${owned} AND NOT c.relrowsecurity ORDER BY 1`)
 // A new collection's generated migration must add ENABLE ROW LEVEL SECURITY for each new table.
 expect(missing.rows.map(row=>row.relname)).toEqual([])
})
it('removes Supabase Data API grants from application tables, sequences and functions',async()=>{
 // Recreate a Supabase project's default grants on the isolated test database.
 for(const role of apiRoles)await h.pool.query(`DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END$$`)
 const roles=apiRoles.join(', ')
 for(const statement of [`GRANT USAGE ON SCHEMA public TO ${roles}`,`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${roles}`,`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${roles}`,`GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${roles}`,`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${roles}`,`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${roles}`,`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${roles}`])await h.pool.query(statement)
 await restrictDataApi({db:h.payload.db.drizzle,payload:h.payload,req:{}} as unknown as Parameters<typeof restrictDataApi>[0])
 const role="(VALUES ('anon'),('authenticated'),('service_role')) AS r(name)"
 const tables=await h.pool.query(`SELECT r.name,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN ${role} WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND has_table_privilege(r.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`)
 const sequences=await h.pool.query(`SELECT r.name,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN ${role} WHERE n.nspname='public' AND c.relkind='S' AND has_sequence_privilege(r.name,c.oid,'USAGE,SELECT,UPDATE')`)
 // Callable functions are the application's own trigger functions; extension support functions stay untouched.
 const functions=await h.pool.query(`SELECT r.name,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN ${role} WHERE n.nspname='public' AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') AND has_function_privilege(r.name,p.oid,'EXECUTE')`)
 expect(tables.rows).toEqual([]);expect(sequences.rows).toEqual([]);expect(functions.rows).toEqual([])
 // Objects created later by the migration role must not inherit Data API grants either.
 await h.pool.query('CREATE TABLE public.data_api_probe (id integer)')
 await h.pool.query('CREATE FUNCTION public.data_api_probe_fn() RETURNS integer LANGUAGE sql AS $$SELECT 1$$')
 try{
  const probe=await h.pool.query(`SELECT r.name,has_table_privilege(r.name,'public.data_api_probe','SELECT') AS can_read,has_function_privilege(r.name,'public.data_api_probe_fn()','EXECUTE') AS can_call FROM ${role}`)
  expect(probe.rows.filter(row=>row.can_read||row.can_call)).toEqual([])
 }finally{
  await h.pool.query('DROP TABLE IF EXISTS public.data_api_probe');await h.pool.query('DROP FUNCTION IF EXISTS public.data_api_probe_fn()')
 }
})
