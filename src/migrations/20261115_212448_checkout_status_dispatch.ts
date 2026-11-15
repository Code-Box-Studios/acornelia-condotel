import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_booking_views_purpose" AS ENUM('booking-view', 'checkout-status');
  CREATE TYPE "public"."enum_payment_attempts_provider_environment" AS ENUM('sandbox', 'production');
  ALTER TABLE "booking_views" ADD COLUMN "purpose" "enum_booking_views_purpose" DEFAULT 'booking-view' NOT NULL;
  ALTER TABLE "booking_views" ADD COLUMN "browser_hash" varchar;
  ALTER TABLE "booking_views" ADD COLUMN "customer_id" uuid;
  ALTER TABLE "checkout_drafts" ADD COLUMN "command_key" varchar;
  ALTER TABLE "payment_attempts" ADD COLUMN "provider_environment" "enum_payment_attempts_provider_environment";
  ALTER TABLE "booking_views" ADD CONSTRAINT "booking_views_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
  CREATE INDEX "booking_views_customer_idx" ON "booking_views" USING btree ("customer_id");
  CREATE UNIQUE INDEX "checkout_drafts_command_key_idx" ON "checkout_drafts" USING btree ("command_key");
  ALTER TABLE booking_views ADD CONSTRAINT booking_view_purpose_guard CHECK ((purpose='booking-view' AND browser_hash IS NULL AND customer_id IS NULL) OR (purpose='checkout-status' AND browser_hash IS NOT NULL AND browser_hash ~ '^[a-f0-9]{64}$' AND token_hash ~ '^[a-f0-9]{64}$'));
  CREATE FUNCTION protect_booking_view_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF (NEW.booking_id,NEW.token_hash,NEW.expires_at,NEW.purpose,NEW.browser_hash,NEW.customer_id,NEW.created_at) IS DISTINCT FROM (OLD.booking_id,OLD.token_hash,OLD.expires_at,OLD.purpose,OLD.browser_hash,OLD.customer_id,OLD.created_at) OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN RAISE EXCEPTION 'Private view scope and revocation are immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_booking_view_scope BEFORE UPDATE ON booking_views FOR EACH ROW EXECUTE FUNCTION protect_booking_view_scope();
  CREATE FUNCTION preserve_checkout_draft_command() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.command_key IS NOT NULL AND NEW.command_key IS DISTINCT FROM OLD.command_key THEN RAISE EXCEPTION 'Draft command identity is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER preserve_checkout_draft_command BEFORE UPDATE ON checkout_drafts FOR EACH ROW EXECUTE FUNCTION preserve_checkout_draft_command();
  CREATE FUNCTION preserve_payment_environment() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.provider_environment IS NOT NULL AND NEW.provider_environment IS DISTINCT FROM OLD.provider_environment THEN RAISE EXCEPTION 'Payment provider environment is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER preserve_payment_environment BEFORE UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION preserve_payment_environment();
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN IF EXISTS (SELECT 1 FROM booking_views WHERE purpose='checkout-status') OR EXISTS (SELECT 1 FROM checkout_drafts WHERE command_key IS NOT NULL) OR EXISTS (SELECT 1 FROM payment_attempts WHERE provider_environment IS NOT NULL) THEN RAISE EXCEPTION 'Checkout security history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER preserve_payment_environment ON payment_attempts;
  DROP FUNCTION preserve_payment_environment();
  DROP TRIGGER preserve_checkout_draft_command ON checkout_drafts;
  DROP FUNCTION preserve_checkout_draft_command();
  DROP TRIGGER protect_booking_view_scope ON booking_views;
  DROP FUNCTION protect_booking_view_scope();
  ALTER TABLE booking_views DROP CONSTRAINT booking_view_purpose_guard;
   ALTER TABLE "booking_views" DROP CONSTRAINT "booking_views_customer_id_customers_id_fk";
  
  DROP INDEX "booking_views_customer_idx";
  DROP INDEX "checkout_drafts_command_key_idx";
  ALTER TABLE "booking_views" DROP COLUMN "purpose";
  ALTER TABLE "booking_views" DROP COLUMN "browser_hash";
  ALTER TABLE "booking_views" DROP COLUMN "customer_id";
  ALTER TABLE "checkout_drafts" DROP COLUMN "command_key";
  ALTER TABLE "payment_attempts" DROP COLUMN "provider_environment";
  DROP TYPE "public"."enum_booking_views_purpose";
  DROP TYPE "public"."enum_payment_attempts_provider_environment";`)
}
