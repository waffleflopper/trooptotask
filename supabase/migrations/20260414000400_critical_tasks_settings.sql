ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "critical_tasks_default_expiration_months" integer;

ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "critical_tasks_expiring_soon_warning_days" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'organizations_critical_tasks_default_expiration_months_check'
  ) THEN
    ALTER TABLE "public"."organizations"
      ADD CONSTRAINT "organizations_critical_tasks_default_expiration_months_check"
      CHECK (
        ("critical_tasks_default_expiration_months" IS NULL)
        OR ("critical_tasks_default_expiration_months" BETWEEN 1 AND 120)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'organizations_critical_tasks_expiring_soon_warning_days_check'
  ) THEN
    ALTER TABLE "public"."organizations"
      ADD CONSTRAINT "organizations_critical_tasks_expiring_soon_warning_days_check"
      CHECK (
        ("critical_tasks_expiring_soon_warning_days" IS NULL)
        OR ("critical_tasks_expiring_soon_warning_days" BETWEEN 1 AND 365)
      );
  END IF;
END;
$$;
