-- Deleting an Event in delete mode removes only active Taskings. Completed and cancelled Taskings are a record,
-- so they are detached as standalone with their Activity, checklist and equipment, the way standalone mode does.
-- The Event FK is ON DELETE SET NULL, so deleting the Event detaches whatever is left.
DROP FUNCTION public.delete_calendar_event(uuid, uuid, text);
CREATE FUNCTION public.delete_calendar_event(p_organization_id uuid, p_event_id uuid, p_taskings text)
RETURNS TABLE(deleted integer, kept integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_linked integer;
  v_deleted integer := 0;
BEGIN
  IF p_taskings IS NULL OR p_taskings NOT IN ('standalone', 'delete') THEN
    RAISE EXCEPTION 'Choose standalone or delete for linked taskings' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL OR calendar_private.can_manage_calendar_events(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Deleting events needs Organization-wide Calendar operation access' USING ERRCODE = '42501';
  END IF;

  -- This also holds off new links through the Event FK until deletion commits.
  PERFORM e.id FROM public.calendar_events AS e
  WHERE e.organization_id = p_organization_id AND e.id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;

  -- Locked until commit, so no Tasking changes status between the delete and the counts.
  PERFORM t.id FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.event_id = p_event_id
  ORDER BY t.id FOR UPDATE;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  IF p_taskings = 'delete' THEN
    DELETE FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.event_id = p_event_id
      AND t.status IN ('open', 'in_progress', 'blocked');
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;
  DELETE FROM public.calendar_events AS e
  WHERE e.organization_id = p_organization_id AND e.id = p_event_id;
  RETURN QUERY SELECT v_deleted, v_linked - v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_calendar_event(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_calendar_event(uuid, uuid, text) TO authenticated;

-- Returned equipment is bounded by what was secured, which is itself bounded by the quantity.
-- The clamp is a repair, not a person's edit: with the stamp and return-Activity triggers off it leaves
-- updated_at and updated_by alone and writes no "returned" Activity attributed to nobody. The audit trigger
-- stays on, so the change is still recorded.
ALTER TABLE public.calendar_tasking_equipment DISABLE TRIGGER stamp_calendar_tasking_equipment;
ALTER TABLE public.calendar_tasking_equipment DISABLE TRIGGER record_tasking_equipment_return;
DO $$
DECLARE v_clamped integer;
BEGIN
  UPDATE public.calendar_tasking_equipment SET returned_quantity = secured_quantity
  WHERE returned_quantity > secured_quantity;
  GET DIAGNOSTICS v_clamped = ROW_COUNT;
  RAISE NOTICE 'Clamped % equipment rows whose returned quantity exceeded the secured quantity', v_clamped;
END;
$$;
ALTER TABLE public.calendar_tasking_equipment ENABLE TRIGGER stamp_calendar_tasking_equipment;
ALTER TABLE public.calendar_tasking_equipment ENABLE TRIGGER record_tasking_equipment_return;

ALTER TABLE public.calendar_tasking_equipment DROP CONSTRAINT calendar_tasking_equipment_check;
ALTER TABLE public.calendar_tasking_equipment ADD CONSTRAINT calendar_tasking_equipment_returned
  CHECK (returned_quantity >= 0 AND returned_quantity <= secured_quantity);

-- Returns are only visible on a completed Tasking, so lowering what is secured on a reopened one trims
-- them instead of refusing over a count the operator cannot see.
CREATE OR REPLACE FUNCTION calendar_private.stamp_calendar_tasking_equipment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer;
  v_last integer;
  v_status text;
  v_group uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.returned_quantity IS DISTINCT FROM OLD.returned_quantity
    AND (NEW.name, NEW.quantity, NEW.secured_quantity, NEW.position)
      IS NOT DISTINCT FROM (OLD.name, OLD.quantity, OLD.secured_quantity, OLD.position) THEN
    SELECT t.status, t.responsible_group_id INTO v_status, v_group
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = NEW.organization_id AND t.id = NEW.tasking_id
    FOR SHARE;
    IF v_status = 'cancelled' AND calendar_private.can_manage_calendar_tasking(NEW.organization_id, v_group) THEN
      RAISE EXCEPTION 'A completed or cancelled tasking cannot change' USING ERRCODE = '55000';
    END IF;
  ELSE
    PERFORM calendar_private.lock_calendar_tasking_for_list_write(NEW.organization_id, NEW.tasking_id, TG_OP = 'INSERT');
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT pg_catalog.count(*), pg_catalog.max(position) INTO v_count, v_last
    FROM public.calendar_tasking_equipment
    WHERE organization_id = NEW.organization_id AND tasking_id = NEW.tasking_id;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'A tasking holds up to 100 equipment requirements' USING ERRCODE = '54000';
    END IF;
    NEW.position := COALESCE(v_last, 0) + 1;
    NEW.created_at := pg_catalog.now();
    NEW.created_by := auth.uid();
  ELSE
    NEW.id := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.tasking_id := OLD.tasking_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    IF NEW.secured_quantity IS DISTINCT FROM OLD.secured_quantity
      AND NEW.returned_quantity IS NOT DISTINCT FROM OLD.returned_quantity THEN
      NEW.returned_quantity := LEAST(NEW.returned_quantity, NEW.secured_quantity);
    END IF;
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

-- A closeout row counts returns against what was secured, the most that can come back.
CREATE OR REPLACE FUNCTION public.calendar_tasking_workspace(p_organization_id uuid, p_today date, p_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
      sum(q.secured_quantity)::integer AS secured, sum(q.returned_quantity)::integer AS returned
    FROM public.calendar_tasking_equipment q WHERE q.organization_id = p_organization_id GROUP BY q.tasking_id
  ), conflicts AS MATERIALIZED (
    SELECT c.tasking_id, count(DISTINCT c.personnel_id)::integer AS conflicts
    FROM calendar_private.tasking_conflicts(p_organization_id) c GROUP BY c.tasking_id
  ), facts AS MATERIALIZED (
    SELECT t.id, t.event_id, t.status, t.responsible_group_id, t.suspense_on, t.execution_starts_on,
      t.staffing_required, coalesce(p.picked, 0) AS picked, coalesce(q.total, 0) AS equipment_total,
      coalesce(q.ready, 0) AS equipment_ready, coalesce(q.secured, 0) AS equipment_secured,
      coalesce(q.returned, 0) AS equipment_returned, coalesce(c.conflicts, 0) AS conflicts,
      t.status IN ('open', 'in_progress', 'blocked') AS active,
      CASE WHEN t.event_id IS NULL THEN 'standalone'
        WHEN t.suspense_on BETWEEN e.starts_on AND e.ends_on
          OR (t.execution_starts_on <= e.ends_on AND t.execution_ends_on >= e.starts_on) THEN 'execution'
        WHEN t.suspense_on < e.starts_on THEN 'preparation' ELSE 'closeout' END AS relation,
      CASE WHEN t.status IN ('open', 'in_progress', 'blocked') AND t.execution_starts_on >= p_today
        AND t.execution_starts_on < t.suspense_on THEN t.execution_starts_on ELSE t.suspense_on END AS next_date,
      m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization'
        OR rg.path && m.access_scope_group_ids AS visible
    FROM public.calendar_taskings t CROSS JOIN membership m
    LEFT JOIN public.groups rg ON rg.organization_id = t.organization_id AND rg.id = t.responsible_group_id
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
        'returnedQuantity', f.equipment_returned, 'securedQuantity', f.equipment_secured),
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

-- Activity states a return against what was secured, so it reads the same as the card.
CREATE OR REPLACE FUNCTION calendar_private.record_tasking_equipment_return() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.returned_quantity IS DISTINCT FROM OLD.returned_quantity THEN
    INSERT INTO public.calendar_tasking_activity(organization_id, tasking_id, actor_id, kind, payload)
    VALUES(NEW.organization_id, NEW.tasking_id, NEW.updated_by, 'equipment_returned',
      pg_catalog.jsonb_build_object('name', NEW.name, 'quantity', NEW.quantity,
        'securedQuantity', NEW.secured_quantity, 'from', OLD.returned_quantity, 'to', NEW.returned_quantity));
  END IF;
  RETURN NULL;
END;
$$;
