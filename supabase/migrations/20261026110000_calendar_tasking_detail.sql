-- Tasking detail names each pick's MOS and clinic role, and a Blocked tasking's
-- reason can be corrected without unblocking it. The correction keeps who blocked
-- it and since when, and is recorded in Activity as an edited block reason.
-- Equipment comes back after the work is done, so a Completed tasking still takes
-- a change to the returned quantity alone. Everything else on it stays closed.
BEGIN;

DROP FUNCTION public.calendar_tasking_people(uuid, uuid);
CREATE FUNCTION public.calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid)
RETURNS TABLE (
  personnel_id uuid, rank text, first_name text, last_name text, group_id uuid, archived boolean,
  selected_at timestamptz, review_since timestamptz, mos text, clinic_role text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT person.id, person.rank, person.first_name, person.last_name, person.group_id, person.archived_at IS NOT NULL,
    p.selected_at, p.review_since, person.mos, person.clinic_role
  FROM public.calendar_taskings AS t
  JOIN public.calendar_tasking_participants AS p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
  JOIN public.personnel AS person ON person.organization_id = p.organization_id AND person.id = p.personnel_id
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
    AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
    AND public.calendar_personnel_group_scope_matches(person.organization_id, person.group_id)
  ORDER BY person.last_name, person.first_name, person.id;
$$;
ALTER FUNCTION public.calendar_tasking_people(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_tasking_people(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_people(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_calendar_tasking(
  p_organization_id uuid, p_tasking_id uuid, p_action text, p_note text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_group uuid;
  v_reason text;
  v_note text := NULLIF(pg_catalog.btrim(p_note), '');
  v_target text;
  v_from text[];
BEGIN
  v_target := CASE p_action
    WHEN 'start' THEN 'in_progress'
    WHEN 'block' THEN 'blocked'
    WHEN 'unblock' THEN 'in_progress'
    WHEN 'complete' THEN 'completed'
    WHEN 'reopen' THEN 'in_progress'
    WHEN 'cancel' THEN 'cancelled'
  END;
  v_from := CASE p_action
    WHEN 'start' THEN ARRAY['open']
    WHEN 'block' THEN ARRAY['open', 'in_progress']
    WHEN 'unblock' THEN ARRAY['blocked']
    WHEN 'complete' THEN ARRAY['open', 'in_progress', 'blocked']
    WHEN 'reopen' THEN ARRAY['completed']
    WHEN 'cancel' THEN ARRAY['open', 'in_progress', 'blocked']
  END;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Unknown tasking action' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'block' AND v_note IS NULL THEN
    RAISE EXCEPTION 'A block needs a reason' USING ERRCODE = '23514';
  END IF;
  IF p_action NOT IN ('block', 'complete', 'cancel') THEN
    v_note := NULL;
  END IF;

  SELECT t.status, t.responsible_group_id, t.block_reason INTO v_status, v_group, v_reason
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR calendar_private.can_view_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tasking not found' USING ERRCODE = 'P0002';
  END IF;
  IF calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing this tasking needs Calendar operation access for its scope' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'block' AND v_status = 'blocked' THEN
    IF v_note = v_reason THEN
      RETURN false;
    END IF;
    UPDATE public.calendar_taskings SET block_reason = v_note
    WHERE organization_id = p_organization_id AND id = p_tasking_id;
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (p_organization_id, p_tasking_id, auth.uid(), pg_catalog.now(), 'blocked',
      pg_catalog.jsonb_build_object('reason', v_note, 'edited', true));
    RETURN true;
  END IF;

  IF v_status = v_target THEN
    RETURN false;
  END IF;
  IF NOT v_status = ANY (v_from) THEN
    RAISE EXCEPTION 'A % tasking cannot %', v_status, p_action USING ERRCODE = '55000';
  END IF;

  UPDATE public.calendar_taskings SET
    status = v_target,
    block_reason = CASE WHEN v_target = 'blocked' THEN v_note END,
    blocked_at = CASE WHEN v_target = 'blocked' THEN pg_catalog.now() END,
    blocked_by = CASE WHEN v_target = 'blocked' THEN auth.uid() END,
    completion_note = CASE WHEN v_target = 'completed' THEN v_note END,
    completed_at = CASE WHEN v_target = 'completed' THEN pg_catalog.now() END,
    completed_by = CASE WHEN v_target = 'completed' THEN auth.uid() END,
    cancellation_reason = CASE WHEN v_target = 'cancelled' THEN v_note END,
    cancelled_at = CASE WHEN v_target = 'cancelled' THEN pg_catalog.now() END,
    cancelled_by = CASE WHEN v_target = 'cancelled' THEN auth.uid() END
  WHERE organization_id = p_organization_id AND id = p_tasking_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION calendar_private.stamp_calendar_tasking_equipment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
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
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_tasking_equipment() FROM PUBLIC, anon, authenticated, service_role;

CREATE POLICY "Calendar operators record returns on completed taskings" ON public.calendar_tasking_equipment
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_equipment.organization_id AND t.id = calendar_tasking_equipment.tasking_id
      AND t.status = 'completed'
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_equipment.organization_id AND t.id = calendar_tasking_equipment.tasking_id
      AND t.status = 'completed'
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  )
);

COMMIT;
