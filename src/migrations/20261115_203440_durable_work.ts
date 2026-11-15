import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_work_items_kind" ADD VALUE 'reconcile-refund' BEFORE 'expire-hold';
  ALTER TABLE "work_items" ADD COLUMN "fingerprint" varchar;
  ALTER TABLE "work_items" ADD COLUMN "dispatch_started" timestamp(3) with time zone;
  CREATE INDEX work_ready_by_kind ON work_items (kind,available_at,id) WHERE state='ready';
  CREATE INDEX work_expired_leases_by_kind ON work_items (kind,lease_expires,id) WHERE state='leased';
  ALTER TABLE work_items ADD CONSTRAINT work_counter_guard CHECK (generation BETWEEN 0 AND 9007199254740991 AND generation=trunc(generation) AND attempts BETWEEN 0 AND 9007199254740991 AND attempts=trunc(attempts));
  ALTER TABLE work_items ADD CONSTRAINT work_lease_guard CHECK ((state='leased' AND lease_owner IS NOT NULL AND lease_owner ~ '^[a-f0-9]{64}$' AND lease_expires IS NOT NULL) OR (state<>'leased' AND lease_owner IS NULL AND lease_expires IS NULL));
  ALTER TABLE work_items ADD CONSTRAINT work_fingerprint_guard CHECK (fingerprint IS NULL OR fingerprint ~ '^[a-f0-9]{64}$');
  CREATE FUNCTION protect_work_intent() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Work history cannot be deleted' USING ERRCODE='23514'; END IF;
    IF (NEW.semantic_key,NEW.kind,NEW.payload,NEW.created_at) IS DISTINCT FROM (OLD.semantic_key,OLD.kind,OLD.payload,OLD.created_at) OR (OLD.fingerprint IS NOT NULL AND NEW.fingerprint IS DISTINCT FROM OLD.fingerprint) THEN RAISE EXCEPTION 'Work intent is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.generation<OLD.generation OR (NEW.lease_owner IS DISTINCT FROM OLD.lease_owner AND NEW.lease_owner IS NOT NULL AND NEW.generation<=OLD.generation) THEN RAISE EXCEPTION 'Work generation must advance on takeover' USING ERRCODE='23514'; END IF;
    IF OLD.state='done' AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN RAISE EXCEPTION 'Completed work is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state='uncertain' AND OLD.kind IN ('create-checkout','refund','email','enquiry') AND NEW.state IN ('ready','leased') THEN RAISE EXCEPTION 'Dispatched work requires outcome reconciliation' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_work_intent BEFORE UPDATE OR DELETE ON work_items FOR EACH ROW EXECUTE FUNCTION protect_work_intent();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`

  DO $$ BEGIN IF EXISTS (SELECT 1 FROM work_items WHERE generation>0 OR dispatch_started IS NOT NULL OR kind::text='reconcile-refund') THEN RAISE EXCEPTION 'Managed work history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER protect_work_intent ON work_items;
  DROP FUNCTION protect_work_intent();
  DROP INDEX work_ready_by_kind;
  DROP INDEX work_expired_leases_by_kind;
  ALTER TABLE work_items DROP CONSTRAINT work_counter_guard;
  ALTER TABLE work_items DROP CONSTRAINT work_lease_guard;
  ALTER TABLE work_items DROP CONSTRAINT work_fingerprint_guard;
  ALTER TABLE "work_items" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_work_items_kind";
  CREATE TYPE "public"."enum_work_items_kind" AS ENUM('create-checkout', 'reconcile-payment', 'expire-hold', 'email', 'refund', 'enquiry');
  ALTER TABLE "work_items" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_work_items_kind" USING "kind"::"public"."enum_work_items_kind";
  ALTER TABLE "work_items" DROP COLUMN "fingerprint";
  ALTER TABLE "work_items" DROP COLUMN "dispatch_started";`)
}
