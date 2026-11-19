import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "staff_users" ADD COLUMN "recovery_hold_at" timestamp(3) with time zone;
  ALTER TABLE "customers" ADD COLUMN "recovery_hold_at" timestamp(3) with time zone;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "staff_users" DROP COLUMN "recovery_hold_at";
  ALTER TABLE "customers" DROP COLUMN "recovery_hold_at";`)
}
