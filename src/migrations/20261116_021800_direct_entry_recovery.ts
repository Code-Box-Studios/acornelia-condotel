import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "direct_command_closures" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "command_key" varchar NOT NULL,
    "quote_id" uuid NOT NULL,
    "staff_id" uuid NOT NULL,
    "closed_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "quotes" ADD COLUMN "direct_command_key" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "direct_command_closures_id" uuid;
  ALTER TABLE "direct_command_closures" ADD CONSTRAINT "direct_command_closures_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "direct_command_closures" ADD CONSTRAINT "direct_command_closures_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  CREATE UNIQUE INDEX "direct_command_closures_command_key_idx" ON "direct_command_closures" USING btree ("command_key");
  CREATE INDEX "direct_command_closures_quote_idx" ON "direct_command_closures" USING btree ("quote_id");
  CREATE INDEX "direct_command_closures_staff_idx" ON "direct_command_closures" USING btree ("staff_id");
  CREATE INDEX "direct_command_closures_updated_at_idx" ON "direct_command_closures" USING btree ("updated_at");
  CREATE INDEX "direct_command_closures_created_at_idx" ON "direct_command_closures" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_direct_command_closures_fk" FOREIGN KEY ("direct_command_closures_id") REFERENCES "public"."direct_command_closures"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "quotes_direct_command_key_idx" ON "quotes" USING btree ("direct_command_key");
  CREATE INDEX "payload_locked_documents_rels_direct_command_closures_id_idx" ON "payload_locked_documents_rels" USING btree ("direct_command_closures_id");
  UPDATE quotes q SET direct_command_key=COALESCE((SELECT b.checkout_key FROM bookings b WHERE b.id=q.consumed_by_booking_id AND b.checkout_quote_id=q.id),gen_random_uuid()::text) WHERE q.scope='staff-direct';
  ALTER TABLE quotes ADD CONSTRAINT direct_quote_command_guard CHECK ((scope='website' AND direct_command_key IS NULL) OR (scope='staff-direct' AND direct_command_key ~ '^[a-f0-9-]{36}$'));
  CREATE FUNCTION protect_direct_quote_command() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.direct_command_key IS DISTINCT FROM OLD.direct_command_key THEN RAISE EXCEPTION 'Direct quote command is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
  CREATE TRIGGER protect_direct_quote_command BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION protect_direct_quote_command();
  CREATE FUNCTION protect_direct_entry_closure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Direct entry closures are immutable' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM quotes q WHERE q.id=NEW.quote_id AND q.scope='staff-direct' AND q.direct_command_key=NEW.command_key AND q.issuer_staff_id=NEW.staff_id) OR EXISTS(SELECT 1 FROM bookings b WHERE b.checkout_key=NEW.command_key) THEN RAISE EXCEPTION 'Only the original unfinished staff entry can be closed' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_direct_entry_closure BEFORE INSERT OR UPDATE OR DELETE ON direct_command_closures FOR EACH ROW EXECUTE FUNCTION protect_direct_entry_closure();
  CREATE FUNCTION reject_closed_direct_booking() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.direct_context IS NOT NULL AND EXISTS(SELECT 1 FROM direct_command_closures c WHERE c.command_key=NEW.checkout_key) THEN RAISE EXCEPTION 'A closed direct entry cannot save a booking' USING ERRCODE='23514'; END IF; RETURN NEW;
  END $$;
  CREATE TRIGGER reject_closed_direct_booking BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION reject_closed_direct_booking();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN IF EXISTS(SELECT 1 FROM direct_command_closures) OR EXISTS(SELECT 1 FROM quotes WHERE direct_command_key IS NOT NULL) THEN RAISE EXCEPTION 'Direct command history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER reject_closed_direct_booking ON bookings;
  DROP FUNCTION reject_closed_direct_booking();
  DROP TRIGGER protect_direct_quote_command ON quotes;
  DROP FUNCTION protect_direct_quote_command();
  ALTER TABLE quotes DROP CONSTRAINT direct_quote_command_guard;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_direct_command_closures_fk";
  DROP TABLE "direct_command_closures" CASCADE;
  DROP FUNCTION protect_direct_entry_closure();

  DROP INDEX "quotes_direct_command_key_idx";
  DROP INDEX "payload_locked_documents_rels_direct_command_closures_id_idx";
  ALTER TABLE "quotes" DROP COLUMN "direct_command_key";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "direct_command_closures_id";`)
}
