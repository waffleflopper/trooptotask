CREATE OR REPLACE FUNCTION "public"."sign_in_roster_scope_matches_personnel"(
	"p_organization_id" uuid,
	"p_personnel_ids" uuid[],
	"p_scope_group_ids" uuid[],
	"p_personnel_snapshot" jsonb
) RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	WITH "input_personnel_ids" AS (
		SELECT DISTINCT "input_personnel"."personnel_id"
		FROM unnest(COALESCE("p_personnel_ids", ARRAY[]::uuid[])) AS "input_personnel"("personnel_id")
	),
	"input_scope_group_ids" AS (
		SELECT DISTINCT "input_scope"."group_id"
		FROM unnest(COALESCE("p_scope_group_ids", ARRAY[]::uuid[])) AS "input_scope"("group_id")
	),
	"snapshot_items" AS (
		SELECT "snapshot"."item"
		FROM jsonb_array_elements(
			CASE
				WHEN jsonb_typeof("p_personnel_snapshot") = 'array' THEN "p_personnel_snapshot"
				ELSE '[]'::jsonb
			END
		) AS "snapshot"("item")
	),
	"snapshot_personnel_ids" AS (
		SELECT DISTINCT ("snapshot_items"."item" ->> 'id')::uuid AS "personnel_id"
		FROM "snapshot_items"
		WHERE "snapshot_items"."item" ? 'id'
			AND "snapshot_items"."item" ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
	),
	"selected_personnel" AS (
		SELECT "personnel"."id", "personnel"."group_id"
		FROM "input_personnel_ids"
		JOIN "public"."personnel"
			ON "personnel"."id" = "input_personnel_ids"."personnel_id"
			AND "personnel"."organization_id" = "p_organization_id"
	),
	"derived_scope_group_ids" AS (
		SELECT DISTINCT "selected_personnel"."group_id"
		FROM "selected_personnel"
		WHERE "selected_personnel"."group_id" IS NOT NULL
	),
	"has_unassigned_personnel" AS (
		SELECT EXISTS (
			SELECT 1
			FROM "selected_personnel"
			WHERE "selected_personnel"."group_id" IS NULL
		) AS "value"
	)
	SELECT
		jsonb_typeof("p_personnel_snapshot") = 'array'
		AND NOT EXISTS (
			SELECT 1
			FROM unnest(COALESCE("p_personnel_ids", ARRAY[]::uuid[])) AS "input_personnel"("personnel_id")
			WHERE "input_personnel"."personnel_id" IS NULL
		)
		AND NOT EXISTS (
			SELECT 1
			FROM unnest(COALESCE("p_scope_group_ids", ARRAY[]::uuid[])) AS "input_scope"("group_id")
			WHERE "input_scope"."group_id" IS NULL
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "snapshot_items"
			WHERE NOT ("snapshot_items"."item" ? 'id')
				OR NOT ("snapshot_items"."item" ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "input_personnel_ids"
			WHERE "input_personnel_ids"."personnel_id" IS NULL
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "input_scope_group_ids"
			WHERE "input_scope_group_ids"."group_id" IS NULL
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "input_personnel_ids"
			WHERE NOT EXISTS (
				SELECT 1
				FROM "snapshot_personnel_ids"
				WHERE "snapshot_personnel_ids"."personnel_id" = "input_personnel_ids"."personnel_id"
			)
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "snapshot_personnel_ids"
			WHERE NOT EXISTS (
				SELECT 1
				FROM "input_personnel_ids"
				WHERE "input_personnel_ids"."personnel_id" = "snapshot_personnel_ids"."personnel_id"
			)
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "input_personnel_ids"
			WHERE NOT EXISTS (
				SELECT 1
				FROM "selected_personnel"
				WHERE "selected_personnel"."id" = "input_personnel_ids"."personnel_id"
			)
		)
		AND (
			(
				(SELECT "value" FROM "has_unassigned_personnel")
				AND COALESCE(array_length("p_scope_group_ids", 1), 0) = 0
			)
			OR (
				NOT (SELECT "value" FROM "has_unassigned_personnel")
				AND NOT EXISTS (
					SELECT 1
					FROM "input_scope_group_ids"
					WHERE NOT EXISTS (
						SELECT 1
						FROM "derived_scope_group_ids"
						WHERE "derived_scope_group_ids"."group_id" = "input_scope_group_ids"."group_id"
					)
				)
				AND NOT EXISTS (
					SELECT 1
					FROM "derived_scope_group_ids"
					WHERE NOT EXISTS (
						SELECT 1
						FROM "input_scope_group_ids"
						WHERE "input_scope_group_ids"."group_id" = "derived_scope_group_ids"."group_id"
					)
				)
			)
		);
$$;

ALTER FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) OWNER TO "postgres";

REVOKE EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) TO "service_role";
