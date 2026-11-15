import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_auth_tokens_purpose" AS ENUM('verify', 'reset');
  CREATE TYPE "public"."enum_auth_deliveries_purpose" AS ENUM('verify', 'reset');
  CREATE TYPE "public"."enum_auth_deliveries_state" AS ENUM('pending', 'delivered', 'failed', 'cancelled');
  CREATE TABLE "auth_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "token_hash" varchar NOT NULL,
    "purpose" "enum_auth_tokens_purpose" NOT NULL,
    "account_id" uuid NOT NULL,
    "email_hash" varchar NOT NULL,
    "security_revision" numeric NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "used_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "auth_deliveries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "purpose" "enum_auth_deliveries_purpose" NOT NULL,
    "account_id" uuid NOT NULL,
    "token_ref_id" uuid NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "encrypted_state" varchar NOT NULL,
    "state" "enum_auth_deliveries_state" DEFAULT 'pending' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "auth_throttles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "key" varchar NOT NULL,
    "count" numeric NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "customers" ADD COLUMN "security_revision" numeric DEFAULT 1 NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "auth_tokens_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "auth_deliveries_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "auth_throttles_id" uuid;
  ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_account_id_customers_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "auth_deliveries" ADD CONSTRAINT "auth_deliveries_account_id_customers_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "auth_deliveries" ADD CONSTRAINT "auth_deliveries_token_ref_id_auth_tokens_id_fk" FOREIGN KEY ("token_ref_id") REFERENCES "public"."auth_tokens"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "auth_tokens_token_hash_idx" ON "auth_tokens" USING btree ("token_hash");
  CREATE INDEX "auth_tokens_account_idx" ON "auth_tokens" USING btree ("account_id");
  CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens" USING btree ("expires_at");
  CREATE INDEX "auth_tokens_updated_at_idx" ON "auth_tokens" USING btree ("updated_at");
  CREATE INDEX "auth_tokens_created_at_idx" ON "auth_tokens" USING btree ("created_at");
  CREATE INDEX "auth_deliveries_account_idx" ON "auth_deliveries" USING btree ("account_id");
  CREATE INDEX "auth_deliveries_token_ref_idx" ON "auth_deliveries" USING btree ("token_ref_id");
  CREATE INDEX "auth_deliveries_updated_at_idx" ON "auth_deliveries" USING btree ("updated_at");
  CREATE INDEX "auth_deliveries_created_at_idx" ON "auth_deliveries" USING btree ("created_at");
  CREATE UNIQUE INDEX "auth_throttles_key_idx" ON "auth_throttles" USING btree ("key");
  CREATE INDEX "auth_throttles_expires_at_idx" ON "auth_throttles" USING btree ("expires_at");
  CREATE INDEX "auth_throttles_updated_at_idx" ON "auth_throttles" USING btree ("updated_at");
  CREATE INDEX "auth_throttles_created_at_idx" ON "auth_throttles" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_auth_tokens_fk" FOREIGN KEY ("auth_tokens_id") REFERENCES "public"."auth_tokens"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_auth_deliveries_fk" FOREIGN KEY ("auth_deliveries_id") REFERENCES "public"."auth_deliveries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_auth_throttles_fk" FOREIGN KEY ("auth_throttles_id") REFERENCES "public"."auth_throttles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_auth_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("auth_tokens_id");
  CREATE INDEX "payload_locked_documents_rels_auth_deliveries_id_idx" ON "payload_locked_documents_rels" USING btree ("auth_deliveries_id");
  CREATE INDEX "payload_locked_documents_rels_auth_throttles_id_idx" ON "payload_locked_documents_rels" USING btree ("auth_throttles_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "auth_tokens" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "auth_deliveries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "auth_throttles" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "auth_tokens" CASCADE;
  DROP TABLE "auth_deliveries" CASCADE;
  DROP TABLE "auth_throttles" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_auth_tokens_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_auth_deliveries_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_auth_throttles_fk";

  DROP INDEX "payload_locked_documents_rels_auth_tokens_id_idx";
  DROP INDEX "payload_locked_documents_rels_auth_deliveries_id_idx";
  DROP INDEX "payload_locked_documents_rels_auth_throttles_id_idx";
  ALTER TABLE "customers" DROP COLUMN "security_revision";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "auth_tokens_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "auth_deliveries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "auth_throttles_id";
  DROP TYPE "public"."enum_auth_tokens_purpose";
  DROP TYPE "public"."enum_auth_deliveries_purpose";
  DROP TYPE "public"."enum_auth_deliveries_state";`)
}
