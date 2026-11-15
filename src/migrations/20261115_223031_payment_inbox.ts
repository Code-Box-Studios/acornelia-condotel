import {type MigrateUpArgs,type MigrateDownArgs,sql} from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payment_inbox_environment" AS ENUM('sandbox', 'production');
  CREATE TYPE "public"."enum_payment_inbox_source" AS ENUM('webhook', 'retrieval');
  CREATE TYPE "public"."enum_payment_inbox_state" AS ENUM('pending', 'processed', 'exception');
  ALTER TYPE "public"."enum_work_items_kind" ADD VALUE 'payment-observation' BEFORE 'reconcile-payment';
  CREATE TABLE "payment_inbox" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"semantic_key" varchar NOT NULL,
  	"delivery_key" varchar NOT NULL,
  	"provider_payment_id" varchar NOT NULL,
  	"merchant_reference" varchar,
  	"environment" "enum_payment_inbox_environment" NOT NULL,
  	"amount_minor" varchar NOT NULL,
  	"currency" varchar NOT NULL,
  	"provider_status" varchar NOT NULL,
  	"method" varchar,
  	"provider_paid_at" timestamp(3) with time zone,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"source" "enum_payment_inbox_source" DEFAULT 'webhook' NOT NULL,
  	"state" "enum_payment_inbox_state" DEFAULT 'pending' NOT NULL,
  	"processed_at" timestamp(3) with time zone,
  	"reason_code" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_inbox_id" uuid;
  CREATE UNIQUE INDEX "payment_inbox_semantic_key_idx" ON "payment_inbox" USING btree ("semantic_key");
  CREATE INDEX "payment_inbox_provider_payment_id_idx" ON "payment_inbox" USING btree ("provider_payment_id");
  CREATE INDEX "payment_inbox_merchant_reference_idx" ON "payment_inbox" USING btree ("merchant_reference");
  CREATE INDEX "payment_inbox_updated_at_idx" ON "payment_inbox" USING btree ("updated_at");
  CREATE INDEX "payment_inbox_created_at_idx" ON "payment_inbox" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_inbox_fk" FOREIGN KEY ("payment_inbox_id") REFERENCES "public"."payment_inbox"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_payment_inbox_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_inbox_id");
  ALTER TABLE payment_inbox ADD CONSTRAINT payment_inbox_facts_guard CHECK (semantic_key ~ '^[a-f0-9]{64}$' AND delivery_key ~ '^[a-f0-9]{64}$' AND amount_minor ~ '^(0|[1-9][0-9]*)$' AND currency ~ '^[A-Z]{3}$' AND provider_status ~ '^[A-Z_]{1,50}$');
  CREATE FUNCTION protect_payment_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment evidence cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['state','processed_at','reason_code','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','processed_at','reason_code','updated_at']) THEN RAISE EXCEPTION 'Payment evidence is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state='processed' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN RAISE EXCEPTION 'Processed evidence is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_payment_inbox BEFORE UPDATE OR DELETE ON payment_inbox FOR EACH ROW EXECUTE FUNCTION protect_payment_inbox();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN IF EXISTS(SELECT 1 FROM payment_inbox) OR EXISTS(SELECT 1 FROM work_items WHERE kind::text='payment-observation') THEN RAISE EXCEPTION 'Payment evidence prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_payment_inbox ON payment_inbox;
  DROP FUNCTION protect_payment_inbox();
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_inbox_fk";
  ALTER TABLE "payment_inbox" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payment_inbox";
  
  ALTER TABLE "work_items" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_work_items_kind";
  CREATE TYPE "public"."enum_work_items_kind" AS ENUM('create-checkout', 'reconcile-payment', 'reconcile-refund', 'expire-hold', 'email', 'refund', 'enquiry');
  ALTER TABLE "work_items" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_work_items_kind" USING "kind"::"public"."enum_work_items_kind";
  DROP INDEX "payload_locked_documents_rels_payment_inbox_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_inbox_id";
  DROP TYPE "public"."enum_payment_inbox_environment";
  DROP TYPE "public"."enum_payment_inbox_source";
  DROP TYPE "public"."enum_payment_inbox_state";`)
}
