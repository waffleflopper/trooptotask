-- The Dashboard's Tasking attention: each active Tasking the reader's scope covers, once, under its most
-- urgent kind. The day is the viewer's, passed in; overdue and every window are derived here, never stored.
-- Picks under review never count toward a requirement.
BEGIN;

CREATE FUNCTION public.calendar_tasking_attention(p_organization_id uuid, p_today date, p_limit integer DEFAULT 100)
RETURNS TABLE (
  tasking_id uuid,
  kind text,
  title text,
  responsible_group_id uuid,
  event_title text,
  status text,
  suspense_on date,
  execution_starts_on date,
  staffing_required integer,
  staffing_picked integer,
  equipment_not_ready integer,
  attention_total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH active AS (
    SELECT t.id, t.title, t.responsible_group_id, e.title AS event_title, t.status, t.suspense_on,
      t.execution_starts_on, t.execution_ends_on, t.staffing_required,
      (SELECT count(*)::integer FROM public.calendar_tasking_participants AS p
       WHERE p.organization_id = t.organization_id AND p.tasking_id = t.id AND p.review_since IS NULL) AS picked,
      (SELECT count(*)::integer FROM public.calendar_tasking_equipment AS q
       WHERE q.organization_id = t.organization_id AND q.tasking_id = t.id
         AND q.secured_quantity < q.quantity) AS not_ready
    FROM public.calendar_taskings AS t
    LEFT JOIN public.calendar_events AS e ON e.organization_id = t.organization_id AND e.id = t.event_id
    WHERE t.organization_id = p_organization_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  ),
  kinded AS (
    SELECT a.*,
      CASE
        WHEN a.suspense_on < p_today THEN 'overdue'
        WHEN a.status = 'blocked' THEN 'blocked'
        WHEN a.execution_starts_on IS NOT NULL
          AND a.execution_ends_on >= p_today
          AND a.execution_starts_on <= p_today + 14
          AND (a.picked < coalesce(a.staffing_required, 0) OR a.not_ready > 0) THEN 'short'
        WHEN a.suspense_on <= p_today + 7 THEN 'due_soon'
      END AS kind
    FROM active AS a
  ),
  ranked AS (
    SELECT k.*, count(*) OVER () AS total
    FROM kinded AS k
    WHERE k.kind IS NOT NULL
  )
  SELECT r.id, r.kind, r.title, r.responsible_group_id, r.event_title, r.status, r.suspense_on,
    r.execution_starts_on, r.staffing_required, r.picked, r.not_ready, r.total
  FROM ranked AS r
  ORDER BY
    CASE r.kind WHEN 'overdue' THEN 1 WHEN 'blocked' THEN 2 WHEN 'short' THEN 3 ELSE 4 END,
    CASE WHEN r.kind = 'short' THEN r.execution_starts_on ELSE r.suspense_on END,
    r.title, r.id
  LIMIT greatest(p_limit, 0);
$$;
ALTER FUNCTION public.calendar_tasking_attention(uuid, date, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_tasking_attention(uuid, date, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_attention(uuid, date, integer) TO authenticated;

COMMIT;
