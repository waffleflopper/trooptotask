-- #1999 Training, critical tasks and Rating Scheme entries are audited by the database in the same transaction as the
-- change, one entry per row. Records about a person save the person's roster label. Notes, descriptions and lists such
-- as who a training applies to are never kept: an entry says the field changed. Reordering writes nothing here.
-- Rows removed with their person, task, training type or unit are not audited.
BEGIN;

-- The ids in a stored list. A value that is not a list of ids reads as empty, so an audit never fails the change it records.
CREATE FUNCTION audit_private.id_list(p_list jsonb) RETURNS SETOF uuid
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_array_elements_text(p_list)::uuid
  WHERE CASE WHEN pg_catalog.jsonb_typeof(p_list) = 'array' THEN NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_list) AS e
      WHERE e !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') ELSE false END;
$$;
REVOKE ALL ON FUNCTION audit_private.id_list(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION audit_private.audit_training_type() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.training_types;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
  v_ex record;
  v_who text;
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
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'training_type.created' WHEN 'UPDATE' THEN 'training_type.updated' WHEN 'DELETE' THEN 'training_type.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name", "expirationMonths": "expiration_months", "warningDaysYellow": "warning_days_yellow", "warningDaysOrange": "warning_days_orange", "color": "color", "expirationDateOnly": "expiration_date_only", "canBeExempted": "can_be_exempted", "isOptional": "is_optional"}');
    IF NEW.applies_to_roles IS DISTINCT FROM OLD.applies_to_roles OR NEW.applies_to_mos IS DISTINCT FROM OLD.applies_to_mos OR NEW.applies_to_ranks IS DISTINCT FROM OLD.applies_to_ranks OR NEW.excluded_roles IS DISTINCT FROM OLD.excluded_roles OR NEW.excluded_mos IS DISTINCT FROM OLD.excluded_mos OR NEW.excluded_ranks IS DISTINCT FROM OLD.excluded_ranks THEN
      v_change := v_change || pg_catalog.jsonb_build_object('audience', true);
    END IF;
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_change := v_change || pg_catalog.jsonb_build_object('description', true);
    END IF;
    IF v_change = '{}'::jsonb AND NOT (OLD.exempt_personnel_ids IS DISTINCT FROM NEW.exempt_personnel_ids) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := '{}'::jsonb;
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  IF TG_OP <> 'UPDATE' OR v_change <> '{}'::jsonb THEN
    PERFORM audit_private.record_entry(
      v_row.organization_id, v_kind, 'training_type', v_row.id, v_row.name,
      NULL, NULL, v_details
    );
  END IF;
  IF TG_OP = 'UPDATE' THEN
    FOR v_ex IN
      SELECT added.id, true AS exempt FROM (
        SELECT e AS id FROM audit_private.id_list(NEW.exempt_personnel_ids) AS e
        EXCEPT SELECT e FROM audit_private.id_list(OLD.exempt_personnel_ids) AS e) AS added
      UNION ALL
      SELECT removed.id, false FROM (
        SELECT e AS id FROM audit_private.id_list(OLD.exempt_personnel_ids) AS e
        EXCEPT SELECT e FROM audit_private.id_list(NEW.exempt_personnel_ids) AS e) AS removed
    LOOP
      v_who := audit_private.personnel_label(NEW.organization_id, v_ex.id);
      IF v_ex.exempt THEN
        PERFORM audit_private.require_in_unit(v_who, v_ex.id);
      END IF;
      IF v_who IS NOT NULL THEN
        PERFORM audit_private.record_entry(
          NEW.organization_id,
          CASE WHEN v_ex.exempt THEN 'training_type.exemption_added' ELSE 'training_type.exemption_removed' END,
          'training_type', NEW.id, NEW.name, v_ex.id, v_who, '{}'::jsonb);
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_training_type() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_training_type
AFTER INSERT OR UPDATE OR DELETE ON public.training_types
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_training_type();

