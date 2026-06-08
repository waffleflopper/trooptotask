CREATE OR REPLACE FUNCTION "public"."list_platform_organization_tier_counts"()
RETURNS TABLE("tier" "text", "gift_tier" "text", "count" bigint)
LANGUAGE "sql"
STABLE
SET "search_path" = "public"
AS $$
	SELECT "organizations"."tier", "organizations"."gift_tier", COUNT(*)::bigint AS "count"
	FROM "public"."organizations"
	GROUP BY "organizations"."tier", "organizations"."gift_tier";
$$;

REVOKE ALL ON FUNCTION "public"."list_platform_organization_tier_counts"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_platform_organization_tier_counts"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."list_platform_organization_tier_counts"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_platform_organization_tier_counts"() TO "service_role";
