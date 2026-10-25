BEGIN;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.platform_admins WHERE NOT is_active) THEN
  RAISE EXCEPTION 'Review inactive platform memberships before converting to operators' USING ERRCODE = '55000';
 END IF;
END $$;

ALTER TABLE public.platform_admins RENAME TO platform_operators;

DROP POLICY "Admins can read platform_admins" ON public.platform_operators;
DROP POLICY "Super admins can manage platform_admins" ON public.platform_operators;
DROP POLICY "Users can check own admin status" ON public.platform_operators;

CREATE FUNCTION public.is_platform_operator() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce((SELECT auth.jwt()->>'aal') = 'aal2', false)
  AND EXISTS (SELECT 1 FROM public.platform_operators WHERE user_id = (SELECT auth.uid()))
  AND NOT EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO anon, authenticated, service_role;

CREATE POLICY "Operators can read operator membership" ON public.platform_operators
 FOR SELECT TO authenticated USING (public.is_platform_operator());
REVOKE ALL ON public.platform_operators FROM anon, authenticated;
GRANT SELECT ON public.platform_operators TO authenticated;

DROP POLICY "Platform admins can delete announcements" ON public.platform_announcements;
DROP POLICY "Platform admins can insert announcements" ON public.platform_announcements;
DROP POLICY "Platform admins can update announcements" ON public.platform_announcements;
CREATE POLICY "Operators can delete announcements" ON public.platform_announcements
 FOR DELETE TO authenticated USING (public.is_platform_operator());
CREATE POLICY "Operators can insert announcements" ON public.platform_announcements
 FOR INSERT TO authenticated WITH CHECK (public.is_platform_operator());
CREATE POLICY "Operators can update announcements" ON public.platform_announcements
 FOR UPDATE TO authenticated USING (public.is_platform_operator()) WITH CHECK (public.is_platform_operator());
DROP POLICY "Platform admins can manage suspensions" ON public.user_suspensions;
CREATE POLICY "Operators can read suspensions" ON public.user_suspensions
 FOR SELECT TO authenticated USING (public.is_platform_operator());
-- Suspension commands require request-bound MFA, attribution and awaited audit at the server.
REVOKE ALL ON public.user_suspensions FROM anon, authenticated;
GRANT SELECT ON public.user_suspensions TO authenticated;

-- Preserve each policy's other predicates while replacing the retired authority functions.
DO $$
DECLARE policy record; expression text; check_expression text; statement text;
BEGIN
 FOR policy IN SELECT p.*, n.nspname, c.relname FROM pg_catalog.pg_policy p
  JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
 LOOP
  expression := pg_catalog.pg_get_expr(policy.polqual, policy.polrelid);
  check_expression := pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid);
  IF coalesce(expression, '') || coalesce(check_expression, '') ~ 'is_super_admin|is_platform_admin' THEN
   statement := pg_catalog.format('ALTER POLICY %I ON %I.%I', policy.polname, policy.nspname, policy.relname);
   IF expression IS NOT NULL THEN statement := statement || ' USING (' || replace(replace(expression, 'is_super_admin', 'is_platform_operator'), 'is_platform_admin', 'is_platform_operator') || ')'; END IF;
   IF check_expression IS NOT NULL THEN statement := statement || ' WITH CHECK (' || replace(replace(check_expression, 'is_super_admin', 'is_platform_operator'), 'is_platform_admin', 'is_platform_operator') || ')'; END IF;
   EXECUTE statement;
  END IF;
 END LOOP;
END $$;

