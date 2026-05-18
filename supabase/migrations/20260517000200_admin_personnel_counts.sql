CREATE OR REPLACE FUNCTION "public"."count_personnel_by_organization"("p_org_ids" "uuid"[])
RETURNS TABLE("organization_id" "uuid", "personnel_count" bigint)
LANGUAGE "sql"
STABLE
SET "search_path" = "public"
AS $$
    SELECT "personnel"."organization_id", COUNT(*)::bigint AS "personnel_count"
    FROM "public"."personnel"
    WHERE "personnel"."organization_id" = ANY("p_org_ids")
      AND "personnel"."archived_at" IS NULL
    GROUP BY "personnel"."organization_id";
$$;

REVOKE ALL ON FUNCTION "public"."count_personnel_by_organization"("uuid"[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."count_personnel_by_organization"("uuid"[]) FROM "anon";
REVOKE ALL ON FUNCTION "public"."count_personnel_by_organization"("uuid"[]) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."count_personnel_by_organization"("uuid"[]) TO "service_role";
