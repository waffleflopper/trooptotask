-- #1999 Deleting an event and keeping its taskings audits each tasking it detached, naming the event, and no longer
-- writes a second "changed" entry for the same unlink.
BEGIN;

CREATE OR REPLACE FUNCTION calendar_private.record_deleted_calendar_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, kind, payload)
  SELECT t.organization_id, t.id, auth.uid(), 'event_deleted',
    pg_catalog.jsonb_build_object('eventId', OLD.id, 'eventTitle', OLD.title)
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = OLD.organization_id AND t.event_id = OLD.id;
  -- Rows removed with their unit: that deletion is the audited event.
  IF audit_private.unit_exists(OLD.organization_id) THEN
    PERFORM audit_private.record_entry(
      t.organization_id, 'calendar_tasking.detached', 'calendar_tasking', t.id, t.title,
      NULL, NULL, pg_catalog.jsonb_build_object('event', OLD.title))
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = OLD.organization_id AND t.event_id = OLD.id
    ORDER BY t.id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION audit_private.audit_calendar_tasking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.calendar_taskings;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb := '{}'::jsonb;
  v_group_to text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  -- Deleting an event leaves its taskings standalone through the foreign key. record_deleted_calendar_event writes
  -- the entry for each, because the event's title is gone by now.
  IF TG_OP = 'UPDATE' AND OLD.event_id IS NOT NULL AND NEW.event_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.calendar_events e WHERE e.id = OLD.event_id)
  THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'calendar_tasking.created' WHEN 'UPDATE' THEN 'calendar_tasking.updated' WHEN 'DELETE' THEN 'calendar_tasking.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_kind := CASE
        WHEN NEW.status = 'cancelled' THEN 'calendar_tasking.cancelled'
        WHEN NEW.status = 'completed' THEN 'calendar_tasking.completed'
        WHEN NEW.status = 'blocked' THEN 'calendar_tasking.blocked'
        WHEN OLD.status = 'blocked' THEN 'calendar_tasking.unblocked'
        WHEN OLD.status = 'completed' THEN 'calendar_tasking.reopened'
        WHEN OLD.status = 'open' AND NEW.status = 'in_progress' THEN 'calendar_tasking.started'
      END;
      IF v_kind = 'calendar_tasking.updated' OR v_kind IS NULL THEN
        RETURN NULL;
      END IF;
    ELSIF NEW.status = 'blocked' AND NEW.block_reason IS DISTINCT FROM OLD.block_reason THEN
      v_kind := 'calendar_tasking.blocked';
    ELSE
      v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"title": "title", "suspenseOn": "suspense_on", "executionStartsOn": "execution_starts_on", "executionEndsOn": "execution_ends_on", "reportTime": "report_time", "staffingRequired": "staffing_required"}');
      IF NEW.responsible_group_id IS DISTINCT FROM OLD.responsible_group_id THEN
        SELECT g.name INTO v_group_to FROM public.groups g
        WHERE g.id = NEW.responsible_group_id AND g.organization_id = NEW.organization_id;
        PERFORM audit_private.require_in_unit(v_group_to, NEW.responsible_group_id);
        v_change := v_change || pg_catalog.jsonb_build_object('responsible', pg_catalog.jsonb_build_object(
          'from', (SELECT g.name FROM public.groups g
            WHERE g.id = OLD.responsible_group_id AND g.organization_id = OLD.organization_id),
          'to', v_group_to));
      END IF;
      IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
        v_change := v_change || pg_catalog.jsonb_build_object('event', true);
      END IF;
      IF NEW.qualifications IS DISTINCT FROM OLD.qualifications THEN
        v_change := v_change || pg_catalog.jsonb_build_object('qualifications', true);
      END IF;
      IF NEW.instructions IS DISTINCT FROM OLD.instructions THEN
        v_change := v_change || pg_catalog.jsonb_build_object('instructions', true);
      END IF;
      IF v_change = '{}'::jsonb THEN
        RETURN NULL;
      END IF;
      v_details := pg_catalog.jsonb_build_object('change', v_change);
    END IF;
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'calendar_tasking', v_row.id, v_row.title,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
COMMIT;
