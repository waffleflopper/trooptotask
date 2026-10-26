-- Summary rows now read staffing as picked of required, as the Taskings list does.
-- Picks under review never count; no person is named.
BEGIN;

DROP FUNCTION public.list_calendar_event_tasking_summaries(uuid, uuid);

-- A NULL responsible_group_name is Organization-level work.
CREATE FUNCTION public.list_calendar_event_tasking_summaries(p_organization_id uuid, p_event_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  responsible_group_name text,
  status text,
  staffing_required integer,
  staffing_picked integer,
  suspense_on date,
  execution_starts_on date,
  execution_ends_on date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR calendar_private.can_view_calendar_events(p_organization_id) IS NOT TRUE
    OR NOT EXISTS (
      SELECT 1 FROM public.calendar_events AS e
      WHERE e.organization_id = p_organization_id AND e.id = p_event_id
    )
  THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT t.id, t.title, g.name, t.status, t.staffing_required,
    (SELECT count(*)::integer FROM public.calendar_tasking_participants AS p
     WHERE p.organization_id = t.organization_id AND p.tasking_id = t.id AND p.review_since IS NULL),
    t.suspense_on, t.execution_starts_on, t.execution_ends_on
  FROM public.calendar_taskings AS t
  LEFT JOIN public.groups AS g
    ON g.organization_id = t.organization_id AND g.id = t.responsible_group_id
  WHERE t.organization_id = p_organization_id
    AND t.event_id = p_event_id
    AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id) IS NOT TRUE
  ORDER BY t.suspense_on, t.title, t.id;
END;
$$;
ALTER FUNCTION public.list_calendar_event_tasking_summaries(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_calendar_event_tasking_summaries(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_calendar_event_tasking_summaries(uuid, uuid) TO authenticated;

COMMIT;
