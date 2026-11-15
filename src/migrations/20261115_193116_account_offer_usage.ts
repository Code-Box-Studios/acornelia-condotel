import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN IF EXISTS (SELECT 1 FROM offer_allocations) THEN RAISE EXCEPTION 'Legacy offer usage requires reviewed mapping before upgrade'; END IF; END $$;
  CREATE TYPE "public"."enum_offer_allocations_release_reason" AS ENUM('failed', 'expired-unpaid', 'cancelled', 'refunded', 'reissue');
  CREATE TABLE "offers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "current_version_id" uuid,
    "usage_revision" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "offer_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "offer_id" uuid NOT NULL,
    "policy_version_id" uuid NOT NULL,
    "name" varchar NOT NULL,
    "revision" numeric NOT NULL,
    "terms" jsonb NOT NULL,
    "approved" boolean DEFAULT false NOT NULL,
    "approval_reference" varchar,
    "published_at" timestamp(3) with time zone NOT NULL,
    "synthetic" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DROP INDEX "offer_allocations_offer_version_id_idx";
  DROP INDEX "offer_allocations_customer_id_idx";
  ALTER TABLE "offer_allocations" ALTER COLUMN "offer_version_id" SET DATA TYPE uuid USING "offer_version_id"::uuid;
  ALTER TABLE "offer_allocations" ALTER COLUMN "customer_id" SET DATA TYPE uuid USING "customer_id"::uuid;
  ALTER TABLE "quotes" ADD COLUMN "offer_version_id" uuid;
  ALTER TABLE "offer_allocations" ADD COLUMN "offer_id" uuid NOT NULL;
  ALTER TABLE "offer_allocations" ADD COLUMN "quote_id" uuid;
  ALTER TABLE "offer_allocations" ADD COLUMN "consumed_at" timestamp(3) with time zone;
  ALTER TABLE "offer_allocations" ADD COLUMN "released_at" timestamp(3) with time zone;
  ALTER TABLE "offer_allocations" ADD COLUMN "release_reason" "enum_offer_allocations_release_reason";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "offers_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "offer_versions_id" uuid;
  ALTER TABLE "offers" ADD CONSTRAINT "offers_current_version_id_offer_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."offer_versions"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "offer_versions" ADD CONSTRAINT "offer_versions_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;
  CREATE INDEX "offers_current_version_idx" ON "offers" USING btree ("current_version_id");
  CREATE INDEX "offers_updated_at_idx" ON "offers" USING btree ("updated_at");
  CREATE INDEX "offers_created_at_idx" ON "offers" USING btree ("created_at");
  CREATE INDEX "offer_versions_offer_idx" ON "offer_versions" USING btree ("offer_id");
  CREATE INDEX "offer_versions_policy_version_idx" ON "offer_versions" USING btree ("policy_version_id");
  CREATE INDEX "offer_versions_updated_at_idx" ON "offer_versions" USING btree ("updated_at");
  CREATE INDEX "offer_versions_created_at_idx" ON "offer_versions" USING btree ("created_at");
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_offer_version_id_offer_versions_id_fk" FOREIGN KEY ("offer_version_id") REFERENCES "public"."offer_versions"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "offer_allocations" ADD CONSTRAINT "offer_allocations_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "offer_allocations" ADD CONSTRAINT "offer_allocations_offer_version_id_offer_versions_id_fk" FOREIGN KEY ("offer_version_id") REFERENCES "public"."offer_versions"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "offer_allocations" ADD CONSTRAINT "offer_allocations_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "offer_allocations" ADD CONSTRAINT "offer_allocations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_offers_fk" FOREIGN KEY ("offers_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_offer_versions_fk" FOREIGN KEY ("offer_versions_id") REFERENCES "public"."offer_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "quotes_offer_version_idx" ON "quotes" USING btree ("offer_version_id");
  CREATE INDEX "offer_allocations_offer_idx" ON "offer_allocations" USING btree ("offer_id");
  CREATE INDEX "offer_allocations_offer_version_idx" ON "offer_allocations" USING btree ("offer_version_id");
  CREATE INDEX "offer_allocations_quote_idx" ON "offer_allocations" USING btree ("quote_id");
  CREATE INDEX "offer_allocations_customer_idx" ON "offer_allocations" USING btree ("customer_id");
  CREATE INDEX "payload_locked_documents_rels_offers_id_idx" ON "payload_locked_documents_rels" USING btree ("offers_id");
  CREATE INDEX "payload_locked_documents_rels_offer_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("offer_versions_id");
  CREATE UNIQUE INDEX offer_version_revision_unique ON offer_versions (offer_id,revision);
  CREATE INDEX offer_usage_by_offer_customer ON offer_allocations (offer_id,customer_id) WHERE state IN ('reserved','consumed');
  CREATE INDEX offer_usage_by_version_customer ON offer_allocations (offer_version_id,customer_id) WHERE state IN ('reserved','consumed');
  ALTER TABLE offers ADD CONSTRAINT offer_counter_guard CHECK (usage_revision>=0 AND usage_revision=trunc(usage_revision) AND (NOT active OR current_version_id IS NOT NULL));
  ALTER TABLE offer_versions ADD CONSTRAINT offer_version_guard CHECK (revision>=1 AND revision=trunc(revision) AND (NOT approved OR (approval_reference IS NOT NULL AND length(trim(approval_reference))>0)) AND terms->>'accountScope' IS NOT NULL AND terms->>'accountScope'='all-customers' AND terms->>'currency'='PHP' AND terms->>'limitScope' IN ('offer','version'));
  ALTER TABLE offer_allocations ADD CONSTRAINT offer_usage_state_guard CHECK ((state='reserved' AND consumed_at IS NULL AND released_at IS NULL AND release_reason IS NULL) OR (state='consumed' AND consumed_at IS NOT NULL AND released_at IS NULL AND release_reason IS NULL) OR (state='released' AND released_at IS NOT NULL AND release_reason IS NOT NULL));
  CREATE FUNCTION preserve_offer_version() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offer versions cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN RAISE EXCEPTION 'Offer versions are immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER preserve_offer_version BEFORE UPDATE OR DELETE ON offer_versions FOR EACH ROW EXECUTE FUNCTION preserve_offer_version();
  CREATE FUNCTION validate_current_offer_version() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.current_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM offer_versions v WHERE v.id=NEW.current_version_id AND v.offer_id=NEW.id AND v.approved=true) THEN RAISE EXCEPTION 'Offer pointer requires its own approved version' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER validate_current_offer_version BEFORE INSERT OR UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION validate_current_offer_version();
  CREATE FUNCTION protect_offer_usage() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE rule jsonb; parent uuid; scope text; cap_all bigint; cap_account bigint; used_all bigint; used_account bigint;
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offer usage cannot be deleted' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' THEN
      IF (to_jsonb(NEW)-'state'-'consumed_at'-'released_at'-'release_reason'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'consumed_at'-'released_at'-'release_reason'-'updated_at') OR (OLD.state='released' AND NEW.state<>'released') OR (OLD.state='consumed' AND NEW.state='reserved') OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at) OR (OLD.released_at IS NOT NULL AND (NEW.released_at IS DISTINCT FROM OLD.released_at OR NEW.release_reason IS DISTINCT FROM OLD.release_reason)) THEN RAISE EXCEPTION 'Offer usage identity and completed transitions are immutable' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END IF;
    SELECT v.terms,v.offer_id INTO rule,parent FROM offer_versions v WHERE v.id=NEW.offer_version_id;
    IF NOT FOUND OR NEW.offer_id<>parent THEN RAISE EXCEPTION 'Offer usage version mismatch' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id=NEW.booking_id AND b.owner_customer_id=NEW.customer_id) THEN RAISE EXCEPTION 'Offer usage requires the customer booker' USING ERRCODE='23514'; END IF;
    IF NEW.quote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.id=NEW.quote_id AND q.consumed_by_booking_id=NEW.booking_id AND q.issuer_customer_id=NEW.customer_id AND q.offer_version_id=NEW.offer_version_id AND q.accepted_at IS NOT NULL) THEN RAISE EXCEPTION 'Offer usage requires its accepted booking quote' USING ERRCODE='23514'; END IF;
    IF NEW.state IN ('reserved','consumed') THEN
      PERFORM 1 FROM offers WHERE id=parent FOR UPDATE;
      scope=rule->>'limitScope';cap_all=(rule->>'overallLimit')::bigint;cap_account=(rule->>'perAccountLimit')::bigint;
      IF scope IS NULL OR scope NOT IN ('offer','version') OR cap_all<1 OR cap_account<1 THEN RAISE EXCEPTION 'Invalid offer usage limits' USING ERRCODE='23514'; END IF;
      SELECT count(*),count(*) FILTER (WHERE a.customer_id=NEW.customer_id) INTO used_all,used_account FROM offer_allocations a WHERE a.state IN ('reserved','consumed') AND ((scope='offer' AND a.offer_id=parent) OR (scope='version' AND a.offer_version_id=NEW.offer_version_id));
      IF (cap_all IS NOT NULL AND used_all>=cap_all) OR (cap_account IS NOT NULL AND used_account>=cap_account) THEN RAISE EXCEPTION 'Offer usage limit reached' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_offer_usage BEFORE INSERT OR UPDATE OR DELETE ON offer_allocations FOR EACH ROW EXECUTE FUNCTION protect_offer_usage();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DO $$ BEGIN IF EXISTS (SELECT 1 FROM offer_allocations) OR EXISTS (SELECT 1 FROM quotes WHERE offer_version_id IS NOT NULL) THEN RAISE EXCEPTION 'Retained offer history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_offer_usage ON offer_allocations;
  DROP FUNCTION protect_offer_usage();
  DROP TRIGGER validate_current_offer_version ON offers;
  DROP FUNCTION validate_current_offer_version();
  DROP TRIGGER preserve_offer_version ON offer_versions;
  DROP FUNCTION preserve_offer_version();
  DROP INDEX offer_usage_by_offer_customer;
  DROP INDEX offer_usage_by_version_customer;
  ALTER TABLE offer_allocations DROP CONSTRAINT offer_usage_state_guard;
  ALTER TABLE "offers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "offer_versions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "offers" CASCADE;
  DROP TABLE "offer_versions" CASCADE;
  ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_offer_version_id_offer_versions_id_fk";

  ALTER TABLE "offer_allocations" DROP CONSTRAINT IF EXISTS "offer_allocations_offer_id_offers_id_fk";

  ALTER TABLE "offer_allocations" DROP CONSTRAINT IF EXISTS "offer_allocations_offer_version_id_offer_versions_id_fk";

  ALTER TABLE "offer_allocations" DROP CONSTRAINT IF EXISTS "offer_allocations_quote_id_quotes_id_fk";

  ALTER TABLE "offer_allocations" DROP CONSTRAINT IF EXISTS "offer_allocations_customer_id_customers_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_offers_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_offer_versions_fk";

  DROP INDEX IF EXISTS "quotes_offer_version_idx";
  DROP INDEX "offer_allocations_offer_idx";
  DROP INDEX "offer_allocations_offer_version_idx";
  DROP INDEX "offer_allocations_quote_idx";
  DROP INDEX "offer_allocations_customer_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_offers_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_offer_versions_id_idx";
  ALTER TABLE "offer_allocations" ALTER COLUMN "offer_version_id" SET DATA TYPE varchar;
  ALTER TABLE "offer_allocations" ALTER COLUMN "customer_id" SET DATA TYPE varchar;
  CREATE INDEX "offer_allocations_offer_version_id_idx" ON "offer_allocations" USING btree ("offer_version_id");
  CREATE INDEX "offer_allocations_customer_id_idx" ON "offer_allocations" USING btree ("customer_id");
  ALTER TABLE "quotes" DROP COLUMN "offer_version_id";
  ALTER TABLE "offer_allocations" DROP COLUMN "offer_id";
  ALTER TABLE "offer_allocations" DROP COLUMN "quote_id";
  ALTER TABLE "offer_allocations" DROP COLUMN "consumed_at";
  ALTER TABLE "offer_allocations" DROP COLUMN "released_at";
  ALTER TABLE "offer_allocations" DROP COLUMN "release_reason";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "offers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "offer_versions_id";
  DROP TYPE "public"."enum_offer_allocations_release_reason";`)
}
