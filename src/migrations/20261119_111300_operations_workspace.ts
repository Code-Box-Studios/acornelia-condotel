import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stay_events_kind" AS ENUM('checked-in', 'checked-out', 'no-show');
  CREATE TYPE "public"."enum_enquiries_follow_up_outcome" AS ENUM('contacted', 'booked', 'not-pursued', 'duplicate');
  CREATE TABLE "stay_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"command_key" varchar NOT NULL,
  	"fingerprint" varchar NOT NULL,
  	"booking_id" uuid NOT NULL,
  	"kind" "enum_stay_events_kind" NOT NULL,
  	"property_date" varchar NOT NULL,
  	"booking_revision" numeric NOT NULL,
  	"staff_id" uuid NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "staff_notes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"command_key" varchar NOT NULL,
  	"fingerprint" varchar NOT NULL,
  	"booking_id" uuid,
  	"enquiry_id" uuid,
  	"staff_id" uuid NOT NULL,
  	"text" varchar NOT NULL,
  	"recorded_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "enquiries" ADD COLUMN "follow_up_outcome" "enum_enquiries_follow_up_outcome";
  ALTER TABLE "enquiries" ADD COLUMN "closed_at" timestamp(3) with time zone;
  ALTER TABLE "enquiries" ADD COLUMN "closed_by_id" uuid;
  ALTER TABLE "payment_issues" ADD COLUMN "resolution_reference" varchar;
  ALTER TABLE "payment_issues" ADD COLUMN "resolved_by_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stay_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "staff_notes_id" uuid;
  ALTER TABLE "stay_events" ADD CONSTRAINT "stay_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "stay_events" ADD CONSTRAINT "stay_events_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  CREATE UNIQUE INDEX "stay_events_command_key_idx" ON "stay_events" USING btree ("command_key");
  CREATE INDEX "stay_events_booking_idx" ON "stay_events" USING btree ("booking_id");
  CREATE INDEX "stay_events_staff_idx" ON "stay_events" USING btree ("staff_id");
  CREATE INDEX "stay_events_updated_at_idx" ON "stay_events" USING btree ("updated_at");
  CREATE INDEX "stay_events_created_at_idx" ON "stay_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "booking_kind_idx" ON "stay_events" USING btree ("booking_id","kind");
  CREATE UNIQUE INDEX "staff_notes_command_key_idx" ON "staff_notes" USING btree ("command_key");
  CREATE INDEX "staff_notes_booking_idx" ON "staff_notes" USING btree ("booking_id");
  CREATE INDEX "staff_notes_enquiry_idx" ON "staff_notes" USING btree ("enquiry_id");
  CREATE INDEX "staff_notes_staff_idx" ON "staff_notes" USING btree ("staff_id");
  CREATE INDEX "staff_notes_updated_at_idx" ON "staff_notes" USING btree ("updated_at");
  CREATE INDEX "staff_notes_created_at_idx" ON "staff_notes" USING btree ("created_at");
  ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_closed_by_id_staff_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payment_issues" ADD CONSTRAINT "payment_issues_resolved_by_id_staff_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stay_events_fk" FOREIGN KEY ("stay_events_id") REFERENCES "public"."stay_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_staff_notes_fk" FOREIGN KEY ("staff_notes_id") REFERENCES "public"."staff_notes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "enquiries_closed_by_idx" ON "enquiries" USING btree ("closed_by_id");
  CREATE INDEX "payment_issues_resolved_by_idx" ON "payment_issues" USING btree ("resolved_by_id");
  CREATE INDEX "payload_locked_documents_rels_stay_events_id_idx" ON "payload_locked_documents_rels" USING btree ("stay_events_id");
  CREATE INDEX "payload_locked_documents_rels_staff_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("staff_notes_id");
  ALTER TABLE "stay_events" ADD CONSTRAINT "stay_events_values_check" CHECK (property_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND booking_revision>=1 AND booking_revision=trunc(booking_revision));
  ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_target_check" CHECK ((booking_id IS NULL)<>(enquiry_id IS NULL) AND char_length(text) BETWEEN 1 AND 2000);
  CREATE OR REPLACE FUNCTION protect_operations_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'Front-desk history is append-only' USING ERRCODE='23514';
  END $$;
  CREATE TRIGGER protect_stay_event BEFORE UPDATE OR DELETE ON stay_events FOR EACH ROW EXECUTE FUNCTION protect_operations_history();
  CREATE TRIGGER protect_staff_note BEFORE UPDATE OR DELETE ON staff_notes FOR EACH ROW EXECUTE FUNCTION protect_operations_history();
  CREATE OR REPLACE FUNCTION protect_payment_issue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment issues cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['state','resolved_at','resolution_code','resolution_reference','resolved_by_id','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','resolved_at','resolution_code','resolution_reference','resolved_by_id','updated_at']) OR (OLD.state='resolved' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at')) THEN RAISE EXCEPTION 'Payment issue evidence is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.state='resolved' AND (NEW.resolved_at IS NULL OR NEW.resolution_code IS NULL) THEN RAISE EXCEPTION 'Issue resolution requires an audited decision' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE OR REPLACE FUNCTION protect_enquiry_closure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.closed_at IS NOT NULL AND (NEW.closed_at,NEW.closed_by_id,NEW.follow_up_outcome,NEW.state) IS DISTINCT FROM (OLD.closed_at,OLD.closed_by_id,OLD.follow_up_outcome,OLD.state) THEN RAISE EXCEPTION 'Enquiry closure is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.closed_at IS NOT NULL AND (NEW.state<>'closed' OR NEW.follow_up_outcome IS NULL OR NEW.closed_by_id IS NULL) THEN RAISE EXCEPTION 'Enquiry closure requires an outcome and staff member' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_enquiry_closure BEFORE UPDATE ON enquiries FOR EACH ROW EXECUTE FUNCTION protect_enquiry_closure();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN IF EXISTS (SELECT 1 FROM stay_events) OR EXISTS (SELECT 1 FROM staff_notes) OR EXISTS (SELECT 1 FROM enquiries WHERE closed_at IS NOT NULL) OR EXISTS (SELECT 1 FROM payment_issues WHERE resolution_reference IS NOT NULL OR resolved_by_id IS NOT NULL) THEN RAISE EXCEPTION 'Operations history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER IF EXISTS protect_enquiry_closure ON enquiries;
  DROP FUNCTION IF EXISTS protect_enquiry_closure();
  CREATE OR REPLACE FUNCTION protect_payment_issue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment issues cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['state','resolved_at','resolution_code','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','resolved_at','resolution_code','updated_at']) OR (OLD.state='resolved' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at')) THEN RAISE EXCEPTION 'Payment issue evidence is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.state='resolved' AND (NEW.resolved_at IS NULL OR NEW.resolution_code IS NULL) THEN RAISE EXCEPTION 'Issue resolution requires an audited decision' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_stay_events_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_staff_notes_fk";
  DROP INDEX "payload_locked_documents_rels_stay_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_staff_notes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "stay_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "staff_notes_id";
  DROP TABLE "stay_events" CASCADE;
  DROP TABLE "staff_notes" CASCADE;
  DROP FUNCTION IF EXISTS protect_operations_history();
  ALTER TABLE "enquiries" DROP CONSTRAINT "enquiries_closed_by_id_staff_users_id_fk";
  ALTER TABLE "payment_issues" DROP CONSTRAINT "payment_issues_resolved_by_id_staff_users_id_fk";
  DROP INDEX "enquiries_closed_by_idx";
  DROP INDEX "payment_issues_resolved_by_idx";
  ALTER TABLE "enquiries" DROP COLUMN "follow_up_outcome";
  ALTER TABLE "enquiries" DROP COLUMN "closed_at";
  ALTER TABLE "enquiries" DROP COLUMN "closed_by_id";
  ALTER TABLE "payment_issues" DROP COLUMN "resolution_reference";
  ALTER TABLE "payment_issues" DROP COLUMN "resolved_by_id";
  DROP TYPE "public"."enum_stay_events_kind";
  DROP TYPE "public"."enum_enquiries_follow_up_outcome";`)
}
