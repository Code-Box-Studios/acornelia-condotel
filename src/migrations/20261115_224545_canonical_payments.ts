import {type MigrateUpArgs,type MigrateDownArgs,sql} from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payment_issues_state" AS ENUM('open', 'resolved');
  CREATE TABLE "payment_issues" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "issue_key" varchar NOT NULL,
    "reason_code" varchar NOT NULL,
    "booking_id" uuid,
    "attempt_id" uuid,
    "payment_id" uuid,
    "inbox_id" uuid,
    "observed_amount_minor" varchar,
    "observed_currency" varchar,
    "state" "enum_payment_issues_state" DEFAULT 'open' NOT NULL,
    "resolved_at" timestamp(3) with time zone,
    "resolution_code" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DROP INDEX "payment_transactions_provider_payment_id_idx";
  ALTER TABLE "payment_transactions" ALTER COLUMN "merchant_reference" DROP NOT NULL;
  ALTER TABLE "payment_transactions" ADD COLUMN "applied_revision" numeric;
  ALTER TABLE "payment_transactions" ADD COLUMN "collected_at" timestamp(3) with time zone;
  ALTER TABLE "payment_transactions" ADD COLUMN "last_observed_at" timestamp(3) with time zone;
  ALTER TABLE "payment_transactions" ADD COLUMN "provider_status" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payment_issues_id" uuid;
  ALTER TABLE "payment_issues" ADD CONSTRAINT "payment_issues_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payment_issues" ADD CONSTRAINT "payment_issues_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payment_issues" ADD CONSTRAINT "payment_issues_payment_id_payment_transactions_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payment_issues" ADD CONSTRAINT "payment_issues_inbox_id_payment_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."payment_inbox"("id") ON DELETE restrict ON UPDATE no action;
  CREATE UNIQUE INDEX "payment_issues_issue_key_idx" ON "payment_issues" USING btree ("issue_key");
  CREATE INDEX "payment_issues_booking_idx" ON "payment_issues" USING btree ("booking_id");
  CREATE INDEX "payment_issues_attempt_idx" ON "payment_issues" USING btree ("attempt_id");
  CREATE INDEX "payment_issues_payment_idx" ON "payment_issues" USING btree ("payment_id");
  CREATE INDEX "payment_issues_inbox_idx" ON "payment_issues" USING btree ("inbox_id");
  CREATE INDEX "payment_issues_updated_at_idx" ON "payment_issues" USING btree ("updated_at");
  CREATE INDEX "payment_issues_created_at_idx" ON "payment_issues" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_issues_fk" FOREIGN KEY ("payment_issues_id") REFERENCES "public"."payment_issues"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "environment_providerPaymentId_idx" ON "payment_transactions" USING btree ("environment","provider_payment_id");
  CREATE UNIQUE INDEX "booking_appliedRevision_idx" ON "payment_transactions" USING btree ("booking_id","applied_revision");
  CREATE INDEX "payload_locked_documents_rels_payment_issues_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_issues_id");
  CREATE INDEX "payment_transactions_provider_payment_id_idx" ON "payment_transactions" USING btree ("provider_payment_id");
  ALTER TABLE payment_transactions ADD CONSTRAINT canonical_payment_money CHECK (amount_minor ~ '^(0|[1-9][0-9]*)$' AND currency ~ '^[A-Z]{3}$');
  ALTER TABLE payment_transactions ADD CONSTRAINT payment_application_guard CHECK (applied_revision IS NULL OR (applied_revision>=1 AND applied_revision=trunc(applied_revision) AND status='collected' AND booking_id IS NOT NULL AND (environment='offline' OR attempt_id IS NOT NULL)));
  CREATE FUNCTION protect_actual_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Actual payment history cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (NEW.provider_payment_id,NEW.environment,NEW.created_at) IS DISTINCT FROM (OLD.provider_payment_id,OLD.environment,OLD.created_at) THEN RAISE EXCEPTION 'Actual payment identity is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.status='collected' AND ((NEW.amount_minor,NEW.currency,NEW.status) IS DISTINCT FROM (OLD.amount_minor,OLD.currency,OLD.status) OR (OLD.merchant_reference IS NOT NULL AND NEW.merchant_reference IS DISTINCT FROM OLD.merchant_reference) OR (OLD.collected_at IS NOT NULL AND NEW.collected_at IS DISTINCT FROM OLD.collected_at)) THEN RAISE EXCEPTION 'Verified collection cannot be rewritten' USING ERRCODE='23514'; END IF;
    IF OLD.status='collected' AND ((OLD.booking_id IS NOT NULL AND NEW.booking_id IS DISTINCT FROM OLD.booking_id) OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id)) THEN RAISE EXCEPTION 'Collected payment association is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.applied_revision IS NOT NULL AND NEW.applied_revision IS DISTINCT FROM OLD.applied_revision THEN RAISE EXCEPTION 'Payment fulfillment is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_actual_payment BEFORE UPDATE OR DELETE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION protect_actual_payment();
  CREATE FUNCTION protect_payment_issue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment issues cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['state','resolved_at','resolution_code','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','resolved_at','resolution_code','updated_at']) OR (OLD.state='resolved' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at')) THEN RAISE EXCEPTION 'Payment issue evidence is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.state='resolved' AND (NEW.resolved_at IS NULL OR NEW.resolution_code IS NULL) THEN RAISE EXCEPTION 'Issue resolution requires an audited decision' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_payment_issue BEFORE UPDATE OR DELETE ON payment_issues FOR EACH ROW EXECUTE FUNCTION protect_payment_issue();
  CREATE FUNCTION protect_paid_attempt_and_code() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME='bookings' THEN
      IF OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'Booking code is immutable' USING ERRCODE='23514'; END IF;
    ELSE
      IF OLD.state='succeeded' AND NEW.state<>'succeeded' THEN RAISE EXCEPTION 'Collected attempt cannot become unpaid' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_paid_attempt BEFORE UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION protect_paid_attempt_and_code();
  CREATE TRIGGER protect_booking_code BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION protect_paid_attempt_and_code();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN IF EXISTS(SELECT 1 FROM payment_issues) OR EXISTS(SELECT 1 FROM payment_transactions WHERE applied_revision IS NOT NULL OR last_observed_at IS NOT NULL OR merchant_reference IS NULL) THEN RAISE EXCEPTION 'Canonical payment history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_actual_payment ON payment_transactions;
  DROP FUNCTION protect_actual_payment();
  DROP TRIGGER protect_payment_issue ON payment_issues;
  DROP FUNCTION protect_payment_issue();
  DROP TRIGGER protect_paid_attempt ON payment_attempts;
  DROP TRIGGER protect_booking_code ON bookings;
  DROP FUNCTION protect_paid_attempt_and_code();
  ALTER TABLE payment_transactions DROP CONSTRAINT canonical_payment_money;
  ALTER TABLE payment_transactions DROP CONSTRAINT payment_application_guard;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payment_issues_fk";
  ALTER TABLE "payment_issues" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payment_issues";

  DROP INDEX "environment_providerPaymentId_idx";
  DROP INDEX "booking_appliedRevision_idx";
  DROP INDEX "payload_locked_documents_rels_payment_issues_id_idx";
  DROP INDEX "payment_transactions_provider_payment_id_idx";
  ALTER TABLE "payment_transactions" ALTER COLUMN "merchant_reference" SET NOT NULL;
  CREATE UNIQUE INDEX "payment_transactions_provider_payment_id_idx" ON "payment_transactions" USING btree ("provider_payment_id");
  ALTER TABLE "payment_transactions" DROP COLUMN "applied_revision";
  ALTER TABLE "payment_transactions" DROP COLUMN "collected_at";
  ALTER TABLE "payment_transactions" DROP COLUMN "last_observed_at";
  ALTER TABLE "payment_transactions" DROP COLUMN "provider_status";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payment_issues_id";
  DROP TYPE "public"."enum_payment_issues_state";`)
}
