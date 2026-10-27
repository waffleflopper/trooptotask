BEGIN;

ALTER TABLE public.calendar_tasking_equipment ADD COLUMN returned_quantity integer NOT NULL DEFAULT 0
  CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);

GRANT UPDATE (returned_quantity) ON public.calendar_tasking_equipment TO authenticated;

DO $$
DECLARE v_kinds text[];
BEGIN
  SELECT array_agg(DISTINCT m[1]) INTO v_kinds FROM pg_catalog.pg_constraint c,
    LATERAL pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') m
  WHERE c.conrelid = 'public.calendar_tasking_activity'::regclass AND c.conname = 'calendar_tasking_activity_kind_check';
  ALTER TABLE public.calendar_tasking_activity DROP CONSTRAINT calendar_tasking_activity_kind_check;
  EXECUTE pg_catalog.format('ALTER TABLE public.calendar_tasking_activity ADD CONSTRAINT calendar_tasking_activity_kind_check CHECK (kind = ANY (%L::text[]))',
    v_kinds || ARRAY['equipment_returned']);
END;
$$;
CREATE FUNCTION calendar_private.record_tasking_equipment_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.returned_quantity IS DISTINCT FROM OLD.returned_quantity THEN
    INSERT INTO public.calendar_tasking_activity(organization_id, tasking_id, actor_id, kind, payload)
    VALUES(NEW.organization_id, NEW.tasking_id, NEW.updated_by, 'equipment_returned',
      pg_catalog.jsonb_build_object('name', NEW.name, 'quantity', NEW.quantity,
        'from', OLD.returned_quantity, 'to', NEW.returned_quantity));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.record_tasking_equipment_return() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER record_tasking_equipment_return AFTER UPDATE ON public.calendar_tasking_equipment
  FOR EACH ROW EXECUTE FUNCTION calendar_private.record_tasking_equipment_return();

