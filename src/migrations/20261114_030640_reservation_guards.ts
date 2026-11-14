import {type MigrateUpArgs,type MigrateDownArgs,sql} from '@payloadcms/db-postgres'

export async function up({db}:MigrateUpArgs):Promise<void>{
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    ALTER TABLE allocations ADD CONSTRAINT allocation_calendar_dates CHECK (
      departure > arrival AND
      (arrival AT TIME ZONE 'UTC')::time = time '00:00:00' AND
      (departure AT TIME ZONE 'UTC')::time = time '00:00:00'
    );
    ALTER TABLE allocations ADD CONSTRAINT allocations_no_room_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        daterange((arrival AT TIME ZONE 'UTC')::date, (departure AT TIME ZONE 'UTC')::date, '[)') WITH &&
      ) WHERE (released = false);
    ALTER TABLE bookings ADD CONSTRAINT booking_calendar_dates CHECK (
      departure > arrival AND
      (arrival AT TIME ZONE 'UTC')::time = time '00:00:00' AND
      (departure AT TIME ZONE 'UTC')::time = time '00:00:00'
    );
    ALTER TABLE bookings ADD CONSTRAINT booking_revision_integer CHECK (revision >= 1 AND revision = trunc(revision));
    ALTER TABLE payment_attempts ADD CONSTRAINT attempt_exact_money CHECK (amount_minor ~ '^(0|[1-9][0-9]*)$' AND currency ~ '^[A-Z]{3}$');
    ALTER TABLE payment_attempts ADD CONSTRAINT attempt_revision_integer CHECK (revision >= 1 AND revision = trunc(revision));
    ALTER TABLE payment_transactions ADD CONSTRAINT transaction_exact_money CHECK (amount_minor ~ '^(0|[1-9][0-9]*)$' AND currency ~ '^[A-Z]{3}$');
    ALTER TABLE work_items ADD CONSTRAINT work_integer_counters CHECK (
      generation >= 0 AND generation = trunc(generation) AND attempts >= 0 AND attempts = trunc(attempts)
    );
  `)
}
export async function down({db}:MigrateDownArgs):Promise<void>{
  await db.execute(sql`
    ALTER TABLE allocations DROP CONSTRAINT allocations_no_room_overlap;
    ALTER TABLE allocations DROP CONSTRAINT allocation_calendar_dates;
    ALTER TABLE bookings DROP CONSTRAINT booking_calendar_dates;
    ALTER TABLE bookings DROP CONSTRAINT booking_revision_integer;
    ALTER TABLE payment_attempts DROP CONSTRAINT attempt_exact_money;
    ALTER TABLE payment_attempts DROP CONSTRAINT attempt_revision_integer;
    ALTER TABLE payment_transactions DROP CONSTRAINT transaction_exact_money;
    ALTER TABLE work_items DROP CONSTRAINT work_integer_counters;
  `)
}
