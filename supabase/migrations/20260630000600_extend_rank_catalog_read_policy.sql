CREATE OR REPLACE FUNCTION "public"."can_export_organization_data"("p_organization_id" uuid)
RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."capability_overrides" ->> 'canManageMembers' = 'true'
      )
  );
$$;

ALTER FUNCTION "public"."can_export_organization_data"(uuid) OWNER TO "postgres";

DROP POLICY IF EXISTS "Users can view organization rank catalog if they can view personnel"
  ON "public"."organization_rank_catalog";
DROP POLICY IF EXISTS "Users can view organization rank catalog for rank-aware workspaces"
  ON "public"."organization_rank_catalog";

CREATE POLICY "Users can view organization rank catalog for rank-aware workspaces"
  ON "public"."organization_rank_catalog"
  FOR SELECT
  USING (
    "public"."can_view_personnel"("organization_id")
    OR "public"."can_view_calendar"("organization_id")
    OR "public"."can_view_training"("organization_id")
    OR "public"."can_view_critical_tasks"("organization_id")
    OR "public"."can_export_organization_data"("organization_id")
    OR "public"."can_update_organization_settings"("organization_id")
  );

REVOKE ALL ON FUNCTION "public"."can_export_organization_data"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_export_organization_data"(uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_export_organization_data"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_export_organization_data"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_unused_organization_rank_catalog_entry"(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_unused_organization_rank_catalog_entry"(uuid, uuid, text) FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_unused_organization_rank_catalog_entry"(uuid, uuid, text) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_unused_organization_rank_catalog_entry"(uuid, uuid, text) TO "service_role";
