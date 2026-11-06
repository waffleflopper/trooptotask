-- #1999 Calendar catalogs (status types, special days, assignment types) are audited by the database in the same
-- transaction as the change, one entry per row. A failed audit write fails the change. Changes to a column an entry
-- does not declare (sort order, roster rules) write nothing.
BEGIN;

CREATE FUNCTION audit_private.audit_status_type() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.status_types;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'status_type.created' WHEN 'UPDATE' THEN 'status_type.updated' WHEN 'DELETE' THEN 'status_type.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name", "shortLabel": "short_label", "color": "color", "textColor": "text_color", "rosterEffect": "roster_effect"}');
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := '{}'::jsonb;
  IF TG_OP = 'UPDATE' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'status_type', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_status_type() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_status_type
AFTER INSERT OR UPDATE OR DELETE ON public.status_types
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_status_type();

CREATE FUNCTION audit_private.audit_special_day() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.special_days;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'special_day.created' WHEN 'UPDATE' THEN 'special_day.updated' WHEN 'DELETE' THEN 'special_day.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name", "date": "date"}');
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('date', v_row.date);
  IF TG_OP = 'UPDATE' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'special_day', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_special_day() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_special_day
AFTER INSERT OR UPDATE OR DELETE ON public.special_days
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_special_day();

CREATE FUNCTION audit_private.audit_assignment_type() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.assignment_types;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'assignment_type.created' WHEN 'UPDATE' THEN 'assignment_type.updated' WHEN 'DELETE' THEN 'assignment_type.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name", "shortName": "short_name", "assignTo": "assign_to", "color": "color", "showOnCalendar": "show_on_calendar"}');
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('assignTo', v_row.assign_to);
  IF TG_OP = 'UPDATE' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'assignment_type', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_assignment_type() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_assignment_type
AFTER INSERT OR UPDATE OR DELETE ON public.assignment_types
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_assignment_type();

COMMIT;
