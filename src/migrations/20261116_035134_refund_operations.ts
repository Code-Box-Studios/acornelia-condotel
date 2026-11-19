import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_refund_operations_origin" AS ENUM('app', 'provider', 'offline');
  CREATE TYPE "public"."enum_refund_operations_method" AS ENUM('refund', 'void', 'offline');
  CREATE TYPE "public"."enum_refund_operations_state" AS ENUM('authorized', 'dispatching', 'uncertain', 'completed', 'failed', 'cancelled');
  CREATE TYPE "public"."enum_refund_operations_reason" AS ENUM('guest-cancellation', 'stay-change', 'duplicate-payment', 'late-payment', 'manual-review');
  CREATE TYPE "public"."enum_refund_operations_provider_environment" AS ENUM('sandbox', 'production');
  CREATE TABLE "refund_operations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "command_key" varchar NOT NULL,
    "fingerprint" varchar NOT NULL,
    "origin" "enum_refund_operations_origin" NOT NULL,
    "booking_id" uuid NOT NULL,
    "payment_id" uuid NOT NULL,
    "authorized_staff_id" uuid,
    "change_id" uuid,
    "expected_revision" numeric NOT NULL,
    "method" "enum_refund_operations_method" NOT NULL,
    "state" "enum_refund_operations_state" NOT NULL,
    "amount_minor" varchar NOT NULL,
    "currency" varchar NOT NULL,
    "reason" "enum_refund_operations_reason" NOT NULL,
    "evidence_reference" varchar,
    "policy_snapshot" jsonb,
    "provider_environment" "enum_refund_operations_provider_environment",
    "provider_operation_id" varchar,
    "provider_status" varchar,
    "actual_amount_minor" varchar,
    "actual_currency" varchar,
    "result_proof" jsonb,
    "dispatch_generation" numeric DEFAULT 0 NOT NULL,
    "dispatched_at" timestamp(3) with time zone,
    "observed_at" timestamp(3) with time zone,
    "completed_at" timestamp(3) with time zone,
    "reason_code" varchar,
    "reconcile_sequence" numeric DEFAULT 0 NOT NULL,
    "next_reconcile_at" timestamp(3) with time zone,
    "offline_evidence" jsonb,
    "offline_receipt_key" varchar,
    "reviewer_staff_id" uuid,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );






  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "refund_operations_id" uuid;
  ALTER TABLE "refund_operations" ADD CONSTRAINT "refund_operations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "refund_operations" ADD CONSTRAINT "refund_operations_payment_id_payment_transactions_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "refund_operations" ADD CONSTRAINT "refund_operations_authorized_staff_id_staff_users_id_fk" FOREIGN KEY ("authorized_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "refund_operations" ADD CONSTRAINT "refund_operations_change_id_booking_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."booking_changes"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "refund_operations" ADD CONSTRAINT "refund_operations_reviewer_staff_id_staff_users_id_fk" FOREIGN KEY ("reviewer_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  CREATE UNIQUE INDEX "refund_operations_command_key_idx" ON "refund_operations" USING btree ("command_key");
  CREATE INDEX "refund_operations_booking_idx" ON "refund_operations" USING btree ("booking_id");
  CREATE INDEX "refund_operations_payment_idx" ON "refund_operations" USING btree ("payment_id");
  CREATE INDEX "refund_operations_authorized_staff_idx" ON "refund_operations" USING btree ("authorized_staff_id");
  CREATE INDEX "refund_operations_change_idx" ON "refund_operations" USING btree ("change_id");
  CREATE INDEX "refund_operations_provider_operation_id_idx" ON "refund_operations" USING btree ("provider_operation_id");
  CREATE UNIQUE INDEX "refund_operations_offline_receipt_key_idx" ON "refund_operations" USING btree ("offline_receipt_key");
  CREATE INDEX "refund_operations_reviewer_staff_idx" ON "refund_operations" USING btree ("reviewer_staff_id");
  CREATE INDEX "refund_operations_updated_at_idx" ON "refund_operations" USING btree ("updated_at");
  CREATE INDEX "refund_operations_created_at_idx" ON "refund_operations" USING btree ("created_at");
  CREATE UNIQUE INDEX "providerEnvironment_providerOperationId_idx" ON "refund_operations" USING btree ("provider_environment","provider_operation_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_refund_operations_fk" FOREIGN KEY ("refund_operations_id") REFERENCES "public"."refund_operations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_refund_operations_id_idx" ON "payload_locked_documents_rels" USING btree ("refund_operations_id");
  ALTER TABLE refund_operations ADD CONSTRAINT refund_exact_money CHECK (amount_minor ~ '^[1-9][0-9]*$' AND length(amount_minor)<=60 AND currency='PHP' AND (actual_amount_minor IS NULL OR actual_amount_minor ~ '^[1-9][0-9]*$' AND actual_currency=currency));
  ALTER TABLE refund_operations ADD CONSTRAINT refund_integer_counters CHECK (expected_revision>=1 AND expected_revision=trunc(expected_revision) AND dispatch_generation>=0 AND dispatch_generation=trunc(dispatch_generation) AND dispatch_generation<=9007199254740991 AND reconcile_sequence>=0 AND reconcile_sequence=trunc(reconcile_sequence) AND reconcile_sequence<=9007199254740991);
  ALTER TABLE refund_operations ADD CONSTRAINT refund_completion_proof CHECK (state<>'completed' OR (completed_at IS NOT NULL AND result_proof IS NOT NULL AND actual_amount_minor IS NOT NULL AND (method='offline' AND offline_evidence IS NOT NULL AND offline_receipt_key IS NOT NULL AND reviewer_staff_id IS NOT NULL OR method IN ('refund','void') AND provider_environment IS NOT NULL AND provider_operation_id IS NOT NULL)));
  CREATE FUNCTION protect_refund_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Refund history cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (NEW.command_key,NEW.fingerprint,NEW.origin,NEW.booking_id,NEW.payment_id,NEW.authorized_staff_id,NEW.change_id,NEW.expected_revision,NEW.method,NEW.amount_minor,NEW.currency,NEW.reason,NEW.evidence_reference,NEW.policy_snapshot,NEW.created_at) IS DISTINCT FROM (OLD.command_key,OLD.fingerprint,OLD.origin,OLD.booking_id,OLD.payment_id,OLD.authorized_staff_id,OLD.change_id,OLD.expected_revision,OLD.method,OLD.amount_minor,OLD.currency,OLD.reason,OLD.evidence_reference,OLD.policy_snapshot,OLD.created_at) THEN RAISE EXCEPTION 'Refund intent is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.provider_operation_id IS NOT NULL AND (NEW.provider_operation_id,NEW.provider_environment) IS DISTINCT FROM (OLD.provider_operation_id,OLD.provider_environment) THEN RAISE EXCEPTION 'Refund provider identity is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.dispatch_generation<OLD.dispatch_generation OR NEW.reconcile_sequence<OLD.reconcile_sequence OR OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at THEN RAISE EXCEPTION 'Refund dispatch history is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state='completed' AND (NEW.state,NEW.actual_amount_minor,NEW.actual_currency,NEW.result_proof,NEW.completed_at,NEW.offline_evidence,NEW.offline_receipt_key,NEW.reviewer_staff_id) IS DISTINCT FROM (OLD.state,OLD.actual_amount_minor,OLD.actual_currency,OLD.result_proof,OLD.completed_at,OLD.offline_evidence,OLD.offline_receipt_key,OLD.reviewer_staff_id) THEN RAISE EXCEPTION 'Actual repayment evidence is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_refund_operation BEFORE UPDATE OR DELETE ON refund_operations FOR EACH ROW EXECUTE FUNCTION protect_refund_operation();
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN IF EXISTS(SELECT 1 FROM refund_operations) THEN RAISE EXCEPTION 'Refund history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_refund_operation ON refund_operations;
  DROP FUNCTION protect_refund_operation();
   ALTER TABLE "refund_operations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "refund_operations" CASCADE;





  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_refund_operations_fk";

  DROP INDEX "payload_locked_documents_rels_refund_operations_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "refund_operations_id";
  DROP TYPE "public"."enum_refund_operations_origin";
  DROP TYPE "public"."enum_refund_operations_method";
  DROP TYPE "public"."enum_refund_operations_state";
  DROP TYPE "public"."enum_refund_operations_reason";
  DROP TYPE "public"."enum_refund_operations_provider_environment";`)
}
