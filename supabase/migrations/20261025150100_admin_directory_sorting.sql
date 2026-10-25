BEGIN;

DROP FUNCTION public.platform_account_directory(text, text, integer, integer);

CREATE FUNCTION public.platform_account_directory(
  p_search text DEFAULT '', p_filter text DEFAULT 'all', p_page integer DEFAULT 1, p_limit integer DEFAULT 20,
  p_sort text DEFAULT 'added', p_dir text DEFAULT 'desc'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH input AS (
    SELECT CASE WHEN p_sort IN ('person', 'organizations', 'lastSignIn', 'status', 'added') AND p_dir IN ('asc', 'desc')
        THEN p_sort ELSE 'added' END AS sort_key,
      CASE WHEN p_sort IN ('person', 'organizations', 'lastSignIn', 'status', 'added') AND p_dir IN ('asc', 'desc')
        THEN p_dir ELSE 'desc' END AS direction,
      '%' || replace(replace(replace(left(trim(coalesce(p_search, '')), 100), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' AS pattern,
      greatest(1, least(coalesce(p_limit, 20), 100)) AS lim,
      greatest(1, coalesce(p_page, 1)) AS requested_page
  ), request_candidates AS MATERIALIZED (
    SELECT r.id, r.email, r.created_at FROM public.access_requests r, input
    WHERE p_filter IN ('all', 'notSetUp') AND (r.name ILIKE input.pattern OR r.email ILIKE input.pattern)
      AND r.status = 'approved' AND r.setup_completed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.access_requests newer
        WHERE lower(newer.email) = lower(r.email) AND (newer.created_at, newer.id) > (r.created_at, r.id))
  ), requests AS (
    SELECT DISTINCT ON (lower(r.email)) r.id FROM request_candidates r
    WHERE public.access_request_setup_grant_is_live(r.id)
    ORDER BY lower(r.email), r.created_at DESC, r.id DESC
  ), people AS (
    SELECT u.id, u.email, coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email, 'Unnamed account') AS name,
      u.created_at, u.last_sign_in_at, u.email_confirmed_at,
      CASE WHEN s.user_id IS NULL THEN jsonb_build_object('kind', 'active', 'userId', u.id)
        ELSE jsonb_build_object('kind', 'suspended', 'userId', u.id, 'reason', coalesce(s.reason, ''), 'suspendedAt', s.suspended_at) END AS state
    FROM auth.users u LEFT JOIN public.user_profiles p ON p.user_id = u.id
      LEFT JOIN public.user_suspensions s ON s.user_id = u.id
    UNION ALL
    SELECT r.id, r.email, r.name, r.created_at, NULL::timestamptz, NULL::timestamptz,
      jsonb_build_object('kind', 'notSetUp', 'requestId', r.id, 'approvedAt', coalesce(r.reviewed_at, r.created_at), 'linkExpiresAt', l.expires_at)
    FROM public.access_requests r JOIN requests ON requests.id = r.id
      LEFT JOIN LATERAL (SELECT x.expires_at FROM public.account_setup_links x
        WHERE x.access_request_id = r.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1) l ON true
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.setup_user_id OR lower(u.email) = lower(r.email))
  ), filtered AS MATERIALIZED (
    SELECT people.*,
      CASE WHEN state->>'kind' = 'notSetUp' THEN 0 ELSE
        (SELECT count(*) FROM public.organization_memberships m WHERE m.user_id = people.id) END AS organization_count
    FROM people, input
    WHERE (name ILIKE input.pattern OR email ILIKE input.pattern)
      AND (p_filter = 'all' OR (p_filter = 'notSetUp' AND state->>'kind' = 'notSetUp')
        OR (p_filter = 'suspended' AND state->>'kind' = 'suspended'))
  ), paging AS (
    SELECT count(filtered.id) AS total, i.lim,
      least(i.requested_page, greatest(1, ceil(count(filtered.id)::numeric / i.lim)::integer)) AS page
    FROM filtered RIGHT JOIN input i ON true GROUP BY i.lim, i.requested_page
  ), page_rows AS (
    SELECT f.*, row_number() OVER (ORDER BY
      CASE WHEN input.sort_key = 'person' AND input.direction = 'asc' THEN lower(f.name) END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'person' AND input.direction = 'desc' THEN lower(f.name) END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'organizations' AND input.direction = 'asc' THEN f.organization_count END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'organizations' AND input.direction = 'desc' THEN f.organization_count END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'lastSignIn' AND input.direction = 'asc' THEN f.last_sign_in_at END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'lastSignIn' AND input.direction = 'desc' THEN f.last_sign_in_at END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'status' AND input.direction = 'asc' THEN CASE f.state->>'kind' WHEN 'active' THEN 0 WHEN 'notSetUp' THEN 1 ELSE 2 END END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'status' AND input.direction = 'desc' THEN CASE f.state->>'kind' WHEN 'active' THEN 0 WHEN 'notSetUp' THEN 1 ELSE 2 END END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'added' AND input.direction = 'asc' THEN f.created_at END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'added' AND input.direction = 'desc' THEN f.created_at END DESC NULLS LAST,
      f.created_at DESC,
      f.id DESC) AS position
    FROM filtered f CROSS JOIN input ORDER BY position
      LIMIT (SELECT lim FROM paging) OFFSET (SELECT (page::bigint - 1) * lim FROM paging)
  ) SELECT jsonb_build_object('people', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'email', email, 'createdAt', created_at, 'lastSignInAt', last_sign_in_at,
    'emailConfirmedAt', email_confirmed_at, 'organizationCount', organization_count, 'state', state
  ) ORDER BY position) FROM page_rows), '[]'::jsonb),
    'totalCount', paging.total, 'page', paging.page, 'limit', paging.lim) FROM paging;
