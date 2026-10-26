BEGIN;

REVOKE SELECT ON public.calendar_tasking_activity FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.read_calendar_tasking_activity(p_organization_id uuid, p_tasking_id uuid DEFAULT NULL)
RETURNS TABLE (
  id bigint, organization_id uuid, tasking_id uuid, actor_id uuid, occurred_at timestamptz, kind text, payload jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH readable_groups AS MATERIALIZED (
    SELECT g.id FROM public.groups AS g
    WHERE g.organization_id = p_organization_id
      AND calendar_private.can_view_calendar_tasking(p_organization_id, g.id)
    UNION ALL
    SELECT NULL::uuid WHERE calendar_private.can_view_calendar_tasking(p_organization_id, NULL)
  ),
  activity AS MATERIALIZED (
    SELECT a.* FROM public.calendar_tasking_activity AS a
    JOIN public.calendar_taskings AS t ON t.organization_id = a.organization_id AND t.id = a.tasking_id
    WHERE a.organization_id = p_organization_id AND (p_tasking_id IS NULL OR a.tasking_id = p_tasking_id)
      AND EXISTS (
        SELECT 1 FROM readable_groups AS g WHERE g.id IS NOT DISTINCT FROM t.responsible_group_id
      )
  ),
  staffing_changes AS MATERIALIZED (
    SELECT a.id, change.key, pick.personnel_id
    FROM activity AS a
    CROSS JOIN LATERAL pg_catalog.jsonb_each(
      CASE WHEN a.kind = 'staffing_changed' THEN a.payload ELSE '{}'::jsonb END
    ) AS change
    LEFT JOIN LATERAL (
      SELECT value::uuid AS personnel_id FROM pg_catalog.jsonb_array_elements_text(change.value)
    ) AS pick ON true
  ),
  labels AS MATERIALIZED (
    SELECT * FROM public.calendar_person_labels(p_organization_id, ARRAY(
      SELECT DISTINCT c.personnel_id FROM staffing_changes AS c WHERE c.personnel_id IS NOT NULL
    ))
  ),
  staffing_payloads AS (
    SELECT people.id, pg_catalog.jsonb_object_agg(people.key, people.summary) AS payload
    FROM (
      SELECT c.id, c.key, pg_catalog.jsonb_build_object(
        'names', coalesce(pg_catalog.jsonb_agg(l.label ORDER BY l.label) FILTER (WHERE l.personnel_id IS NOT NULL), '[]'::jsonb),
        'others', count(c.personnel_id) FILTER (WHERE l.personnel_id IS NULL)
      ) AS summary
      FROM staffing_changes AS c LEFT JOIN labels AS l ON l.personnel_id = c.personnel_id
      GROUP BY c.id, c.key
    ) AS people
    GROUP BY people.id
  )
  SELECT a.id, a.organization_id, a.tasking_id, a.actor_id, a.occurred_at, a.kind,
    CASE WHEN a.kind = 'staffing_changed' THEN s.payload ELSE a.payload END
  FROM activity AS a LEFT JOIN staffing_payloads AS s ON s.id = a.id
  ORDER BY a.id;
$$;
ALTER FUNCTION public.read_calendar_tasking_activity(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_calendar_tasking_activity(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_calendar_tasking_activity(uuid, uuid) TO authenticated;

COMMIT;
