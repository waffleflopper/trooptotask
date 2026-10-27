-- The Dashboard forecast marks an Event strongly when the reader has work on it.
-- hasWork is true when a Tasking on the Event that is not cancelled passes the
-- reader's own Tasking policy, so a Group-scoped reader sees it only for their
-- Groups' work. The Calendar ignores it.
BEGIN;

CREATE OR REPLACE FUNCTION public.calendar_range_projection(p_organization_id uuid, p_range_start date, p_range_end date)
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
        'id', e.id, 'title', e.title, 'startsOn', e.starts_on, 'endsOn', e.ends_on, 'cancelled', e.cancelled_at IS NOT NULL,
        'hasWork', EXISTS (
          SELECT 1 FROM public.calendar_taskings AS t
          WHERE t.organization_id = e.organization_id AND t.event_id = e.id AND t.status <> 'cancelled'
        )
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

NOTIFY pgrst, 'reload schema';

COMMIT;
