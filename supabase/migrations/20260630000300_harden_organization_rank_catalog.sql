ALTER TABLE "public"."organization_rank_catalog"
  DROP CONSTRAINT IF EXISTS "organization_rank_catalog_code_check";

ALTER TABLE "public"."organization_rank_catalog"
  ADD CONSTRAINT "organization_rank_catalog_code_check"
  CHECK ((length(btrim("code")) BETWEEN 1 AND 80) AND "code" = btrim("code"));

CREATE UNIQUE INDEX IF NOT EXISTS "organization_rank_catalog_org_trimmed_code_key"
  ON "public"."organization_rank_catalog" USING "btree" ("organization_id", btrim("code"));

ALTER TABLE "public"."organization_rank_catalog"
  DROP CONSTRAINT IF EXISTS "organization_rank_catalog_pay_grade_check";

ALTER TABLE "public"."organization_rank_catalog"
  ADD CONSTRAINT "organization_rank_catalog_pay_grade_check"
  CHECK (
    "pay_grade" = ANY (
      ARRAY[
        'O-1'::"text",
        'O-2'::"text",
        'O-3'::"text",
        'O-4'::"text",
        'O-5'::"text",
        'O-6'::"text",
        'O-7'::"text",
        'O-8'::"text",
        'O-9'::"text",
        'O-10'::"text",
        'W-1'::"text",
        'W-2'::"text",
        'W-3'::"text",
        'W-4'::"text",
        'W-5'::"text",
        'E-1'::"text",
        'E-2'::"text",
        'E-3'::"text",
        'E-4'::"text",
        'E-5'::"text",
        'E-6'::"text",
        'E-7'::"text",
        'E-8'::"text",
        'E-9'::"text",
        'ungraded'::"text"
      ]
    )
  );

DROP POLICY IF EXISTS "Organization governors can manage organization rank catalog"
  ON "public"."organization_rank_catalog";
DROP POLICY IF EXISTS "Users can view organization rank catalog if they can view personnel"
  ON "public"."organization_rank_catalog";
DROP POLICY IF EXISTS "Users can view organization rank catalog for rank-aware workspaces"
  ON "public"."organization_rank_catalog";
DROP POLICY IF EXISTS "Organization governors can insert organization rank catalog"
  ON "public"."organization_rank_catalog";
DROP POLICY IF EXISTS "Organization governors can update organization rank catalog"
  ON "public"."organization_rank_catalog";

CREATE POLICY "Users can view organization rank catalog for rank-aware workspaces"
  ON "public"."organization_rank_catalog"
  FOR SELECT
  USING (
    "public"."can_view_personnel"("organization_id")
    OR "public"."can_view_calendar"("organization_id")
    OR "public"."can_view_training"("organization_id")
    OR "public"."can_view_critical_tasks"("organization_id")
    OR "public"."can_update_organization_settings"("organization_id")
  );

CREATE POLICY "Organization governors can insert organization rank catalog"
  ON "public"."organization_rank_catalog"
  FOR INSERT
  WITH CHECK ("public"."can_update_organization_settings"("organization_id"));

CREATE POLICY "Organization governors can update organization rank catalog"
  ON "public"."organization_rank_catalog"
  FOR UPDATE
  USING ("public"."can_update_organization_settings"("organization_id"))
  WITH CHECK ("public"."can_update_organization_settings"("organization_id"));

REVOKE ALL ON TABLE "public"."organization_rank_catalog" FROM "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."organization_rank_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_rank_catalog" TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_update_organization_settings"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_update_organization_settings"(uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_update_organization_settings"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_update_organization_settings"(uuid) TO "service_role";
