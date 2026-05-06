ALTER TABLE "public"."duty_roster_template_runs"
  ADD COLUMN IF NOT EXISTS "invalidated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "invalidated_by_user_id" "uuid";

ALTER TABLE "public"."duty_roster_template_runs"
  DROP CONSTRAINT IF EXISTS "duty_roster_template_runs_status_check";

ALTER TABLE "public"."duty_roster_template_runs"
  ADD CONSTRAINT "duty_roster_template_runs_status_check"
  CHECK (("status" = ANY (ARRAY['accepted'::"text", 'invalidated'::"text"])));

DO $$
BEGIN
  ALTER TABLE ONLY "public"."duty_roster_template_runs"
    ADD CONSTRAINT "duty_roster_template_runs_invalidated_by_user_id_fkey"
    FOREIGN KEY ("invalidated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Users can invalidate duty roster template runs if they can edit calendar assignments" ON "public"."duty_roster_template_runs";

CREATE POLICY "Users can invalidate duty roster template runs if they can edit calendar assignments"
  ON "public"."duty_roster_template_runs"
  FOR UPDATE
  USING ("public"."can_edit_calendar"("organization_id"))
  WITH CHECK ("public"."can_edit_calendar"("organization_id"));
