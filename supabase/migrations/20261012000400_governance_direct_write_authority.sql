-- Membership admission, removal and ownership changes run through SECURITY
-- DEFINER commands or service-role member operations, never direct writes.
DROP POLICY IF EXISTS "Invited users can insert themselves as members" ON "public"."organization_memberships";
DROP POLICY IF EXISTS "Creators and owners can insert memberships" ON "public"."organization_memberships";
DROP POLICY IF EXISTS "Admins can delete memberships" ON "public"."organization_memberships";
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON "public"."organizations";

DROP POLICY IF EXISTS "Admins can update memberships" ON "public"."organization_memberships";
CREATE POLICY "Governors can update member access"
	ON "public"."organization_memberships"
	FOR UPDATE
	TO "authenticated"
	USING (
		("role" = 'member'::"public"."organization_role" AND "public"."can_manage_org_members"("organization_id"))
		OR ("role" = 'admin'::"public"."organization_role" AND "public"."is_org_owner"("organization_id"))
	)
	WITH CHECK (
		("role" = 'member'::"public"."organization_role" AND "public"."can_manage_org_members"("organization_id"))
		OR ("role" = 'admin'::"public"."organization_role" AND "public"."is_org_owner"("organization_id"))
	);

REVOKE UPDATE ON TABLE "public"."organization_memberships" FROM "anon", "authenticated";
GRANT UPDATE ("role", "member_preset", "capability_overrides", "access_scope_kind", "access_scope_group_ids")
	ON TABLE "public"."organization_memberships" TO "authenticated";

DROP POLICY IF EXISTS "Privileged members can update their organizations" ON "public"."organizations";
CREATE POLICY "Privileged members can update their organizations"
	ON "public"."organizations"
	FOR UPDATE
	TO "authenticated"
	USING ("public"."is_org_privileged"("id"))
	WITH CHECK ("public"."is_org_privileged"("id"));

-- Suspension, identity and creator columns stay with platform service paths.
-- A new governed settings column needs its own grant.
REVOKE UPDATE ON TABLE "public"."organizations" FROM "anon", "authenticated";
GRANT UPDATE (
	"name",
	"url_slug",
	"archive_retention_months",
	"loss_warning_window_days",
	"training_readiness_goal_percent",
	"personnel_document_storage_cap_bytes"
) ON TABLE "public"."organizations" TO "authenticated";

DROP POLICY IF EXISTS "Admins can create invitations" ON "public"."organization_invitations";
CREATE POLICY "Governors can create invitations"
	ON "public"."organization_invitations"
	FOR INSERT
	TO "authenticated"
	WITH CHECK (
		("role" = 'member'::"public"."organization_role" AND "public"."can_manage_org_members"("organization_id"))
		OR ("role" = 'admin'::"public"."organization_role" AND "public"."is_org_owner"("organization_id"))
	);

-- Acceptance copies the invited role, so a pending owner invitation would
-- admit a second owner. No supported writer creates one.
UPDATE "public"."organization_invitations"
SET "status" = 'revoked'::"public"."invitation_status", "revoked_at" = now()
WHERE "role" = 'owner'::"public"."organization_role"
	AND "status" = 'pending'::"public"."invitation_status";

ALTER TABLE "public"."organization_invitations"
	ADD CONSTRAINT "organization_invitations_pending_role_check"
	CHECK ("status" <> 'pending'::"public"."invitation_status" OR "role" <> 'owner'::"public"."organization_role");

CREATE OR REPLACE FUNCTION "public"."can_export_organization_data"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT "public"."can_manage_org_members"("p_organization_id");
$$;

ALTER FUNCTION "public"."can_export_organization_data"(uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."can_export_organization_data"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_export_organization_data"(uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_export_organization_data"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_export_organization_data"(uuid) TO "service_role";
