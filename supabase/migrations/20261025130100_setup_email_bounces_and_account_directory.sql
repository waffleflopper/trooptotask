ALTER TABLE public.access_requests ADD COLUMN rescinded_at timestamptz;
UPDATE public.access_requests r SET rescinded_at = (
  SELECT max(l.revoked_at) FROM public.account_setup_links l
  WHERE l.access_request_id = r.id AND l.revocation_reason = 'manual'
) WHERE r.status = 'rescinded';
CREATE FUNCTION public.stamp_access_request_rescission() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.rescinded_at := CASE WHEN NEW.status = 'rescinded' AND OLD.status <> 'rescinded' THEN now() ELSE OLD.rescinded_at END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER access_request_rescission_stamp BEFORE UPDATE ON public.access_requests
FOR EACH ROW EXECUTE FUNCTION public.stamp_access_request_rescission();
REVOKE ALL ON FUNCTION public.stamp_access_request_rescission() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.account_setup_links
  ADD COLUMN resend_email_id text,
  ADD COLUMN bounced_at timestamptz,
  ADD COLUMN bounce_reason text;
CREATE UNIQUE INDEX account_setup_links_resend_email_id_idx
  ON public.account_setup_links (resend_email_id) WHERE resend_email_id IS NOT NULL;

CREATE FUNCTION public.platform_account_directory(
  p_search text DEFAULT '', p_filter text DEFAULT 'all', p_page integer DEFAULT 1, p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH input AS (
    SELECT '%' || replace(replace(replace(left(trim(coalesce(p_search, '')), 100), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' AS pattern,
      greatest(1, least(coalesce(p_limit, 20), 100)) AS lim,
      greatest(1, coalesce(p_page, 1)) AS requested_page
  ), request_candidates AS MATERIALIZED (
    SELECT r.id, r.email, r.created_at FROM public.access_requests r, input
    WHERE p_filter IN ('all', 'notSetUp') AND (r.name ILIKE input.pattern OR r.email ILIKE input.pattern)
      AND r.status = 'approved' AND r.setup_completed_at IS NULL
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
    SELECT people.* FROM people, input
    WHERE (name ILIKE input.pattern OR email ILIKE input.pattern)
      AND (p_filter = 'all' OR (p_filter = 'notSetUp' AND state->>'kind' = 'notSetUp')
        OR (p_filter = 'suspended' AND state->>'kind' = 'suspended'))
  ), paging AS (
    SELECT count(filtered.id) AS total, i.lim,
      least(i.requested_page, greatest(1, ceil(count(filtered.id)::numeric / i.lim)::integer)) AS page
    FROM filtered RIGHT JOIN input i ON true GROUP BY i.lim, i.requested_page
  ), page_rows AS (
    SELECT f.* FROM filtered f ORDER BY f.created_at DESC, f.id DESC
      LIMIT (SELECT lim FROM paging) OFFSET (SELECT (page::bigint - 1) * lim FROM paging)
  ) SELECT jsonb_build_object('people', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'email', email, 'createdAt', created_at, 'lastSignInAt', last_sign_in_at,
    'emailConfirmedAt', email_confirmed_at, 'organizationCount', CASE WHEN state->>'kind' = 'notSetUp' THEN 0 ELSE (SELECT count(*) FROM public.organization_memberships m WHERE m.user_id = page_rows.id) END, 'state', state
  ) ORDER BY created_at DESC, id DESC) FROM page_rows), '[]'::jsonb),
    'totalCount', paging.total, 'page', paging.page, 'limit', paging.lim) FROM paging;
$$;
REVOKE ALL ON FUNCTION public.platform_account_directory(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_account_directory(text, text, integer, integer) TO service_role;

CREATE FUNCTION public.platform_setup_email_inbox(
  p_tab text DEFAULT 'open', p_limit integer DEFAULT 50, p_now timestamptz DEFAULT now(), p_link_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH failures AS (
    SELECT l.*, r.name, r.email, r.status, r.setup_completed_at, public.access_request_setup_grant_is_live(r.id) AS setup_grant_live,
      CASE WHEN l.bounced_at IS NOT NULL THEN 'bounced' ELSE 'expiredUnused' END AS reason,
      coalesce(l.bounced_at, l.expires_at) AS failed_at_inbox,
      least(r.setup_completed_at, l.used_at,
        r.rescinded_at,
        (SELECT min(o.sent_at) FROM public.account_setup_links newer JOIN public.auth_email_outbox o ON o.setup_link_id = newer.id
          WHERE newer.access_request_id = l.access_request_id AND (newer.created_at, newer.id) > (l.created_at, l.id) AND o.status = 'sent')
      ) AS closed_at,
      NOT EXISTS (SELECT 1 FROM public.account_setup_links newer WHERE newer.access_request_id = l.access_request_id
        AND (newer.created_at, newer.id) > (l.created_at, l.id)
        AND (newer.bounced_at IS NOT NULL OR (newer.expires_at <= p_now AND newer.claimed_at IS NULL
          AND (newer.revoked_at IS NULL OR newer.revoked_at >= newer.expires_at)))) AS latest
    FROM public.account_setup_links l JOIN public.access_requests r ON r.id = l.access_request_id
    WHERE (l.bounced_at IS NOT NULL OR (l.expires_at <= p_now AND l.claimed_at IS NULL AND (l.revoked_at IS NULL OR l.revoked_at >= l.expires_at)))
      AND (p_link_id IS NULL OR l.id = p_link_id)
  ), selected AS MATERIALIZED (
    SELECT * FROM failures WHERE (closed_at IS NULL OR closed_at >= failed_at_inbox)
      AND ((p_tab = 'open' AND latest AND closed_at IS NULL AND (revoked_at IS NULL OR revocation_reason IN ('replaced', 'cleanup'))
        AND status = 'approved' AND setup_completed_at IS NULL AND setup_grant_live)
      OR (p_tab = 'done' AND closed_at >= p_now - interval '30 days' AND closed_at <= p_now)
      OR p_link_id IS NOT NULL)
  ), page_rows AS (
    SELECT * FROM selected ORDER BY coalesce(closed_at, failed_at_inbox) DESC, id DESC LIMIT greatest(0, least(p_limit, 100))
  ) SELECT jsonb_build_object('count', (SELECT count(*) FROM selected), 'rows', coalesce((SELECT jsonb_agg(
    jsonb_build_object('id', id, 'requestId', access_request_id, 'name', name, 'email', email, 'reason', reason,
      'failedAt', failed_at_inbox, 'closedAt', closed_at, 'bounceReason', bounce_reason, 'expiresAt', expires_at,
      'createdAt', created_at, 'claimedAt', claimed_at, 'revokedAt', revoked_at, 'completedAt', setup_completed_at,
      'status', status, 'isOpen', latest AND closed_at IS NULL AND (revoked_at IS NULL OR revocation_reason IN ('replaced', 'cleanup')) AND status = 'approved' AND setup_completed_at IS NULL AND setup_grant_live) ORDER BY coalesce(closed_at, failed_at_inbox) DESC, id DESC) FROM page_rows), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.platform_setup_email_inbox(text, integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_setup_email_inbox(text, integer, timestamptz, uuid) TO service_role;
