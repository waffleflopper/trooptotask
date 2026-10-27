BEGIN;

ALTER TABLE public.calendar_taskings DROP CONSTRAINT calendar_taskings_event_fkey;
ALTER TABLE public.calendar_taskings ADD CONSTRAINT calendar_taskings_event_fkey
  FOREIGN KEY (organization_id, event_id) REFERENCES public.calendar_events (organization_id, id)
  ON DELETE SET NULL (event_id);

DO $$
DECLARE v_kinds text[];
BEGIN
  SELECT pg_catalog.array_agg(DISTINCT m[1]) INTO v_kinds
  FROM pg_catalog.pg_constraint AS c,
    LATERAL pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid), '[''{,]([a-z_]+)(?=[''},])', 'g') AS m
  WHERE c.conrelid = 'public.calendar_tasking_activity'::regclass
    AND c.conname = 'calendar_tasking_activity_kind_check';
  ALTER TABLE public.calendar_tasking_activity DROP CONSTRAINT calendar_tasking_activity_kind_check;
  EXECUTE pg_catalog.format(
    'ALTER TABLE public.calendar_tasking_activity ADD CONSTRAINT calendar_tasking_activity_kind_check CHECK (kind = ANY (%L::text[]))',
    v_kinds || ARRAY['event_deleted']
  );
END;
$$;

-- The FK can unlink closed Taskings only after their Event is gone. Ordinary edits stay closed.
CREATE OR REPLACE FUNCTION calendar_private.stamp_calendar_tasking() RETURNS trigger
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
    IF OLD.status IN ('completed', 'cancelled') AND NEW.status = OLD.status
      AND NOT (
        OLD.event_id IS NOT NULL AND NEW.event_id IS NULL
        AND pg_catalog.to_jsonb(NEW) - 'event_id' = pg_catalog.to_jsonb(OLD) - 'event_id'
        AND NOT EXISTS (
          SELECT 1 FROM public.calendar_events AS e
          WHERE e.organization_id = OLD.organization_id AND e.id = OLD.event_id
        )
      ) THEN
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


-- Deletion records the title before the Event disappears, so its FK unlink must not add a second entry.
CREATE OR REPLACE FUNCTION calendar_private.record_calendar_tasking_activity() RETURNS trigger
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
    IF OLD.event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.calendar_events AS e
      WHERE e.organization_id = OLD.organization_id AND e.id = OLD.event_id
    ) THEN
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


CREATE FUNCTION calendar_private.record_deleted_calendar_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, kind, payload)
  SELECT t.organization_id, t.id, auth.uid(), 'event_deleted',
    pg_catalog.jsonb_build_object('eventId', OLD.id, 'eventTitle', OLD.title)
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = OLD.organization_id AND t.event_id = OLD.id;
  RETURN OLD;
END;
$$;
ALTER FUNCTION calendar_private.record_deleted_calendar_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.record_deleted_calendar_event() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER record_deleted_calendar_event
BEFORE DELETE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION calendar_private.record_deleted_calendar_event();

CREATE FUNCTION public.delete_calendar_event(p_organization_id uuid, p_event_id uuid, p_taskings text)
RETURNS TABLE (taskings integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
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

  PERFORM t.id FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.event_id = p_event_id
  ORDER BY t.id FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_taskings = 'delete' THEN
    DELETE FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.event_id = p_event_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  DELETE FROM public.calendar_events AS e
  WHERE e.organization_id = p_organization_id AND e.id = p_event_id;
  RETURN QUERY SELECT v_count;
END;
$$;
ALTER FUNCTION public.delete_calendar_event(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_calendar_event(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_calendar_event(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
