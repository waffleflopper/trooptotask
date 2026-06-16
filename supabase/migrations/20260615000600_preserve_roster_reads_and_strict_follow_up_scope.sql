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

REVOKE EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"(uuid, uuid[], uuid[], jsonb) TO "service_role";

DROP POLICY IF EXISTS "Members can view personnel follow ups through scoped personnel access"
	ON "public"."personnel_follow_ups";
DROP POLICY IF EXISTS "Operators can insert personnel follow ups through scoped personnel access"
	ON "public"."personnel_follow_ups";
DROP POLICY IF EXISTS "Operators can update personnel follow ups through scoped personnel access"
	ON "public"."personnel_follow_ups";
DROP POLICY IF EXISTS "Operators can delete personnel follow ups through scoped personnel access"
	ON "public"."personnel_follow_ups";

CREATE POLICY "Members can view personnel follow ups through scoped personnel access"
	ON "public"."personnel_follow_ups"
	FOR SELECT
	USING (
		"public"."member_access_has_capability"("organization_id", 'personnel', 'view')
		AND EXISTS (
			SELECT 1
			FROM "public"."personnel"
			WHERE "personnel"."id" = "personnel_follow_ups"."personnel_id"
				AND "personnel"."organization_id" = "personnel_follow_ups"."organization_id"
				AND (
					(
						"personnel"."group_id" IS NOT NULL
						AND "public"."member_access_group_scope_matches"(
							"personnel_follow_ups"."organization_id",
							"personnel"."group_id"
						)
					)
					OR (
						"personnel"."group_id" IS NULL
						AND EXISTS (
							SELECT 1
							FROM "public"."organization_memberships"
							WHERE "organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id"
								AND "organization_memberships"."user_id" = "auth"."uid"()
								AND (
									"organization_memberships"."role" IN ('owner', 'admin')
									OR "organization_memberships"."access_scope_kind" = 'organization'
								)
						)
					)
				)
		)
	);

CREATE POLICY "Operators can insert personnel follow ups through scoped personnel access"
	ON "public"."personnel_follow_ups"
	FOR INSERT
	WITH CHECK (
		"public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
		AND EXISTS (
			SELECT 1
			FROM "public"."personnel"
			WHERE "personnel"."id" = "personnel_follow_ups"."personnel_id"
				AND "personnel"."organization_id" = "personnel_follow_ups"."organization_id"
				AND (
					(
						"personnel"."group_id" IS NOT NULL
						AND "public"."member_access_group_scope_matches"(
							"personnel_follow_ups"."organization_id",
							"personnel"."group_id"
						)
					)
					OR (
						"personnel"."group_id" IS NULL
						AND EXISTS (
							SELECT 1
							FROM "public"."organization_memberships"
							WHERE "organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id"
								AND "organization_memberships"."user_id" = "auth"."uid"()
								AND (
									"organization_memberships"."role" IN ('owner', 'admin')
									OR "organization_memberships"."access_scope_kind" = 'organization'
								)
						)
					)
				)
		)
	);

CREATE POLICY "Operators can update personnel follow ups through scoped personnel access"
	ON "public"."personnel_follow_ups"
	FOR UPDATE
	USING (
		"public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
		AND EXISTS (
			SELECT 1
			FROM "public"."personnel"
			WHERE "personnel"."id" = "personnel_follow_ups"."personnel_id"
				AND "personnel"."organization_id" = "personnel_follow_ups"."organization_id"
				AND (
					(
						"personnel"."group_id" IS NOT NULL
						AND "public"."member_access_group_scope_matches"(
							"personnel_follow_ups"."organization_id",
							"personnel"."group_id"
						)
					)
					OR (
						"personnel"."group_id" IS NULL
						AND EXISTS (
							SELECT 1
							FROM "public"."organization_memberships"
							WHERE "organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id"
								AND "organization_memberships"."user_id" = "auth"."uid"()
								AND (
									"organization_memberships"."role" IN ('owner', 'admin')
									OR "organization_memberships"."access_scope_kind" = 'organization'
								)
						)
					)
				)
		)
	)
	WITH CHECK (
		"public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
		AND EXISTS (
			SELECT 1
			FROM "public"."personnel"
			WHERE "personnel"."id" = "personnel_follow_ups"."personnel_id"
				AND "personnel"."organization_id" = "personnel_follow_ups"."organization_id"
				AND (
					(
						"personnel"."group_id" IS NOT NULL
						AND "public"."member_access_group_scope_matches"(
							"personnel_follow_ups"."organization_id",
							"personnel"."group_id"
						)
					)
					OR (
						"personnel"."group_id" IS NULL
						AND EXISTS (
							SELECT 1
							FROM "public"."organization_memberships"
							WHERE "organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id"
								AND "organization_memberships"."user_id" = "auth"."uid"()
								AND (
									"organization_memberships"."role" IN ('owner', 'admin')
									OR "organization_memberships"."access_scope_kind" = 'organization'
								)
						)
					)
				)
		)
	);

CREATE POLICY "Operators can delete personnel follow ups through scoped personnel access"
	ON "public"."personnel_follow_ups"
	FOR DELETE
	USING (
		"public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
		AND EXISTS (
			SELECT 1
			FROM "public"."personnel"
			WHERE "personnel"."id" = "personnel_follow_ups"."personnel_id"
				AND "personnel"."organization_id" = "personnel_follow_ups"."organization_id"
				AND (
					(
						"personnel"."group_id" IS NOT NULL
						AND "public"."member_access_group_scope_matches"(
							"personnel_follow_ups"."organization_id",
							"personnel"."group_id"
						)
					)
					OR (
						"personnel"."group_id" IS NULL
						AND EXISTS (
							SELECT 1
							FROM "public"."organization_memberships"
							WHERE "organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id"
								AND "organization_memberships"."user_id" = "auth"."uid"()
								AND (
									"organization_memberships"."role" IN ('owner', 'admin')
									OR "organization_memberships"."access_scope_kind" = 'organization'
								)
						)
					)
				)
		)
	);
