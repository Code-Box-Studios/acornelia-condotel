import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_quotes_scope" AS ENUM('website', 'staff-direct');
  ALTER TABLE "quotes" ADD COLUMN "scope" "enum_quotes_scope" DEFAULT 'website' NOT NULL;
  ALTER TABLE "quotes" ADD COLUMN "issuer_staff_id" uuid;
  ALTER TABLE "bookings" ADD COLUMN "direct_context" jsonb;
  ALTER TABLE "payment_transactions" ADD COLUMN "offline_evidence" jsonb;
  ALTER TABLE "payment_transactions" ADD COLUMN "offline_receipt_key" varchar;
  CREATE UNIQUE INDEX "payment_transactions_offline_receipt_key_idx" ON payment_transactions USING btree(offline_receipt_key);
  ALTER TABLE "payment_transactions" ADD COLUMN "recorded_by_staff_id" uuid;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_issuer_staff_id_staff_users_id_fk" FOREIGN KEY ("issuer_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_recorded_by_staff_id_staff_users_id_fk" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  CREATE INDEX "quotes_issuer_staff_idx" ON "quotes" USING btree ("issuer_staff_id");
  CREATE INDEX "payment_transactions_recorded_by_staff_idx" ON "payment_transactions" USING btree ("recorded_by_staff_id");
  ALTER TABLE quotes ADD CONSTRAINT staff_quote_scope_guard CHECK ((scope='website' AND issuer_staff_id IS NULL) OR (scope='staff-direct' AND issuer_staff_id IS NOT NULL AND issuer_customer_id IS NULL));
  CREATE FUNCTION protect_staff_quote_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF (NEW.scope,NEW.issuer_staff_id) IS DISTINCT FROM (OLD.scope,OLD.issuer_staff_id) THEN RAISE EXCEPTION 'Quote purpose and staff issuer are immutable' USING ERRCODE='23514'; END IF; RETURN NEW;
  END $$;
  CREATE TRIGGER protect_staff_quote_scope BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION protect_staff_quote_scope();
  CREATE FUNCTION protect_direct_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='UPDATE' AND OLD.direct_context IS NOT NULL AND (NEW.direct_context,NEW.source) IS DISTINCT FROM (OLD.direct_context,OLD.source) THEN RAISE EXCEPTION 'Direct booking agreement is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.direct_context IS NOT NULL AND (NEW.source NOT IN ('phone','walk-in') OR NEW.direct_context->>'purpose' IS DISTINCT FROM 'staff-direct' OR NOT EXISTS(SELECT 1 FROM quotes q WHERE q.id=NEW.checkout_quote_id AND q.scope='staff-direct' AND q.issuer_staff_id::text=NEW.direct_context->>'creatorStaffId' AND q.id::text=NEW.direct_context->>'quoteId')) THEN RAISE EXCEPTION 'Direct booking requires its staff quote and agreement' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_direct_context BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION protect_direct_context();
  CREATE FUNCTION protect_offline_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='UPDATE' AND OLD.offline_evidence IS NOT NULL AND (NEW.offline_evidence,NEW.offline_receipt_key,NEW.recorded_by_staff_id) IS DISTINCT FROM (OLD.offline_evidence,OLD.offline_receipt_key,OLD.recorded_by_staff_id) THEN RAISE EXCEPTION 'Offline collection evidence is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.environment<>'offline' AND (NEW.offline_evidence IS NOT NULL OR NEW.offline_receipt_key IS NOT NULL OR NEW.recorded_by_staff_id IS NOT NULL) THEN RAISE EXCEPTION 'Staff evidence cannot create provider verification' USING ERRCODE='23514'; END IF;
    IF NEW.environment='offline' THEN
      IF TG_OP='INSERT' AND NEW.offline_evidence IS NULL THEN RAISE EXCEPTION 'New offline collections require explicit evidence' USING ERRCODE='23514'; END IF;
      IF NEW.offline_evidence IS NOT NULL AND (jsonb_typeof(NEW.offline_evidence) IS DISTINCT FROM 'object' OR NEW.offline_evidence->>'trust' IS DISTINCT FROM 'staff-attested' OR NEW.offline_evidence->>'version' IS DISTINCT FROM '1' OR COALESCE(NEW.offline_evidence->>'method','') NOT IN ('cash','bank-transfer') OR COALESCE(length(NEW.offline_evidence->>'receiptReference'),0)=0 OR COALESCE(length(NEW.offline_evidence->>'evidenceReference'),0)=0 OR COALESCE(NEW.offline_evidence->>'bookingRevision','') !~ '^[1-9][0-9]*$' OR NEW.recorded_by_staff_id IS NULL OR NEW.offline_receipt_key IS NULL OR NEW.status<>'collected' OR NEW.amount_minor !~ '^[1-9][0-9]*$' OR NEW.collected_at IS NULL OR (NEW.offline_evidence->>'receivedAt')::timestamptz IS DISTINCT FROM NEW.collected_at) THEN RAISE EXCEPTION 'Offline collection evidence failed validation' USING ERRCODE='23514'; END IF;
      IF TG_OP='UPDATE' AND NEW.offline_evidence IS NULL AND NEW.applied_revision IS DISTINCT FROM OLD.applied_revision THEN RAISE EXCEPTION 'Legacy offline money requires reviewed evidence before application' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_offline_evidence BEFORE INSERT OR UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION protect_offline_evidence();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN IF EXISTS(SELECT 1 FROM quotes WHERE scope='staff-direct') OR EXISTS(SELECT 1 FROM bookings WHERE direct_context IS NOT NULL) OR EXISTS(SELECT 1 FROM payment_transactions WHERE offline_evidence IS NOT NULL) THEN RAISE EXCEPTION 'Direct booking history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_offline_evidence ON payment_transactions;
  DROP FUNCTION protect_offline_evidence();
  DROP TRIGGER protect_direct_context ON bookings;
  DROP FUNCTION protect_direct_context();
  DROP TRIGGER protect_staff_quote_scope ON quotes;
  DROP FUNCTION protect_staff_quote_scope();
  ALTER TABLE quotes DROP CONSTRAINT staff_quote_scope_guard;
  DROP INDEX payment_transactions_offline_receipt_key_idx;
  ALTER TABLE payment_transactions DROP COLUMN offline_receipt_key;
  ALTER TABLE "quotes" DROP CONSTRAINT "quotes_issuer_staff_id_staff_users_id_fk";

  ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_recorded_by_staff_id_staff_users_id_fk";

  DROP INDEX "quotes_issuer_staff_idx";
  DROP INDEX "payment_transactions_recorded_by_staff_idx";
  ALTER TABLE "quotes" DROP COLUMN "scope";
  ALTER TABLE "quotes" DROP COLUMN "issuer_staff_id";
  ALTER TABLE "bookings" DROP COLUMN "direct_context";
  ALTER TABLE "payment_transactions" DROP COLUMN "offline_evidence";
  ALTER TABLE "payment_transactions" DROP COLUMN "recorded_by_staff_id";
  DROP TYPE "public"."enum_quotes_scope";`)
}