CREATE FUNCTION public.calendar_tasking_workspace(p_organization_id uuid, p_today date, p_event_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH membership AS MATERIALIZED (
    SELECT m.role, m.access_scope_kind, m.access_scope_group_ids
    FROM public.organization_memberships m
    WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
      AND calendar_private.can_view_calendar_events(p_organization_id)
  ), picked AS (
    -- Same rule as calendar_tasking_staffing: a closed Tasking keeps a pick whose Person is archived later.
    SELECT p.tasking_id, count(*) FILTER (WHERE p.review_since IS NULL)::integer AS picked
    FROM public.calendar_tasking_participants p
    WHERE p.organization_id = p_organization_id GROUP BY p.tasking_id
  ), equipment AS (
    SELECT q.tasking_id, count(*)::integer AS total,
      count(*) FILTER (WHERE q.secured_quantity = q.quantity)::integer AS ready,
      sum(q.quantity)::integer AS quantity, sum(q.returned_quantity)::integer AS returned
    FROM public.calendar_tasking_equipment q WHERE q.organization_id = p_organization_id GROUP BY q.tasking_id
  ), conflicts AS MATERIALIZED (
    SELECT c.tasking_id, count(DISTINCT c.personnel_id)::integer AS conflicts
    FROM calendar_private.tasking_conflicts(p_organization_id) c GROUP BY c.tasking_id
  ), facts AS MATERIALIZED (
    SELECT t.id, t.event_id, t.status, t.responsible_group_id, t.suspense_on, t.execution_starts_on,
      t.staffing_required, coalesce(p.picked, 0) AS picked, coalesce(q.total, 0) AS equipment_total,
      coalesce(q.ready, 0) AS equipment_ready, coalesce(q.quantity, 0) AS equipment_quantity,
      coalesce(q.returned, 0) AS equipment_returned, coalesce(c.conflicts, 0) AS conflicts,
      t.status IN ('open', 'in_progress', 'blocked') AS active,
      CASE WHEN t.event_id IS NULL THEN 'standalone'
        WHEN t.suspense_on BETWEEN e.starts_on AND e.ends_on
          OR (t.execution_starts_on <= e.ends_on AND t.execution_ends_on >= e.starts_on) THEN 'execution'
        WHEN t.suspense_on < e.starts_on THEN 'preparation' ELSE 'closeout' END AS relation,
      CASE WHEN t.status IN ('open', 'in_progress', 'blocked') AND t.execution_starts_on >= p_today
        AND t.execution_starts_on < t.suspense_on THEN t.execution_starts_on ELSE t.suspense_on END AS next_date,
      m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization'
        OR t.responsible_group_id = ANY(m.access_scope_group_ids) AS visible
    FROM public.calendar_taskings t CROSS JOIN membership m
    LEFT JOIN public.calendar_events e ON e.organization_id = t.organization_id AND e.id = t.event_id
    LEFT JOIN picked p ON p.tasking_id = t.id
    LEFT JOIN equipment q ON q.tasking_id = t.id
    LEFT JOIN conflicts c ON c.tasking_id = t.id
    WHERE t.organization_id = p_organization_id AND (p_event_id IS NULL OR t.event_id = p_event_id)
  ), event_totals AS (
    SELECT e.id,
      count(f.id)::integer AS total,
      count(f.id) FILTER (WHERE f.active AND (f.suspense_on < p_today OR f.status = 'blocked'
        OR f.picked < coalesce(f.staffing_required, 0)))::integer AS need_action,
      count(f.id) FILTER (WHERE f.active AND f.suspense_on < p_today)::integer AS overdue,
      count(f.id) FILTER (WHERE f.status = 'blocked')::integer AS blocked,
      count(f.id) FILTER (WHERE f.active AND f.picked < coalesce(f.staffing_required, 0))::integer AS need_people,
      count(f.id) FILTER (WHERE f.active AND f.staffing_required IS NOT NULL AND f.picked >= f.staffing_required
        AND f.equipment_ready = f.equipment_total AND f.conflicts = 0)::integer AS ready,
      coalesce(sum(f.conflicts), 0)::integer AS conflicts
    FROM public.calendar_events e CROSS JOIN membership m
    LEFT JOIN facts f ON f.event_id = e.id
    WHERE e.organization_id = p_organization_id AND (p_event_id IS NULL OR e.id = p_event_id)
    GROUP BY e.id
  )
  SELECT pg_catalog.jsonb_build_object(
    'taskings', coalesce((SELECT pg_catalog.jsonb_object_agg(f.id, pg_catalog.jsonb_build_object(
      'eventRelation', f.relation, 'picked', f.picked, 'required', f.staffing_required,
      'equipment', pg_catalog.jsonb_build_object('ready', f.equipment_ready, 'total', f.equipment_total,
        'returnedQuantity', f.equipment_returned, 'totalQuantity', f.equipment_quantity),
      'conflicts', f.conflicts, 'nextDate', f.next_date, 'suspenseOn', f.suspense_on,
      'status', f.status, 'responsibleGroupId', f.responsible_group_id
    )) FROM facts f WHERE f.visible), '{}'::jsonb),
    'events', coalesce((SELECT pg_catalog.jsonb_object_agg(e.id, pg_catalog.jsonb_build_object(
      'total', e.total, 'needAction', e.need_action, 'overdue', e.overdue, 'blocked', e.blocked,
      'needPeople', e.need_people, 'fullyStaffedAndReady', e.ready, 'conflicts', e.conflicts
    )) FROM event_totals e), '{}'::jsonb),
    'counts', (SELECT pg_catalog.jsonb_build_object(
      'active', count(*) FILTER (WHERE f.active),
      'overdue', count(*) FILTER (WHERE f.active AND f.suspense_on < p_today),
      'blocked', count(*) FILTER (WHERE f.status = 'blocked'),
      'needsPeople', count(*) FILTER (WHERE f.active AND f.picked < coalesce(f.staffing_required, 0)),
      'completed', count(*) FILTER (WHERE f.status = 'completed')
    ) FROM facts f WHERE f.visible)
  );
$$;
REVOKE ALL ON FUNCTION public.calendar_tasking_workspace(uuid, date, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_workspace(uuid, date, uuid) TO authenticated;

ALTER FUNCTION calendar_private.record_tasking_equipment_return() OWNER TO postgres;
ALTER FUNCTION public.calendar_tasking_workspace(uuid, date, uuid) OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
COMMIT;
