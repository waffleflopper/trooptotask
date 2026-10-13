-- #1383: the Group catalog follows the member's scope set. Owners, admins and
-- Organization-scoped members with view in any lane read every same-Organization
-- Group; a Group-scoped member reads only its Groups, and an empty scope reads
-- none. Existing rows are unchanged.
DROP POLICY "Users can view groups if they can access related workspaces" ON "public"."groups";
CREATE POLICY "Members can view Groups in their scope"
	ON "public"."groups"
	FOR SELECT
	USING (
		"public"."can_view_groups"("organization_id")
		AND "public"."member_access_group_scope_matches"("organization_id", "id")
	);

-- Manage Groups is Organization configuration, matching personnel.manageGroups
-- at Organization scope. Separate write policies keep the manage grant from
-- widening SELECT.
CREATE OR REPLACE FUNCTION "public"."can_manage_groups"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'configure')
		AND EXISTS (
			SELECT 1 FROM "public"."organization_memberships"
			WHERE "organization_memberships"."organization_id" = "p_organization_id"
				AND "organization_memberships"."user_id" = "auth"."uid"()
				AND (
					"organization_memberships"."role" IN ('owner', 'admin')
					OR "organization_memberships"."access_scope_kind" = 'organization'
				)
		);
$$;

DROP POLICY "Users can manage groups if they can edit personnel" ON "public"."groups";
CREATE POLICY "Organization-wide Personnel configurers can create Groups"
	ON "public"."groups"
	FOR INSERT
	WITH CHECK ("public"."can_manage_groups"("organization_id"));
CREATE POLICY "Organization-wide Personnel configurers can update Groups"
	ON "public"."groups"
	FOR UPDATE
	USING ("public"."can_manage_groups"("organization_id"))
	WITH CHECK ("public"."can_manage_groups"("organization_id"));
CREATE POLICY "Organization-wide Personnel configurers can delete Groups"
	ON "public"."groups"
	FOR DELETE
	USING ("public"."can_manage_groups"("organization_id"));
