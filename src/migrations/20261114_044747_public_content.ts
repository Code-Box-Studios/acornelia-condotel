import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_room_types_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__room_types_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_media_access_class" AS ENUM('private', 'public');
  CREATE TYPE "public"."enum_media_status" AS ENUM('uploading', 'ready', 'deleting', 'failed');
  CREATE TYPE "public"."enum_property_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__property_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_site_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__site_pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_policies_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__policies_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "room_types_amenities" (
    "_order" integer NOT NULL,
    "_parent_id" uuid NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "label" varchar
  );

  CREATE TABLE "room_types_gallery" (
    "_order" integer NOT NULL,
    "_parent_id" uuid NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "image_id" uuid
  );

  CREATE TABLE "room_types" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar,
    "slug" varchar,
    "description" varchar,
    "max_guests" numeric,
    "bed_description" varchar,
    "sort_order" numeric DEFAULT 0,
    "synthetic" boolean DEFAULT false,
    "private_notes" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_room_types_status" DEFAULT 'draft'
  );

  CREATE TABLE "_room_types_v_version_amenities" (
    "_order" integer NOT NULL,
    "_parent_id" uuid NOT NULL,
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "label" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_room_types_v_version_gallery" (
    "_order" integer NOT NULL,
    "_parent_id" uuid NOT NULL,
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "image_id" uuid,
    "_uuid" varchar
  );

  CREATE TABLE "_room_types_v" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "parent_id" uuid,
    "version_name" varchar,
    "version_slug" varchar,
    "version_description" varchar,
    "version_max_guests" numeric,
    "version_bed_description" varchar,
    "version_sort_order" numeric DEFAULT 0,
    "version_synthetic" boolean DEFAULT false,
    "version_private_notes" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__room_types_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  CREATE TABLE "media" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "alt" varchar NOT NULL,
    "source" varchar NOT NULL,
    "license" varchar NOT NULL,
    "access_class" "enum_media_access_class" DEFAULT 'private' NOT NULL,
    "status" "enum_media_status" DEFAULT 'uploading' NOT NULL,
    "synthetic" boolean DEFAULT false,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "url" varchar,
    "thumbnail_u_r_l" varchar,
    "filename" varchar,
    "mime_type" varchar,
    "filesize" numeric,
    "width" numeric,
    "height" numeric,
    "focal_x" numeric,
    "focal_y" numeric,
    "sizes_thumbnail_url" varchar,
    "sizes_thumbnail_width" numeric,
    "sizes_thumbnail_height" numeric,
    "sizes_thumbnail_mime_type" varchar,
    "sizes_thumbnail_filesize" numeric,
    "sizes_thumbnail_filename" varchar
  );

  CREATE TABLE "property" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" varchar,
    "tagline" varchar,
    "description" varchar,
    "hero_id" uuid,
    "address" varchar,
    "email" varchar,
    "phone" varchar,
    "map_url" varchar,
    "synthetic" boolean DEFAULT false,
    "private_notes" varchar,
    "_status" "enum_property_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_property_v" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "version_name" varchar,
    "version_tagline" varchar,
    "version_description" varchar,
    "version_hero_id" uuid,
    "version_address" varchar,
    "version_email" varchar,
    "version_phone" varchar,
    "version_map_url" varchar,
    "version_synthetic" boolean DEFAULT false,
    "version_private_notes" varchar,
    "version__status" "enum__property_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  CREATE TABLE "site_pages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "about" varchar,
    "contact" varchar,
    "_status" "enum_site_pages_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_site_pages_v" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "version_about" varchar,
    "version_contact" varchar,
    "version__status" "enum__site_pages_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  CREATE TABLE "policies" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "house_rules" varchar,
    "cancellation" varchar,
    "privacy" varchar,
    "_status" "enum_policies_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_policies_v" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "version_house_rules" varchar,
    "version_cancellation" varchar,
    "version_privacy" varchar,
    "version__status" "enum__policies_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "room_types_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_id" uuid;
  ALTER TABLE "room_types_amenities" ADD CONSTRAINT "room_types_amenities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "room_types_gallery" ADD CONSTRAINT "room_types_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "room_types_gallery" ADD CONSTRAINT "room_types_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_room_types_v_version_amenities" ADD CONSTRAINT "_room_types_v_version_amenities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_room_types_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_room_types_v_version_gallery" ADD CONSTRAINT "_room_types_v_version_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_room_types_v_version_gallery" ADD CONSTRAINT "_room_types_v_version_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_room_types_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_room_types_v" ADD CONSTRAINT "_room_types_v_parent_id_room_types_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."room_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "property" ADD CONSTRAINT "property_hero_id_media_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_property_v" ADD CONSTRAINT "_property_v_version_hero_id_media_id_fk" FOREIGN KEY ("version_hero_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "room_types_amenities_order_idx" ON "room_types_amenities" USING btree ("_order");
  CREATE INDEX "room_types_amenities_parent_id_idx" ON "room_types_amenities" USING btree ("_parent_id");
  CREATE INDEX "room_types_gallery_order_idx" ON "room_types_gallery" USING btree ("_order");
  CREATE INDEX "room_types_gallery_parent_id_idx" ON "room_types_gallery" USING btree ("_parent_id");
  CREATE INDEX "room_types_gallery_image_idx" ON "room_types_gallery" USING btree ("image_id");
  CREATE UNIQUE INDEX "room_types_slug_idx" ON "room_types" USING btree ("slug");
  CREATE INDEX "room_types_updated_at_idx" ON "room_types" USING btree ("updated_at");
  CREATE INDEX "room_types_created_at_idx" ON "room_types" USING btree ("created_at");
  CREATE INDEX "room_types__status_idx" ON "room_types" USING btree ("_status");
  CREATE INDEX "_room_types_v_version_amenities_order_idx" ON "_room_types_v_version_amenities" USING btree ("_order");
  CREATE INDEX "_room_types_v_version_amenities_parent_id_idx" ON "_room_types_v_version_amenities" USING btree ("_parent_id");
  CREATE INDEX "_room_types_v_version_gallery_order_idx" ON "_room_types_v_version_gallery" USING btree ("_order");
  CREATE INDEX "_room_types_v_version_gallery_parent_id_idx" ON "_room_types_v_version_gallery" USING btree ("_parent_id");
  CREATE INDEX "_room_types_v_version_gallery_image_idx" ON "_room_types_v_version_gallery" USING btree ("image_id");
  CREATE INDEX "_room_types_v_parent_idx" ON "_room_types_v" USING btree ("parent_id");
  CREATE INDEX "_room_types_v_version_version_slug_idx" ON "_room_types_v" USING btree ("version_slug");
  CREATE INDEX "_room_types_v_version_version_updated_at_idx" ON "_room_types_v" USING btree ("version_updated_at");
  CREATE INDEX "_room_types_v_version_version_created_at_idx" ON "_room_types_v" USING btree ("version_created_at");
  CREATE INDEX "_room_types_v_version_version__status_idx" ON "_room_types_v" USING btree ("version__status");
  CREATE INDEX "_room_types_v_created_at_idx" ON "_room_types_v" USING btree ("created_at");
  CREATE INDEX "_room_types_v_updated_at_idx" ON "_room_types_v" USING btree ("updated_at");
  CREATE INDEX "_room_types_v_latest_idx" ON "_room_types_v" USING btree ("latest");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "property_hero_idx" ON "property" USING btree ("hero_id");
  CREATE INDEX "property__status_idx" ON "property" USING btree ("_status");
  CREATE INDEX "_property_v_version_version_hero_idx" ON "_property_v" USING btree ("version_hero_id");
  CREATE INDEX "_property_v_version_version__status_idx" ON "_property_v" USING btree ("version__status");
  CREATE INDEX "_property_v_created_at_idx" ON "_property_v" USING btree ("created_at");
  CREATE INDEX "_property_v_updated_at_idx" ON "_property_v" USING btree ("updated_at");
  CREATE INDEX "_property_v_latest_idx" ON "_property_v" USING btree ("latest");
  CREATE INDEX "site_pages__status_idx" ON "site_pages" USING btree ("_status");
  CREATE INDEX "_site_pages_v_version_version__status_idx" ON "_site_pages_v" USING btree ("version__status");
  CREATE INDEX "_site_pages_v_created_at_idx" ON "_site_pages_v" USING btree ("created_at");
  CREATE INDEX "_site_pages_v_updated_at_idx" ON "_site_pages_v" USING btree ("updated_at");
  CREATE INDEX "_site_pages_v_latest_idx" ON "_site_pages_v" USING btree ("latest");
  CREATE INDEX "policies__status_idx" ON "policies" USING btree ("_status");
  CREATE INDEX "_policies_v_version_version__status_idx" ON "_policies_v" USING btree ("version__status");
  CREATE INDEX "_policies_v_created_at_idx" ON "_policies_v" USING btree ("created_at");
  CREATE INDEX "_policies_v_updated_at_idx" ON "_policies_v" USING btree ("updated_at");
  CREATE INDEX "_policies_v_latest_idx" ON "_policies_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_room_types_fk" FOREIGN KEY ("room_types_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_room_types_id_idx" ON "payload_locked_documents_rels" USING btree ("room_types_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "room_types_amenities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "room_types_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "room_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_room_types_v_version_amenities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_room_types_v_version_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_room_types_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "property" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_property_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_site_pages_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "policies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_policies_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "room_types_amenities" CASCADE;
  DROP TABLE "room_types_gallery" CASCADE;
  DROP TABLE "room_types" CASCADE;
  DROP TABLE "_room_types_v_version_amenities" CASCADE;
  DROP TABLE "_room_types_v_version_gallery" CASCADE;
  DROP TABLE "_room_types_v" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "property" CASCADE;
  DROP TABLE "_property_v" CASCADE;
  DROP TABLE "site_pages" CASCADE;
  DROP TABLE "_site_pages_v" CASCADE;
  DROP TABLE "policies" CASCADE;
  DROP TABLE "_policies_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_room_types_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_fk";

  DROP INDEX "payload_locked_documents_rels_room_types_id_idx";
  DROP INDEX "payload_locked_documents_rels_media_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "room_types_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_id";
  DROP TYPE "public"."enum_room_types_status";
  DROP TYPE "public"."enum__room_types_v_version_status";
  DROP TYPE "public"."enum_media_access_class";
  DROP TYPE "public"."enum_media_status";
  DROP TYPE "public"."enum_property_status";
  DROP TYPE "public"."enum__property_v_version_status";
  DROP TYPE "public"."enum_site_pages_status";
  DROP TYPE "public"."enum__site_pages_v_version_status";
  DROP TYPE "public"."enum_policies_status";
  DROP TYPE "public"."enum__policies_v_version_status";`)
}
