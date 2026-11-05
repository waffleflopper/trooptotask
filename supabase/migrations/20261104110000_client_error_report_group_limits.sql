-- A signed-in browser can report failures, so what it reports must not grow storage without bound or undo an
-- operator's work. An account creates at most 20 new client-reported groups a day; further new failures from it join
-- one overflow group for that account. A client report never reopens a resolved group, a server failure still does.
BEGIN;

ALTER TABLE public.platform_error_groups
	ADD COLUMN first_reported_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
CREATE INDEX platform_error_groups_first_reported_by_idx
	ON public.platform_error_groups (first_reported_by, first_seen_at) WHERE origin = 'client_reported';

CREATE OR REPLACE FUNCTION public.record_platform_error(
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
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
	v_fingerprint text := p_fingerprint;
	v_name text := p_name;
	v_code text := p_code;
	v_message text := p_message;
	v_route_id text := p_route_id;
	v_method text := p_method;
	v_group_id uuid;
BEGIN
	-- A retry of the same reference changes nothing.
	IF EXISTS (SELECT 1 FROM public.platform_error_occurrences seen WHERE seen.id = p_reference) THEN
		RETURN;
	END IF;

	IF p_origin = 'client_reported' AND p_user_id IS NOT NULL
		AND NOT EXISTS (SELECT 1 FROM public.platform_error_groups known WHERE known.fingerprint = p_fingerprint) THEN
		-- Serialize one account's new groups so concurrent reports cannot all pass the count.
		PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client-error-groups:' || p_user_id::text, 0));
		IF NOT EXISTS (SELECT 1 FROM public.platform_error_groups known WHERE known.fingerprint = p_fingerprint)
			AND (
				SELECT pg_catalog.count(*)
				FROM public.platform_error_groups mine
				WHERE mine.origin = 'client_reported'
					AND mine.first_reported_by = p_user_id
					AND mine.first_seen_at > pg_catalog.now() - interval '1 day'
					AND mine.fingerprint NOT LIKE 'client-overflow:%'
			) >= 20 THEN
			v_fingerprint := 'client-overflow:' || p_user_id::text;
			v_name := 'ClientReportOverflow';
			v_code := NULL;
			v_message := 'Further new client failures from this account passed the daily limit';
			v_route_id := NULL;
			v_method := NULL;
		END IF;
	END IF;

	INSERT INTO public.platform_error_groups AS g
		(fingerprint, origin, kind, name, code, message, route_id, method, first_reported_by)
	VALUES (
		v_fingerprint, p_origin, p_kind, v_name, v_code, v_message, v_route_id, v_method,
		CASE WHEN p_origin = 'client_reported' THEN p_user_id END
	)
	ON CONFLICT (fingerprint) DO UPDATE SET
		last_seen_at = pg_catalog.now(),
		status = CASE WHEN p_origin = 'client_reported' THEN g.status ELSE 'open' END,
		resolved_at = CASE WHEN p_origin = 'client_reported' THEN g.resolved_at END,
		resolved_by = CASE WHEN p_origin = 'client_reported' THEN g.resolved_by END
	RETURNING g.id INTO v_group_id;

	INSERT INTO public.platform_error_occurrences (id, group_id, user_id, organization_id, http_status)
	VALUES (p_reference, v_group_id, p_user_id, p_organization_id, p_http_status)
	ON CONFLICT (id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.record_platform_error(uuid, text, text, text, text, text, text, text, text, smallint, uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_platform_error(uuid, text, text, text, text, text, text, text, text, smallint, uuid, uuid)
	TO service_role;

COMMIT;
