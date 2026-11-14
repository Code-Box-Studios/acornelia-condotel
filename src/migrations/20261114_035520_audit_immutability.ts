import {type MigrateUpArgs,type MigrateDownArgs,sql} from '@payloadcms/db-postgres'
export async function up({db}:MigrateUpArgs):Promise<void>{
  await db.execute(sql`
    CREATE FUNCTION protect_action_log_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Action log history is append-only'; END;
    $$;
    CREATE TRIGGER protect_action_log_history BEFORE UPDATE OR DELETE ON audit_entries
      FOR EACH ROW EXECUTE FUNCTION protect_action_log_history();
  `)
}
export async function down({db}:MigrateDownArgs):Promise<void>{
  await db.execute(sql`
    DROP TRIGGER protect_action_log_history ON audit_entries;
    DROP FUNCTION protect_action_log_history();
  `)
}
