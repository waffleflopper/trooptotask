CREATE OR REPLACE FUNCTION "public"."can_manage_org_members"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" IN ('owner', 'admin')
	);
$$;

ALTER FUNCTION "public"."can_manage_org_members"(uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_view_groups"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT
		"public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'training', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view');
$$;

ALTER FUNCTION "public"."can_view_groups"(uuid) OWNER TO "postgres";

DROP POLICY IF EXISTS "org_editors_can_delete_roster_history" ON "public"."duty_roster_history";
CREATE POLICY "org_editors_can_delete_roster_history"
	ON "public"."duty_roster_history"
	FOR DELETE
	USING ("public"."can_edit_calendar"("organization_id"));

DROP POLICY IF EXISTS "org_editors_can_insert_roster_history" ON "public"."duty_roster_history";
CREATE POLICY "org_editors_can_insert_roster_history"
	ON "public"."duty_roster_history"
	FOR INSERT
	WITH CHECK ("public"."can_edit_calendar"("organization_id"));

DROP POLICY IF EXISTS "sign_in_rosters_delete" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_delete"
	ON "public"."sign_in_rosters"
	FOR DELETE
	USING ("public"."can_edit_training"("organization_id"));

DROP POLICY IF EXISTS "sign_in_rosters_select" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_select"
	ON "public"."sign_in_rosters"
	FOR SELECT
	USING ("public"."can_view_training"("organization_id"));

DROP POLICY IF EXISTS "sign_in_rosters_update" ON "public"."sign_in_rosters";
CREATE POLICY "sign_in_rosters_update"
	ON "public"."sign_in_rosters"
	FOR UPDATE
	USING ("public"."can_edit_training"("organization_id"));
