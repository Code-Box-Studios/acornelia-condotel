import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "rate_plans" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "room_type_id" uuid NOT NULL,
    "policy_version_id" uuid NOT NULL,
    "revision" numeric NOT NULL,
    "rules" jsonb NOT NULL,
    "valid_from" timestamp(3) with time zone NOT NULL,
    "valid_until" timestamp(3) with time zone NOT NULL,
    "approved" boolean DEFAULT false NOT NULL,
    "approval_reference" varchar,
    "synthetic" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "quotes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "version" numeric DEFAULT 1 NOT NULL,
    "issuer_customer_id" uuid,
    "browser_hash" varchar NOT NULL,
    "snapshot" jsonb NOT NULL,
    "policy_snapshot" jsonb NOT NULL,
    "rate_snapshot" jsonb NOT NULL,
    "policy_version_id" uuid NOT NULL,
    "rate_version_id" uuid NOT NULL,
    "amount_minor" varchar NOT NULL,
    "currency" varchar NOT NULL,
    "issued_at" timestamp(3) with time zone NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "accepted_at" timestamp(3) with time zone,
    "accepted_by" jsonb,
    "consumed_by_booking_id" uuid,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "policy_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "revision" numeric NOT NULL,
    "approved_sections" jsonb NOT NULL,
    "sections" jsonb NOT NULL,
    "approved" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "approval_reference" varchar,
    "synthetic" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "rate_plans_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quotes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "policy_versions_id" uuid;
  ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_issuer_customer_id_customers_id_fk" FOREIGN KEY ("issuer_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rate_version_id_rate_plans_id_fk" FOREIGN KEY ("rate_version_id") REFERENCES "public"."rate_plans"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_consumed_by_booking_id_bookings_id_fk" FOREIGN KEY ("consumed_by_booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  CREATE INDEX "rate_plans_room_type_idx" ON "rate_plans" USING btree ("room_type_id");
  CREATE INDEX "rate_plans_policy_version_idx" ON "rate_plans" USING btree ("policy_version_id");
  CREATE INDEX "rate_plans_updated_at_idx" ON "rate_plans" USING btree ("updated_at");
  CREATE INDEX "rate_plans_created_at_idx" ON "rate_plans" USING btree ("created_at");
  CREATE INDEX "quotes_issuer_customer_idx" ON "quotes" USING btree ("issuer_customer_id");
  CREATE INDEX "quotes_policy_version_idx" ON "quotes" USING btree ("policy_version_id");
  CREATE INDEX "quotes_rate_version_idx" ON "quotes" USING btree ("rate_version_id");
  CREATE INDEX "quotes_consumed_by_booking_idx" ON "quotes" USING btree ("consumed_by_booking_id");
  CREATE INDEX "quotes_updated_at_idx" ON "quotes" USING btree ("updated_at");
  CREATE INDEX "quotes_created_at_idx" ON "quotes" USING btree ("created_at");
  CREATE UNIQUE INDEX "policy_versions_revision_idx" ON "policy_versions" USING btree ("revision");
  CREATE INDEX "policy_versions_updated_at_idx" ON "policy_versions" USING btree ("updated_at");
  CREATE INDEX "policy_versions_created_at_idx" ON "policy_versions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rate_plans_fk" FOREIGN KEY ("rate_plans_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quotes_fk" FOREIGN KEY ("quotes_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_policy_versions_fk" FOREIGN KEY ("policy_versions_id") REFERENCES "public"."policy_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_rate_plans_id_idx" ON "payload_locked_documents_rels" USING btree ("rate_plans_id");
  CREATE INDEX "payload_locked_documents_rels_quotes_id_idx" ON "payload_locked_documents_rels" USING btree ("quotes_id");
  CREATE INDEX "payload_locked_documents_rels_policy_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("policy_versions_id");
  CREATE UNIQUE INDEX one_active_policy_version ON policy_versions (active) WHERE active=true;
  CREATE UNIQUE INDEX rate_plan_revision_unique ON rate_plans (room_type_id,policy_version_id,revision);
  ALTER TABLE policy_versions ADD CONSTRAINT policy_version_guard CHECK (revision>=1 AND revision=trunc(revision) AND (NOT active OR approved) AND (NOT approved OR (approval_reference IS NOT NULL AND length(trim(approval_reference))>0)));
  ALTER TABLE rate_plans ADD CONSTRAINT rate_plan_guard CHECK (revision>=1 AND revision=trunc(revision) AND valid_until>valid_from AND (valid_from AT TIME ZONE 'UTC')::time=time '00:00:00' AND (valid_until AT TIME ZONE 'UTC')::time=time '00:00:00' AND (NOT approved OR (approval_reference IS NOT NULL AND length(trim(approval_reference))>0)));
  ALTER TABLE quotes ADD CONSTRAINT quote_guard CHECK (version>=1 AND version=trunc(version) AND amount_minor ~ '^(0|[1-9][0-9]*)$' AND currency='PHP' AND browser_hash ~ '^[a-f0-9]{64}$' AND expires_at>issued_at AND ((accepted_at IS NULL AND accepted_by IS NULL) OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL AND accepted_at>=issued_at AND accepted_at<=expires_at)) AND (consumed_by_booking_id IS NULL OR accepted_at IS NOT NULL) AND snapshot ? 'total' AND snapshot->'total'->>'minor'=amount_minor AND snapshot->'total'->>'currency'=currency);
  CREATE FUNCTION preserve_policy_version() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Policy versions cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-'active'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'active'-'updated_at') THEN RAISE EXCEPTION 'Policy versions are immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER preserve_policy_version BEFORE UPDATE OR DELETE ON policy_versions FOR EACH ROW EXECUTE FUNCTION preserve_policy_version();
  CREATE FUNCTION preserve_rate_version() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Rate versions cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN RAISE EXCEPTION 'Rate versions are immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER preserve_rate_version BEFORE UPDATE OR DELETE ON rate_plans FOR EACH ROW EXECUTE FUNCTION preserve_rate_version();
  CREATE FUNCTION preserve_quote_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Quotes cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-'accepted_at'-'accepted_by'-'consumed_by_booking_id'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'accepted_at'-'accepted_by'-'consumed_by_booking_id'-'updated_at') OR (OLD.accepted_at IS NOT NULL AND (NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by)) OR (OLD.consumed_by_booking_id IS NOT NULL AND NEW.consumed_by_booking_id IS DISTINCT FROM OLD.consumed_by_booking_id) THEN RAISE EXCEPTION 'Quote financial context is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER preserve_quote_snapshot BEFORE UPDATE OR DELETE ON quotes FOR EACH ROW EXECUTE FUNCTION preserve_quote_snapshot();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TRIGGER preserve_quote_snapshot ON quotes;
  DROP FUNCTION preserve_quote_snapshot();
  DROP TRIGGER preserve_rate_version ON rate_plans;
  DROP FUNCTION preserve_rate_version();
  DROP TRIGGER preserve_policy_version ON policy_versions;
  DROP FUNCTION preserve_policy_version();
  ALTER TABLE "rate_plans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quotes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "policy_versions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "rate_plans" CASCADE;
  DROP TABLE "quotes" CASCADE;
  DROP TABLE "policy_versions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_rate_plans_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_quotes_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_policy_versions_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_rate_plans_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_quotes_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_policy_versions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "rate_plans_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quotes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "policy_versions_id";`)
}
