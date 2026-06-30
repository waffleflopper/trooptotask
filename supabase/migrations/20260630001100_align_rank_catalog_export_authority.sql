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
        "public"."can_manage_org_members"("p_organization_id")
        OR "organization_memberships"."capability_overrides" ->> 'canManageMembers' = 'true'
      )
  );
$$;

ALTER FUNCTION "public"."can_export_organization_data"(uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."can_export_organization_data"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_export_organization_data"(uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_export_organization_data"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_export_organization_data"(uuid) TO "service_role";
