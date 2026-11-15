import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_booking_claims_purpose" AS ENUM('booking-claim');
  CREATE TABLE "booking_claims" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "booking_id" uuid NOT NULL,
    "customer_id" uuid NOT NULL,
    "reviewer_id" uuid NOT NULL,
    "purpose" "enum_booking_claims_purpose" NOT NULL,
    "token_hash" varchar NOT NULL,
    "proof" jsonb NOT NULL,
    "policy_id" varchar NOT NULL,
    "policy_revision" numeric NOT NULL,
    "security_revision" numeric NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "used_at" timestamp(3) with time zone,
    "revoked_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "booking_views" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "booking_id" uuid NOT NULL,
    "token_hash" varchar NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "revoked_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DROP INDEX "bookings_owner_customer_id_idx";
  ALTER TABLE "bookings" ALTER COLUMN "owner_customer_id" SET DATA TYPE uuid USING "owner_customer_id"::uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "booking_claims_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "booking_views_id" uuid;
  ALTER TABLE "booking_claims" ADD CONSTRAINT "booking_claims_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "booking_claims" ADD CONSTRAINT "booking_claims_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "booking_claims" ADD CONSTRAINT "booking_claims_reviewer_id_staff_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "booking_views" ADD CONSTRAINT "booking_views_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
  CREATE INDEX "booking_claims_booking_idx" ON "booking_claims" USING btree ("booking_id");
  CREATE INDEX "booking_claims_customer_idx" ON "booking_claims" USING btree ("customer_id");
  CREATE INDEX "booking_claims_reviewer_idx" ON "booking_claims" USING btree ("reviewer_id");
  CREATE UNIQUE INDEX "booking_claims_token_hash_idx" ON "booking_claims" USING btree ("token_hash");
  CREATE INDEX "booking_claims_expires_at_idx" ON "booking_claims" USING btree ("expires_at");
  CREATE INDEX "booking_claims_updated_at_idx" ON "booking_claims" USING btree ("updated_at");
  CREATE INDEX "booking_claims_created_at_idx" ON "booking_claims" USING btree ("created_at");
  CREATE INDEX "booking_views_booking_idx" ON "booking_views" USING btree ("booking_id");
  CREATE UNIQUE INDEX "booking_views_token_hash_idx" ON "booking_views" USING btree ("token_hash");
  CREATE INDEX "booking_views_expires_at_idx" ON "booking_views" USING btree ("expires_at");
  CREATE INDEX "booking_views_updated_at_idx" ON "booking_views" USING btree ("updated_at");
  CREATE INDEX "booking_views_created_at_idx" ON "booking_views" USING btree ("created_at");
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_customer_id_customers_id_fk" FOREIGN KEY ("owner_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_claims_fk" FOREIGN KEY ("booking_claims_id") REFERENCES "public"."booking_claims"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_views_fk" FOREIGN KEY ("booking_views_id") REFERENCES "public"."booking_views"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "bookings_owner_customer_idx" ON "bookings" USING btree ("owner_customer_id");
  CREATE INDEX "payload_locked_documents_rels_booking_claims_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_claims_id");
  CREATE INDEX "payload_locked_documents_rels_booking_views_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_views_id");
  CREATE INDEX bookings_customer_arrival_id_idx ON bookings (owner_customer_id, arrival DESC, id DESC);
  CREATE FUNCTION preserve_booking_owner() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.owner_customer_id IS NOT NULL AND NEW.owner_customer_id IS DISTINCT FROM OLD.owner_customer_id THEN
      RAISE EXCEPTION 'Booking ownership is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER preserve_booking_owner BEFORE UPDATE OF owner_customer_id ON bookings FOR EACH ROW EXECUTE FUNCTION preserve_booking_owner();
  ALTER TABLE booking_claims ADD CONSTRAINT booking_claims_digest_shape CHECK (token_hash ~ '^[a-f0-9]{64}$');
  ALTER TABLE booking_views ADD CONSTRAINT booking_views_digest_shape CHECK (token_hash ~ '^[a-f0-9]{64}$');`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TRIGGER preserve_booking_owner ON bookings;
  DROP FUNCTION preserve_booking_owner();
  DROP INDEX bookings_customer_arrival_id_idx;
  ALTER TABLE "booking_claims" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "booking_views" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "booking_claims" CASCADE;
  DROP TABLE "booking_views" CASCADE;
  ALTER TABLE "bookings" DROP CONSTRAINT "bookings_owner_customer_id_customers_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_booking_claims_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_booking_views_fk";

  DROP INDEX "bookings_owner_customer_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_booking_claims_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_booking_views_id_idx";
  ALTER TABLE "bookings" ALTER COLUMN "owner_customer_id" SET DATA TYPE varchar;
  CREATE INDEX "bookings_owner_customer_id_idx" ON "bookings" USING btree ("owner_customer_id");
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "booking_claims_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "booking_views_id";
  DROP TYPE "public"."enum_booking_claims_purpose";`)
}
