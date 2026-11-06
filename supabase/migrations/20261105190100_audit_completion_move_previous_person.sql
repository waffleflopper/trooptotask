-- #2013 Moving a critical task completion to another person also writes an entry under the person it moved from, so
-- filtering Logs by that person shows the move. The two entries carry the same details.
BEGIN;

CREATE OR REPLACE FUNCTION audit_private.audit_ict_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.personnel_ict_completions;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
  v_task text;
  v_who text;
  v_previous_who text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  SELECT item.title INTO v_task FROM public.ict_tasks item
  WHERE item.id = v_row.ict_task_id AND item.organization_id = v_row.organization_id;
  v_who := audit_private.personnel_label(v_row.organization_id, v_row.personnel_id);
  IF TG_OP <> 'DELETE' THEN
    PERFORM audit_private.require_in_unit(v_task, v_row.ict_task_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.ict_task_id END);
    PERFORM audit_private.require_in_unit(v_who, v_row.personnel_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.personnel_id END);
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF NOT audit_private.unit_exists(v_row.organization_id) OR v_task IS NULL OR v_who IS NULL THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'personnel_ict_completion.created' WHEN 'UPDATE' THEN 'personnel_ict_completion.updated' WHEN 'DELETE' THEN 'personnel_ict_completion.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"completedAt": "completed_at", "validationMethod": "validation_method"}');
    IF NEW.personnel_id IS DISTINCT FROM OLD.personnel_id THEN
      v_change := v_change || pg_catalog.jsonb_build_object('person', pg_catalog.jsonb_build_object(
        'from', audit_private.personnel_label(OLD.organization_id, OLD.personnel_id), 'to', v_who));
    END IF;
    IF NEW.ict_task_id IS DISTINCT FROM OLD.ict_task_id THEN
      v_change := v_change || pg_catalog.jsonb_build_object('task', pg_catalog.jsonb_build_object(
        'from', (SELECT item.title FROM public.ict_tasks item
          WHERE item.id = OLD.ict_task_id AND item.organization_id = OLD.organization_id),
        'to', v_task));
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      v_change := v_change || pg_catalog.jsonb_build_object('notes', true);
    END IF;
    IF NEW.validated_by IS DISTINCT FROM OLD.validated_by THEN
      v_change := v_change || pg_catalog.jsonb_build_object('validator', true);
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('completedAt', v_row.completed_at, 'validationMethod', v_row.validation_method);
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'personnel_ict_completion', v_row.id, v_task,
    v_row.personnel_id, v_who, v_details
  );
  IF TG_OP = 'UPDATE' AND NEW.personnel_id IS DISTINCT FROM OLD.personnel_id THEN
    v_previous_who := audit_private.personnel_label(OLD.organization_id, OLD.personnel_id);
    IF v_previous_who IS NOT NULL THEN
      PERFORM audit_private.record_entry(
        v_row.organization_id, v_kind, 'personnel_ict_completion', v_row.id, v_task,
        OLD.personnel_id, v_previous_who, v_details
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_ict_completion() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
