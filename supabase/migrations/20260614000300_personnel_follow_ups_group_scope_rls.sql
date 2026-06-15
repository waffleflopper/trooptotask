DROP POLICY IF EXISTS "Members can view personnel follow ups"
	ON "public"."personnel_follow_ups";
DROP POLICY IF EXISTS "Operators can insert personnel follow ups"
	ON "public"."personnel_follow_ups";
DROP POLICY IF EXISTS "Operators can update personnel follow ups"
	ON "public"."personnel_follow_ups";
DROP POLICY IF EXISTS "Operators can delete personnel follow ups"
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
