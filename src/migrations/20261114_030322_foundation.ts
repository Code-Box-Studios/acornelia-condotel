import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_staff_users_role" AS ENUM('staff', 'developer');
  CREATE TYPE "public"."enum_bookings_status" AS ENUM('held', 'confirmed', 'cancelled', 'completed', 'expired');
  CREATE TYPE "public"."enum_bookings_source" AS ENUM('website', 'phone', 'walk-in');
  CREATE TYPE "public"."enum_allocations_purpose" AS ENUM('hold', 'booking', 'block');
  CREATE TYPE "public"."enum_offer_allocations_state" AS ENUM('reserved', 'consumed', 'released');
  CREATE TYPE "public"."enum_payment_attempts_purpose" AS ENUM('booking', 'change');
  CREATE TYPE "public"."enum_payment_attempts_state" AS ENUM('preparing', 'ready', 'unknown', 'pending', 'succeeded', 'closed');
  CREATE TYPE "public"."enum_payment_transactions_environment" AS ENUM('sandbox', 'production', 'offline');
  CREATE TYPE "public"."enum_payment_transactions_status" AS ENUM('pending', 'authorized', 'collected', 'failed', 'voided');
  CREATE TYPE "public"."enum_work_items_kind" AS ENUM('create-checkout', 'reconcile-payment', 'expire-hold', 'email', 'refund', 'enquiry');
  CREATE TYPE "public"."enum_work_items_state" AS ENUM('ready', 'leased', 'done', 'uncertain', 'failed');
  CREATE TABLE "staff_users_sessions" (
    "_order" integer NOT NULL,
    "_parent_id" uuid NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "created_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "staff_users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar NOT NULL,
    "role" "enum_staff_users_role" DEFAULT 'staff' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "email" varchar NOT NULL,
    "reset_password_token" varchar,
    "reset_password_expiration" timestamp(3) with time zone,
    "salt" varchar,
    "hash" varchar,
    "reset_password_requested_at" timestamp(3) with time zone,
    "login_attempts" numeric DEFAULT 0,
    "lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "rooms" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "label" varchar NOT NULL,
    "on_sale" boolean DEFAULT false,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "bookings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "code" varchar,
    "owner_customer_id" varchar,
    "status" "enum_bookings_status" DEFAULT 'held' NOT NULL,
    "revision" numeric DEFAULT 1 NOT NULL,
    "arrival" timestamp(3) with time zone NOT NULL,
    "departure" timestamp(3) with time zone NOT NULL,
    "accepted_quote" jsonb NOT NULL,
    "contact" jsonb NOT NULL,
    "staying_guest" varchar,
    "source" "enum_bookings_source" DEFAULT 'website' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "allocations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "room_id" uuid NOT NULL,
    "booking_id" uuid,
    "arrival" timestamp(3) with time zone NOT NULL,
    "departure" timestamp(3) with time zone NOT NULL,
    "purpose" "enum_allocations_purpose" DEFAULT 'hold' NOT NULL,
    "released" boolean DEFAULT false NOT NULL,
    "deadline" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "offer_allocations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "offer_version_id" varchar NOT NULL,
    "booking_id" uuid NOT NULL,
    "allocation_key" varchar NOT NULL,
    "state" "enum_offer_allocations_state" DEFAULT 'reserved' NOT NULL,
    "customer_id" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payment_attempts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "booking_id" uuid NOT NULL,
    "merchant_reference" varchar NOT NULL,
    "command_key" varchar NOT NULL,
    "fingerprint" varchar NOT NULL,
    "amount_minor" varchar NOT NULL,
    "currency" varchar NOT NULL,
    "accepted_context" jsonb NOT NULL,
    "purpose" "enum_payment_attempts_purpose" DEFAULT 'booking' NOT NULL,
    "revision" numeric NOT NULL,
    "state" "enum_payment_attempts_state" DEFAULT 'preparing' NOT NULL,
    "deadline" timestamp(3) with time zone NOT NULL,
    "checkout_url" varchar,
    "provider_checkout_id" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payment_transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "provider_payment_id" varchar NOT NULL,
    "merchant_reference" varchar NOT NULL,
    "booking_id" uuid,
    "attempt_id" uuid,
    "environment" "enum_payment_transactions_environment" NOT NULL,
    "amount_minor" varchar NOT NULL,
    "currency" varchar NOT NULL,
    "status" "enum_payment_transactions_status" DEFAULT 'pending' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "audit_entries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "actor" jsonb NOT NULL,
    "action" varchar NOT NULL,
    "record_type" varchar NOT NULL,
    "record_id" varchar,
    "outcome" varchar NOT NULL,
    "safe_changes" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "work_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "semantic_key" varchar NOT NULL,
    "kind" "enum_work_items_kind" NOT NULL,
    "payload" jsonb NOT NULL,
    "state" "enum_work_items_state" DEFAULT 'ready' NOT NULL,
    "generation" numeric DEFAULT 0 NOT NULL,
    "attempts" numeric DEFAULT 0 NOT NULL,
    "lease_owner" varchar,
    "lease_expires" timestamp(3) with time zone,
    "available_at" timestamp(3) with time zone NOT NULL,
    "last_error" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_kv" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "key" varchar NOT NULL,
    "data" jsonb NOT NULL
  );

  CREATE TABLE "payload_locked_documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "global_slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_locked_documents_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" uuid NOT NULL,
    "path" varchar NOT NULL,
    "staff_users_id" uuid,
    "rooms_id" uuid,
    "bookings_id" uuid,
    "allocations_id" uuid,
    "offer_allocations_id" uuid,
    "payment_attempts_id" uuid,
    "payment_transactions_id" uuid,
    "audit_entries_id" uuid,
    "work_items_id" uuid
  );

  CREATE TABLE "payload_preferences" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "key" varchar,
    "value" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_preferences_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" uuid NOT NULL,
    "path" varchar NOT NULL,
    "staff_users_id" uuid
  );

  CREATE TABLE "payload_migrations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar,
    "batch" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "staff_users_sessions" ADD CONSTRAINT "staff_users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "allocations" ADD CONSTRAINT "allocations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "allocations" ADD CONSTRAINT "allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "offer_allocations" ADD CONSTRAINT "offer_allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_staff_users_fk" FOREIGN KEY ("staff_users_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rooms_fk" FOREIGN KEY ("rooms_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bookings_fk" FOREIGN KEY ("bookings_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_allocations_fk" FOREIGN KEY ("allocations_id") REFERENCES "public"."allocations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_offer_allocations_fk" FOREIGN KEY ("offer_allocations_id") REFERENCES "public"."offer_allocations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_attempts_fk" FOREIGN KEY ("payment_attempts_id") REFERENCES "public"."payment_attempts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payment_transactions_fk" FOREIGN KEY ("payment_transactions_id") REFERENCES "public"."payment_transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_entries_fk" FOREIGN KEY ("audit_entries_id") REFERENCES "public"."audit_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_work_items_fk" FOREIGN KEY ("work_items_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_staff_users_fk" FOREIGN KEY ("staff_users_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "staff_users_sessions_order_idx" ON "staff_users_sessions" USING btree ("_order");
  CREATE INDEX "staff_users_sessions_parent_id_idx" ON "staff_users_sessions" USING btree ("_parent_id");
  CREATE INDEX "staff_users_updated_at_idx" ON "staff_users" USING btree ("updated_at");
  CREATE INDEX "staff_users_created_at_idx" ON "staff_users" USING btree ("created_at");
  CREATE UNIQUE INDEX "staff_users_email_idx" ON "staff_users" USING btree ("email");
  CREATE UNIQUE INDEX "rooms_label_idx" ON "rooms" USING btree ("label");
  CREATE INDEX "rooms_updated_at_idx" ON "rooms" USING btree ("updated_at");
  CREATE INDEX "rooms_created_at_idx" ON "rooms" USING btree ("created_at");
  CREATE UNIQUE INDEX "bookings_code_idx" ON "bookings" USING btree ("code");
  CREATE INDEX "bookings_owner_customer_id_idx" ON "bookings" USING btree ("owner_customer_id");
  CREATE INDEX "bookings_updated_at_idx" ON "bookings" USING btree ("updated_at");
  CREATE INDEX "bookings_created_at_idx" ON "bookings" USING btree ("created_at");
  CREATE INDEX "allocations_room_idx" ON "allocations" USING btree ("room_id");
  CREATE INDEX "allocations_booking_idx" ON "allocations" USING btree ("booking_id");
  CREATE INDEX "allocations_released_idx" ON "allocations" USING btree ("released");
  CREATE INDEX "allocations_updated_at_idx" ON "allocations" USING btree ("updated_at");
  CREATE INDEX "allocations_created_at_idx" ON "allocations" USING btree ("created_at");
  CREATE INDEX "offer_allocations_offer_version_id_idx" ON "offer_allocations" USING btree ("offer_version_id");
  CREATE INDEX "offer_allocations_booking_idx" ON "offer_allocations" USING btree ("booking_id");
  CREATE UNIQUE INDEX "offer_allocations_allocation_key_idx" ON "offer_allocations" USING btree ("allocation_key");
  CREATE INDEX "offer_allocations_customer_id_idx" ON "offer_allocations" USING btree ("customer_id");
  CREATE INDEX "offer_allocations_updated_at_idx" ON "offer_allocations" USING btree ("updated_at");
  CREATE INDEX "offer_allocations_created_at_idx" ON "offer_allocations" USING btree ("created_at");
  CREATE INDEX "payment_attempts_booking_idx" ON "payment_attempts" USING btree ("booking_id");
  CREATE UNIQUE INDEX "payment_attempts_merchant_reference_idx" ON "payment_attempts" USING btree ("merchant_reference");
  CREATE UNIQUE INDEX "payment_attempts_command_key_idx" ON "payment_attempts" USING btree ("command_key");
  CREATE INDEX "payment_attempts_updated_at_idx" ON "payment_attempts" USING btree ("updated_at");
  CREATE INDEX "payment_attempts_created_at_idx" ON "payment_attempts" USING btree ("created_at");
  CREATE UNIQUE INDEX "payment_transactions_provider_payment_id_idx" ON "payment_transactions" USING btree ("provider_payment_id");
  CREATE INDEX "payment_transactions_merchant_reference_idx" ON "payment_transactions" USING btree ("merchant_reference");
  CREATE INDEX "payment_transactions_booking_idx" ON "payment_transactions" USING btree ("booking_id");
  CREATE INDEX "payment_transactions_attempt_idx" ON "payment_transactions" USING btree ("attempt_id");
  CREATE INDEX "payment_transactions_updated_at_idx" ON "payment_transactions" USING btree ("updated_at");
  CREATE INDEX "payment_transactions_created_at_idx" ON "payment_transactions" USING btree ("created_at");
  CREATE INDEX "audit_entries_updated_at_idx" ON "audit_entries" USING btree ("updated_at");
  CREATE INDEX "audit_entries_created_at_idx" ON "audit_entries" USING btree ("created_at");
  CREATE UNIQUE INDEX "work_items_semantic_key_idx" ON "work_items" USING btree ("semantic_key");
  CREATE INDEX "work_items_updated_at_idx" ON "work_items" USING btree ("updated_at");
  CREATE INDEX "work_items_created_at_idx" ON "work_items" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_staff_users_id_idx" ON "payload_locked_documents_rels" USING btree ("staff_users_id");
  CREATE INDEX "payload_locked_documents_rels_rooms_id_idx" ON "payload_locked_documents_rels" USING btree ("rooms_id");
  CREATE INDEX "payload_locked_documents_rels_bookings_id_idx" ON "payload_locked_documents_rels" USING btree ("bookings_id");
  CREATE INDEX "payload_locked_documents_rels_allocations_id_idx" ON "payload_locked_documents_rels" USING btree ("allocations_id");
  CREATE INDEX "payload_locked_documents_rels_offer_allocations_id_idx" ON "payload_locked_documents_rels" USING btree ("offer_allocations_id");
  CREATE INDEX "payload_locked_documents_rels_payment_attempts_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_attempts_id");
  CREATE INDEX "payload_locked_documents_rels_payment_transactions_id_idx" ON "payload_locked_documents_rels" USING btree ("payment_transactions_id");
  CREATE INDEX "payload_locked_documents_rels_audit_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_entries_id");
  CREATE INDEX "payload_locked_documents_rels_work_items_id_idx" ON "payload_locked_documents_rels" USING btree ("work_items_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_staff_users_id_idx" ON "payload_preferences_rels" USING btree ("staff_users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "staff_users_sessions" CASCADE;
  DROP TABLE "staff_users" CASCADE;
  DROP TABLE "rooms" CASCADE;
  DROP TABLE "bookings" CASCADE;
  DROP TABLE "allocations" CASCADE;
  DROP TABLE "offer_allocations" CASCADE;
  DROP TABLE "payment_attempts" CASCADE;
  DROP TABLE "payment_transactions" CASCADE;
  DROP TABLE "audit_entries" CASCADE;
  DROP TABLE "work_items" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_staff_users_role";
  DROP TYPE "public"."enum_bookings_status";
  DROP TYPE "public"."enum_bookings_source";
  DROP TYPE "public"."enum_allocations_purpose";
  DROP TYPE "public"."enum_offer_allocations_state";
  DROP TYPE "public"."enum_payment_attempts_purpose";
  DROP TYPE "public"."enum_payment_attempts_state";
  DROP TYPE "public"."enum_payment_transactions_environment";
  DROP TYPE "public"."enum_payment_transactions_status";
  DROP TYPE "public"."enum_work_items_kind";
  DROP TYPE "public"."enum_work_items_state";`)
}
