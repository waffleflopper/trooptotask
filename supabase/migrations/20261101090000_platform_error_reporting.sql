BEGIN;

-- First-party error capture. The server writes through service_role functions only; no signed-in role reads or
-- writes these tables. Occurrences carry no message, route or request data: those live once on the group.
CREATE TABLE public.platform_error_groups (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	fingerprint text NOT NULL UNIQUE,
	origin text NOT NULL CHECK (origin IN ('server', 'client_reported')),
	kind text NOT NULL CHECK (kind IN ('server_response', 'server_exception', 'render', 'transport', 'unconfirmed_write')),
	name text NOT NULL,
	code text,
	message text NOT NULL,
	route_id text,
	method text,
	status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
	first_seen_at timestamptz NOT NULL DEFAULT now(),
	last_seen_at timestamptz NOT NULL DEFAULT now(),
	resolved_at timestamptz,
	resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
	CONSTRAINT platform_error_groups_resolution_check CHECK (status = 'resolved' OR (resolved_at IS NULL AND resolved_by IS NULL))
);

CREATE TABLE public.platform_error_occurrences (
	id uuid PRIMARY KEY,
	group_id uuid NOT NULL REFERENCES public.platform_error_groups (id) ON DELETE CASCADE,
	occurred_at timestamptz NOT NULL DEFAULT now(),
	user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
	organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
	http_status smallint
);

CREATE INDEX platform_error_groups_status_last_seen_idx ON public.platform_error_groups (status, last_seen_at DESC, id);
CREATE INDEX platform_error_groups_resolved_by_idx ON public.platform_error_groups (resolved_by) WHERE resolved_by IS NOT NULL;
CREATE INDEX platform_error_occurrences_group_idx ON public.platform_error_occurrences (group_id, occurred_at DESC);
CREATE INDEX platform_error_occurrences_occurred_idx ON public.platform_error_occurrences (occurred_at);
CREATE INDEX platform_error_occurrences_user_idx ON public.platform_error_occurrences (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX platform_error_occurrences_org_idx ON public.platform_error_occurrences (organization_id) WHERE organization_id IS NOT NULL;

ALTER TABLE public.platform_error_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_error_occurrences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_error_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_error_occurrences FROM PUBLIC, anon, authenticated;

-- A report that names the failure it was about. Only the server sets it, after proving the submitter owns it.
ALTER TABLE public.beta_feedback
	ADD COLUMN error_reference uuid REFERENCES public.platform_error_occurrences (id) ON DELETE SET NULL;
CREATE INDEX beta_feedback_error_reference_idx ON public.beta_feedback (error_reference) WHERE error_reference IS NOT NULL;

-- One statement: bump or create the group (a recurrence reopens a resolved one), then add the occurrence.
-- A retry of the same reference changes nothing.
CREATE FUNCTION public.record_platform_error(
	p_reference uuid,
	p_fingerprint text,
	p_origin text,
	p_kind text,
	p_name text,
	p_code text,
	p_message text,
	p_route_id text,
	p_method text,
	p_http_status smallint,
	p_user_id uuid,
	p_organization_id uuid
) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
	WITH upserted AS (
		INSERT INTO public.platform_error_groups AS g (fingerprint, origin, kind, name, code, message, route_id, method)
		SELECT p_fingerprint, p_origin, p_kind, p_name, p_code, p_message, p_route_id, p_method
		ON CONFLICT (fingerprint) DO UPDATE
			SET last_seen_at = pg_catalog.now(), status = 'open', resolved_at = NULL, resolved_by = NULL
			WHERE NOT EXISTS (SELECT 1 FROM public.platform_error_occurrences seen WHERE seen.id = p_reference)
		RETURNING g.id
	)
	INSERT INTO public.platform_error_occurrences (id, group_id, user_id, organization_id, http_status)
	SELECT p_reference, upserted.id, p_user_id, p_organization_id, p_http_status FROM upserted
	ON CONFLICT (id) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.record_platform_error(uuid, text, text, text, text, text, text, text, text, smallint, uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_platform_error(uuid, text, text, text, text, text, text, text, text, smallint, uuid, uuid)
	TO service_role;

-- The admin list reads only the retained 30 days, so it stays honest between weekly cleanup runs.
CREATE FUNCTION public.list_platform_error_groups(p_status text, p_limit integer, p_offset integer)
RETURNS TABLE (
	id uuid,
	origin text,
	kind text,
	name text,
	code text,
	message text,
	route_id text,
	method text,
	status text,
	first_seen_at timestamptz,
	last_seen_at timestamptz,
	resolved_at timestamptz,
	occurrence_count bigint,
	affected_users bigint,
	reports jsonb,
	total_count bigint
)
LANGUAGE sql STABLE SET search_path = '' AS $$
	WITH recent AS (
		SELECT o.group_id, pg_catalog.count(*) AS occurrence_count, pg_catalog.count(DISTINCT o.user_id) AS affected_users
		FROM public.platform_error_occurrences o
		WHERE o.occurred_at >= pg_catalog.now() - interval '30 days'
		GROUP BY o.group_id
	), page AS (
		SELECT g.*, r.occurrence_count, r.affected_users, pg_catalog.count(*) OVER () AS total_count
		FROM public.platform_error_groups g
		JOIN recent r ON r.group_id = g.id
		WHERE g.status = p_status
		ORDER BY g.last_seen_at DESC, g.id
		LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
	)
	SELECT page.id, page.origin, page.kind, page.name, page.code, page.message, page.route_id, page.method, page.status,
		page.first_seen_at, page.last_seen_at, page.resolved_at, page.occurrence_count, page.affected_users,
		COALESCE((
			SELECT pg_catalog.jsonb_agg(
				pg_catalog.jsonb_build_object('id', f.id, 'category', f.category, 'createdAt', f.created_at)
				ORDER BY f.created_at DESC, f.id
			)
			FROM public.platform_error_occurrences o
			JOIN public.beta_feedback f ON f.error_reference = o.id
			WHERE o.group_id = page.id AND o.occurred_at >= pg_catalog.now() - interval '30 days'
		), '[]'::jsonb),
		page.total_count
	FROM page
	ORDER BY page.last_seen_at DESC, page.id;
$$;
REVOKE ALL ON FUNCTION public.list_platform_error_groups(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_error_groups(text, integer, integer) TO service_role;

-- Occurrences are kept 30 days; a group left with none goes with them.
CREATE FUNCTION public.cleanup_old_platform_errors() RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
	deleted_count integer;
BEGIN
	DELETE FROM public.platform_error_occurrences WHERE occurred_at < pg_catalog.now() - interval '30 days';
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	DELETE FROM public.platform_error_groups g
	WHERE NOT EXISTS (SELECT 1 FROM public.platform_error_occurrences o WHERE o.group_id = g.id);
	RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_old_platform_errors() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_platform_errors() TO service_role;

COMMIT;
