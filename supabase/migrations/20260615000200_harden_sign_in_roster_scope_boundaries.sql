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
	"derived_scope_group_ids" AS (
		SELECT DISTINCT "personnel"."group_id"
		FROM "input_personnel_ids"
		JOIN "public"."personnel"
			ON "personnel"."id" = "input_personnel_ids"."personnel_id"
			AND "personnel"."organization_id" = "p_organization_id"
		WHERE "personnel"."group_id" IS NOT NULL
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
				FROM "public"."personnel"
				WHERE "personnel"."id" = "input_personnel_ids"."personnel_id"
					AND "personnel"."organization_id" = "p_organization_id"
			)
		)
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
		);
$$;

ALTER FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) OWNER TO "postgres";

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
		AND NOT EXISTS (
			SELECT 1
			FROM unnest(COALESCE("p_scope_group_ids", ARRAY[]::uuid[])) AS "roster_scope"("group_id")
			WHERE "roster_scope"."group_id" IS NULL
		)
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

CREATE OR REPLACE FUNCTION "public"."can_access_sign_in_roster"(
	"p_organization_id" uuid,
	"p_personnel_ids" uuid[],
	"p_scope_group_ids" uuid[],
	"p_personnel_snapshot" jsonb,
	"p_required_capability" text
) RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT
		"public"."sign_in_roster_scope_matches_personnel"(
			"p_organization_id",
			"p_personnel_ids",
			"p_scope_group_ids",
			"p_personnel_snapshot"
		)
		AND "public"."can_access_sign_in_roster_scope"(
			"p_organization_id",
			"p_scope_group_ids",
			"p_required_capability"
		);
$$;

ALTER FUNCTION "public"."can_access_sign_in_roster"(uuid, uuid[], uuid[], jsonb, text) OWNER TO "postgres";

DROP POLICY IF EXISTS "sign_in_rosters_insert" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_insert"
	ON "public"."sign_in_rosters"
	FOR INSERT
	WITH CHECK (
		"public"."can_access_sign_in_roster"(
			"organization_id",
			"personnel_ids",
			"scope_group_ids",
			"personnel_snapshot",
			'operate'
		)
	);

DROP POLICY IF EXISTS "sign_in_rosters_select" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_select"
	ON "public"."sign_in_rosters"
	FOR SELECT
	USING (
		"public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'view')
	);

DROP POLICY IF EXISTS "sign_in_rosters_update" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_update"
	ON "public"."sign_in_rosters"
	FOR UPDATE
	USING (
		"public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'operate')
	)
	WITH CHECK (
		"public"."can_access_sign_in_roster"(
			"organization_id",
			"personnel_ids",
			"scope_group_ids",
			"personnel_snapshot",
			'operate'
		)
	);

DROP POLICY IF EXISTS "sign_in_rosters_delete" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_delete"
	ON "public"."sign_in_rosters"
	FOR DELETE
	USING (
		"public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'operate')
	);

CREATE OR REPLACE FUNCTION "public"."sensitive_file_object_is_readable"("bucket_name" text, "object_name" text)
RETURNS boolean
	LANGUAGE "plpgsql" STABLE SECURITY DEFINER
	SET "search_path" TO 'public', 'storage'
	AS $$
DECLARE
	org_id uuid;
	object_scope text;
	personnel_id uuid;
	roster_id uuid;
BEGIN
	IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
		RETURN FALSE;
	END IF;

	org_id := public.storage_object_org_id(object_name);
	object_scope := public.storage_object_scope(object_name);

	CASE object_scope
		WHEN 'sign-in-rosters' THEN
			BEGIN
				roster_id := (storage.foldername(object_name))[3]::uuid;
			EXCEPTION
				WHEN others THEN
					RETURN FALSE;
			END;

			RETURN EXISTS (
				SELECT 1
				FROM "public"."sign_in_rosters"
				WHERE "sign_in_rosters"."id" = roster_id
					AND "sign_in_rosters"."organization_id" = org_id
					AND "public"."can_access_sign_in_roster_scope"(
						"sign_in_rosters"."organization_id",
						"sign_in_rosters"."scope_group_ids",
						'view'
					)
			);
		WHEN 'counseling-records' THEN
			BEGIN
				personnel_id := (storage.foldername(object_name))[3]::uuid;
			EXCEPTION
				WHEN others THEN
					RETURN FALSE;
			END;

			RETURN public.member_access_has_capability(org_id, 'personnel', 'view')
				AND EXISTS (
					SELECT 1
					FROM "public"."personnel"
					WHERE "personnel"."id" = personnel_id
						AND "personnel"."organization_id" = org_id
						AND "public"."member_access_group_scope_matches"(org_id, "personnel"."group_id")
				);
		ELSE
			RETURN FALSE;
	END CASE;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."sensitive_file_object_is_readable"(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."sensitive_file_object_is_readable"(text, text) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."sensitive_file_object_is_readable"(text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sensitive_file_object_is_readable"(text, text) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."sensitive_file_object_is_writable"("bucket_name" text, "object_name" text)
RETURNS boolean
	LANGUAGE "plpgsql" STABLE SECURITY DEFINER
	SET "search_path" TO 'public', 'storage'
	AS $$
DECLARE
	org_id uuid;
	object_scope text;
	personnel_id uuid;
	roster_id uuid;
BEGIN
	IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
		RETURN FALSE;
	END IF;

	org_id := public.storage_object_org_id(object_name);
	object_scope := public.storage_object_scope(object_name);

	CASE object_scope
		WHEN 'sign-in-rosters' THEN
			BEGIN
				roster_id := (storage.foldername(object_name))[3]::uuid;
			EXCEPTION
				WHEN others THEN
					RETURN FALSE;
			END;

			RETURN EXISTS (
				SELECT 1
				FROM "public"."sign_in_rosters"
				WHERE "sign_in_rosters"."id" = roster_id
					AND "sign_in_rosters"."organization_id" = org_id
					AND "public"."can_access_sign_in_roster_scope"(
						"sign_in_rosters"."organization_id",
						"sign_in_rosters"."scope_group_ids",
						'operate'
					)
			);
		WHEN 'counseling-records' THEN
			BEGIN
				personnel_id := (storage.foldername(object_name))[3]::uuid;
			EXCEPTION
				WHEN others THEN
					RETURN FALSE;
			END;

			RETURN public.member_access_has_capability(org_id, 'personnel', 'operate')
				AND EXISTS (
					SELECT 1
					FROM "public"."personnel"
					WHERE "personnel"."id" = personnel_id
						AND "personnel"."organization_id" = org_id
						AND "public"."member_access_group_scope_matches"(org_id, "personnel"."group_id")
				);
		ELSE
			RETURN FALSE;
	END CASE;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."sensitive_file_object_is_writable"(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."sensitive_file_object_is_writable"(text, text) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."sensitive_file_object_is_writable"(text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sensitive_file_object_is_writable"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_access_sign_in_roster"(uuid, uuid[], uuid[], jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."can_access_sign_in_roster"(uuid, uuid[], uuid[], jsonb, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_access_sign_in_roster"(uuid, uuid[], uuid[], jsonb, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."can_access_sign_in_roster"(uuid, uuid[], uuid[], jsonb, text) TO "anon";

REVOKE ALL ON FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."can_access_sign_in_roster_scope"(uuid, uuid[], text) TO "anon";
