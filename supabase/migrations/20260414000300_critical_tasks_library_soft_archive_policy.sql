DROP POLICY IF EXISTS "Owners and admins can manage ICT task library" ON "public"."ict_tasks";
DROP POLICY IF EXISTS "Owners and admins can insert ICT task library records" ON "public"."ict_tasks";
DROP POLICY IF EXISTS "Owners and admins can update ICT task library records" ON "public"."ict_tasks";

CREATE POLICY "Owners and admins can insert ICT task library records" ON "public"."ict_tasks"
  FOR INSERT
  WITH CHECK ("public"."can_manage_ict_task_library"("organization_id"));

CREATE POLICY "Owners and admins can update ICT task library records" ON "public"."ict_tasks"
  FOR UPDATE
  USING ("public"."can_manage_ict_task_library"("organization_id"))
  WITH CHECK ("public"."can_manage_ict_task_library"("organization_id"));
