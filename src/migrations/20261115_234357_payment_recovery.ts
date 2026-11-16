import {type MigrateUpArgs,type MigrateDownArgs,sql} from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payment_attempts_create_outcome" AS ENUM('created', 'refused', 'unknown');
  ALTER TABLE "payment_attempts" ADD COLUMN "create_outcome" "enum_payment_attempts_create_outcome";
  ALTER TABLE "payment_attempts" ADD COLUMN "create_refusal_code" varchar;
  ALTER TABLE "payment_attempts" ADD COLUMN "create_observed_at" timestamp(3) with time zone;
  ALTER TABLE "payment_attempts" ADD COLUMN "closed_at" timestamp(3) with time zone;
  ALTER TABLE "payment_attempts" ADD COLUMN "close_evidence" jsonb;
  ALTER TABLE "payment_attempts" ADD COLUMN "last_reconciled_at" timestamp(3) with time zone;
  ALTER TABLE "payment_attempts" ADD COLUMN "next_reconcile_at" timestamp(3) with time zone;
  ALTER TABLE "payment_attempts" ADD COLUMN "escalated_at" timestamp(3) with time zone;
  ALTER TABLE "payment_attempts" ADD COLUMN "reconcile_sequence" numeric DEFAULT 0 NOT NULL;
  ALTER TABLE "payment_attempts" ADD COLUMN "resume_count" numeric DEFAULT 0 NOT NULL;
  ALTER TABLE "payment_attempts" ADD COLUMN "resume_requested_at" timestamp(3) with time zone;
  ALTER TABLE payment_attempts ADD CONSTRAINT recovery_counter_guard CHECK (reconcile_sequence>=0 AND reconcile_sequence=trunc(reconcile_sequence) AND reconcile_sequence<=9007199254740991 AND resume_count>=0 AND resume_count=trunc(resume_count) AND resume_count<=9007199254740991);
  ALTER TABLE payment_attempts ADD CONSTRAINT close_evidence_guard CHECK ((closed_at IS NULL AND close_evidence IS NULL) OR (closed_at IS NOT NULL AND close_evidence IS NOT NULL AND close_evidence->>'kind' IN ('provider-terminal','never-dispatched','definite-refusal')));
  ALTER TABLE payment_attempts ADD CONSTRAINT create_refusal_guard CHECK (create_outcome IS DISTINCT FROM 'refused' OR (create_refusal_code IS NOT NULL AND create_observed_at IS NOT NULL));
  CREATE FUNCTION protect_payment_recovery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.reconcile_sequence<OLD.reconcile_sequence OR NEW.resume_count<OLD.resume_count THEN RAISE EXCEPTION 'Recovery counters are monotonic' USING ERRCODE='23514'; END IF;
    IF OLD.create_outcome IN ('created','refused') AND (NEW.create_outcome,NEW.create_refusal_code,NEW.create_observed_at) IS DISTINCT FROM (OLD.create_outcome,OLD.create_refusal_code,OLD.create_observed_at) THEN RAISE EXCEPTION 'Known creation outcome is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.closed_at IS NOT NULL AND (NEW.closed_at,NEW.close_evidence) IS DISTINCT FROM (OLD.closed_at,OLD.close_evidence) THEN RAISE EXCEPTION 'Closure evidence is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.escalated_at IS NOT NULL AND NEW.escalated_at IS DISTINCT FROM OLD.escalated_at THEN RAISE EXCEPTION 'Escalation history is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_payment_recovery BEFORE UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION protect_payment_recovery();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN IF EXISTS(SELECT 1 FROM payment_attempts WHERE create_outcome IS NOT NULL OR closed_at IS NOT NULL OR reconcile_sequence>0 OR resume_count>0 OR last_reconciled_at IS NOT NULL OR escalated_at IS NOT NULL) THEN RAISE EXCEPTION 'Payment recovery history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_payment_recovery ON payment_attempts;
  DROP FUNCTION protect_payment_recovery();
  ALTER TABLE payment_attempts DROP CONSTRAINT recovery_counter_guard;
  ALTER TABLE payment_attempts DROP CONSTRAINT close_evidence_guard;
  ALTER TABLE payment_attempts DROP CONSTRAINT create_refusal_guard;
  ALTER TABLE "payment_attempts" DROP COLUMN "create_outcome";
  ALTER TABLE "payment_attempts" DROP COLUMN "create_refusal_code";
  ALTER TABLE "payment_attempts" DROP COLUMN "create_observed_at";
  ALTER TABLE "payment_attempts" DROP COLUMN "closed_at";
  ALTER TABLE "payment_attempts" DROP COLUMN "close_evidence";
  ALTER TABLE "payment_attempts" DROP COLUMN "last_reconciled_at";
  ALTER TABLE "payment_attempts" DROP COLUMN "next_reconcile_at";
  ALTER TABLE "payment_attempts" DROP COLUMN "escalated_at";
  ALTER TABLE "payment_attempts" DROP COLUMN "reconcile_sequence";
  ALTER TABLE "payment_attempts" DROP COLUMN "resume_count";
  ALTER TABLE "payment_attempts" DROP COLUMN "resume_requested_at";
  DROP TYPE "public"."enum_payment_attempts_create_outcome";`)
}
