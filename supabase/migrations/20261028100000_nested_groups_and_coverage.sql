BEGIN;

ALTER TABLE public.groups
  ADD COLUMN parent_id uuid,
  ADD COLUMN path uuid[];
UPDATE public.groups SET path = ARRAY[id];
ALTER TABLE public.groups
  ADD COLUMN depth integer GENERATED ALWAYS AS (pg_catalog.cardinality(path)) STORED,
  ALTER COLUMN path SET NOT NULL,
  ALTER COLUMN path SET DEFAULT '{}'::uuid[],
  ADD CONSTRAINT groups_parent_fkey FOREIGN KEY (organization_id, parent_id)
    REFERENCES public.groups (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT groups_path_shape CHECK (
    pg_catalog.array_ndims(path) = 1 AND pg_catalog.array_lower(path, 1) = 1
    AND pg_catalog.cardinality(path) BETWEEN 1 AND 3
    AND pg_catalog.array_position(path, NULL) IS NULL
    AND path[pg_catalog.cardinality(path)] = id
  ),
  DROP CONSTRAINT groups_clinic_id_name_key,
  ADD CONSTRAINT groups_sibling_name_key UNIQUE NULLS NOT DISTINCT (organization_id, parent_id, name);
CREATE INDEX groups_children_idx ON public.groups (organization_id, parent_id, sort_order);

CREATE FUNCTION organization_private.set_group_path() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_parent_path uuid[];
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name) AND NEW.name LIKE '% / %' THEN
    RAISE EXCEPTION 'Group names cannot contain the path separator' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT g.path INTO v_parent_path FROM public.groups g
    WHERE g.organization_id = NEW.organization_id AND g.id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent Group not found' USING ERRCODE = '23503', CONSTRAINT = 'groups_parent_fkey';
    END IF;
    IF NEW.id = ANY(v_parent_path) THEN
      RAISE EXCEPTION 'A Group cannot sit inside itself' USING ERRCODE = '22023';
    END IF;
  END IF;
  NEW.path := coalesce(v_parent_path, ARRAY[]::uuid[]) || NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.set_group_path() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER groups_set_path BEFORE INSERT OR UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION organization_private.set_group_path();

CREATE FUNCTION organization_private.group_within(p_organization_id uuid, p_group_id uuid, p_ancestor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p_ancestor_id IS NULL OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.organization_id = p_organization_id AND g.id = p_group_id AND p_ancestor_id = ANY(g.path)
  );
