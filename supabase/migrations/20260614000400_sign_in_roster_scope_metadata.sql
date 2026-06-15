ALTER TABLE "public"."sign_in_rosters"
	ADD COLUMN IF NOT EXISTS "personnel_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	ADD COLUMN IF NOT EXISTS "scope_group_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL;

WITH "roster_scope" AS (
	SELECT
		"sign_in_rosters"."id",
		COALESCE(
			array_agg(DISTINCT "personnel"."id") FILTER (WHERE "personnel"."id" IS NOT NULL),
			ARRAY[]::uuid[]
		) AS "personnel_ids",
		COALESCE(
			array_agg(DISTINCT "personnel"."group_id") FILTER (WHERE "personnel"."group_id" IS NOT NULL),
			ARRAY[]::uuid[]
		) AS "scope_group_ids"
	FROM "public"."sign_in_rosters"
	LEFT JOIN LATERAL (
		SELECT ("snapshot"."item" ->> 'id')::uuid AS "personnel_id"
		FROM jsonb_array_elements(
			CASE
				WHEN jsonb_typeof("sign_in_rosters"."personnel_snapshot") = 'array'
					THEN "sign_in_rosters"."personnel_snapshot"
				ELSE '[]'::jsonb
			END
		) AS "snapshot"("item")
		WHERE "snapshot"."item" ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
	) AS "snapshot_ids" ON TRUE
	LEFT JOIN "public"."personnel"
		ON "personnel"."id" = "snapshot_ids"."personnel_id"
		AND "personnel"."organization_id" = "sign_in_rosters"."organization_id"
	GROUP BY "sign_in_rosters"."id"
)
UPDATE "public"."sign_in_rosters"
SET
	"personnel_ids" = "roster_scope"."personnel_ids",
	"scope_group_ids" = "roster_scope"."scope_group_ids"
FROM "roster_scope"
WHERE "sign_in_rosters"."id" = "roster_scope"."id";

CREATE INDEX IF NOT EXISTS "sign_in_rosters_personnel_ids_gin_idx"
	ON "public"."sign_in_rosters" USING gin ("personnel_ids");

CREATE INDEX IF NOT EXISTS "sign_in_rosters_scope_group_ids_gin_idx"
	ON "public"."sign_in_rosters" USING gin ("scope_group_ids");

CREATE OR REPLACE FUNCTION "public"."can_access_sign_in_roster_scope"(
	"p_organization_id" uuid,
	"p_scope_group_ids" uuid[],
	"p_required_capability" text
) RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT
		"public"."member_access_has_capability"("p_organization_id", 'training', "p_required_capability")
		AND (
			(
				COALESCE(array_length("p_scope_group_ids", 1), 0) = 0
				AND EXISTS (
					SELECT 1
					FROM "public"."organization_memberships"
					WHERE "organization_memberships"."organization_id" = "p_organization_id"
						AND "organization_memberships"."user_id" = "auth"."uid"()
						AND (
							"organization_memberships"."role" IN ('owner', 'admin')
							OR "organization_memberships"."access_scope_kind" = 'organization'
						)
				)
			)
			OR (
				COALESCE(array_length("p_scope_group_ids", 1), 0) > 0
				AND NOT EXISTS (
					SELECT 1
					FROM unnest(COALESCE("p_scope_group_ids", ARRAY[]::uuid[])) AS "roster_scope"("group_id")
					WHERE NOT "public"."member_access_group_scope_matches"("p_organization_id", "roster_scope"."group_id")
				)
			)
		);
$$;

ALTER FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) OWNER TO "postgres";

DROP POLICY IF EXISTS "sign_in_rosters_insert" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_insert"
	ON "public"."sign_in_rosters"
	FOR INSERT
	WITH CHECK ("public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'operate'));

DROP POLICY IF EXISTS "sign_in_rosters_select" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_select"
	ON "public"."sign_in_rosters"
	FOR SELECT
	USING ("public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'view'));

DROP POLICY IF EXISTS "sign_in_rosters_update" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_update"
	ON "public"."sign_in_rosters"
	FOR UPDATE
	USING ("public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'operate'))
	WITH CHECK ("public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'operate'));

DROP POLICY IF EXISTS "sign_in_rosters_delete" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_delete"
	ON "public"."sign_in_rosters"
	FOR DELETE
	USING ("public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'operate'));

REVOKE ALL ON FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) TO "service_role";
