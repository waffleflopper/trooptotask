BEGIN;
CREATE FUNCTION public.calendar_tasking_dashboard(p_organization_id uuid, p_today date, p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH workspace AS MATERIALIZED (
    SELECT public.calendar_tasking_workspace(p_organization_id, p_today)->'taskings' AS facts
  ), active AS MATERIALIZED (
    SELECT t.*, e.title AS event_title, (f.value->>'picked')::integer AS picked, (f.value->>'conflicts')::integer AS conflict_count,
      (f.value->'equipment'->>'total')::integer - (f.value->'equipment'->>'ready')::integer AS not_ready
    FROM workspace w CROSS JOIN LATERAL pg_catalog.jsonb_each(w.facts) f
    JOIN public.calendar_taskings t ON t.id = f.key::uuid AND t.organization_id = p_organization_id
    LEFT JOIN public.calendar_events e ON e.organization_id = t.organization_id AND e.id = t.event_id
    WHERE t.status IN ('open', 'in_progress', 'blocked')
  ), people AS MATERIALIZED (
    SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
    WHERE v.organization_id = p_organization_id
  ), conflicts AS MATERIALIZED (
    SELECT DISTINCT ON(c.tasking_id, c.personnel_id) c.*, person.rank, person.first_name, person.last_name
    FROM calendar_private.tasking_conflicts(p_organization_id) c
    JOIN active a ON a.id = c.tasking_id
    JOIN people v ON v.personnel_id = c.personnel_id
    JOIN public.personnel person ON person.organization_id = p_organization_id AND person.id = c.personnel_id
    ORDER BY c.tasking_id, c.personnel_id, c.starts_on, c.availability_id
  ), windowed AS (
    SELECT a.*, a.execution_starts_on IS NOT NULL AND a.execution_ends_on >= p_today
      AND a.execution_starts_on <= p_today + 14 AS executing_soon
    FROM active a
  ), kinded AS (
    SELECT a.*, CASE WHEN a.suspense_on < p_today THEN 'overdue'
      WHEN a.status = 'blocked' THEN 'blocked'
      -- Incomplete work due within a week is short even with no execution dates near.
      WHEN (a.executing_soon OR a.suspense_on <= p_today + 7)
        AND (a.picked < coalesce(a.staffing_required, 0) OR a.not_ready > 0) THEN 'short'
      END AS kind FROM windowed a
  ), attention AS (
    -- An execution start goes out only when its window drives the row's timing; otherwise the suspense does.
    SELECT a.id, a.title, a.responsible_group_id, a.event_title, a.suspense_on,
      CASE WHEN a.executing_soon THEN a.execution_starts_on END AS execution_starts_on,
      a.staffing_required, a.picked, a.not_ready, a.kind, NULL::jsonb AS conflict,
      CASE WHEN a.kind = 'short' AND a.execution_starts_on = p_today THEN 0
        WHEN a.kind = 'overdue' THEN 1 WHEN a.kind = 'blocked' THEN 3 ELSE 4 END AS priority,
      CASE WHEN a.kind = 'short' AND a.executing_soon THEN a.execution_starts_on ELSE a.suspense_on END AS next_date,
      '' AS person_key
    FROM kinded a WHERE a.kind IS NOT NULL
    UNION ALL
    SELECT a.id, a.title, a.responsible_group_id, a.event_title, a.suspense_on, a.execution_starts_on,
      a.staffing_required, a.picked, a.not_ready, 'conflict',
      pg_catalog.jsonb_build_object('personnelId', c.personnel_id,
        'personLabel', pg_catalog.concat_ws(' ', nullif(c.rank, ''), c.first_name, c.last_name),
        'statusLabel', c.label, 'startsOn', c.starts_on, 'endsOn', c.ends_on,
        'overlapDays', c.overlap_days, 'executionDays', c.execution_days), 2, c.starts_on, c.personnel_id::text
    FROM conflicts c JOIN active a ON a.id = c.tasking_id
  ), limited AS (
    SELECT * FROM attention ORDER BY priority, next_date, title, id, person_key
    LIMIT greatest(0, least(p_limit, 1000))
  )
  SELECT pg_catalog.jsonb_build_object(
    'rows', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'tasking_id', a.id, 'kind', a.kind, 'title', a.title, 'responsible_group_id', a.responsible_group_id,
      'event_title', a.event_title, 'suspense_on', a.suspense_on, 'execution_starts_on', a.execution_starts_on,
      'staffing_required', a.staffing_required, 'staffing_picked', a.picked,
      'equipment_not_ready', a.not_ready, 'conflict', a.conflict
    ) ORDER BY a.priority, a.next_date, a.title, a.id, a.person_key) FROM limited a), '[]'::jsonb),
    'total', (SELECT count(*) FROM attention),
    'onTrack', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'taskingId', a.id, 'title', a.title, 'suspenseOn', a.suspense_on,
      'responsibleGroupId', a.responsible_group_id, 'picked', a.picked, 'required', a.staffing_required,
      'status', a.status
    ) ORDER BY a.suspense_on, a.title, a.id)
      FROM kinded a WHERE a.kind IS NULL AND a.suspense_on BETWEEN p_today AND p_today + 7
        AND a.picked >= coalesce(a.staffing_required, 0) AND a.not_ready = 0
        AND a.conflict_count = 0), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.calendar_tasking_dashboard(uuid, date, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_dashboard(uuid, date, integer) TO authenticated;
ALTER FUNCTION public.calendar_tasking_dashboard(uuid, date, integer) OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
COMMIT;
