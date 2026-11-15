import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_room_blocks_state" AS ENUM('active', 'released');
  CREATE TABLE "room_blocks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "room_id" uuid NOT NULL,
    "allocation_id" uuid NOT NULL,
    "arrival" timestamp(3) with time zone NOT NULL,
    "departure" timestamp(3) with time zone NOT NULL,
    "reason" varchar NOT NULL,
    "state" "enum_room_blocks_state" DEFAULT 'active' NOT NULL,
    "released_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "room_types" ADD COLUMN "on_sale" boolean DEFAULT false;
  ALTER TABLE "_room_types_v" ADD COLUMN "version_on_sale" boolean DEFAULT false;
  ALTER TABLE "rooms" ADD COLUMN "room_type_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "room_blocks_id" uuid;
  ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE restrict ON UPDATE no action;
  CREATE INDEX "room_blocks_room_idx" ON "room_blocks" USING btree ("room_id");
  CREATE UNIQUE INDEX "room_blocks_allocation_idx" ON "room_blocks" USING btree ("allocation_id");
  CREATE INDEX "room_blocks_updated_at_idx" ON "room_blocks" USING btree ("updated_at");
  CREATE INDEX "room_blocks_created_at_idx" ON "room_blocks" USING btree ("created_at");
  ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_room_blocks_fk" FOREIGN KEY ("room_blocks_id") REFERENCES "public"."room_blocks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "rooms_room_type_idx" ON "rooms" USING btree ("room_type_id");
  CREATE INDEX "payload_locked_documents_rels_room_blocks_id_idx" ON "payload_locked_documents_rels" USING btree ("room_blocks_id");
  CREATE INDEX allocations_active_room_dates_idx ON allocations (room_id, arrival, departure) WHERE released=false;
  CREATE INDEX rooms_sale_type_idx ON rooms (room_type_id, id) WHERE on_sale=true;
  CREATE FUNCTION preserve_allocation_history() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Allocation history cannot be deleted' USING ERRCODE='23514'; END IF;
    IF NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.arrival IS DISTINCT FROM OLD.arrival OR NEW.departure IS DISTINCT FROM OLD.departure OR (OLD.released AND NOT NEW.released) OR (NEW.purpose<>OLD.purpose AND NOT (OLD.purpose='hold' AND NEW.purpose='booking' AND NOT OLD.released)) THEN
      RAISE EXCEPTION 'Allocation assignment is immutable; use an approved transition' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER preserve_allocation_history BEFORE UPDATE OR DELETE ON allocations FOR EACH ROW EXECUTE FUNCTION preserve_allocation_history();
  CREATE FUNCTION validate_room_block_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='UPDATE' AND (NEW.allocation_id<>OLD.allocation_id OR NEW.room_id<>OLD.room_id OR NEW.arrival<>OLD.arrival OR NEW.departure<>OLD.departure OR (OLD.state='released' AND NEW.state<>'released')) THEN
      RAISE EXCEPTION 'Room block assignment is immutable' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM allocations a WHERE a.id=NEW.allocation_id AND a.room_id=NEW.room_id AND a.arrival=NEW.arrival AND a.departure=NEW.departure AND a.purpose='block' AND a.released=(NEW.state='released')) THEN
      RAISE EXCEPTION 'Room block does not match its allocation' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER validate_room_block_allocation BEFORE INSERT OR UPDATE ON room_blocks FOR EACH ROW EXECUTE FUNCTION validate_room_block_allocation();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TRIGGER validate_room_block_allocation ON room_blocks;
  DROP FUNCTION validate_room_block_allocation();
  DROP TRIGGER preserve_allocation_history ON allocations;
  DROP FUNCTION preserve_allocation_history();
  DROP INDEX allocations_active_room_dates_idx;
  DROP INDEX rooms_sale_type_idx;
  ALTER TABLE "room_blocks" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "room_blocks" CASCADE;
  ALTER TABLE "rooms" DROP CONSTRAINT "rooms_room_type_id_room_types_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_room_blocks_fk";

  DROP INDEX "rooms_room_type_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_room_blocks_id_idx";
  ALTER TABLE "room_types" DROP COLUMN "on_sale";
  ALTER TABLE "_room_types_v" DROP COLUMN "version_on_sale";
  ALTER TABLE "rooms" DROP COLUMN "room_type_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "room_blocks_id";
  DROP TYPE "public"."enum_room_blocks_state";`)
}