$$;
REVOKE ALL ON FUNCTION public.platform_account_directory(text, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_account_directory(text, text, integer, integer, text, text) TO service_role;

DROP FUNCTION public.platform_list_organizations(text, text, integer, integer);

CREATE FUNCTION public.platform_list_organizations(
	p_search text, p_filter text, p_page integer, p_page_size integer,
	p_sort text DEFAULT 'lastActive', p_dir text DEFAULT 'desc'
) RETURNS TABLE (
	total_count bigint,
	page integer,
	all_count bigint,
	active_week_count bigint,
	quiet_count bigint,
	suspended_count bigint,
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
	WITH input AS (
    SELECT CASE WHEN p_sort IN ('name', 'owner', 'members', 'personnel', 'lastActive', 'created', 'status') AND p_dir IN ('asc', 'desc')
      THEN p_sort ELSE 'lastActive' END AS sort_key,
      CASE WHEN p_sort IN ('name', 'owner', 'members', 'personnel', 'lastActive', 'created', 'status') AND p_dir IN ('asc', 'desc')
      THEN p_dir ELSE 'desc' END AS direction
  ), search AS (
		SELECT '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
			pg_catalog.btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pattern,
			pg_catalog.btrim(coalesce(p_search, '')) = '' AS empty
	),
	matched AS (
		SELECT o.id, o.name, o.created_at, o.suspended_at, activity.last_active_at,
			facts.member_count, facts.personnel_count, facts.owner_count, facts.owner_email,
			public.platform_organization_status(o.suspended_at, activity.last_active_at, o.created_at) AS status,
			coalesce(o.suspended_at IS NULL AND activity.last_active_at >= pg_catalog.now() - interval '7 days', false) AS active_week
		FROM public.organizations o
		CROSS JOIN search
		CROSS JOIN LATERAL (
			SELECT pg_catalog.max(a."timestamp") AS last_active_at FROM public.audit_logs a WHERE a.org_id = o.id
		) activity
		CROSS JOIN LATERAL (
		SELECT
			(SELECT pg_catalog.count(*) FROM public.organization_memberships m WHERE m.organization_id = o.id) AS member_count,
			(SELECT pg_catalog.count(*) FROM public.personnel p
				WHERE p.organization_id = o.id AND p.archived_at IS NULL) AS personnel_count,
			(SELECT pg_catalog.count(*) FROM public.organization_memberships m
				WHERE m.organization_id = o.id AND m.role = 'owner') AS owner_count,
			(SELECT pg_catalog.min(coalesce(m.email, u.email))
				FROM public.organization_memberships m LEFT JOIN auth.users u ON u.id = m.user_id
				WHERE m.organization_id = o.id AND m.role = 'owner') AS owner_email
	) facts
		WHERE search.empty
			OR o.name ILIKE search.pattern
			OR EXISTS (
				SELECT 1 FROM public.organization_memberships m
				LEFT JOIN auth.users owner_account ON owner_account.id = m.user_id
				WHERE m.organization_id = o.id AND m.role = 'owner'
					AND coalesce(m.email, owner_account.email) ILIKE search.pattern
			)
	),
	filtered AS (
		SELECT matched.*,
			pg_catalog.row_number() OVER (
				ORDER BY
      CASE WHEN input.sort_key = 'name' AND input.direction = 'asc' THEN lower(matched.name) END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'name' AND input.direction = 'desc' THEN lower(matched.name) END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'owner' AND input.direction = 'asc' THEN lower(matched.owner_email) END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'owner' AND input.direction = 'desc' THEN lower(matched.owner_email) END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'members' AND input.direction = 'asc' THEN matched.member_count END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'members' AND input.direction = 'desc' THEN matched.member_count END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'personnel' AND input.direction = 'asc' THEN matched.personnel_count END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'personnel' AND input.direction = 'desc' THEN matched.personnel_count END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'lastActive' AND input.direction = 'asc' THEN matched.last_active_at END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'lastActive' AND input.direction = 'desc' THEN matched.last_active_at END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'created' AND input.direction = 'asc' THEN matched.created_at END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'created' AND input.direction = 'desc' THEN matched.created_at END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'status' AND input.direction = 'asc' THEN CASE matched.status WHEN 'active' THEN 0 WHEN 'quiet' THEN 1 ELSE 2 END END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'status' AND input.direction = 'desc' THEN CASE matched.status WHEN 'active' THEN 0 WHEN 'quiet' THEN 1 ELSE 2 END END DESC NULLS LAST,
      matched.created_at DESC,
      matched.id DESC
			) AS position,
			pg_catalog.count(*) OVER () AS total
		FROM matched CROSS JOIN input
		WHERE CASE p_filter
			WHEN 'active-week' THEN matched.active_week
			WHEN 'quiet' THEN matched.status = 'quiet'
			WHEN 'suspended' THEN matched.status = 'suspended'
			ELSE true
		END
	),
	counts AS (
		SELECT pg_catalog.count(*) AS all_count,
			pg_catalog.count(*) FILTER (WHERE active_week) AS active_week_count,
			pg_catalog.count(*) FILTER (WHERE status = 'quiet') AS quiet_count,
			pg_catalog.count(*) FILTER (WHERE status = 'suspended') AS suspended_count
		FROM matched
	),
	bounds AS (
		SELECT greatest(1, least(greatest(1, p_page),
			greatest(1, pg_catalog.ceil(coalesce(
				(SELECT pg_catalog.max(total) FROM filtered), 0)::numeric / greatest(1, p_page_size))::integer)
		)) AS page,
		coalesce((SELECT pg_catalog.max(total) FROM filtered), 0)::bigint AS total
	)
	SELECT bounds.total, bounds.page, counts.all_count, counts.active_week_count, counts.quiet_count,
		counts.suspended_count, f.id, f.name, f.created_at, f.status, f.last_active_at,
		f.member_count, f.personnel_count, f.owner_count, f.owner_email
	FROM bounds
	CROSS JOIN counts
	LEFT JOIN filtered f
		ON f.position > (bounds.page - 1) * p_page_size AND f.position <= bounds.page * p_page_size
	ORDER BY f.position;
$$;

REVOKE ALL ON FUNCTION public.platform_list_organizations(text, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_organizations(text, text, integer, integer, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
