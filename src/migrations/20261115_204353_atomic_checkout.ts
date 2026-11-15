import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bookings" ADD COLUMN "checkout_key" varchar;
  ALTER TABLE "bookings" ADD COLUMN "checkout_fingerprint" varchar;
  ALTER TABLE "bookings" ADD COLUMN "checkout_browser_hash" varchar;
  ALTER TABLE "bookings" ADD COLUMN "checkout_quote_id" uuid;
  ALTER TABLE "bookings" ADD COLUMN "prepared_at" timestamp(3) with time zone;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkout_quote_id_quotes_id_fk" FOREIGN KEY ("checkout_quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "bookings_checkout_key_idx" ON "bookings" USING btree ("checkout_key");
  CREATE INDEX "bookings_checkout_quote_idx" ON "bookings" USING btree ("checkout_quote_id");
  ALTER TABLE bookings ADD CONSTRAINT checkout_receipt_guard CHECK ((checkout_key IS NULL AND checkout_fingerprint IS NULL AND checkout_browser_hash IS NULL AND checkout_quote_id IS NULL AND prepared_at IS NULL) OR (checkout_key IS NOT NULL AND checkout_fingerprint IS NOT NULL AND checkout_fingerprint ~ '^[a-f0-9]{64}$' AND checkout_browser_hash IS NOT NULL AND checkout_browser_hash ~ '^[a-f0-9]{64}$' AND checkout_quote_id IS NOT NULL AND prepared_at IS NOT NULL));
  CREATE FUNCTION protect_checkout_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF (NEW.checkout_key,NEW.checkout_fingerprint,NEW.checkout_browser_hash,NEW.checkout_quote_id,NEW.prepared_at) IS DISTINCT FROM (OLD.checkout_key,OLD.checkout_fingerprint,OLD.checkout_browser_hash,OLD.checkout_quote_id,OLD.prepared_at) THEN RAISE EXCEPTION 'Checkout command receipt is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.checkout_key IS NOT NULL AND EXISTS (SELECT 1 FROM payment_attempts a WHERE a.booking_id=OLD.id AND a.state IN ('preparing','ready','unknown','pending')) AND (NEW.accepted_quote,NEW.arrival,NEW.departure,NEW.contact,NEW.staying_guest,NEW.source,NEW.revision,NEW.owner_customer_id) IS DISTINCT FROM (OLD.accepted_quote,OLD.arrival,OLD.departure,OLD.contact,OLD.staying_guest,OLD.source,OLD.revision,OLD.owner_customer_id) THEN RAISE EXCEPTION 'Payable or uncertain booking context is frozen' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_checkout_receipt BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION protect_checkout_receipt();
  CREATE FUNCTION protect_payment_attempt_context() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment attempts cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (NEW.booking_id,NEW.merchant_reference,NEW.command_key,NEW.fingerprint,NEW.amount_minor,NEW.currency,NEW.accepted_context,NEW.purpose,NEW.revision,NEW.deadline,NEW.created_at) IS DISTINCT FROM (OLD.booking_id,OLD.merchant_reference,OLD.command_key,OLD.fingerprint,OLD.amount_minor,OLD.currency,OLD.accepted_context,OLD.purpose,OLD.revision,OLD.deadline,OLD.created_at) THEN RAISE EXCEPTION 'Payment attempt context is immutable' USING ERRCODE='23514'; END IF;
    IF (OLD.provider_checkout_id IS NOT NULL AND NEW.provider_checkout_id IS DISTINCT FROM OLD.provider_checkout_id) OR (OLD.checkout_url IS NOT NULL AND NEW.checkout_url IS DISTINCT FROM OLD.checkout_url) THEN RAISE EXCEPTION 'Payment attempt provider association is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_payment_attempt_context BEFORE UPDATE OR DELETE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION protect_payment_attempt_context();
`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN IF EXISTS (SELECT 1 FROM bookings WHERE checkout_key IS NOT NULL) THEN RAISE EXCEPTION 'Prepared checkout history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_payment_attempt_context ON payment_attempts;
  DROP FUNCTION protect_payment_attempt_context();
  DROP TRIGGER protect_checkout_receipt ON bookings;
  DROP FUNCTION protect_checkout_receipt();
  ALTER TABLE bookings DROP CONSTRAINT checkout_receipt_guard;
   ALTER TABLE "bookings" DROP CONSTRAINT "bookings_checkout_quote_id_quotes_id_fk";
  
  DROP INDEX "bookings_checkout_key_idx";
  DROP INDEX "bookings_checkout_quote_idx";
  ALTER TABLE "bookings" DROP COLUMN "checkout_key";
  ALTER TABLE "bookings" DROP COLUMN "checkout_fingerprint";
  ALTER TABLE "bookings" DROP COLUMN "checkout_browser_hash";
  ALTER TABLE "bookings" DROP COLUMN "checkout_quote_id";
  ALTER TABLE "bookings" DROP COLUMN "prepared_at";`)
}
