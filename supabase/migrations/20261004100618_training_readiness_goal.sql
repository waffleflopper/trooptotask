ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "training_readiness_goal_percent" smallint NOT NULL DEFAULT 90;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'organizations_training_readiness_goal_percent_check'
  ) THEN
    ALTER TABLE "public"."organizations"
      ADD CONSTRAINT "organizations_training_readiness_goal_percent_check"
      CHECK ("training_readiness_goal_percent" BETWEEN 1 AND 100);
  END IF;
END;
$$;
