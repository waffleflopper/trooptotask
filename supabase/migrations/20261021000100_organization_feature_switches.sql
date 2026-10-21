ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "disabled_features" text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "strength_floor_percent" smallint NOT NULL DEFAULT 80;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'organizations_disabled_features_check'
  ) THEN
    ALTER TABLE "public"."organizations"
      ADD CONSTRAINT "organizations_disabled_features_check"
      CHECK ("disabled_features" <@ ARRAY['training', 'criticalTasks', 'evaluations', 'onboarding', 'lossesAndAwards']::text[]);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'organizations_strength_floor_percent_check'
  ) THEN
    ALTER TABLE "public"."organizations"
      ADD CONSTRAINT "organizations_strength_floor_percent_check"
      CHECK ("strength_floor_percent" BETWEEN 1 AND 100);
  END IF;
END;
$$;

GRANT UPDATE ("disabled_features", "strength_floor_percent") ON TABLE "public"."organizations" TO "authenticated";
