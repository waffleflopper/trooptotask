-- Calendar Taskings: one outcome the unit owes, owned by one Group or by the
-- Organization, standalone or linked to an Event. Readers see the Taskings their
-- scope covers; operators write the ones their scope covers, and only
-- Organization-wide operators change responsibility. Status moves only through
-- transition_calendar_tasking. Attribution and Activity come from the database.
BEGIN;

CREATE TABLE public.calendar_taskings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_id uuid,
  title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 200),
  -- NULL means the Organization itself is responsible.
  responsible_group_id uuid,
  suspense_on date NOT NULL,
  execution_starts_on date,
  execution_ends_on date,
  report_time time,
  staffing_required integer CHECK (staffing_required IS NULL OR staffing_required BETWEEN 1 AND 9999),
  qualifications text CHECK (qualifications IS NULL OR (btrim(qualifications) <> '' AND char_length(qualifications) <= 1000)),
  instructions text CHECK (instructions IS NULL OR (btrim(instructions) <> '' AND char_length(instructions) <= 4000)),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  block_reason text CHECK (block_reason IS NULL OR (btrim(block_reason) <> '' AND char_length(block_reason) <= 1000)),
  blocked_at timestamptz,
  blocked_by uuid,
  completion_note text CHECK (completion_note IS NULL OR (btrim(completion_note) <> '' AND char_length(completion_note) <= 1000)),
  completed_at timestamptz,
  completed_by uuid,
  cancellation_reason text CHECK (
    cancellation_reason IS NULL OR (btrim(cancellation_reason) <> '' AND char_length(cancellation_reason) <= 1000)
  ),
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT calendar_taskings_execution CHECK (
    (execution_starts_on IS NULL) = (execution_ends_on IS NULL)
    AND (execution_ends_on IS NULL OR execution_ends_on >= execution_starts_on)
    AND (report_time IS NULL OR execution_starts_on IS NOT NULL)
  ),
  CONSTRAINT calendar_taskings_staffing CHECK (qualifications IS NULL OR staffing_required IS NOT NULL),
  CONSTRAINT calendar_taskings_blocked CHECK (
    (status = 'blocked') = (blocked_at IS NOT NULL) AND (status = 'blocked') = (block_reason IS NOT NULL)
    AND (blocked_at IS NOT NULL OR blocked_by IS NULL)
  ),
  CONSTRAINT calendar_taskings_completed CHECK (
    (status = 'completed') = (completed_at IS NOT NULL)
    AND (completed_at IS NOT NULL OR (completed_by IS NULL AND completion_note IS NULL))
  ),
  CONSTRAINT calendar_taskings_cancelled CHECK (
    (status = 'cancelled') = (cancelled_at IS NOT NULL)
    AND (cancelled_at IS NOT NULL OR (cancelled_by IS NULL AND cancellation_reason IS NULL))
  ),
  CONSTRAINT calendar_taskings_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT calendar_taskings_event_fkey FOREIGN KEY (organization_id, event_id)
    REFERENCES public.calendar_events (organization_id, id),
  -- Deleting a Group that still owns Taskings is refused; responsibility never clears silently.
  CONSTRAINT calendar_taskings_responsible_group_fkey FOREIGN KEY (organization_id, responsible_group_id)
    REFERENCES public.groups (organization_id, id)
);

