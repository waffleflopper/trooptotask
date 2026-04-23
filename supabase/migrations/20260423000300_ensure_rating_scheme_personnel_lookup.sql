DROP POLICY IF EXISTS "Users can view personnel if allowed by scoped rating scheme reference access" ON "public"."personnel";

CREATE OR REPLACE FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid")
RETURNS TABLE("id" "uuid", "rank" "text", "last_name" "text", "first_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    "personnel"."id",
    "personnel"."rank",
    "personnel"."last_name",
    "personnel"."first_name"
  FROM "public"."personnel"
  JOIN "public"."organization_memberships"
    ON "organization_memberships"."organization_id" = "personnel"."organization_id"
   AND "organization_memberships"."user_id" = "auth"."uid"()
  WHERE "personnel"."organization_id" = "p_organization_id"
    AND "personnel"."archived_at" IS NULL
    AND (
      "organization_memberships"."role" IN ('owner', 'admin')
      OR "organization_memberships"."can_view_rating_scheme" = true
    )
    AND (
      "organization_memberships"."scoped_group_id" IS NULL
      OR "personnel"."group_id" IS NULL
      OR "organization_memberships"."scoped_group_id" = "personnel"."group_id"
    )
  ORDER BY "personnel"."last_name" ASC, "personnel"."first_name" ASC;
$$;

ALTER FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "service_role";

NOTIFY "pgrst", 'reload schema';
