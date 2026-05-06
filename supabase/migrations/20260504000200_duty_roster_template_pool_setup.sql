ALTER TABLE "public"."duty_roster_templates"
  ADD COLUMN IF NOT EXISTS "pool_criteria" "jsonb" DEFAULT '{"rankValues":[],"groupIds":[],"mosValues":[],"dutyRoleValues":[]}'::"jsonb" NOT NULL,
  ADD COLUMN IF NOT EXISTS "exempt_personnel_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
  ADD COLUMN IF NOT EXISTS "manual_baseline_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL;

ALTER TABLE "public"."duty_roster_templates"
  DROP CONSTRAINT IF EXISTS "duty_roster_templates_pool_criteria_object_check",
  DROP CONSTRAINT IF EXISTS "duty_roster_templates_exempt_personnel_ids_array_check",
  DROP CONSTRAINT IF EXISTS "duty_roster_templates_manual_baseline_counts_object_check";

ALTER TABLE "public"."duty_roster_templates"
  ADD CONSTRAINT "duty_roster_templates_pool_criteria_object_check" CHECK (("jsonb_typeof"("pool_criteria") = 'object'::"text")),
  ADD CONSTRAINT "duty_roster_templates_exempt_personnel_ids_array_check" CHECK (("jsonb_typeof"("exempt_personnel_ids") = 'array'::"text")),
  ADD CONSTRAINT "duty_roster_templates_manual_baseline_counts_object_check" CHECK (("jsonb_typeof"("manual_baseline_counts") = 'object'::"text"));
