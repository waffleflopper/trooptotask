-- #1999 Calendar events, taskings and their equipment and checklist items are audited by the database in the same
-- transaction as the change. A failed audit write fails the change. A status change writes the entry for its
-- transition. Free text (description, instructions, qualifications, reasons, notes) is never saved, only that it
-- changed. Reordering an item list changes only positions, so it writes nothing here.
BEGIN;

CREATE FUNCTION audit_private.audit_calendar_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.calendar_events;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
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
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'calendar_event.created' WHEN 'UPDATE' THEN 'calendar_event.updated' WHEN 'DELETE' THEN 'calendar_event.deleted' END;
  v_details := pg_catalog.jsonb_build_object('startsOn', v_row.starts_on, 'endsOn', v_row.ends_on);
  IF TG_OP = 'UPDATE' THEN
    IF OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL THEN
      v_kind := 'calendar_event.cancelled';
    ELSE
      v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"title": "title", "startsOn": "starts_on", "endsOn": "ends_on", "host": "host_name", "location": "location"}');
      IF NEW.coordinator_user_id IS DISTINCT FROM OLD.coordinator_user_id THEN
        v_change := v_change || pg_catalog.jsonb_build_object('coordinator', true);
      END IF;
      IF NEW.description IS DISTINCT FROM OLD.description THEN
        v_change := v_change || pg_catalog.jsonb_build_object('description', true);
      END IF;
      IF NEW.source_reference IS DISTINCT FROM OLD.source_reference THEN
        v_change := v_change || pg_catalog.jsonb_build_object('sourceReference', true);
      END IF;
      IF v_change = '{}'::jsonb THEN
        RETURN NULL;
      END IF;
      v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
    END IF;
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'calendar_event', v_row.id, v_row.title,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_calendar_event() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_calendar_event
AFTER INSERT OR UPDATE OR DELETE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_calendar_event();

CREATE FUNCTION audit_private.audit_calendar_tasking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.calendar_taskings;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb := '{}'::jsonb;
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
        v_change := v_change || pg_catalog.jsonb_build_object('responsible', pg_catalog.jsonb_build_object(
          'from', (SELECT g.name FROM public.groups g WHERE g.id = OLD.responsible_group_id),
          'to', (SELECT g.name FROM public.groups g WHERE g.id = NEW.responsible_group_id)));
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
REVOKE ALL ON FUNCTION audit_private.audit_calendar_tasking() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_calendar_tasking
AFTER INSERT OR UPDATE OR DELETE ON public.calendar_taskings
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_calendar_tasking();

CREATE FUNCTION audit_private.audit_calendar_tasking_equipment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.calendar_tasking_equipment;
  v_title text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Items removed with their tasking or unit: that deletion is the audited event.
  SELECT t.title INTO v_title FROM public.calendar_taskings t
  WHERE t.organization_id = v_row.organization_id AND t.id = v_row.tasking_id;
  IF v_title IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_private.record_entry(v_row.organization_id, 'calendar_tasking.equipment_added', 'calendar_tasking',
      v_row.tasking_id, v_title, NULL, NULL, pg_catalog.jsonb_build_object('item', v_row.name));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM audit_private.record_entry(v_row.organization_id, 'calendar_tasking.equipment_removed', 'calendar_tasking',
      v_row.tasking_id, v_title, NULL, NULL, pg_catalog.jsonb_build_object('item', v_row.name));
  ELSE
    IF NEW.name IS DISTINCT FROM OLD.name OR NEW.quantity IS DISTINCT FROM OLD.quantity THEN
      PERFORM audit_private.record_entry(v_row.organization_id, 'calendar_tasking.equipment_changed', 'calendar_tasking',
        v_row.tasking_id, v_title, NULL, NULL, pg_catalog.jsonb_build_object('item', v_row.name));
    END IF;
    IF NEW.secured_quantity IS DISTINCT FROM OLD.secured_quantity THEN
      PERFORM audit_private.record_entry(v_row.organization_id, 'calendar_tasking.equipment_secured', 'calendar_tasking',
        v_row.tasking_id, v_title, NULL, NULL, pg_catalog.jsonb_build_object('item', v_row.name));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_calendar_tasking_equipment() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_calendar_tasking_equipment
AFTER INSERT OR UPDATE OR DELETE ON public.calendar_tasking_equipment
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_calendar_tasking_equipment();

CREATE FUNCTION audit_private.audit_calendar_tasking_checklist_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.calendar_tasking_checklist_items;
  v_title text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Items removed with their tasking or unit: that deletion is the audited event.
  SELECT t.title INTO v_title FROM public.calendar_taskings t
  WHERE t.organization_id = v_row.organization_id AND t.id = v_row.tasking_id;
  IF v_title IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_private.record_entry(v_row.organization_id, 'calendar_tasking.checklist_added', 'calendar_tasking',
      v_row.tasking_id, v_title, NULL, NULL, pg_catalog.jsonb_build_object('item', v_row.label));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM audit_private.record_entry(v_row.organization_id, 'calendar_tasking.checklist_removed', 'calendar_tasking',
      v_row.tasking_id, v_title, NULL, NULL, pg_catalog.jsonb_build_object('item', v_row.label));
  ELSE
    IF NEW.label IS DISTINCT FROM OLD.label THEN
      PERFORM audit_private.record_entry(v_row.organization_id, 'calendar_tasking.checklist_renamed', 'calendar_tasking',
        v_row.tasking_id, v_title, NULL, NULL, pg_catalog.jsonb_build_object('item', v_row.label));
    END IF;
    IF NEW.done IS DISTINCT FROM OLD.done THEN
      PERFORM audit_private.record_entry(v_row.organization_id,
        CASE WHEN NEW.done THEN 'calendar_tasking.checklist_completed' ELSE 'calendar_tasking.checklist_reopened' END,
        'calendar_tasking', v_row.tasking_id, v_title, NULL, NULL, pg_catalog.jsonb_build_object('item', v_row.label));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_calendar_tasking_checklist_item() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_calendar_tasking_checklist_item
AFTER INSERT OR UPDATE OR DELETE ON public.calendar_tasking_checklist_items
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_calendar_tasking_checklist_item();

COMMIT;