$$;
REVOKE ALL ON FUNCTION organization_private.group_within(uuid, uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION organization_private.group_within(uuid, uuid, uuid) TO authenticated;

CREATE FUNCTION calendar_private.review_picks_after_group_move(p_organization_id uuid, p_group_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.calendar_tasking_participants p SET review_since = pg_catalog.now()
  FROM public.calendar_taskings t, public.personnel person
  WHERE p.organization_id = p_organization_id AND p.review_since IS NULL
    AND t.organization_id = p.organization_id AND t.id = p.tasking_id
    AND t.status NOT IN ('completed', 'cancelled')
    AND person.organization_id = p.organization_id AND person.id = p.personnel_id
    AND person.group_id = p_group_id
    AND NOT organization_private.group_within(p_organization_id, person.group_id, t.responsible_group_id);
$$;
REVOKE ALL ON FUNCTION calendar_private.review_picks_after_group_move(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION organization_private.cascade_group_path() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.groups SET parent_id = parent_id
  WHERE organization_id = NEW.organization_id AND parent_id = NEW.id;
  PERFORM calendar_private.review_picks_after_group_move(NEW.organization_id, NEW.id);
  IF NEW.parent_id IS NOT NULL THEN
    DELETE FROM public.user_pinned_groups WHERE organization_id = NEW.organization_id AND group_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.cascade_group_path() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER groups_cascade_path AFTER UPDATE ON public.groups
  FOR EACH ROW WHEN (OLD.path IS DISTINCT FROM NEW.path)
  EXECUTE FUNCTION organization_private.cascade_group_path();

CREATE FUNCTION personnel_private.require_top_level_group_pin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_parent_id uuid;
BEGIN
  SELECT parent_id INTO v_parent_id FROM public.groups
  WHERE organization_id = NEW.organization_id AND id = NEW.group_id
  FOR SHARE;
  IF v_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only top-level Groups can be pinned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION personnel_private.require_top_level_group_pin() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER require_top_level_group_pin BEFORE INSERT OR UPDATE ON public.user_pinned_groups
  FOR EACH ROW EXECUTE FUNCTION personnel_private.require_top_level_group_pin();

CREATE OR REPLACE FUNCTION personnel_private.lock_group_catalog(p_organization_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.member_access_group_scope_matches(p_organization_id uuid, p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
      AND (
        m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization' OR p_group_id IS NULL
        OR (m.access_scope_kind = 'groups' AND EXISTS (
          SELECT 1 FROM public.groups g WHERE g.organization_id = p_organization_id AND g.id = p_group_id
            AND g.path && m.access_scope_group_ids
        ))
      )
  );
$$;

CREATE FUNCTION public.read_request_member_access(p_organization_id uuid)
RETURNS TABLE (id uuid, role text, member_preset text, capability_overrides jsonb,
  access_scope_kind text, access_scope_group_ids uuid[], covered_group_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.id, m.role, m.member_preset, m.capability_overrides, m.access_scope_kind, m.access_scope_group_ids,
    CASE WHEN m.role = 'member' AND m.access_scope_kind = 'groups' THEN ARRAY(
      SELECT g.id FROM public.groups g
      WHERE g.organization_id = m.organization_id AND g.path && m.access_scope_group_ids ORDER BY g.id
    ) ELSE NULL::uuid[] END
  FROM public.organization_memberships m
  WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
    AND public.organization_access_admitted(p_organization_id);
$$;
REVOKE ALL ON FUNCTION public.read_request_member_access(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_request_member_access(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION member_access_private.viewable_personnel(p_lane text) RETURNS TABLE(organization_id uuid, personnel_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.organization_id, p.id
  FROM public.organization_memberships m
  JOIN public.personnel p ON p.organization_id = m.organization_id
  LEFT JOIN public.groups g ON g.organization_id = p.organization_id AND g.id = p.group_id
  WHERE m.user_id = auth.uid()
    AND public.member_access_has_capability(m.organization_id, p_lane, 'view')
    AND (
      m.role IN ('owner', 'admin')
      OR m.access_scope_kind = 'organization'
      OR (m.access_scope_kind = 'groups' AND g.path && m.access_scope_group_ids)
    );
$$;

CREATE OR REPLACE FUNCTION calendar_private.viewable_assignees() RETURNS TABLE(organization_id uuid, assignment_type_id uuid, assignee_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT t.organization_id, t.id, v.personnel_id::text
  FROM member_access_private.viewable_personnel('calendar') v
  JOIN public.assignment_types t ON t.organization_id = v.organization_id AND t.assign_to = 'personnel'
  UNION ALL
  SELECT t.organization_id, t.id, g.id::text
  FROM public.organization_memberships m
  JOIN public.groups g ON g.organization_id = m.organization_id
  JOIN public.assignment_types t ON t.organization_id = m.organization_id AND t.assign_to = 'group'
  WHERE m.user_id = auth.uid()
    AND public.member_access_has_capability(m.organization_id, 'calendar', 'view')
    AND (
      m.role IN ('owner', 'admin')
      OR m.access_scope_kind = 'organization'
      OR (m.access_scope_kind = 'groups' AND g.path && m.access_scope_group_ids)
    );
$$;

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

CREATE OR REPLACE FUNCTION calendar_private.flag_picks_of_changed_person() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.calendar_tasking_participants AS p SET review_since = pg_catalog.now()
  FROM public.calendar_taskings AS t
  WHERE p.organization_id = NEW.organization_id AND p.personnel_id = NEW.id AND p.review_since IS NULL
    AND t.organization_id = p.organization_id AND t.id = p.tasking_id
    AND t.status NOT IN ('completed', 'cancelled')
    AND (NEW.archived_at IS NOT NULL
      OR (t.responsible_group_id IS NOT NULL AND NOT organization_private.group_within(NEW.organization_id, NEW.group_id, t.responsible_group_id)));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION calendar_private.flag_picks_of_changed_tasking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.status NOT IN ('completed', 'cancelled') THEN
    UPDATE public.calendar_tasking_participants AS p SET review_since = pg_catalog.now()
    FROM public.personnel AS person
    WHERE p.organization_id = NEW.organization_id AND p.tasking_id = NEW.id AND p.review_since IS NULL
      AND person.organization_id = p.organization_id AND person.id = p.personnel_id
      AND (person.archived_at IS NOT NULL
        OR (NEW.responsible_group_id IS NOT NULL AND NOT organization_private.group_within(NEW.organization_id, person.group_id, NEW.responsible_group_id)));
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.calendar_tasking_advisories(p_organization_id uuid, p_tasking_id uuid) RETURNS TABLE(personnel_id uuid, kind text, label text, starts_on date, ends_on date, other_tasking_id uuid, is_conflict boolean, overlap_days integer, execution_days integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH tasking AS MATERIALIZED (
    SELECT t.* FROM public.calendar_taskings t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id AND t.execution_starts_on IS NOT NULL
      AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  ), people AS MATERIALIZED (
    SELECT person.id FROM member_access_private.viewable_personnel('calendar') v
    JOIN public.personnel person ON person.organization_id = v.organization_id AND person.id = v.personnel_id
    JOIN tasking t ON t.organization_id = person.organization_id
    WHERE person.archived_at IS NULL
      AND (organization_private.group_within(t.organization_id, person.group_id, t.responsible_group_id)
        OR EXISTS (SELECT 1 FROM public.calendar_tasking_participants p
          WHERE p.tasking_id = t.id AND p.personnel_id = person.id))
  )
  SELECT a.personnel_id, 'availability', s.name, a.start_date, a.end_date, NULL::uuid,
    t.status IN ('open', 'in_progress', 'blocked') AND a.set_for_tasking_id IS DISTINCT FROM t.id
      AND s.roster_effect <> 'available',
    least(a.end_date, t.execution_ends_on) - greatest(a.start_date, t.execution_starts_on) + 1,
    t.execution_ends_on - t.execution_starts_on + 1
  FROM tasking t
  JOIN public.availability_entries a ON a.organization_id = t.organization_id
    AND a.start_date <= t.execution_ends_on AND a.end_date >= t.execution_starts_on
  JOIN people ON people.id = a.personnel_id
  JOIN public.status_types s ON s.organization_id = a.organization_id AND s.id = a.status_type_id
  UNION ALL
  SELECT p.personnel_id, 'tasking', CASE WHEN visible THEN other.title END,
    CASE WHEN visible THEN other.execution_starts_on END, CASE WHEN visible THEN other.execution_ends_on END,
    CASE WHEN visible THEN other.id END, false, NULL::integer, NULL::integer
  FROM tasking t
  JOIN public.calendar_taskings other ON other.organization_id = t.organization_id AND other.id <> t.id
    AND other.status IN ('open', 'in_progress', 'blocked')
    AND other.execution_starts_on <= t.execution_ends_on AND other.execution_ends_on >= t.execution_starts_on
  JOIN public.calendar_tasking_participants p ON p.organization_id = other.organization_id AND p.tasking_id = other.id
    AND p.review_since IS NULL
  JOIN people ON people.id = p.personnel_id
  CROSS JOIN LATERAL (SELECT calendar_private.can_view_calendar_tasking(other.organization_id,
    other.responsible_group_id) AS visible) access
  ORDER BY 1, 4 NULLS LAST, 3, 2, 5, 6;
$$;

CREATE OR REPLACE FUNCTION public.save_calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid, p_personnel_ids uuid[], p_kept_ids uuid[], p_remove_outside_scope boolean, p_expected_revision integer) RETURNS TABLE(outcome text, revision integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_ids uuid[] := coalesce(p_personnel_ids, ARRAY[]::uuid[]);
  v_kept uuid[] := coalesce(p_kept_ids, ARRAY[]::uuid[]);
  v_status text;
  v_group uuid;
  v_revision integer;
  v_current uuid[];
  v_flagged uuid[];
  v_outside uuid[];
  v_added uuid[];
  v_removed uuid[];
  v_checked uuid[];
  v_eligible integer;
BEGIN
  IF array_position(v_ids, NULL) IS NOT NULL OR array_position(v_kept, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(v_ids) AS id) <> cardinality(v_ids)
    OR (SELECT count(DISTINCT id) FROM unnest(v_kept) AS id) <> cardinality(v_kept)
    OR NOT v_kept <@ v_ids
    OR cardinality(v_ids) > 9999
  THEN
    RAISE EXCEPTION 'Pick each person once' USING ERRCODE = '22023';
  END IF;

  -- A structure move reviews committed picks, so hold it out until this save commits.
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR SHARE;
  SELECT t.status, t.responsible_group_id, t.staffing_revision INTO v_status, v_group, v_revision
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR calendar_private.can_view_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tasking not found' USING ERRCODE = 'P0002';
  END IF;
  IF calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Staffing this tasking needs Calendar operation access for its scope' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(p.personnel_id), ARRAY[]::uuid[]),
    coalesce(array_agg(p.personnel_id) FILTER (WHERE p.review_since IS NOT NULL), ARRAY[]::uuid[]),
    coalesce(array_agg(p.personnel_id) FILTER (
      WHERE NOT calendar_private.calendar_person_in_scope(p.organization_id, p.personnel_id)
    ), ARRAY[]::uuid[])
  INTO v_current, v_flagged, v_outside
  FROM public.calendar_tasking_participants AS p
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id;
  IF p_remove_outside_scope IS NOT TRUE THEN
    v_ids := v_ids || ARRAY(SELECT id FROM unnest(v_outside) AS id WHERE NOT id = ANY (v_ids));
  END IF;

  v_kept := ARRAY(SELECT id FROM unnest(v_kept) AS id WHERE id = ANY (v_flagged));
  IF v_ids @> v_current AND v_current @> v_ids AND cardinality(v_kept) = 0 THEN
    RETURN QUERY SELECT 'unchanged'::text, v_revision;
    RETURN;
  END IF;
  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'A % tasking cannot change its staffing', v_status USING ERRCODE = '55000';
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_revision THEN
    RETURN QUERY SELECT 'conflict'::text, v_revision;
    RETURN;
  END IF;

  v_added := ARRAY(SELECT id FROM unnest(v_ids) AS id WHERE NOT id = ANY (v_current));
  v_removed := ARRAY(SELECT id FROM unnest(v_current) AS id WHERE NOT id = ANY (v_ids));
  v_checked := v_added || v_kept;
  -- Lock the People so an archive or Group move lands before or after this save, never beside it.
  SELECT count(*) INTO v_eligible FROM (
    SELECT 1 FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.id = ANY (v_checked)
      AND person.archived_at IS NULL
      AND organization_private.group_within(person.organization_id, person.group_id, v_group)
    FOR SHARE
  ) AS eligible;
  IF v_eligible <> cardinality(v_checked) THEN
    RAISE EXCEPTION 'Pick active people from this tasking''s roster' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.calendar_tasking_participants AS p
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id AND p.personnel_id = ANY (v_removed);
  INSERT INTO public.calendar_tasking_participants (organization_id, tasking_id, personnel_id, selected_by)
  SELECT p_organization_id, p_tasking_id, id, auth.uid() FROM unnest(v_added) AS id;
  UPDATE public.calendar_tasking_participants AS p SET review_since = NULL
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id AND p.personnel_id = ANY (v_kept);

  UPDATE public.calendar_taskings AS t SET staffing_revision = t.staffing_revision + 1
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id;
  INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, kind, payload)
  VALUES (p_organization_id, p_tasking_id, auth.uid(), 'staffing_changed', pg_catalog.jsonb_build_object(
    'added', pg_catalog.to_jsonb(v_added), 'removed', pg_catalog.to_jsonb(v_removed), 'kept', pg_catalog.to_jsonb(v_kept)
  ));
  RETURN QUERY SELECT 'saved'::text, v_revision + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.calendar_deletion_references(p_organization_id uuid, p_personnel_id uuid, p_group_id uuid) RETURNS TABLE(tasking_id uuid, title text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN visible THEN t.id END, CASE WHEN visible THEN t.title END
  FROM public.calendar_taskings AS t
  CROSS JOIN LATERAL (
    SELECT calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id) AS visible
  ) AS access
  WHERE t.organization_id = p_organization_id
    AND (
      (p_group_id IS NOT NULL AND organization_private.group_within(t.organization_id, t.responsible_group_id, p_group_id)
        AND public.can_manage_groups(p_organization_id))
      OR (p_personnel_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.calendar_tasking_participants AS p
        JOIN public.personnel AS person ON person.organization_id = p.organization_id AND person.id = p.personnel_id
        WHERE p.organization_id = t.organization_id AND p.tasking_id = t.id AND p.personnel_id = p_personnel_id
          AND public.can_configure_personnel_record(person.organization_id, person.group_id)
      ))
    )
  ORDER BY t.suspense_on DESC, t.id;
$$;

DROP FUNCTION public.set_group_order(uuid, uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.set_group_order(p_organization_id uuid, p_group_ids uuid[], p_expected_group_ids uuid[], p_parent_id uuid DEFAULT NULL) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_saved uuid[];
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF p_group_ids IS NULL OR p_expected_group_ids IS NULL
    OR pg_catalog.array_ndims(p_group_ids) > 1
    OR pg_catalog.array_ndims(p_expected_group_ids) > 1
    OR pg_catalog.array_position(p_group_ids, NULL) IS NOT NULL
    OR pg_catalog.array_position(p_expected_group_ids, NULL) IS NOT NULL
    OR pg_catalog.cardinality(p_group_ids) <> (
      SELECT pg_catalog.count(DISTINCT ids.id) FROM pg_catalog.unnest(p_group_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Choose every Group once' USING ERRCODE = '22023';
  END IF;

  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM 1 FROM public.groups
  WHERE organization_id = p_organization_id AND parent_id IS NOT DISTINCT FROM p_parent_id
  ORDER BY id
  FOR NO KEY UPDATE;
  PERFORM personnel_private.require_group_manager(p_organization_id);

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, name, id), '{}') INTO v_saved
  FROM public.groups
  WHERE organization_id = p_organization_id AND parent_id IS NOT DISTINCT FROM p_parent_id;
  IF v_saved = p_group_ids THEN
    RETURN;
  END IF;
  IF v_saved IS DISTINCT FROM p_expected_group_ids THEN
    RAISE EXCEPTION 'Group order changed' USING ERRCODE = 'GRP01';
  END IF;
  IF pg_catalog.cardinality(p_group_ids) <> pg_catalog.cardinality(v_saved)
    OR NOT (p_group_ids @> v_saved)
  THEN
    RAISE EXCEPTION 'Choose every Group once' USING ERRCODE = '22023';
  END IF;

  UPDATE public.groups AS g SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_group_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE g.organization_id = p_organization_id AND g.parent_id IS NOT DISTINCT FROM p_parent_id AND g.id = o.id AND g.sort_order <> o.ordinal - 1;

  -- Row security silently hides rows from a write whose author lost authority.
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, name, id), '{}')
      FROM public.groups WHERE organization_id = p_organization_id AND parent_id IS NOT DISTINCT FROM p_parent_id)
     IS DISTINCT FROM p_group_ids
  THEN
    RAISE EXCEPTION 'Group order was not saved' USING ERRCODE = 'GRP01';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_order(uuid, uuid[], uuid[], uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_group_order(uuid, uuid[], uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_group_with_reassignment(p_organization_id uuid, p_group_id uuid, p_target_group_id uuid) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_moved integer;
  v_group uuid;
  v_subtree uuid[];
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF p_group_id IS NULL OR p_group_id = p_target_group_id THEN
    RAISE EXCEPTION 'Choose another Group for the members' USING ERRCODE = '22023';
  END IF;
  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM personnel_private.require_group_manager(p_organization_id);
  PERFORM 1 FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_target_group_id IS NOT NULL THEN
    PERFORM 1 FROM public.groups AS g
    WHERE g.organization_id = p_organization_id AND g.id = p_target_group_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT array_agg(g.id) INTO v_subtree FROM public.groups g
  WHERE g.organization_id = p_organization_id AND p_group_id = ANY(g.path);
  IF p_target_group_id = ANY(v_subtree) THEN
    RAISE EXCEPTION 'Choose another Group for the members' USING ERRCODE = '22023';
  END IF;

  UPDATE public.personnel AS p SET group_id = p_target_group_id
  WHERE p.organization_id = p_organization_id AND p.group_id = ANY(v_subtree);
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  FOR v_group IN SELECT g.id FROM public.groups g
    WHERE g.organization_id = p_organization_id AND g.id = ANY(v_subtree)
    ORDER BY pg_catalog.cardinality(g.path) DESC, g.id
  LOOP
    DELETE FROM public.groups AS g WHERE g.organization_id = p_organization_id AND g.id = v_group;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Group management is not allowed' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN v_moved;
END;
$$;

DROP FUNCTION public.rename_group(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.rename_group(p_organization_id uuid, p_group_id uuid, p_name text) RETURNS TABLE(id uuid, name text, sort_order integer, parent_id uuid, depth integer)
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_name text := pg_catalog.btrim(p_name);
  v_old text;
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Group name must be 1 to 100 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM personnel_private.require_group_manager(p_organization_id);
  SELECT g.name INTO v_old FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old <> v_name THEN
    UPDATE public.groups AS g SET name = v_name
    WHERE g.organization_id = p_organization_id AND g.id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Group management is not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT g.id, g.name, g.sort_order, g.parent_id, g.depth FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_group(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rename_group(uuid, uuid, text) TO authenticated;

COMMIT;
