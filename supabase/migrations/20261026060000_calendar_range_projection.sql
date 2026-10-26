-- One read for the Calendar matrix and the Dashboard forecast: the Events that
-- overlap a date range, the active Taskings whose suspense falls in it, and the
-- commitments of People picked for active Taskings whose execution dates overlap
-- it. It runs as the caller, so every row passes the same policies as a direct
-- read: Events for any Calendar reader, a Tasking only where the reader's scope
-- covers its responsibility, a pick only for a Person in the reader's roster
-- scope. A pick under review commits nobody.
BEGIN;

CREATE FUNCTION public.calendar_range_projection(p_organization_id uuid, p_range_start date, p_range_end date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL OR p_range_end < p_range_start OR p_range_end - p_range_start > 400 THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22023';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'events', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'title', e.title, 'startsOn', e.starts_on, 'endsOn', e.ends_on, 'cancelled', e.cancelled_at IS NOT NULL
      ) ORDER BY e.starts_on, e.title, e.id)
      FROM public.calendar_events AS e
      WHERE e.organization_id = p_organization_id AND e.starts_on <= p_range_end AND e.ends_on >= p_range_start
    ), '[]'::jsonb),
    'suspenses', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'taskingId', t.id, 'title', t.title, 'suspenseOn', t.suspense_on, 'status', t.status
      ) ORDER BY t.suspense_on, t.title, t.id)
      FROM public.calendar_taskings AS t
      WHERE t.organization_id = p_organization_id AND t.status IN ('open', 'in_progress', 'blocked')
        AND t.suspense_on BETWEEN p_range_start AND p_range_end
    ), '[]'::jsonb),
    'commitments', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'taskingId', t.id, 'title', t.title, 'personnelId', p.personnel_id,
        'startsOn', t.execution_starts_on, 'endsOn', t.execution_ends_on
      ) ORDER BY p.personnel_id, t.execution_starts_on, t.id)
      FROM public.calendar_taskings AS t
      JOIN public.calendar_tasking_participants AS p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
      WHERE t.organization_id = p_organization_id AND t.status IN ('open', 'in_progress', 'blocked')
        AND t.execution_starts_on <= p_range_end AND t.execution_ends_on >= p_range_start
        AND p.review_since IS NULL
    ), '[]'::jsonb)
  );
END;
$$;
ALTER FUNCTION public.calendar_range_projection(uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_range_projection(uuid, date, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_range_projection(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
