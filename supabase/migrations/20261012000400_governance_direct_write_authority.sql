-- Mirrors Identity's sensitive-action check for direct writes. MFA assurance
-- passes, as does a session without a verified factor whose latest
-- authentication method is at most 15 minutes old.
CREATE FUNCTION "public"."current_session_sensitive_action_assured"()
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT COALESCE((
		SELECT CASE "current_session"."claims" ->> 'aal'
			WHEN 'aal2' THEN true
			WHEN 'aal1' THEN NOT EXISTS (
					SELECT 1 FROM "auth"."mfa_factors" AS "factor"
					WHERE "factor"."user_id" = "current_session"."user_id"
						AND "factor"."status" = 'verified'::"auth"."factor_status"
				)
				AND (
					SELECT pg_catalog.count(*) > 0
						AND pg_catalog.bool_and(COALESCE(
							"method"."name" <> ''
								AND "method"."signed_in_at" = pg_catalog.trunc("method"."signed_in_at")
								AND "method"."signed_in_at" > 0
								AND "method"."signed_in_at" <= "current_session"."now_epoch",
							false
						))
						AND pg_catalog.max("method"."signed_in_at") >= "current_session"."now_epoch" - 900
					FROM pg_catalog.jsonb_array_elements(
						CASE WHEN pg_catalog.jsonb_typeof("current_session"."claims" -> 'amr') = 'array'
							THEN "current_session"."claims" -> 'amr' ELSE '[]'::jsonb END
					) AS "entry"
					CROSS JOIN LATERAL (
						SELECT
							CASE WHEN pg_catalog.jsonb_typeof("entry" -> 'method') = 'string'
								THEN pg_catalog.btrim("entry" ->> 'method') END AS "name",
							CASE WHEN pg_catalog.jsonb_typeof("entry" -> 'timestamp') = 'number'
								THEN ("entry" ->> 'timestamp')::numeric END AS "signed_in_at"
					) AS "method"
				)
			ELSE false
		END
		FROM (
			SELECT "auth"."uid"() AS "user_id", "auth"."jwt"() AS "claims",
				extract(epoch FROM pg_catalog.now()) AS "now_epoch"
		) AS "current_session"
		WHERE "current_session"."user_id" IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM "public"."user_suspensions" AS "suspension"
				WHERE "suspension"."user_id" = "current_session"."user_id"
			)
	), false);
$$;

ALTER FUNCTION "public"."current_session_sensitive_action_assured"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."current_session_sensitive_action_assured"() FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."current_session_sensitive_action_assured"() TO "authenticated";

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
		OR ("role" = 'admin'::"public"."organization_role" AND "public"."is_org_owner"("organization_id")
			AND "public"."current_session_sensitive_action_assured"())
	)
	WITH CHECK (
		("role" = 'member'::"public"."organization_role" AND "public"."can_manage_org_members"("organization_id"))
		OR ("role" = 'admin'::"public"."organization_role" AND "public"."is_org_owner"("organization_id")
			AND "public"."current_session_sensitive_action_assured"())
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
		"invited_by" = (SELECT "auth"."uid"())
		AND (
			("role" = 'member'::"public"."organization_role" AND "public"."can_manage_org_members"("organization_id"))
			OR ("role" = 'admin'::"public"."organization_role" AND "public"."is_org_owner"("organization_id")
				AND "public"."current_session_sensitive_action_assured"())
		)
	);

-- Decline, revoke and expiry change lifecycle state only. Acceptance and
-- blocking run through SECURITY DEFINER commands or service-role paths.
REVOKE UPDATE ON TABLE "public"."organization_invitations" FROM "anon", "authenticated";
GRANT UPDATE ("status", "declined_at", "declined_by", "revoked_at", "revoked_by", "expired_at")
	ON TABLE "public"."organization_invitations" TO "authenticated";

-- Acceptance copies the invited role, so a pending owner invitation would
-- admit a second owner. No supported writer creates one.
UPDATE "public"."organization_invitations"
SET "status" = 'revoked'::"public"."invitation_status", "revoked_at" = now()
WHERE "role" = 'owner'::"public"."organization_role"
	AND "status" = 'pending'::"public"."invitation_status";

ALTER TABLE "public"."organization_invitations"
	ADD CONSTRAINT "organization_invitations_pending_role_check"
	CHECK ("status" <> 'pending'::"public"."invitation_status" OR "role" <> 'owner'::"public"."organization_role");

DROP POLICY IF EXISTS "Organization owners can delete their organizations" ON "public"."organizations";
CREATE POLICY "Organization owners can delete their organizations"
	ON "public"."organizations"
	FOR DELETE
	TO "authenticated"
	USING ("public"."is_org_owner"("id") AND "public"."current_session_sensitive_action_assured"());

-- Same command as 20261003000200, with the sensitive-action check after the owner check.
CREATE OR REPLACE FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_owner_count integer;
  v_owner_user_id uuid;
  v_target_role public.organization_role;
  v_changed integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Membership commands require read committed isolation' USING ERRCODE = '25000';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_actor_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.organization_memberships
        WHERE organization_id = p_organization_id AND user_id = v_actor_user_id AND role = 'owner'
    ) OR EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id AND suspended_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = v_actor_user_id)
  THEN RAISE EXCEPTION 'Only the owner can transfer ownership'; END IF;
  IF NOT public.current_session_sensitive_action_assured() THEN
    RAISE EXCEPTION 'Recent sign-in or MFA verification is required to transfer ownership';
  END IF;
  PERFORM id FROM public.organization_memberships WHERE organization_id = p_organization_id
    AND (role = 'owner' OR user_id = p_new_owner_id) ORDER BY id FOR UPDATE;
  SELECT pg_catalog.count(*)::integer, (pg_catalog.array_agg(user_id))[1]
    INTO v_owner_count, v_owner_user_id FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND role = 'owner';
  IF v_owner_count <> 1 OR v_owner_user_id IS DISTINCT FROM v_actor_user_id THEN
    RAISE EXCEPTION 'Organization must have exactly one current owner';
  END IF;
  SELECT role INTO v_target_role FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_new_owner_id;
  IF NOT FOUND OR v_target_role = 'owner' THEN RAISE EXCEPTION 'New owner must be an existing member'; END IF;
  UPDATE public.organization_memberships
    SET role = 'admin', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE organization_id = p_organization_id AND user_id = v_actor_user_id AND role = 'owner';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Ownership demotion was not acknowledged'; END IF;
  UPDATE public.organization_memberships
    SET role = 'owner', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE organization_id = p_organization_id AND user_id = p_new_owner_id AND role = v_target_role;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Ownership promotion was not acknowledged'; END IF;
END;
$$;

-- A Group deleted after an invitation was issued stays in its snapshot, so
-- only Groups that exist in another Organization are rejected.
CREATE FUNCTION organization_private.require_access_scope_groups_in_organization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = ANY (NEW.access_scope_group_ids) AND organization_id <> NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Access scope Groups must belong to the Organization' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_access_scope_groups_in_organization()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER require_access_scope_groups_in_organization
  BEFORE INSERT OR UPDATE OF organization_id, access_scope_group_ids ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION organization_private.require_access_scope_groups_in_organization();
CREATE TRIGGER require_access_scope_groups_in_organization
  BEFORE INSERT OR UPDATE OF organization_id, access_scope_group_ids ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION organization_private.require_access_scope_groups_in_organization();

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
