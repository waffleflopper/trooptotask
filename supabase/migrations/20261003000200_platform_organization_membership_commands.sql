-- Organization owns privileged membership transitions. All transfers serialize
-- with ordinary ownership transfer and parent deletion on the Organization row.
-- Apply remotely only through the owner's migration/release procedure.
BEGIN;

CREATE FUNCTION public.platform_promote_org_member(
  p_actor_user_id uuid, p_organization_id uuid, p_target_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exists boolean;
  v_admin_id uuid;
  v_membership_id uuid;
  v_role public.organization_role;
  v_changed integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Membership commands require read committed isolation' USING ERRCODE = '25000';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  v_exists := FOUND;
  -- This separate query sees authority revoked while the Organization lock waited.
  SELECT id INTO v_admin_id FROM public.platform_admins
    WHERE user_id = p_actor_user_id AND is_active AND role = 'super_admin' FOR SHARE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_user_id) THEN
    RAISE EXCEPTION 'Current active super-admin access is required' USING ERRCODE = '42501';
  END IF;
  IF NOT v_exists THEN RETURN pg_catalog.jsonb_build_object('status','organization_not_found'); END IF;
  SELECT id, role INTO v_membership_id, v_role FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','target_not_member'); END IF;
  IF v_role = 'owner' THEN RETURN pg_catalog.jsonb_build_object('status','already_owner'); END IF;
  IF v_role = 'admin' THEN RETURN pg_catalog.jsonb_build_object('status','already_admin'); END IF;
  UPDATE public.organization_memberships
    SET role = 'admin', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE id = v_membership_id AND organization_id = p_organization_id AND role = 'member';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Membership promotion was not acknowledged'; END IF;
  RETURN pg_catalog.jsonb_build_object('status','updated','org_id',p_organization_id,'target_user_id',p_target_user_id);
END;
$$;

CREATE FUNCTION public.platform_transfer_org_ownership(
  p_actor_user_id uuid, p_organization_id uuid, p_target_user_id uuid, p_confirm_name text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exists boolean;
  v_name text;
  v_admin_id uuid;
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
  SELECT id INTO v_admin_id FROM public.platform_admins
    WHERE user_id = p_actor_user_id AND is_active AND role = 'super_admin' FOR SHARE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_user_id) THEN
    RAISE EXCEPTION 'Current active super-admin access is required' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.platform_promote_org_member(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_transfer_org_ownership(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_promote_org_member(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_transfer_org_ownership(uuid,uuid,uuid,text) TO service_role;

-- Preserve the ordinary API and its existing ACL. Recheck the current owner only
-- after taking the same lock; a former owner's queued transfer must not succeed.
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
NOTIFY pgrst, 'reload schema';
COMMIT;
