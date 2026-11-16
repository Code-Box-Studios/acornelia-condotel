import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_booking_changes_kind" AS ENUM('stay', 'cancellation');
  CREATE TYPE "public"."enum_booking_changes_state" AS ENUM('awaiting-payment', 'completed', 'failed', 'abandoned');
  ALTER TYPE "public"."enum_quotes_scope" ADD VALUE 'staff-change';
  CREATE TABLE "booking_changes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"command_key" varchar NOT NULL,
  	"fingerprint" varchar NOT NULL,
  	"booking_id" uuid NOT NULL,
  	"staff_id" uuid NOT NULL,
  	"kind" "enum_booking_changes_kind" NOT NULL,
  	"state" "enum_booking_changes_state" NOT NULL,
  	"base_revision" numeric NOT NULL,
  	"target_revision" numeric NOT NULL,
  	"quote_id" uuid,
  	"payment_attempt_id" uuid,
  	"original_quote" jsonb NOT NULL,
  	"accepted_quote" jsonb NOT NULL,
  	"original_allocation" jsonb NOT NULL,
  	"delta_minor" varchar NOT NULL,
  	"currency" varchar NOT NULL,
  	"agreement_reference" varchar NOT NULL,
  	"reason" varchar NOT NULL,
  	"completed_at" timestamp(3) with time zone,
  	"abandoned_at" timestamp(3) with time zone,
  	"reason_code" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "quotes" ADD COLUMN "change_context" jsonb;
  ALTER TABLE "bookings" ADD COLUMN "current_quote_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "booking_changes_id" uuid;
  ALTER TABLE "booking_changes" ADD CONSTRAINT "booking_changes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "booking_changes" ADD CONSTRAINT "booking_changes_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "booking_changes" ADD CONSTRAINT "booking_changes_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "booking_changes" ADD CONSTRAINT "booking_changes_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;
  CREATE UNIQUE INDEX "booking_changes_command_key_idx" ON "booking_changes" USING btree ("command_key");
  CREATE INDEX "booking_changes_booking_idx" ON "booking_changes" USING btree ("booking_id");
  CREATE INDEX "booking_changes_staff_idx" ON "booking_changes" USING btree ("staff_id");
  CREATE INDEX "booking_changes_quote_idx" ON "booking_changes" USING btree ("quote_id");
  CREATE INDEX "booking_changes_payment_attempt_idx" ON "booking_changes" USING btree ("payment_attempt_id");
  CREATE INDEX "booking_changes_updated_at_idx" ON "booking_changes" USING btree ("updated_at");
  CREATE INDEX "booking_changes_created_at_idx" ON "booking_changes" USING btree ("created_at");
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_current_quote_id_quotes_id_fk" FOREIGN KEY ("current_quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_changes_fk" FOREIGN KEY ("booking_changes_id") REFERENCES "public"."booking_changes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "bookings_current_quote_idx" ON "bookings" USING btree ("current_quote_id");
  CREATE INDEX "payload_locked_documents_rels_booking_changes_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_changes_id");
  ALTER TABLE quotes DROP CONSTRAINT staff_quote_scope_guard;
  ALTER TABLE quotes ADD CONSTRAINT staff_quote_scope_guard CHECK ((scope::text='website' AND issuer_staff_id IS NULL AND change_context IS NULL) OR (scope::text IN ('staff-direct','staff-change') AND issuer_staff_id IS NOT NULL AND issuer_customer_id IS NULL AND (scope::text='staff-direct' AND change_context IS NULL OR scope::text='staff-change' AND change_context IS NOT NULL AND jsonb_typeof(change_context)='object' AND COALESCE(change_context->>'bookingId','') ~ '^[a-f0-9-]{36}$' AND COALESCE(change_context->>'revision','') ~ '^[1-9][0-9]*$')));
  ALTER TABLE quotes DROP CONSTRAINT direct_quote_command_guard;
  ALTER TABLE quotes ADD CONSTRAINT direct_quote_command_guard CHECK ((scope::text IN ('website','staff-change') AND direct_command_key IS NULL) OR (scope::text='staff-direct' AND direct_command_key IS NOT NULL AND direct_command_key ~ '^[a-f0-9-]{36}$'));
  CREATE FUNCTION protect_change_quote_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.change_context IS DISTINCT FROM OLD.change_context THEN RAISE EXCEPTION 'Change quote binding is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
  CREATE TRIGGER protect_change_quote_context BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION protect_change_quote_context();
  ALTER TABLE booking_changes ADD CONSTRAINT change_revision_guard CHECK (base_revision>=1 AND base_revision=trunc(base_revision) AND target_revision=base_revision+1);
  ALTER TABLE booking_changes ADD CONSTRAINT change_money_guard CHECK (delta_minor ~ '^(0|-?[1-9][0-9]*)$' AND currency='PHP' AND (kind<>'stay' OR quote_id IS NOT NULL));
  ALTER TABLE booking_changes ADD CONSTRAINT change_state_guard CHECK ((state='completed' AND completed_at IS NOT NULL OR state<>'completed' AND completed_at IS NULL) AND (state='abandoned' AND abandoned_at IS NOT NULL OR state<>'abandoned' AND abandoned_at IS NULL));
  CREATE UNIQUE INDEX one_pending_change_per_booking ON booking_changes(booking_id) WHERE state='awaiting-payment';
  CREATE UNIQUE INDEX one_completed_change_per_revision ON booking_changes(booking_id,target_revision) WHERE state='completed';
  CREATE FUNCTION protect_booking_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Change history cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (NEW.command_key,NEW.fingerprint,NEW.booking_id,NEW.staff_id,NEW.kind,NEW.base_revision,NEW.target_revision,NEW.quote_id,NEW.original_quote,NEW.accepted_quote,NEW.original_allocation,NEW.delta_minor,NEW.currency,NEW.agreement_reference,NEW.reason,NEW.created_at) IS DISTINCT FROM (OLD.command_key,OLD.fingerprint,OLD.booking_id,OLD.staff_id,OLD.kind,OLD.base_revision,OLD.target_revision,OLD.quote_id,OLD.original_quote,OLD.accepted_quote,OLD.original_allocation,OLD.delta_minor,OLD.currency,OLD.agreement_reference,OLD.reason,OLD.created_at) OR OLD.payment_attempt_id IS NOT NULL AND NEW.payment_attempt_id IS DISTINCT FROM OLD.payment_attempt_id THEN RAISE EXCEPTION 'Accepted change context is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state<>'awaiting-payment' AND (NEW.state,NEW.completed_at,NEW.abandoned_at,NEW.reason_code) IS DISTINCT FROM (OLD.state,OLD.completed_at,OLD.abandoned_at,OLD.reason_code) THEN RAISE EXCEPTION 'Terminal change history is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_booking_change BEFORE UPDATE OR DELETE ON booking_changes FOR EACH ROW EXECUTE FUNCTION protect_booking_change();
  CREATE OR REPLACE FUNCTION protect_checkout_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF (NEW.checkout_key,NEW.checkout_fingerprint,NEW.checkout_browser_hash,NEW.checkout_quote_id,NEW.prepared_at) IS DISTINCT FROM (OLD.checkout_key,OLD.checkout_fingerprint,OLD.checkout_browser_hash,OLD.checkout_quote_id,OLD.prepared_at) THEN RAISE EXCEPTION 'Checkout command receipt is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.checkout_key IS NOT NULL AND EXISTS(SELECT 1 FROM payment_attempts a WHERE a.booking_id=OLD.id AND a.purpose='booking' AND a.state IN ('preparing','ready','unknown','pending')) AND (NEW.accepted_quote,NEW.arrival,NEW.departure,NEW.contact,NEW.staying_guest,NEW.source,NEW.revision,NEW.owner_customer_id,NEW.current_quote_id) IS DISTINCT FROM (OLD.accepted_quote,OLD.arrival,OLD.departure,OLD.contact,OLD.staying_guest,OLD.source,OLD.revision,OLD.owner_customer_id,OLD.current_quote_id) THEN RAISE EXCEPTION 'Payable or uncertain booking context is frozen' USING ERRCODE='23514'; END IF;
    IF (NEW.revision,NEW.current_quote_id,NEW.accepted_quote,NEW.arrival,NEW.departure) IS DISTINCT FROM (OLD.revision,OLD.current_quote_id,OLD.accepted_quote,OLD.arrival,OLD.departure) AND NOT EXISTS(SELECT 1 FROM booking_changes c WHERE c.booking_id=OLD.id AND c.base_revision=OLD.revision AND c.target_revision=NEW.revision AND c.state='completed' AND c.original_quote=OLD.accepted_quote AND (c.kind='cancellation' AND NEW.status='cancelled' AND NEW.accepted_quote=OLD.accepted_quote AND NEW.current_quote_id IS NOT DISTINCT FROM OLD.current_quote_id AND NEW.arrival=OLD.arrival AND NEW.departure=OLD.departure OR c.kind='stay' AND NEW.status='confirmed' AND c.quote_id=NEW.current_quote_id AND c.accepted_quote=NEW.accepted_quote AND NEW.arrival::date=(NEW.accepted_quote->'stay'->>'arrival')::date AND NEW.departure::date=(NEW.accepted_quote->'stay'->>'departure')::date)) THEN RAISE EXCEPTION 'A completed revision transition is required' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN IF EXISTS(SELECT 1 FROM booking_changes) OR EXISTS(SELECT 1 FROM quotes WHERE scope::text='staff-change') OR EXISTS(SELECT 1 FROM bookings WHERE current_quote_id IS NOT NULL) THEN RAISE EXCEPTION 'Stay change history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_booking_change ON booking_changes;
  DROP FUNCTION protect_booking_change();
  DROP TRIGGER protect_change_quote_context ON quotes;
  DROP FUNCTION protect_change_quote_context();
  ALTER TABLE quotes DROP CONSTRAINT staff_quote_scope_guard;
  ALTER TABLE quotes DROP CONSTRAINT direct_quote_command_guard;
  ALTER TABLE quotes DROP CONSTRAINT direct_command_required;
  CREATE OR REPLACE FUNCTION protect_checkout_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF (NEW.checkout_key,NEW.checkout_fingerprint,NEW.checkout_browser_hash,NEW.checkout_quote_id,NEW.prepared_at) IS DISTINCT FROM (OLD.checkout_key,OLD.checkout_fingerprint,OLD.checkout_browser_hash,OLD.checkout_quote_id,OLD.prepared_at) THEN RAISE EXCEPTION 'Checkout command receipt is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.checkout_key IS NOT NULL AND EXISTS (SELECT 1 FROM payment_attempts a WHERE a.booking_id=OLD.id AND a.state IN ('preparing','ready','unknown','pending')) AND (NEW.accepted_quote,NEW.arrival,NEW.departure,NEW.contact,NEW.staying_guest,NEW.source,NEW.revision,NEW.owner_customer_id) IS DISTINCT FROM (OLD.accepted_quote,OLD.arrival,OLD.departure,OLD.contact,OLD.staying_guest,OLD.source,OLD.revision,OLD.owner_customer_id) THEN RAISE EXCEPTION 'Payable or uncertain booking context is frozen' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;

   ALTER TABLE "booking_changes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "booking_changes" CASCADE;
  ALTER TABLE "bookings" DROP CONSTRAINT "bookings_current_quote_id_quotes_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_booking_changes_fk";
  
  ALTER TABLE "quotes" ALTER COLUMN "scope" SET DATA TYPE text;
  ALTER TABLE "quotes" ALTER COLUMN "scope" SET DEFAULT 'website'::text;
  DROP TYPE "public"."enum_quotes_scope";
  CREATE TYPE "public"."enum_quotes_scope" AS ENUM('website', 'staff-direct');
  ALTER TABLE "quotes" ALTER COLUMN "scope" SET DEFAULT 'website'::"public"."enum_quotes_scope";
  ALTER TABLE "quotes" ALTER COLUMN "scope" SET DATA TYPE "public"."enum_quotes_scope" USING "scope"::"public"."enum_quotes_scope";
  DROP INDEX "bookings_current_quote_idx";
  DROP INDEX "payload_locked_documents_rels_booking_changes_id_idx";
  ALTER TABLE "quotes" DROP COLUMN "change_context";
  ALTER TABLE "bookings" DROP COLUMN "current_quote_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "booking_changes_id";
  DROP TYPE "public"."enum_booking_changes_kind";
  DROP TYPE "public"."enum_booking_changes_state";
  ALTER TABLE quotes ADD CONSTRAINT staff_quote_scope_guard CHECK ((scope='website' AND issuer_staff_id IS NULL) OR (scope='staff-direct' AND issuer_staff_id IS NOT NULL AND issuer_customer_id IS NULL));
  ALTER TABLE quotes ADD CONSTRAINT direct_quote_command_guard CHECK ((scope='website' AND direct_command_key IS NULL) OR (scope='staff-direct' AND direct_command_key IS NOT NULL AND direct_command_key ~ '^[a-f0-9-]{36}$'));
  ALTER TABLE quotes ADD CONSTRAINT direct_command_required CHECK (scope<>'staff-direct' OR (direct_command_key IS NOT NULL AND direct_command_key ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'));`)
}