CREATE FUNCTION audit_private.audit_training_view() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.training_views;
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
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'training_view.created' WHEN 'UPDATE' THEN 'training_view.updated' WHEN 'DELETE' THEN 'training_view.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name"}');
    IF NEW.column_ids IS DISTINCT FROM OLD.column_ids THEN
      v_change := v_change || pg_catalog.jsonb_build_object('columns', true);
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
    v_row.organization_id, v_kind, 'training_view', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_training_view() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_training_view
AFTER INSERT OR UPDATE OR DELETE ON public.training_views
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_training_view();

CREATE FUNCTION audit_private.audit_training_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.personnel_trainings;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
  v_type text;
  v_who text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  SELECT kind.name INTO v_type FROM public.training_types kind
  WHERE kind.id = v_row.training_type_id AND kind.organization_id = v_row.organization_id;
  v_who := audit_private.personnel_label(v_row.organization_id, v_row.personnel_id);
  IF TG_OP <> 'DELETE' THEN
    PERFORM audit_private.require_in_unit(v_type, v_row.training_type_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.training_type_id END);
    PERFORM audit_private.require_in_unit(v_who, v_row.personnel_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.personnel_id END);
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF NOT audit_private.unit_exists(v_row.organization_id) OR v_type IS NULL OR v_who IS NULL THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'training_record.created' WHEN 'UPDATE' THEN 'training_record.updated' WHEN 'DELETE' THEN 'training_record.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"completionDate": "completion_date", "expirationDate": "expiration_date"}');
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      v_change := v_change || pg_catalog.jsonb_build_object('notes', true);
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('completionDate', v_row.completion_date, 'expirationDate', v_row.expiration_date);
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'training_record', v_row.id, v_type,
    v_row.personnel_id, v_who, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_training_record() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_training_record
AFTER INSERT OR UPDATE OR DELETE ON public.personnel_trainings
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_training_record();

CREATE FUNCTION audit_private.audit_ict_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.ict_tasks;
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
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'ict_task.created' WHEN 'UPDATE' THEN 'ict_task.updated' WHEN 'DELETE' THEN 'ict_task.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"taskCode": "task_code", "title": "title", "expirationMonths": "expiration_months", "category": "category"}');
    IF NEW.mos IS DISTINCT FROM OLD.mos THEN
      v_change := v_change || pg_catalog.jsonb_build_object('mos', true);
    END IF;
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_change := v_change || pg_catalog.jsonb_build_object('description', true);
    END IF;
    IF v_change = '{}'::jsonb AND NOT ((OLD.archived_at IS NULL) <> (NEW.archived_at IS NULL)) THEN
      RETURN NULL;
    END IF;
    v_kind := CASE
  WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'ict_task.archived'
  WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'ict_task.restored'
  ELSE 'ict_task.updated' END;
  END IF;
  v_details := pg_catalog.jsonb_build_object('taskCode', v_row.task_code);
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'ict_task', v_row.id, v_row.title,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_ict_task() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_ict_task
AFTER INSERT OR UPDATE OR DELETE ON public.ict_tasks
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_ict_task();

CREATE FUNCTION audit_private.audit_ict_completion() RETURNS trigger
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
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      v_change := v_change || pg_catalog.jsonb_build_object('notes', true);
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
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_ict_completion() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_ict_completion
AFTER INSERT OR UPDATE OR DELETE ON public.personnel_ict_completions
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_ict_completion();

