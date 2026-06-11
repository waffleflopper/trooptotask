CREATE OR REPLACE FUNCTION public.create_org_with_owner(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
	v_org_id uuid;
	v_org_name text;
	v_user_id uuid := auth.uid();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required to create an organization';
	END IF;

	v_org_name := btrim(p_name);
	IF v_org_name IS NULL OR v_org_name = '' THEN
		RAISE EXCEPTION 'Organization name is required';
	END IF;

	IF char_length(v_org_name) > 100 THEN
		RAISE EXCEPTION 'Organization name must be 100 characters or fewer';
	END IF;

	INSERT INTO public.organizations (name, created_by)
	VALUES (v_org_name, v_user_id)
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
