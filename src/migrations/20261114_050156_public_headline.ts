import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "property" ADD COLUMN "headline" varchar;
  ALTER TABLE "property" ADD COLUMN "headline_accent" varchar;
  ALTER TABLE "_property_v" ADD COLUMN "version_headline" varchar;
  ALTER TABLE "_property_v" ADD COLUMN "version_headline_accent" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "property" DROP COLUMN "headline";
  ALTER TABLE "property" DROP COLUMN "headline_accent";
  ALTER TABLE "_property_v" DROP COLUMN "version_headline";
  ALTER TABLE "_property_v" DROP COLUMN "version_headline_accent";`)
}
