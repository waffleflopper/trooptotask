CREATE OR REPLACE FUNCTION public.create_org_with_owner(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
	v_org_id uuid;
	v_user_id uuid := auth.uid();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required to create an organization';
	END IF;

	INSERT INTO public.organizations (name, created_by)
	VALUES (p_name, v_user_id)
	RETURNING id INTO v_org_id;

	INSERT INTO public.organization_memberships (
		organization_id,
		user_id,
		role,
		member_preset,
		capability_overrides,
		access_scope_kind,
		access_scope_group_ids
	)
	VALUES (
		v_org_id,
		v_user_id,
		'owner',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	);

	RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
	v_current_owner_id uuid := auth.uid();
BEGIN
	IF NOT public.is_org_owner(p_organization_id) THEN
		RAISE EXCEPTION 'Only the owner can transfer ownership';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM public.organization_memberships
		WHERE organization_id = p_organization_id
			AND user_id = p_new_owner_id
	) THEN
		RAISE EXCEPTION 'New owner must be an existing member';
	END IF;

	UPDATE public.organization_memberships
	SET role = 'admin',
		member_preset = 'editor',
		capability_overrides = '{}'::jsonb,
		access_scope_kind = 'organization',
		access_scope_group_ids = ARRAY[]::uuid[]
	WHERE organization_id = p_organization_id
		AND user_id = v_current_owner_id;

	UPDATE public.organization_memberships
	SET role = 'owner',
		member_preset = 'editor',
		capability_overrides = '{}'::jsonb,
		access_scope_kind = 'organization',
		access_scope_group_ids = ARRAY[]::uuid[]
	WHERE organization_id = p_organization_id
		AND user_id = p_new_owner_id;
END;
$$;
