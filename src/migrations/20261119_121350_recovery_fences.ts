import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "recovery_fences" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "generation" varchar NOT NULL,
    "previous_generation" varchar,
    "operator" varchar NOT NULL,
    "authorized_at" timestamp(3) with time zone NOT NULL,
    "permit" jsonb NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "recovery_fences_id" uuid;
  CREATE UNIQUE INDEX "recovery_fences_generation_idx" ON "recovery_fences" USING btree ("generation");
  CREATE INDEX "recovery_fences_authorized_at_idx" ON "recovery_fences" USING btree ("authorized_at");
  CREATE INDEX "recovery_fences_updated_at_idx" ON "recovery_fences" USING btree ("updated_at");
  CREATE INDEX "recovery_fences_created_at_idx" ON "recovery_fences" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_recovery_fences_fk" FOREIGN KEY ("recovery_fences_id") REFERENCES "public"."recovery_fences"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_recovery_fences_id_idx" ON "payload_locked_documents_rels" USING btree ("recovery_fences_id");
  INSERT INTO "recovery_fences" ("generation","operator","authorized_at","permit") VALUES ('1','initial-install',now(),'{"version":1,"source":"initial-install"}');
  CREATE OR REPLACE FUNCTION protect_recovery_fence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'Recovery fence history is append-only' USING ERRCODE='23514';
  END $$;
  CREATE TRIGGER protect_recovery_fence BEFORE UPDATE OR DELETE ON recovery_fences FOR EACH ROW EXECUTE FUNCTION protect_recovery_fence();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN IF (SELECT count(*) FROM recovery_fences)>1 THEN RAISE EXCEPTION 'Recovery history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER IF EXISTS protect_recovery_fence ON recovery_fences;
  DROP FUNCTION IF EXISTS protect_recovery_fence();
   ALTER TABLE "recovery_fences" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "recovery_fences" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_recovery_fences_fk";

  DROP INDEX "payload_locked_documents_rels_recovery_fences_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "recovery_fences_id";`)
}
