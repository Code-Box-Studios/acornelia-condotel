import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Payload owns every application table and is the only database client. Supabase's Data API reaches
// the public schema through the anon, authenticated and service_role roles, which this application never
// uses. Row level security without policies blocks those roles while the owning role keeps access.
// The roles exist only on Supabase, so the grant removal is skipped on local and CI databases.
// Re-runnable: tests apply it again after recreating Supabase's default grants.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$
  DECLARE
    owner_oid oid := (SELECT oid FROM pg_roles WHERE rolname = current_user);
    item record;
    api_role text;
  BEGIN
    FOR item IN SELECT c.oid::regclass AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relowner = owner_oid AND NOT c.relrowsecurity LOOP
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', item.name);
    END LOOP;
    -- The application's own functions are trigger functions. Extension support functions are left alone.
    FOR item IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proowner = owner_oid
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e') LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', item.name);
    END LOOP;
    ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role);
      FOR item IN SELECT c.oid::regclass AS name, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND c.relowner = owner_oid LOOP
        EXECUTE format('REVOKE ALL ON %s %s FROM %I', CASE WHEN item.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, item.name, api_role);
      END LOOP;
      FOR item IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proowner = owner_oid
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', item.name, api_role);
      END LOOP;
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END LOOP;
  END $$;`)
}

// Rolling back turns row level security off and restores PostgreSQL's default function access.
// It never grants anything back to the Data API roles.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$
  DECLARE
    owner_oid oid := (SELECT oid FROM pg_roles WHERE rolname = current_user);
    item record;
  BEGIN
    FOR item IN SELECT c.oid::regclass AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relowner = owner_oid AND c.relrowsecurity LOOP
      EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', item.name);
    END LOOP;
    FOR item IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proowner = owner_oid
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e') LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', item.name);
    END LOOP;
    ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
  END $$;`)
}
