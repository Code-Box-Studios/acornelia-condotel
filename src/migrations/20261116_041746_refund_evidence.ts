import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_refund_evidence_environment" AS ENUM('sandbox', 'production', 'offline');
  CREATE TYPE "public"."enum_refund_evidence_kind" AS ENUM('refund', 'void', 'offline');
  CREATE TYPE "public"."enum_refund_evidence_source" AS ENUM('merchant-get', 'merchant-post', 'staff-attested', 'staff-reviewed');
  CREATE TYPE "public"."enum_refund_evidence_state" AS ENUM('pending', 'processed', 'exception');
  ALTER TYPE "public"."enum_refund_operations_state" ADD VALUE 'satisfied';
  CREATE TABLE "refund_evidence" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "semantic_key" varchar NOT NULL,
    "payment_id" uuid NOT NULL,
    "operation_id" uuid,
    "environment" "enum_refund_evidence_environment" NOT NULL,
    "kind" "enum_refund_evidence_kind" NOT NULL,
    "provider_operation_id" varchar,
    "provider_payment_id" varchar NOT NULL,
    "amount_minor" varchar NOT NULL,
    "currency" varchar NOT NULL,
    "provider_status" varchar NOT NULL,
    "source" "enum_refund_evidence_source" NOT NULL,
    "observed_at" timestamp(3) with time zone NOT NULL,
    "proof" jsonb NOT NULL,
    "work_generation" numeric,
    "source_staff_id" uuid,
    "reviewer_staff_id" uuid,
    "state" "enum_refund_evidence_state" DEFAULT 'pending' NOT NULL,
    "processed_at" timestamp(3) with time zone,
    "reason_code" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );











  ALTER TABLE "refund_operations" ADD COLUMN "last_evidence_id" uuid;
  ALTER TABLE "refund_operations" ADD COLUMN "settled_by_refund_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "refund_evidence_id" uuid;
  ALTER TABLE "refund_evidence" ADD CONSTRAINT "refund_evidence_payment_id_payment_transactions_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "refund_evidence" ADD CONSTRAINT "refund_evidence_operation_id_refund_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."refund_operations"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "refund_evidence" ADD CONSTRAINT "refund_evidence_source_staff_id_staff_users_id_fk" FOREIGN KEY ("source_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "refund_evidence" ADD CONSTRAINT "refund_evidence_reviewer_staff_id_staff_users_id_fk" FOREIGN KEY ("reviewer_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  CREATE UNIQUE INDEX "refund_evidence_semantic_key_idx" ON "refund_evidence" USING btree ("semantic_key");
  CREATE INDEX "refund_evidence_payment_idx" ON "refund_evidence" USING btree ("payment_id");
  CREATE INDEX "refund_evidence_operation_idx" ON "refund_evidence" USING btree ("operation_id");
  CREATE INDEX "refund_evidence_provider_operation_id_idx" ON "refund_evidence" USING btree ("provider_operation_id");
  CREATE INDEX "refund_evidence_source_staff_idx" ON "refund_evidence" USING btree ("source_staff_id");
  CREATE INDEX "refund_evidence_reviewer_staff_idx" ON "refund_evidence" USING btree ("reviewer_staff_id");
  CREATE INDEX "refund_evidence_updated_at_idx" ON "refund_evidence" USING btree ("updated_at");
  CREATE INDEX "refund_evidence_created_at_idx" ON "refund_evidence" USING btree ("created_at");
  ALTER TABLE "refund_operations" ADD CONSTRAINT "refund_operations_last_evidence_id_refund_evidence_id_fk" FOREIGN KEY ("last_evidence_id") REFERENCES "public"."refund_evidence"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "refund_operations" ADD CONSTRAINT "refund_operations_settled_by_refund_id_refund_operations_id_fk" FOREIGN KEY ("settled_by_refund_id") REFERENCES "public"."refund_operations"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_refund_evidence_fk" FOREIGN KEY ("refund_evidence_id") REFERENCES "public"."refund_evidence"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "refund_operations_last_evidence_idx" ON "refund_operations" USING btree ("last_evidence_id");
  CREATE UNIQUE INDEX "refund_operations_settled_by_refund_idx" ON "refund_operations" USING btree ("settled_by_refund_id");
  CREATE INDEX "payload_locked_documents_rels_refund_evidence_id_idx" ON "payload_locked_documents_rels" USING btree ("refund_evidence_id");
  ALTER TABLE refund_evidence ADD CONSTRAINT refund_evidence_money CHECK (amount_minor ~ '^[1-9][0-9]*$' AND length(amount_minor)<=60 AND currency ~ '^[A-Z]{3}$');
  ALTER TABLE refund_evidence ADD CONSTRAINT refund_evidence_generation CHECK (work_generation IS NULL OR work_generation>=1 AND work_generation=trunc(work_generation));
  CREATE FUNCTION protect_refund_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Refund evidence cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (NEW.semantic_key,NEW.payment_id,NEW.operation_id,NEW.environment,NEW.kind,NEW.provider_operation_id,NEW.provider_payment_id,NEW.amount_minor,NEW.currency,NEW.provider_status,NEW.source,NEW.observed_at,NEW.proof,NEW.work_generation,NEW.source_staff_id,NEW.reviewer_staff_id,NEW.created_at) IS DISTINCT FROM (OLD.semantic_key,OLD.payment_id,OLD.operation_id,OLD.environment,OLD.kind,OLD.provider_operation_id,OLD.provider_payment_id,OLD.amount_minor,OLD.currency,OLD.provider_status,OLD.source,OLD.observed_at,OLD.proof,OLD.work_generation,OLD.source_staff_id,OLD.reviewer_staff_id,OLD.created_at) THEN RAISE EXCEPTION 'Refund evidence facts are immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state<>'pending' AND (NEW.state,NEW.processed_at,NEW.reason_code) IS DISTINCT FROM (OLD.state,OLD.processed_at,OLD.reason_code) THEN RAISE EXCEPTION 'Processed refund evidence is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_refund_evidence BEFORE UPDATE OR DELETE ON refund_evidence FOR EACH ROW EXECUTE FUNCTION protect_refund_evidence();
  ALTER TABLE refund_operations DROP CONSTRAINT refund_completion_proof;
  ALTER TABLE refund_operations ADD CONSTRAINT refund_completion_proof CHECK (state::text<>'completed' OR (completed_at IS NOT NULL AND result_proof IS NOT NULL AND actual_amount_minor IS NOT NULL AND (method='offline' AND offline_evidence IS NOT NULL AND offline_receipt_key IS NOT NULL AND reviewer_staff_id IS NOT NULL OR method='refund' AND provider_environment IS NOT NULL AND provider_operation_id IS NOT NULL OR method='void' AND provider_environment IS NOT NULL AND (provider_operation_id IS NOT NULL OR result_proof->>'source'='merchant-payment-root'))));
  ALTER TABLE refund_operations ADD CONSTRAINT refund_settlement_guard CHECK ((state::text='satisfied')=(settled_by_refund_id IS NOT NULL));
  CREATE FUNCTION protect_refund_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.settled_by_refund_id IS NOT NULL AND (NEW.settled_by_refund_id,NEW.state,NEW.result_proof) IS DISTINCT FROM (OLD.settled_by_refund_id,OLD.state,OLD.result_proof) THEN RAISE EXCEPTION 'Refund settlement association is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.settled_by_refund_id IS NOT NULL AND (NEW.origin<>'app' OR NEW.actual_amount_minor IS NOT NULL OR NOT EXISTS(SELECT 1 FROM refund_operations r WHERE r.id=NEW.settled_by_refund_id AND r.origin='provider' AND r.state::text='completed' AND r.payment_id=NEW.payment_id AND r.actual_amount_minor=NEW.amount_minor AND r.currency=NEW.currency)) THEN RAISE EXCEPTION 'Only exact external evidence can satisfy an unresolved reservation' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_refund_settlement BEFORE UPDATE ON refund_operations FOR EACH ROW EXECUTE FUNCTION protect_refund_settlement();
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN IF EXISTS(SELECT 1 FROM refund_evidence) OR EXISTS(SELECT 1 FROM refund_operations WHERE last_evidence_id IS NOT NULL OR settled_by_refund_id IS NOT NULL) THEN RAISE EXCEPTION 'Refund evidence history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_refund_evidence ON refund_evidence; DROP FUNCTION protect_refund_evidence();
  DROP TRIGGER protect_refund_settlement ON refund_operations; DROP FUNCTION protect_refund_settlement();
  ALTER TABLE refund_operations DROP CONSTRAINT refund_settlement_guard;

   ALTER TABLE "refund_evidence" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "refund_evidence" CASCADE;
  ALTER TABLE "refund_operations" DROP CONSTRAINT IF EXISTS "refund_operations_last_evidence_id_refund_evidence_id_fk";

  ALTER TABLE "refund_operations" DROP CONSTRAINT "refund_operations_settled_by_refund_id_refund_operations_id_fk";











  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_refund_evidence_fk";

  ALTER TABLE "refund_operations" ALTER COLUMN "state" SET DATA TYPE text;
  DROP TYPE "public"."enum_refund_operations_state";
  CREATE TYPE "public"."enum_refund_operations_state" AS ENUM('authorized', 'dispatching', 'uncertain', 'completed', 'failed', 'cancelled');
  ALTER TABLE "refund_operations" ALTER COLUMN "state" SET DATA TYPE "public"."enum_refund_operations_state" USING "state"::"public"."enum_refund_operations_state";
  DROP INDEX "refund_operations_last_evidence_idx";
  DROP INDEX "refund_operations_settled_by_refund_idx";
  DROP INDEX "payload_locked_documents_rels_refund_evidence_id_idx";
  ALTER TABLE "refund_operations" DROP COLUMN "last_evidence_id";
  ALTER TABLE "refund_operations" DROP COLUMN "settled_by_refund_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "refund_evidence_id";
  DROP TYPE "public"."enum_refund_evidence_environment";
  DROP TYPE "public"."enum_refund_evidence_kind";
  DROP TYPE "public"."enum_refund_evidence_source";
  DROP TYPE "public"."enum_refund_evidence_state";`)
}
