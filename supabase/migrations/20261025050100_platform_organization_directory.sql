BEGIN;

-- The suspension reason is an operator note. It lives beside, not inside, organizations so Organization
-- members, who can read their own Organization row, never see it. Only the service role reaches it.
CREATE TABLE public.organization_suspensions (
	organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
	reason text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(reason)) BETWEEN 1 AND 500),
	suspended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
	suspended_at timestamptz NOT NULL
);
ALTER TABLE public.organization_suspensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_suspensions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.organization_suspensions TO service_role;

-- Suspension state and its reason change together, and only for a current operator.
CREATE FUNCTION public.platform_suspend_organization(
	p_actor_user_id uuid, p_organization_id uuid, p_reason text, p_suspended_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
	v_suspended_at timestamptz;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM public.platform_operators WHERE user_id = p_actor_user_id)
		OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_user_id) THEN
		RAISE EXCEPTION 'Current platform operator access is required' USING ERRCODE = '42501';
	END IF;
	UPDATE public.organizations
	SET suspended_at = coalesce(suspended_at, p_suspended_at)
	WHERE id = p_organization_id
	RETURNING suspended_at INTO v_suspended_at;
	IF NOT FOUND THEN RETURN false; END IF;
	INSERT INTO public.organization_suspensions (organization_id, reason, suspended_by, suspended_at)
	VALUES (p_organization_id, p_reason, p_actor_user_id, v_suspended_at)
	ON CONFLICT (organization_id) DO UPDATE
	SET reason = EXCLUDED.reason, suspended_by = EXCLUDED.suspended_by, suspended_at = EXCLUDED.suspended_at;
	RETURN true;
END;
$$;

CREATE FUNCTION public.platform_unsuspend_organization(p_actor_user_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM public.platform_operators WHERE user_id = p_actor_user_id)
		OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_user_id) THEN
		RAISE EXCEPTION 'Current platform operator access is required' USING ERRCODE = '42501';
	END IF;
	UPDATE public.organizations SET suspended_at = NULL WHERE id = p_organization_id;
	IF NOT FOUND THEN RETURN false; END IF;
	DELETE FROM public.organization_suspensions WHERE organization_id = p_organization_id;
	RETURN true;
END;
$$;

-- One definition of Status for the list and the page: Quiet is no audit event for 30 days,
-- counted from creation for a unit that has never been used.
CREATE FUNCTION public.platform_organization_status(
	p_suspended_at timestamptz, p_last_active_at timestamptz, p_created_at timestamptz
) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
	SELECT CASE
		WHEN p_suspended_at IS NOT NULL THEN 'suspended'
		WHEN coalesce(p_last_active_at, p_created_at) < pg_catalog.now() - interval '30 days' THEN 'quiet'
		ELSE 'active'
	END;
$$;