CREATE FUNCTION audit_private.audit_rating_scheme() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.rating_scheme_entries;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
  v_who text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  v_who := audit_private.personnel_label(v_row.organization_id, v_row.rated_person_id);
  IF TG_OP <> 'DELETE' THEN
    PERFORM audit_private.require_in_unit(v_who, v_row.rated_person_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.rated_person_id END);
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF NOT audit_private.unit_exists(v_row.organization_id) OR v_who IS NULL THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'rating_scheme.created' WHEN 'UPDATE' THEN 'rating_scheme.updated' WHEN 'DELETE' THEN 'rating_scheme.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"evalType": "eval_type", "status": "status", "workflowStatus": "workflow_status", "reportType": "report_type", "periodStart": "rating_period_start", "periodEnd": "rating_period_end"}');
    IF NEW.rater_person_id IS DISTINCT FROM OLD.rater_person_id OR NEW.rater_name IS DISTINCT FROM OLD.rater_name OR NEW.senior_rater_person_id IS DISTINCT FROM OLD.senior_rater_person_id OR NEW.senior_rater_name IS DISTINCT FROM OLD.senior_rater_name OR NEW.intermediate_rater_person_id IS DISTINCT FROM OLD.intermediate_rater_person_id OR NEW.intermediate_rater_name IS DISTINCT FROM OLD.intermediate_rater_name OR NEW.reviewer_person_id IS DISTINCT FROM OLD.reviewer_person_id OR NEW.reviewer_name IS DISTINCT FROM OLD.reviewer_name THEN
      v_change := v_change || pg_catalog.jsonb_build_object('raters', true);
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      v_change := v_change || pg_catalog.jsonb_build_object('notes', true);
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('periodStart', v_row.rating_period_start, 'periodEnd', v_row.rating_period_end);
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'rating_scheme', v_row.id, v_row.eval_type,
    v_row.rated_person_id, v_who, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_rating_scheme() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_rating_scheme
AFTER INSERT OR UPDATE OR DELETE ON public.rating_scheme_entries
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_rating_scheme();

-- An approved deletion runs through the service role for a reviewer the server has already authorized, so the delete
-- triggers would read no signed-in member and record System. The reviewer becomes the signed-in member for this
-- transaction only, the way close_roster_form acts for its caller. The claim is set inside a command only the service
-- role can execute, and a signed-in client's own claim is what auth.uid() reads for every other write, so no client
-- can choose whose name an entry carries.
CREATE OR REPLACE FUNCTION public.approve_record_deletion_request(
	p_organization_id uuid,
	p_request_id uuid,
	p_resource_type text,
	p_resource_id uuid,
	p_reviewer_id uuid,
	p_reviewed_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
	v_claim text := pg_catalog.current_setting('request.jwt.claim.sub', true);
BEGIN
	IF public.feature_is_off(p_organization_id, CASE p_resource_type
		WHEN 'training_type' THEN 'training'
		WHEN 'personnel_training' THEN 'training'
		WHEN 'rating_scheme_entry' THEN 'evaluations'
	END) THEN
		RAISE EXCEPTION 'This feature is turned off for the organization' USING ERRCODE = '42501';
	END IF;

	PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_reviewer_id::text, ''), true);
	IF p_resource_type = 'training_type' THEN
		DELETE FROM public.training_types
		WHERE organization_id = p_organization_id AND id = p_resource_id;
	ELSIF p_resource_type = 'personnel_training' THEN
		DELETE FROM public.personnel_trainings
		WHERE organization_id = p_organization_id AND id = p_resource_id;
	ELSIF p_resource_type = 'rating_scheme_entry' THEN
		DELETE FROM public.rating_scheme_entries
		WHERE organization_id = p_organization_id AND id = p_resource_id;
	ELSE
		RAISE EXCEPTION 'Unsupported deletion resource type' USING ERRCODE = '22023';
	END IF;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Deletion target not found' USING ERRCODE = 'P0002';
	END IF;
	PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_claim, ''), true);

	UPDATE public.deletion_requests
	SET status = 'approved',
		reviewed_by = p_reviewer_id,
		reviewed_at = p_reviewed_at,
		denial_reason = NULL
	WHERE organization_id = p_organization_id
		AND id = p_request_id
		AND resource_type = p_resource_type
		AND resource_id = p_resource_id
		AND status = 'pending';

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
	END IF;
END;
$$;

COMMIT;
