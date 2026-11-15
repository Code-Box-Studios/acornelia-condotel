import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "checkout_drafts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "secret_hash" varchar NOT NULL,
    "browser_hash" varchar NOT NULL,
    "owner_customer_id" varchar,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "version" numeric NOT NULL,
    "encrypted_state" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "checkout_drafts_id" uuid;
  CREATE INDEX "checkout_drafts_expires_at_idx" ON "checkout_drafts" USING btree ("expires_at");
  CREATE INDEX "checkout_drafts_updated_at_idx" ON "checkout_drafts" USING btree ("updated_at");
  CREATE INDEX "checkout_drafts_created_at_idx" ON "checkout_drafts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_checkout_drafts_fk" FOREIGN KEY ("checkout_drafts_id") REFERENCES "public"."checkout_drafts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_checkout_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("checkout_drafts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "checkout_drafts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "checkout_drafts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_checkout_drafts_fk";

  DROP INDEX "payload_locked_documents_rels_checkout_drafts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "checkout_drafts_id";`)
}
