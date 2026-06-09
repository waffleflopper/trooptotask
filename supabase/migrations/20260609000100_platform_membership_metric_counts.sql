CREATE OR REPLACE FUNCTION "public"."count_memberships_by_organization"("p_org_ids" "uuid"[])
RETURNS TABLE("organization_id" "uuid", "membership_count" bigint)
LANGUAGE "sql"
STABLE
SECURITY INVOKER
SET "search_path" = "public"
AS $$
	SELECT "organization_memberships"."organization_id", COUNT(*)::bigint AS "membership_count"
	FROM "public"."organization_memberships"
	WHERE "organization_memberships"."organization_id" = ANY("p_org_ids")
	GROUP BY "organization_memberships"."organization_id";
$$;

CREATE OR REPLACE FUNCTION "public"."list_platform_owner_membership_metrics"("p_org_ids" "uuid"[])
RETURNS TABLE("organization_id" "uuid", "owner_count" bigint, "owner_user_id" "uuid", "owner_email" "text")
LANGUAGE "sql"
STABLE
SECURITY INVOKER
SET "search_path" = "public"
AS $$
	WITH "owner_rows" AS (
		SELECT
			"organization_memberships"."organization_id",
			"organization_memberships"."user_id",
			"organization_memberships"."email",
			COUNT(*) OVER (PARTITION BY "organization_memberships"."organization_id")::bigint AS "owner_count",
			ROW_NUMBER() OVER (
				PARTITION BY "organization_memberships"."organization_id"
				ORDER BY "organization_memberships"."user_id"
			) AS "owner_rank"
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = ANY("p_org_ids")
			AND "organization_memberships"."role" = 'owner'::"public"."organization_role"
	)
	SELECT
		"owner_rows"."organization_id",
		"owner_rows"."owner_count",
		CASE WHEN "owner_rows"."owner_count" = 1 THEN "owner_rows"."user_id" ELSE NULL END AS "owner_user_id",
		CASE WHEN "owner_rows"."owner_count" = 1 THEN "owner_rows"."email" ELSE NULL END AS "owner_email"
	FROM "owner_rows"
	WHERE "owner_rows"."owner_rank" = 1;
$$;

REVOKE ALL ON FUNCTION "public"."count_memberships_by_organization"("uuid"[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."count_memberships_by_organization"("uuid"[]) FROM "anon";
REVOKE ALL ON FUNCTION "public"."count_memberships_by_organization"("uuid"[]) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."count_memberships_by_organization"("uuid"[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_platform_owner_membership_metrics"("uuid"[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_platform_owner_membership_metrics"("uuid"[]) FROM "anon";
REVOKE ALL ON FUNCTION "public"."list_platform_owner_membership_metrics"("uuid"[]) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_platform_owner_membership_metrics"("uuid"[]) TO "service_role";
