import {type MigrateUpArgs,type MigrateDownArgs,sql} from '@payloadcms/db-postgres'
export async function up({db}:MigrateUpArgs):Promise<void>{await db.execute(sql`ALTER TABLE quotes ADD CONSTRAINT direct_command_required CHECK (scope<>'staff-direct' OR (direct_command_key IS NOT NULL AND direct_command_key ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'));`)}
export async function down({db}:MigrateDownArgs):Promise<void>{await db.execute(sql`ALTER TABLE quotes DROP CONSTRAINT direct_command_required;`)}