DROP FUNCTION public.platform_promote_org_member(uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION public.platform_transfer_org_ownership(
  p_actor_user_id uuid, p_organization_id uuid, p_target_user_id uuid, p_confirm_name text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exists boolean;
  v_name text;
  v_operator_id uuid;
  v_owner_count integer;
  v_owner_user_id uuid;
  v_target_role public.organization_role;
  v_changed integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Membership commands require read committed isolation' USING ERRCODE = '25000';
  END IF;
  SELECT name INTO v_name FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  v_exists := FOUND;
  SELECT user_id INTO v_operator_id FROM public.platform_operators
    WHERE user_id = p_actor_user_id FOR SHARE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_user_id) THEN
    RAISE EXCEPTION 'Current platform operator access is required' USING ERRCODE = '42501';
  END IF;
  IF NOT v_exists THEN RETURN pg_catalog.jsonb_build_object('status','organization_not_found'); END IF;
  IF p_confirm_name IS DISTINCT FROM v_name THEN RETURN pg_catalog.jsonb_build_object('status','name_mismatch'); END IF;
  -- Lock the current rows before discovering the owner; no saved row is recreated.
  PERFORM id FROM public.organization_memberships WHERE organization_id = p_organization_id
    AND (role = 'owner' OR user_id = p_target_user_id) ORDER BY id FOR UPDATE;
  SELECT pg_catalog.count(*)::integer, (pg_catalog.array_agg(user_id))[1]
    INTO v_owner_count, v_owner_user_id FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND role = 'owner';
  IF v_owner_count = 0 THEN RETURN pg_catalog.jsonb_build_object('status','no_current_owner'); END IF;
  IF v_owner_count <> 1 THEN RETURN pg_catalog.jsonb_build_object('status','multiple_current_owners'); END IF;
  SELECT role INTO v_target_role FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_target_user_id;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','target_not_member'); END IF;
  IF v_target_role = 'owner' THEN RETURN pg_catalog.jsonb_build_object('status','already_owner'); END IF;
  UPDATE public.organization_memberships
    SET role = 'admin', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE organization_id = p_organization_id AND user_id = v_owner_user_id AND role = 'owner';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Ownership demotion was not acknowledged'; END IF;
  UPDATE public.organization_memberships
    SET role = 'owner', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE organization_id = p_organization_id AND user_id = p_target_user_id AND role = v_target_role;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Ownership promotion was not acknowledged'; END IF;
  RETURN pg_catalog.jsonb_build_object('status','updated','org_id',p_organization_id,
    'from_user_id',v_owner_user_id,'to_user_id',p_target_user_id,'org_name',v_name);
END;
$$;


CREATE OR REPLACE FUNCTION "public"."release_account_setup_claim_for_staff"(
	"p_setup_link_id" uuid,
	"p_access_request_id" uuid,
	"p_operator_user_id" uuid,
	"p_release_reason" text,
	"p_evidence_reference" text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	request_row public.access_requests%ROWTYPE;
	link_row public.account_setup_links%ROWTYPE;
BEGIN
	IF p_release_reason IS NULL OR p_release_reason NOT IN ('provider-terminal', 'provider-quiescent') THEN
		RAISE EXCEPTION 'A provider operation attestation is required' USING ERRCODE = '22023';
	END IF;
	-- Require a case/ticket ID such as INC-12345. A free-form string could
	-- accidentally persist a setup token or provider credential in audit_logs.
	IF p_evidence_reference IS NULL OR p_evidence_reference !~ '^[A-Z][A-Z0-9]{1,15}-[0-9]{3,12}$' THEN
		RAISE EXCEPTION 'A case or ticket ID is required' USING ERRCODE = '22023';
	END IF;

	-- The service-role operational caller authenticates the human operator at
	-- the application edge and supplies that actor's ID. SQL also requires the
	-- attested actor to remain the platform operator for this write.
	PERFORM 1
	FROM public.platform_operators
	WHERE user_id = p_operator_user_id
	FOR SHARE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Platform operator authorization is required' USING ERRCODE = '42501';
	END IF;

	-- Match claim admission's lock order: request row, normalized stored-email
	-- advisory lock, target link. A different request for this email cannot claim
	-- while the release and its audit record are uncommitted.
	SELECT * INTO request_row
	FROM public.access_requests
	WHERE id = p_access_request_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Access Request for claim release is missing' USING ERRCODE = '55000';
	END IF;

	PERFORM pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended('account-setup-claim:' || pg_catalog.lower(pg_catalog.btrim(request_row.email)), 0)
	);

	SELECT * INTO link_row
	FROM public.account_setup_links
	WHERE id = p_setup_link_id AND access_request_id = p_access_request_id
	FOR UPDATE;
	IF NOT FOUND OR link_row.claimed_at IS NULL OR link_row.used_at IS NOT NULL OR link_row.failed_at IS NOT NULL THEN
		RAISE EXCEPTION 'Account Setup claim is not held' USING ERRCODE = '55000';
	END IF;

	UPDATE public.account_setup_links
	SET failed_at = pg_catalog.clock_timestamp(), failure_reason = 'operator-released'
	WHERE id = p_setup_link_id
		AND access_request_id = p_access_request_id
		AND claimed_at IS NOT NULL
		AND used_at IS NULL
		AND failed_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Account Setup claim changed before release' USING ERRCODE = '40001';
	END IF;

	-- Audit and release are one transaction: a failed audit insert rolls back
	-- the terminal state. The evidence reference must never be a raw token or URL.
	INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details, severity)
	VALUES (
		p_operator_user_id,
		'account_setup.claim_released_by_staff',
		'account_setup_link',
		p_setup_link_id,
		pg_catalog.jsonb_build_object(
			'accessRequestId', p_access_request_id,
			'releaseReason', p_release_reason,
			'evidenceReference', p_evidence_reference,
			'priorClaimedAt', link_row.claimed_at
		),
		'warning'
	);

	RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION "public"."release_account_setup_claim_for_staff"(uuid, uuid, uuid, text, text) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_account_setup_claim_for_staff"(uuid, uuid, uuid, text, text) TO "service_role";

CREATE OR REPLACE FUNCTION public.is_user_suspended(check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE WHEN current_setting('role', true) = 'service_role'
  OR public.is_platform_operator() OR (SELECT auth.uid()) = check_user_id
 THEN EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = check_user_id)
 ELSE false END;
$$;

DROP FUNCTION public.is_super_admin();
DROP FUNCTION public.is_platform_admin();
ALTER TABLE public.platform_operators DROP CONSTRAINT platform_admins_role_check;
ALTER TABLE public.platform_operators DROP CONSTRAINT platform_admins_pkey;
ALTER TABLE public.platform_operators DROP CONSTRAINT platform_admins_user_id_key;
ALTER TABLE public.platform_operators DROP COLUMN id, DROP COLUMN role, DROP COLUMN is_active;
ALTER TABLE public.platform_operators ADD PRIMARY KEY (user_id);
ALTER TABLE public.platform_operators RENAME CONSTRAINT platform_admins_user_id_fkey TO platform_operators_user_id_fkey;
DROP INDEX public.idx_platform_admins_user_id;

NOTIFY pgrst, 'reload schema';
COMMIT;
