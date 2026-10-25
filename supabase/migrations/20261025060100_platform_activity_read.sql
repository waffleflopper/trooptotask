-- One page of platform Activity: filtered, searched, paged and joined to the Organization name in a single read.
-- An offset past the last page clamps to the last page, and the offset used comes back with every row.
CREATE FUNCTION public.list_platform_activity(
  p_actions text[],
  p_prefixes text[],
  p_search text,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer,
  p_offset integer
) RETURNS TABLE (
  id uuid,
  "timestamp" timestamptz,
  user_id uuid,
  org_id uuid,
  org_name text,
  action text,
  resource_type text,
  resource_id uuid,
  ip_address text,
  details jsonb,
  severity text,
  total_count bigint,
  page_offset integer
)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH matched AS MATERIALIZED (
    SELECT a.id, a."timestamp", a.user_id, a.org_id, o.name AS org_name, a.action, a.resource_type, a.resource_id,
      a.ip_address::text AS ip_address, a.details, a.severity
    FROM public.audit_logs a
    LEFT JOIN public.organizations o ON o.id = a.org_id
    WHERE (
        a.action = ANY (coalesce(p_actions, ARRAY[]::text[]))
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(p_prefixes, ARRAY[]::text[])) AS prefix WHERE starts_with(a.action, prefix)
        )
      )
      AND (p_from IS NULL OR a."timestamp" >= p_from)
      AND (p_to IS NULL OR a."timestamp" < p_to)
      AND (
        coalesce(p_search, '') = ''
        OR strpos(lower(a.action), lower(p_search)) > 0
        OR strpos(lower(coalesce(a.details ->> 'actorEmail', '')), lower(p_search)) > 0
        OR strpos(lower(coalesce(a.details ->> 'targetName', '')), lower(p_search)) > 0
        OR strpos(lower(coalesce(a.resource_id::text, '')), lower(p_search)) > 0
        OR strpos(lower(coalesce(o.name, '')), lower(p_search)) > 0
      )
  ),
  bounds AS (
    SELECT count(*) AS total,
      least(greatest(p_offset, 0), (greatest(count(*) - 1, 0) / greatest(p_limit, 1)) * greatest(p_limit, 1))::integer AS skip
    FROM matched
  )
  SELECT m.id, m."timestamp", m.user_id, m.org_id, m.org_name, m.action, m.resource_type, m.resource_id, m.ip_address,
    m.details, m.severity, b.total, b.skip
  FROM matched m CROSS JOIN bounds b
  ORDER BY m."timestamp" DESC, m.id
  OFFSET (SELECT skip FROM bounds) LIMIT greatest(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.list_platform_activity(text[], text[], text, timestamptz, timestamptz, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_platform_activity(text[], text[], text, timestamptz, timestamptz, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_activity(text[], text[], text, timestamptz, timestamptz, integer, integer) TO service_role;
