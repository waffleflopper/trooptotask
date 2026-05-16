ALTER TABLE "public"."personnel_extended_info"
  ADD COLUMN IF NOT EXISTS "blood_type" "text",
  ADD COLUMN IF NOT EXISTS "basd" "date",
  ADD COLUMN IF NOT EXISTS "date_of_rank" "date",
  ADD COLUMN IF NOT EXISTS "marital_status" "text",
  ADD COLUMN IF NOT EXISTS "number_of_dependents" integer,
  ADD COLUMN IF NOT EXISTS "children" jsonb,
  ADD COLUMN IF NOT EXISTS "civilian_education" "text",
  ADD COLUMN IF NOT EXISTS "military_education" jsonb;
