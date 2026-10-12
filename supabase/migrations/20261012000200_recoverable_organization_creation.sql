CREATE TABLE public.organization_creation_requests (
	user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
	request_id uuid NOT NULL,
	organization_id uuid NOT NULL UNIQUE
		REFERENCES public.organizations (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.organization_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_creation_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_organization(p_name text, p_request_id uuid, p_defaults jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
	v_user_id uuid := auth.uid();
	v_email text;
	v_confirmed boolean;
	v_name text;
	v_key text;
	v_org_id uuid;
	v_inserted uuid;
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required to create an organization';
	END IF;

	SELECT lower(btrim(u.email)), COALESCE(u.email_confirmed_at, u.confirmed_at) IS NOT NULL
	INTO v_email, v_confirmed
	FROM auth.users AS u
	WHERE u.id = v_user_id;

	IF v_confirmed IS NOT TRUE THEN
		RAISE EXCEPTION 'Confirm your email before creating an organization' USING ERRCODE = '42501';
	END IF;

	IF p_request_id IS NULL THEN
		RAISE EXCEPTION 'Organization creation request id is required' USING ERRCODE = '22023';
	END IF;

	v_name := btrim(p_name);
	IF v_name IS NULL OR v_name = '' THEN
		RAISE EXCEPTION 'Organization name is required';
	END IF;

	IF char_length(v_name) > 100 THEN
		RAISE EXCEPTION 'Organization name must be 100 characters or fewer';
	END IF;

	IF jsonb_typeof(p_defaults) IS DISTINCT FROM 'object' THEN
		RAISE EXCEPTION 'Organization defaults must be an object' USING ERRCODE = '22023';
	END IF;
	FOREACH v_key IN ARRAY ARRAY['groups', 'status_types', 'assignment_types', 'special_days', 'rank_catalog'] LOOP
		IF jsonb_typeof(p_defaults -> v_key) IS DISTINCT FROM 'array' THEN
			RAISE EXCEPTION 'Organization defaults require a % array', v_key USING ERRCODE = '22023';
		END IF;
	END LOOP;

	v_org_id := gen_random_uuid();
	INSERT INTO public.organization_creation_requests (user_id, request_id, organization_id)
	VALUES (v_user_id, p_request_id, v_org_id)
	ON CONFLICT (user_id, request_id) DO NOTHING
	RETURNING organization_id INTO v_inserted;

	IF v_inserted IS NULL THEN
		SELECT r.organization_id
		INTO v_org_id
		FROM public.organization_creation_requests AS r
		WHERE r.user_id = v_user_id AND r.request_id = p_request_id;
		RETURN v_org_id;
	END IF;

	INSERT INTO public.organizations (id, name, created_by)
	VALUES (v_org_id, v_name, v_user_id);

	INSERT INTO public.organization_memberships (
		organization_id,
		user_id,
		role,
		member_preset,
		capability_overrides,
		access_scope_kind,
		access_scope_group_ids,
		email
	)
	VALUES (
		v_org_id,
		v_user_id,
		'owner',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		v_email
	);

	INSERT INTO public.groups (organization_id, name, sort_order)
	SELECT v_org_id, d.name, d.sort_order
	FROM jsonb_to_recordset(p_defaults -> 'groups') AS d (name text, sort_order integer);

	INSERT INTO public.status_types (organization_id, name, color, text_color, sort_order)
	SELECT v_org_id, d.name, d.color, d.text_color, d.sort_order
	FROM jsonb_to_recordset(p_defaults -> 'status_types')
		AS d (name text, color text, text_color text, sort_order integer);

	INSERT INTO public.assignment_types (organization_id, name, short_name, assign_to, color, sort_order)
	SELECT v_org_id, d.name, d.short_name, d.assign_to, d.color, d.sort_order
	FROM jsonb_to_recordset(p_defaults -> 'assignment_types')
		AS d (name text, short_name text, assign_to text, color text, sort_order integer);

	INSERT INTO public.special_days (organization_id, date, name, type)
	SELECT v_org_id, d.date, d.name, d.type
	FROM jsonb_to_recordset(p_defaults -> 'special_days') AS d (date date, name text, type text);

	INSERT INTO public.organization_rank_catalog (
		organization_id, code, label, service, category, pay_grade, state, source, sort_order
	)
	SELECT v_org_id, d.code, d.label, d.service, d.category, d.pay_grade, d.state, d.source, d.sort_order
	FROM jsonb_to_recordset(p_defaults -> 'rank_catalog')
		AS d (code text, label text, service text, category text, pay_grade text, state text, source text, sort_order integer);

	RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text, uuid, jsonb) TO authenticated;

DROP FUNCTION public.create_org_with_owner(text);
