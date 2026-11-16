import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_messages_category" AS ENUM('booking', 'booking-view', 'auth', 'claim', 'staff-reset', 'enquiry', 'payment-issue');
  CREATE TYPE "public"."enum_email_messages_state" AS ENUM('pending', 'accepted', 'failed', 'uncertain', 'cancelled');
  CREATE TYPE "public"."enum_email_messages_reason" AS ENUM('temporary', 'permanent', 'timeout', 'transport', 'partial', 'expired', 'quota', 'obsolete');
  CREATE TABLE "email_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "semantic_key" varchar NOT NULL,
    "category" "enum_email_messages_category" NOT NULL,
    "encrypted_snapshot" varchar NOT NULL,
    "encrypted_message" varchar,
    "booking_id" uuid,
    "revision" numeric,
    "auth_delivery_id" uuid,
    "enquiry_id" uuid,
    "issue_id" uuid,
    "expires_at" timestamp(3) with time zone,
    "state" "enum_email_messages_state" DEFAULT 'pending' NOT NULL,
    "provider_message_id" varchar,
    "accepted_at" timestamp(3) with time zone,
    "reason" "enum_email_messages_reason",
    "reserved_day" varchar,
    "recipient_count" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_messages_id" uuid;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_auth_delivery_id_auth_deliveries_id_fk" FOREIGN KEY ("auth_delivery_id") REFERENCES "public"."auth_deliveries"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_issue_id_payment_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."payment_issues"("id") ON DELETE restrict ON UPDATE no action;
  CREATE UNIQUE INDEX "email_messages_semantic_key_idx" ON "email_messages" USING btree ("semantic_key");
  CREATE INDEX "email_messages_booking_idx" ON "email_messages" USING btree ("booking_id");
  CREATE INDEX "email_messages_auth_delivery_idx" ON "email_messages" USING btree ("auth_delivery_id");
  CREATE INDEX "email_messages_enquiry_idx" ON "email_messages" USING btree ("enquiry_id");
  CREATE INDEX "email_messages_issue_idx" ON "email_messages" USING btree ("issue_id");
  CREATE INDEX "email_messages_updated_at_idx" ON "email_messages" USING btree ("updated_at");
  CREATE INDEX "email_messages_created_at_idx" ON "email_messages" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_messages_fk" FOREIGN KEY ("email_messages_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_email_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("email_messages_id");
  ALTER TABLE email_messages ADD CONSTRAINT email_acceptance_guard CHECK (state<>'accepted' OR (provider_message_id IS NOT NULL AND accepted_at IS NOT NULL));
  ALTER TABLE email_messages ADD CONSTRAINT email_quota_guard CHECK ((reserved_day IS NULL AND recipient_count IS NULL) OR (reserved_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND recipient_count BETWEEN 1 AND 20 AND recipient_count=trunc(recipient_count)));
  CREATE FUNCTION protect_email_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Email evidence cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (NEW.semantic_key,NEW.category,NEW.encrypted_snapshot,NEW.booking_id,NEW.revision,NEW.auth_delivery_id,NEW.enquiry_id,NEW.issue_id,NEW.expires_at) IS DISTINCT FROM (OLD.semantic_key,OLD.category,OLD.encrypted_snapshot,OLD.booking_id,OLD.revision,OLD.auth_delivery_id,OLD.enquiry_id,OLD.issue_id,OLD.expires_at) THEN RAISE EXCEPTION 'Frozen email identity is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.encrypted_message IS NOT NULL AND NEW.encrypted_message IS DISTINCT FROM OLD.encrypted_message THEN RAISE EXCEPTION 'Prepared email is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state='accepted' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN RAISE EXCEPTION 'SMTP acceptance evidence is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state='uncertain' AND NEW.state='pending' THEN RAISE EXCEPTION 'Uncertain sends need explicit resolution' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_email_message BEFORE UPDATE OR DELETE ON email_messages FOR EACH ROW EXECUTE FUNCTION protect_email_message();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN IF EXISTS(SELECT 1 FROM email_messages) THEN RAISE EXCEPTION 'Email history prevents destructive rollback'; END IF; END $$;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_messages_fk";
  DROP TABLE "email_messages" CASCADE;
  DROP FUNCTION protect_email_message();

  DROP INDEX "payload_locked_documents_rels_email_messages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_messages_id";
  DROP TYPE "public"."enum_email_messages_category";
  DROP TYPE "public"."enum_email_messages_state";
  DROP TYPE "public"."enum_email_messages_reason";`)
}
