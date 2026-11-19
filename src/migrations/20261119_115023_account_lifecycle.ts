import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "staff_users" ADD COLUMN "security_revision" numeric DEFAULT 1 NOT NULL;
  ALTER TABLE "customers" ADD COLUMN "anonymized_at" timestamp(3) with time zone;
  ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_security_revision_check" CHECK (security_revision>=1 AND security_revision=trunc(security_revision));
  CREATE OR REPLACE FUNCTION protect_account_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.security_revision<OLD.security_revision THEN RAISE EXCEPTION 'Security revision cannot decrease' USING ERRCODE='23514'; END IF;
    IF TG_TABLE_NAME='customers' THEN
      IF OLD.anonymized_at IS NOT NULL AND (NEW.anonymized_at,NEW.email,NEW.name,NEW.deactivated) IS DISTINCT FROM (OLD.anonymized_at,OLD.email,OLD.name,OLD.deactivated) THEN RAISE EXCEPTION 'An anonymized account cannot be restored or changed' USING ERRCODE='23514'; END IF;
      IF NEW.anonymized_at IS NOT NULL AND NEW.deactivated IS NOT TRUE THEN RAISE EXCEPTION 'An anonymized account must stay deactivated' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER protect_customer_lifecycle BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION protect_account_lifecycle();
  CREATE TRIGGER protect_staff_lifecycle BEFORE UPDATE ON staff_users FOR EACH ROW EXECUTE FUNCTION protect_account_lifecycle();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN IF EXISTS (SELECT 1 FROM customers WHERE anonymized_at IS NOT NULL) OR EXISTS (SELECT 1 FROM staff_users WHERE security_revision>1) THEN RAISE EXCEPTION 'Account lifecycle history prevents destructive rollback'; END IF; END $$;
  DROP TRIGGER IF EXISTS protect_customer_lifecycle ON customers;
  DROP TRIGGER IF EXISTS protect_staff_lifecycle ON staff_users;
  DROP FUNCTION IF EXISTS protect_account_lifecycle();
  ALTER TABLE "staff_users" DROP CONSTRAINT "staff_users_security_revision_check";
  ALTER TABLE "staff_users" DROP COLUMN "security_revision";
  ALTER TABLE "customers" DROP COLUMN "anonymized_at";`)
}