CREATE INDEX calendar_taskings_organization_status_idx ON public.calendar_taskings (organization_id, status, suspense_on);
CREATE INDEX calendar_taskings_event_idx ON public.calendar_taskings (organization_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX calendar_taskings_group_idx
  ON public.calendar_taskings (organization_id, responsible_group_id) WHERE responsible_group_id IS NOT NULL;

-- Append-only. Rows come only from calendar_private.record_calendar_tasking_activity.
CREATE TABLE public.calendar_tasking_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  tasking_id uuid NOT NULL,
  actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN (
    'created', 'outcome_changed', 'responsibility_changed', 'dates_changed', 'linked', 'unlinked',
    'requirement_changed', 'instructions_changed',
    'started', 'blocked', 'unblocked', 'completed', 'reopened', 'cancelled'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  FOREIGN KEY (organization_id, tasking_id)
    REFERENCES public.calendar_taskings (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX calendar_tasking_activity_tasking_idx ON public.calendar_tasking_activity (tasking_id, id);
CREATE INDEX calendar_tasking_activity_organization_idx ON public.calendar_tasking_activity (organization_id, id);

-- A NULL Group is Organization-level work, which only Organization-wide scope covers.
CREATE FUNCTION calendar_private.can_view_calendar_tasking(p_organization_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT calendar_private.can_view_calendar_events(p_organization_id)
    AND public.calendar_personnel_group_scope_matches(p_organization_id, p_group_id);
$$;
ALTER FUNCTION calendar_private.can_view_calendar_tasking(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.can_view_calendar_tasking(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION calendar_private.can_view_calendar_tasking(uuid, uuid) TO authenticated;

CREATE FUNCTION calendar_private.can_manage_calendar_tasking(p_organization_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND public.organization_access_admitted(p_organization_id, 'eventsAndTaskings')
    AND public.calendar_personnel_group_scope_matches(p_organization_id, p_group_id);
$$;
ALTER FUNCTION calendar_private.can_manage_calendar_tasking(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.can_manage_calendar_tasking(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION calendar_private.can_manage_calendar_tasking(uuid, uuid) TO authenticated;

CREATE FUNCTION calendar_private.stamp_calendar_tasking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := pg_catalog.now();
    NEW.created_by := auth.uid();
    NEW.status := 'open';
    NEW.block_reason := NULL;
    NEW.blocked_at := NULL;
    NEW.blocked_by := NULL;
    NEW.completion_note := NULL;
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
    NEW.cancellation_reason := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancelled_by := NULL;
  ELSE
    IF OLD.status IN ('completed', 'cancelled') AND NEW.status = OLD.status THEN
      RAISE EXCEPTION 'A completed or cancelled tasking cannot change' USING ERRCODE = '55000';
    END IF;
    IF NEW.responsible_group_id IS DISTINCT FROM OLD.responsible_group_id
      AND NOT calendar_private.can_manage_calendar_tasking(NEW.organization_id, NULL)
    THEN
      RAISE EXCEPTION 'Only Organization-wide Calendar operators change responsibility' USING ERRCODE = '42501';
    END IF;
    NEW.id := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_tasking() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stamp_calendar_tasking
BEFORE INSERT OR UPDATE ON public.calendar_taskings
FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_calendar_tasking();

CREATE FUNCTION calendar_private.record_calendar_tasking_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_payload jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind)
    VALUES (NEW.organization_id, NEW.id, NEW.created_by, NEW.created_at, 'created');
    RETURN NULL;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'outcome_changed',
      pg_catalog.jsonb_build_object('from', OLD.title, 'to', NEW.title));
  END IF;
  IF NEW.responsible_group_id IS DISTINCT FROM OLD.responsible_group_id THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'responsibility_changed',
      pg_catalog.jsonb_build_object('from', OLD.responsible_group_id, 'to', NEW.responsible_group_id));
  END IF;
  IF (NEW.suspense_on, NEW.execution_starts_on, NEW.execution_ends_on, NEW.report_time)
    IS DISTINCT FROM (OLD.suspense_on, OLD.execution_starts_on, OLD.execution_ends_on, OLD.report_time)
  THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'dates_changed', pg_catalog.jsonb_build_object(
      'from', pg_catalog.jsonb_build_object('suspenseOn', OLD.suspense_on, 'executionStartsOn', OLD.execution_starts_on,
        'executionEndsOn', OLD.execution_ends_on, 'reportTime', pg_catalog.to_char(OLD.report_time, 'HH24:MI')),
      'to', pg_catalog.jsonb_build_object('suspenseOn', NEW.suspense_on, 'executionStartsOn', NEW.execution_starts_on,
        'executionEndsOn', NEW.execution_ends_on, 'reportTime', pg_catalog.to_char(NEW.report_time, 'HH24:MI'))
    ));
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    IF OLD.event_id IS NOT NULL THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'unlinked',
        pg_catalog.jsonb_build_object('eventId', OLD.event_id));
    END IF;
    IF NEW.event_id IS NOT NULL THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'linked',
        pg_catalog.jsonb_build_object('eventId', NEW.event_id));
    END IF;
  END IF;
  IF (NEW.staffing_required, NEW.qualifications) IS DISTINCT FROM (OLD.staffing_required, OLD.qualifications) THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'requirement_changed', pg_catalog.jsonb_build_object(
      'from', pg_catalog.jsonb_build_object('count', OLD.staffing_required, 'qualifications', OLD.qualifications),
      'to', pg_catalog.jsonb_build_object('count', NEW.staffing_required, 'qualifications', NEW.qualifications)
    ));
  END IF;
  IF NEW.instructions IS DISTINCT FROM OLD.instructions THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'instructions_changed');
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_kind := CASE
      WHEN NEW.status = 'blocked' THEN 'blocked'
      WHEN NEW.status = 'completed' THEN 'completed'
      WHEN NEW.status = 'cancelled' THEN 'cancelled'
      WHEN OLD.status = 'open' THEN 'started'
      WHEN OLD.status = 'blocked' THEN 'unblocked'
      ELSE 'reopened'
    END;
    v_payload := CASE v_kind
      WHEN 'blocked' THEN pg_catalog.jsonb_build_object('reason', NEW.block_reason)
      WHEN 'completed' THEN pg_catalog.jsonb_build_object('note', NEW.completion_note)
      WHEN 'cancelled' THEN pg_catalog.jsonb_build_object('reason', NEW.cancellation_reason)
      ELSE '{}'::jsonb
    END;
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, v_kind, v_payload);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.record_calendar_tasking_activity() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER record_calendar_tasking_activity
AFTER INSERT OR UPDATE ON public.calendar_taskings
FOR EACH ROW EXECUTE FUNCTION calendar_private.record_calendar_tasking_activity();

