-- #1999 Onboarding is audited by the database in the same transaction as the change, one entry per row: templates and
-- their steps, a person's onboarding (started, completed, cancelled, reopened, switched to another template) and the
-- steps within it (completed, advanced, noted, removed). Notes and descriptions are never kept. Reordering template
-- steps writes nothing here. Rows removed with their person, template or unit are not audited.
BEGIN;

CREATE FUNCTION audit_private.audit_onboarding_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.onboarding_templates;
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
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'onboarding_template.created' WHEN 'UPDATE' THEN 'onboarding_template.updated' WHEN 'DELETE' THEN 'onboarding_template.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name"}');
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_change := v_change || pg_catalog.jsonb_build_object('description', true);
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := '{}'::jsonb;
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'onboarding_template', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_onboarding_template() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_onboarding_template
AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_templates
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_onboarding_template();

CREATE FUNCTION audit_private.audit_onboarding_template_step() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.onboarding_template_steps;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
  v_template text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  SELECT item.name INTO v_template FROM public.onboarding_templates item WHERE item.id = v_row.template_id;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id) OR v_template IS NULL) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'onboarding_template_step.created' WHEN 'UPDATE' THEN 'onboarding_template_step.updated' WHEN 'DELETE' THEN 'onboarding_template_step.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name", "stepType": "step_type"}');
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_change := v_change || pg_catalog.jsonb_build_object('description', true);
    END IF;
    IF NEW.stages IS DISTINCT FROM OLD.stages THEN
      v_change := v_change || pg_catalog.jsonb_build_object('stages', true);
    END IF;
    IF NEW.training_type_id IS DISTINCT FROM OLD.training_type_id THEN
      v_change := v_change || pg_catalog.jsonb_build_object('trainingType', true);
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('template', v_template, 'stepType', v_row.step_type);
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'onboarding_template_step', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_onboarding_template_step() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_onboarding_template_step
AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_template_steps
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_onboarding_template_step();

CREATE FUNCTION audit_private.audit_personnel_onboarding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_details jsonb;
  v_who text;
  v_template text;
BEGIN
  v_who := audit_private.personnel_label(NEW.personnel_id);
  IF v_who IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT item.name INTO v_template FROM public.onboarding_templates item WHERE item.id = NEW.template_id;
  IF TG_OP = 'INSERT' THEN
    v_kind := 'onboarding.started';
  ELSE
    v_kind := CASE
      WHEN OLD.status = 'in_progress' AND NEW.status = 'completed' THEN 'onboarding.completed'
      WHEN OLD.status = 'in_progress' AND NEW.status = 'cancelled' THEN 'onboarding.cancelled'
      WHEN OLD.status <> 'in_progress' AND NEW.status = 'in_progress' THEN 'onboarding.reopened'
      -- Deleting a template clears this reference. That is the template's deletion, not a switch.
      WHEN NEW.template_id IS NOT NULL AND NEW.template_id IS DISTINCT FROM OLD.template_id THEN 'onboarding.template_switched'
    END;
    IF v_kind IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('template', v_template);
  IF v_kind = 'onboarding.completed' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('incomplete',
      (SELECT pg_catalog.count(*) FROM public.onboarding_step_progress progress
        WHERE progress.onboarding_id = NEW.id AND progress.active AND NOT progress.completed));
  ELSIF v_kind = 'onboarding.template_switched' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('previousTemplate',
      (SELECT item.name FROM public.onboarding_templates item WHERE item.id = OLD.template_id));
  END IF;
  PERFORM audit_private.record_entry(
    NEW.organization_id, v_kind, 'personnel_onboarding', NEW.id, v_who,
    NEW.personnel_id, v_who, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_personnel_onboarding() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_personnel_onboarding
AFTER INSERT OR UPDATE ON public.personnel_onboardings
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_personnel_onboarding();

CREATE FUNCTION audit_private.audit_onboarding_step() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.onboarding_step_progress;
  v_kind text;
  v_details jsonb := '{}'::jsonb;
  v_person_id uuid;
  v_who text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    IF v_row.active OR NOT audit_private.unit_exists(v_row.organization_id) THEN
      RETURN NULL;
    END IF;
  ELSE
    v_row := NEW;
  END IF;
  SELECT packet.personnel_id INTO v_person_id FROM public.personnel_onboardings packet WHERE packet.id = v_row.onboarding_id;
  v_who := audit_private.personnel_label(v_person_id);
  IF v_who IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_kind := 'onboarding_step.inactive_removed';
  ELSIF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    v_kind := 'onboarding_step.stage_advanced';
    v_details := pg_catalog.jsonb_build_object('stage', NEW.current_stage, 'completed', NEW.completed);
  ELSIF NEW.completed IS DISTINCT FROM OLD.completed THEN
    v_kind := 'onboarding_step.toggled';
    v_details := pg_catalog.jsonb_build_object('completed', NEW.completed);
  ELSIF (CASE WHEN pg_catalog.jsonb_typeof(NEW.notes) = 'array' THEN pg_catalog.jsonb_array_length(NEW.notes) ELSE 0 END)
      > (CASE WHEN pg_catalog.jsonb_typeof(OLD.notes) = 'array' THEN pg_catalog.jsonb_array_length(OLD.notes) ELSE 0 END) THEN
    v_kind := 'onboarding_step.note_added';
  ELSE
    RETURN NULL;
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'onboarding_step_progress', v_row.id, v_row.step_name, v_person_id, v_who, v_details);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_onboarding_step() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_onboarding_step
AFTER UPDATE OR DELETE ON public.onboarding_step_progress
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_onboarding_step();

COMMIT;
