BEGIN;
CREATE FUNCTION public.calendar_tasking_conflict_people(p_organization_id uuid)
RETURNS TABLE(tasking_id uuid, personnel_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH people AS MATERIALIZED (
    SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
    WHERE v.organization_id = p_organization_id
  )
  SELECT DISTINCT c.tasking_id, c.personnel_id FROM calendar_private.tasking_conflicts(p_organization_id) c
  JOIN public.calendar_taskings t ON t.organization_id = p_organization_id AND t.id = c.tasking_id
  JOIN people ON people.personnel_id = c.personnel_id
  WHERE calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id);
$$;
REVOKE ALL ON FUNCTION public.calendar_tasking_conflict_people(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_conflict_people(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.calendar_range_projection(p_organization_id uuid, p_range_start date, p_range_end date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_conflicts jsonb;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL OR p_range_end < p_range_start OR p_range_end - p_range_start > 400 THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_object_agg(c.tasking_id::text || ':' || c.personnel_id::text, true), '{}'::jsonb)
    INTO v_conflicts FROM public.calendar_tasking_conflict_people(p_organization_id) c;
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
        'startsOn', t.execution_starts_on, 'endsOn', t.execution_ends_on,
        'conflicts', coalesce((v_conflicts ->> (t.id::text || ':' || p.personnel_id::text))::boolean, false)
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

ALTER FUNCTION public.calendar_tasking_conflict_people(uuid) OWNER TO postgres;

NOTIFY pgrst, 'reload schema';

COMMIT;