ALTER TABLE public.calendar_taskings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_tasking_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Calendar readers view the taskings their scope covers" ON public.calendar_taskings
FOR SELECT TO authenticated USING (calendar_private.can_view_calendar_tasking(organization_id, responsible_group_id));
CREATE POLICY "Calendar operators create taskings their scope covers" ON public.calendar_taskings
FOR INSERT TO authenticated
WITH CHECK (calendar_private.can_manage_calendar_tasking(organization_id, responsible_group_id));
CREATE POLICY "Calendar operators edit taskings their scope covers" ON public.calendar_taskings
FOR UPDATE TO authenticated
USING (calendar_private.can_manage_calendar_tasking(organization_id, responsible_group_id))
WITH CHECK (calendar_private.can_manage_calendar_tasking(organization_id, responsible_group_id));

-- Activity follows its Tasking's visibility through the Tasking's own policy.
CREATE POLICY "Calendar readers view activity of taskings they can see" ON public.calendar_tasking_activity
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_activity.organization_id AND t.id = calendar_tasking_activity.tasking_id
  )
);

REVOKE ALL ON public.calendar_taskings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.calendar_tasking_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.calendar_taskings TO authenticated;
GRANT INSERT (
  id, organization_id, event_id, title, responsible_group_id, suspense_on, execution_starts_on, execution_ends_on,
  report_time, staffing_required, qualifications, instructions
) ON public.calendar_taskings TO authenticated;
GRANT UPDATE (
  event_id, title, responsible_group_id, suspense_on, execution_starts_on, execution_ends_on,
  report_time, staffing_required, qualifications, instructions
) ON public.calendar_taskings TO authenticated;
GRANT SELECT ON public.calendar_tasking_activity TO authenticated;
GRANT ALL ON public.calendar_taskings, public.calendar_tasking_activity TO service_role;

-- The only way a Tasking's status changes. A repeat of an action that already
-- landed is a no-op, so a retried request keeps the first actor, time and note.
CREATE FUNCTION public.transition_calendar_tasking(
  p_organization_id uuid, p_tasking_id uuid, p_action text, p_note text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_group uuid;
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

  SELECT t.status, t.responsible_group_id INTO v_status, v_group
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR calendar_private.can_view_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tasking not found' USING ERRCODE = 'P0002';
  END IF;
  IF calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing this tasking needs Calendar operation access for its scope' USING ERRCODE = '42501';
  END IF;

  IF v_status = v_target THEN
    RETURN;
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
END;
$$;
ALTER FUNCTION public.transition_calendar_tasking(uuid, uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transition_calendar_tasking(uuid, uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transition_calendar_tasking(uuid, uuid, text, text) TO authenticated;

COMMIT;