-- One page of Organizations with every list fact. Filtering, ordering and paging run over the cheap
-- columns, and the counts and owner are read for the page's rows only. The page is clamped here, so a
-- stale page number still returns the last page, and an empty result still returns its total.
CREATE FUNCTION public.platform_list_organizations(
	p_search text, p_filter text, p_page integer, p_page_size integer
) RETURNS TABLE (
	total_count bigint,
	page integer,
	organization_id uuid,
	name text,
	created_at timestamptz,
	status text,
	last_active_at timestamptz,
	member_count bigint,
	personnel_count bigint,
	owner_count bigint,
	owner_email text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
	WITH search AS (
		SELECT '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
			pg_catalog.btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pattern,
			pg_catalog.btrim(coalesce(p_search, '')) = '' AS empty
	),
	matched AS (
		SELECT o.id, o.name, o.created_at, o.suspended_at, activity.last_active_at,
			public.platform_organization_status(o.suspended_at, activity.last_active_at, o.created_at) AS status
		FROM public.organizations o
		CROSS JOIN search
		CROSS JOIN LATERAL (
			SELECT pg_catalog.max(a."timestamp") AS last_active_at FROM public.audit_logs a WHERE a.org_id = o.id
		) activity
		WHERE search.empty
			OR o.name ILIKE search.pattern
			OR EXISTS (
				SELECT 1 FROM public.organization_memberships m
				WHERE m.organization_id = o.id AND m.role = 'owner' AND m.email ILIKE search.pattern
			)
	),
	filtered AS (
		SELECT matched.*,
			pg_catalog.row_number() OVER (
				ORDER BY matched.last_active_at DESC NULLS LAST, matched.created_at DESC, matched.id DESC
			) AS position,
			pg_catalog.count(*) OVER () AS total
		FROM matched
		WHERE CASE p_filter
			WHEN 'active-week' THEN matched.status <> 'suspended'
				AND matched.last_active_at >= pg_catalog.now() - interval '7 days'
			WHEN 'quiet' THEN matched.status = 'quiet'
			WHEN 'suspended' THEN matched.status = 'suspended'
			ELSE true
		END
	),
	bounds AS (
		SELECT greatest(1, least(greatest(1, p_page),
			greatest(1, pg_catalog.ceil(coalesce(
				(SELECT pg_catalog.max(total) FROM filtered), 0)::numeric / greatest(1, p_page_size))::integer)
		)) AS page,
		coalesce((SELECT pg_catalog.max(total) FROM filtered), 0)::bigint AS total
	)
	SELECT bounds.total, bounds.page, f.id, f.name, f.created_at, f.status, f.last_active_at,
		facts.member_count, facts.personnel_count, facts.owner_count, facts.owner_email
	FROM bounds
	LEFT JOIN filtered f
		ON f.position > (bounds.page - 1) * p_page_size AND f.position <= bounds.page * p_page_size
	LEFT JOIN LATERAL (
		SELECT
			(SELECT pg_catalog.count(*) FROM public.organization_memberships m WHERE m.organization_id = f.id) AS member_count,
			(SELECT pg_catalog.count(*) FROM public.personnel p
				WHERE p.organization_id = f.id AND p.archived_at IS NULL) AS personnel_count,
			(SELECT pg_catalog.count(*) FROM public.organization_memberships m
				WHERE m.organization_id = f.id AND m.role = 'owner') AS owner_count,
			(SELECT pg_catalog.min(coalesce(m.email, u.email))
				FROM public.organization_memberships m LEFT JOIN auth.users u ON u.id = m.user_id
				WHERE m.organization_id = f.id AND m.role = 'owner') AS owner_email
	) facts ON f.id IS NOT NULL
	ORDER BY f.position;
$$;

-- The Organization page's own facts, members with last sign-in, pending invitations and suspension.
CREATE FUNCTION public.platform_organization_detail(p_organization_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
	SELECT pg_catalog.jsonb_build_object(
		'id', o.id,
		'name', o.name,
		'createdAt', o.created_at,
		'suspendedAt', o.suspended_at,
		'status', public.platform_organization_status(o.suspended_at, activity.last_active_at, o.created_at),
		'lastActiveAt', activity.last_active_at,
		'personnelCount', (SELECT pg_catalog.count(*) FROM public.personnel p
			WHERE p.organization_id = o.id AND p.archived_at IS NULL),
		'suspension', (
			SELECT pg_catalog.jsonb_build_object('reason', s.reason, 'suspendedAt', s.suspended_at,
				'suspendedByEmail', operator.email)
			FROM public.organization_suspensions s LEFT JOIN auth.users operator ON operator.id = s.suspended_by
			WHERE s.organization_id = o.id
		),
		'members', coalesce((
			SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
				'userId', m.user_id, 'email', coalesce(m.email, u.email), 'role', m.role,
				'lastSignInAt', u.last_sign_in_at
			) ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at, m.id)
			FROM public.organization_memberships m LEFT JOIN auth.users u ON u.id = m.user_id
			WHERE m.organization_id = o.id
		), '[]'::jsonb),
		'invitations', coalesce((
			SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
				'id', i.id, 'email', i.email, 'role', i.role, 'invitedAt', i.created_at, 'expiresAt', i.expires_at
			) ORDER BY i.created_at DESC, i.id DESC)
			FROM public.organization_invitations i
			WHERE i.organization_id = o.id AND i.status = 'pending'
		), '[]'::jsonb)
	)
	FROM public.organizations o
	CROSS JOIN LATERAL (
		SELECT pg_catalog.max(a."timestamp") AS last_active_at FROM public.audit_logs a WHERE a.org_id = o.id
	) activity
	WHERE o.id = p_organization_id;
$$;

REVOKE ALL ON FUNCTION public.platform_suspend_organization(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_unsuspend_organization(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_organization_status(timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_list_organizations(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_organization_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_suspend_organization(uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_unsuspend_organization(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_organization_status(timestamptz, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_list_organizations(text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_organization_detail(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
