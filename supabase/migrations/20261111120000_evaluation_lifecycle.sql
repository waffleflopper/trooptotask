-- An Evaluation keeps one lifecycle: workflow_status. NULL is "not tracked" and open; 'completed' is the only closed state.
-- Where the two columns disagree, the later state wins, so a completed or change-of-rater entry becomes completed.
-- The mapping is a repair, not a person's edit: with the stamp trigger off it leaves updated_at alone. The audit
-- trigger stays on, so the change is still recorded.
ALTER TABLE public.rating_scheme_entries DISABLE TRIGGER update_rating_scheme_entries_updated_at;
DO $$
DECLARE v_mapped integer;
BEGIN
  UPDATE public.rating_scheme_entries SET workflow_status = 'completed'
  WHERE status IN ('completed', 'change-of-rater') AND workflow_status IS DISTINCT FROM 'completed';
  GET DIAGNOSTICS v_mapped = ROW_COUNT;
  RAISE NOTICE 'Completed % evaluations whose status was already closed', v_mapped;
END;
$$;
ALTER TABLE public.rating_scheme_entries ENABLE TRIGGER update_rating_scheme_entries_updated_at;
ALTER TABLE public.rating_scheme_entries DROP COLUMN status;

CREATE OR REPLACE FUNCTION audit_private.audit_rating_scheme() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"evalType": "eval_type", "workflowStatus": "workflow_status", "reportType": "report_type", "periodStart": "rating_period_start", "periodEnd": "rating_period_end"}');
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

CREATE OR REPLACE FUNCTION public.roster_signals(p_organization_id uuid, p_as_of date, p_since date, p_sources text[], p_personnel_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH active AS MATERIALIZED (
    SELECT p.id, p.rank, p.mos, p.clinic_role
    FROM public.personnel p
    WHERE p.organization_id = p_organization_id AND p.archived_at IS NULL
      AND (p.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('personnel') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
      AND (SELECT public.is_org_member(p_organization_id))
      AND (p_personnel_ids IS NULL OR p.id = ANY (p_personnel_ids))
  ),
  presence_cohort AS (
    SELECT a.id
    FROM active a
    WHERE 'availability' = ANY (p_sources)
      AND (a.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
  ),
  training_cohort AS (
    SELECT a.id, a.rank, a.mos, a.clinic_role
    FROM active a
    WHERE 'training' = ANY (p_sources)
      AND (a.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('training') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
  ),
  task_cohort AS (
    SELECT a.id, a.mos
    FROM active a
    WHERE 'criticalTasks' = ANY (p_sources)
      AND (a.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('criticalTasks') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
  ),
  evaluation_cohort AS (
    SELECT a.id
    FROM active a
    WHERE 'evaluations' = ANY (p_sources)
      AND (a.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('ratingScheme') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
  ),
  record_cohort AS (
    SELECT a.id
    FROM active a
    WHERE ('followUps' = ANY (p_sources) OR 'counseling' = ANY (p_sources))
      AND (SELECT public.member_access_has_capability(p_organization_id, 'personnel', 'configure'))
  ),
  tasks AS (
    SELECT t.id, t.task_code, t.title, t.mos, t.expiration_months, t.sort_order
    FROM public.ict_tasks t
    WHERE 'criticalTasks' = ANY (p_sources) AND t.organization_id = p_organization_id AND t.archived_at IS NULL
      AND (SELECT public.member_access_has_capability(p_organization_id, 'criticalTasks', 'view'))
  ),
  latest_completions AS (
    SELECT DISTINCT ON (pc.personnel_id, pc.ict_task_id)
      pc.personnel_id, pc.ict_task_id, pc.completed_at, pc.created_at, pc.validated_by
    FROM public.personnel_ict_completions pc
    JOIN task_cohort c ON c.id = pc.personnel_id
    JOIN tasks t ON t.id = pc.ict_task_id
    WHERE pc.organization_id = p_organization_id AND pc.completed_at <= p_as_of
    ORDER BY pc.personnel_id, pc.ict_task_id, pc.completed_at DESC, pc.created_at DESC
  ),
  active_evaluations AS (
    SELECT DISTINCT ON (r.rated_person_id)
      r.rated_person_id, r.id, r.eval_type, r.report_type, r.rating_period_start, r.rating_period_end,
      r.workflow_status
    FROM public.rating_scheme_entries r
    JOIN evaluation_cohort c ON c.id = r.rated_person_id
    WHERE r.organization_id = p_organization_id AND r.workflow_status IS DISTINCT FROM 'completed'
    ORDER BY r.rated_person_id, r.rating_period_end DESC, r.id DESC
  )
  SELECT jsonb_build_object(
    'availability', CASE WHEN 'availability' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM presence_cohort c), '[]'::jsonb),
      'statusTypes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'color', s.color, 'textColor', s.text_color, 'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.name)
        FROM public.status_types s
        WHERE s.organization_id = p_organization_id
          AND (SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view'))
      ), '[]'::jsonb),
      'entries', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(e.id, e.personnel_id, e.status_type_id, e.start_date)
          ORDER BY e.personnel_id, e.id)
        FROM public.availability_entries e
        JOIN presence_cohort c ON c.id = e.personnel_id
        WHERE e.organization_id = p_organization_id AND e.start_date <= p_as_of AND e.end_date >= p_as_of
      ), '[]'::jsonb)
    ) END,
    'training', CASE WHEN 'training' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(c.id, c.rank, c.mos, c.clinic_role) ORDER BY c.id) FROM training_cohort c
      ), '[]'::jsonb),
      'types', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', t.id, 'name', t.name, 'expiration_months', t.expiration_months,
          'warning_days_yellow', t.warning_days_yellow, 'warning_days_orange', t.warning_days_orange,
          'applies_to_roles', t.applies_to_roles, 'applies_to_mos', t.applies_to_mos, 'applies_to_ranks', t.applies_to_ranks,
          'excluded_roles', t.excluded_roles, 'excluded_mos', t.excluded_mos, 'excluded_ranks', t.excluded_ranks,
          'expiration_date_only', t.expiration_date_only, 'can_be_exempted', t.can_be_exempted,
          'exempt_personnel_ids', t.exempt_personnel_ids, 'is_optional', t.is_optional
        ) ORDER BY t.sort_order, t.id)
        FROM public.training_types t
        WHERE t.organization_id = p_organization_id AND t.archived_at IS NULL
          AND (SELECT public.member_access_has_capability(p_organization_id, 'training', 'view'))
      ), '[]'::jsonb),
      'completions', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(pt.personnel_id, pt.training_type_id, pt.completion_date, pt.expiration_date)
          ORDER BY pt.personnel_id, pt.training_type_id)
        FROM public.personnel_trainings pt
        JOIN training_cohort c ON c.id = pt.personnel_id
        JOIN public.training_types t ON t.id = pt.training_type_id AND t.archived_at IS NULL
        WHERE pt.organization_id = p_organization_id
      ), '[]'::jsonb)
    ) END,
    'criticalTasks', CASE WHEN 'criticalTasks' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(jsonb_build_array(c.id, c.mos) ORDER BY c.id) FROM task_cohort c), '[]'::jsonb),
      'tasks', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', t.id, 'task_code', t.task_code, 'title', t.title, 'mos', t.mos, 'expiration_months', t.expiration_months
        ) ORDER BY t.sort_order, t.task_code)
        FROM tasks t
      ), '[]'::jsonb),
      'settings', (
        SELECT jsonb_build_object(
          'defaultExpirationMonths', o.critical_tasks_default_expiration_months,
          'expiringSoonWarningDays', o.critical_tasks_expiring_soon_warning_days
        )
        FROM public.organizations o
        WHERE o.id = p_organization_id AND EXISTS (
          SELECT 1 FROM public.organization_memberships m
          WHERE m.organization_id = p_organization_id AND m.user_id = (SELECT auth.uid())
        )
      ),
      'completions', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(l.personnel_id, l.ict_task_id, l.completed_at, l.created_at, l.validated_by)
          ORDER BY l.personnel_id, l.ict_task_id)
        FROM latest_completions l
      ), '[]'::jsonb)
    ) END,
    'evaluations', CASE WHEN 'evaluations' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM evaluation_cohort c), '[]'::jsonb),
      'entries', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(
          a.rated_person_id, a.id, a.eval_type, a.report_type, a.rating_period_start, a.rating_period_end,
          a.workflow_status
        ) ORDER BY a.rated_person_id)
        FROM active_evaluations a
      ), '[]'::jsonb)
    ) END,
    'followUps', CASE WHEN 'followUps' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM record_cohort c), '[]'::jsonb),
      'open', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(f.id, f.personnel_id, f.title, f.due_date)
          ORDER BY f.due_date NULLS LAST, f.created_at, f.id)
        FROM public.personnel_follow_ups f
        JOIN record_cohort c ON c.id = f.personnel_id
        WHERE f.organization_id = p_organization_id AND f.status = 'open'
      ), '[]'::jsonb)
    ) END,
    'counseling', CASE WHEN 'counseling' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM record_cohort c), '[]'::jsonb),
      'latest', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(l.personnel_id, l.conducted_on) ORDER BY l.personnel_id)
        FROM (
          SELECT cr.personnel_id, max(cr.date_conducted) AS conducted_on
          FROM public.counseling_records cr
          JOIN record_cohort c ON c.id = cr.personnel_id
          WHERE cr.organization_id = p_organization_id AND cr.archived_at IS NULL
            AND cr.date_conducted BETWEEN p_since AND p_as_of
          GROUP BY cr.personnel_id
        ) l
      ), '[]'::jsonb)
    ) END
  );
$$;

-- One step forward or back along the chain, skipping the intermediate-rater and reviewer steps when the entry has
-- no one in that role. Not tracked can start at drafting or be marked completed; drafting and completed can return
-- to not tracked. The same table is asserted in evaluationWorkflow.test.ts.
CREATE FUNCTION public.transition_rating_scheme_entry(p_organization_id uuid, p_entry_id uuid, p_to text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_steps CONSTANT text[] := ARRAY['drafting', 'with-rater', 'rater-signed', 'with-senior-rater', 'sr-signed',
    'with-intermediate-rater', 'ir-signed', 'with-reviewer', 'reviewer-signed', 'with-rated-soldier', 'sm-signed',
    'submitted-to-s1', 'completed'];
  v_row public.rating_scheme_entries;
  v_absent text[] := '{}';
  v_at integer;
  v_prev text;
  v_next text;
BEGIN
  IF p_to IS NOT NULL AND NOT p_to = ANY (v_steps) THEN
    RAISE EXCEPTION 'Unknown evaluation step' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.rating_scheme_entries AS r
  WHERE r.organization_id = p_organization_id AND r.id = p_entry_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL
    OR public.can_view_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Evaluation not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.can_edit_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Moving this evaluation needs Evals operation access for its scope' USING ERRCODE = '42501';
  END IF;

  IF v_row.workflow_status IS NOT DISTINCT FROM p_to THEN
    RETURN false;
  END IF;

  IF v_row.intermediate_rater_person_id IS NULL AND NULLIF(pg_catalog.btrim(v_row.intermediate_rater_name), '') IS NULL THEN
    v_absent := v_absent || ARRAY['with-intermediate-rater', 'ir-signed'];
  END IF;
  IF v_row.reviewer_person_id IS NULL AND NULLIF(pg_catalog.btrim(v_row.reviewer_name), '') IS NULL THEN
    v_absent := v_absent || ARRAY['with-reviewer', 'reviewer-signed'];
  END IF;
  v_at := pg_catalog.array_position(v_steps, v_row.workflow_status);
  IF v_at IS NOT NULL THEN
    SELECT s.step INTO v_prev FROM unnest(v_steps) WITH ORDINALITY AS s(step, n)
    WHERE s.n < v_at AND NOT s.step = ANY (v_absent) ORDER BY s.n DESC LIMIT 1;
    SELECT s.step INTO v_next FROM unnest(v_steps) WITH ORDINALITY AS s(step, n)
    WHERE s.n > v_at AND NOT s.step = ANY (v_absent) ORDER BY s.n LIMIT 1;
  END IF;

  -- A missing neighbour is NULL, so the comparison must not decide the move by being NULL.
  IF NOT COALESCE(
    (v_row.workflow_status IS NULL AND p_to IN ('drafting', 'completed'))
    OR (p_to IS NULL AND v_row.workflow_status IN ('drafting', 'completed'))
    OR p_to = v_prev OR p_to = v_next,
    false
  ) THEN
    RAISE EXCEPTION 'An evaluation at % cannot move to %',
      COALESCE(v_row.workflow_status, 'not tracked'), COALESCE(p_to, 'not tracked') USING ERRCODE = '55000';
  END IF;

  UPDATE public.rating_scheme_entries SET workflow_status = p_to
  WHERE organization_id = p_organization_id AND id = p_entry_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_rating_scheme_entry(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_rating_scheme_entry(uuid, uuid, text) TO authenticated;

-- A change of rater completes the current entry as a Change of Rater report through the change date and opens an
-- Annual successor for the new rater the next day. A completed entry has already been closed, so a repeat is a no-op.
CREATE FUNCTION public.change_rating_scheme_rater(p_organization_id uuid, p_entry_id uuid, p_change_date date,
  p_rater_person_id uuid DEFAULT NULL, p_rater_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.rating_scheme_entries;
  v_rater_name text := NULLIF(pg_catalog.btrim(p_rater_name), '');
  v_start date := p_change_date + 1;
  v_successor uuid;
BEGIN
  IF (p_rater_person_id IS NULL) = (v_rater_name IS NULL) THEN
    RAISE EXCEPTION 'Choose one new rater' USING ERRCODE = '22023';
  END IF;
  IF p_change_date IS NULL THEN
    RAISE EXCEPTION 'Choose the last day with the current rater' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.rating_scheme_entries AS r
  WHERE r.organization_id = p_organization_id AND r.id = p_entry_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL
    OR public.can_view_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Evaluation not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.can_edit_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing this rater needs Evals operation access for its scope' USING ERRCODE = '42501';
  END IF;

  IF v_row.workflow_status = 'completed' THEN
    RETURN NULL;
  END IF;
  IF p_rater_person_id = v_row.rater_person_id THEN
    RAISE EXCEPTION 'The new rater is already this evaluation''s rater' USING ERRCODE = '22023';
  END IF;
  IF p_change_date < v_row.rating_period_start OR p_change_date > v_row.rating_period_end THEN
    RAISE EXCEPTION 'The last day with the current rater must fall within the rating period' USING ERRCODE = '22023';
  END IF;

  UPDATE public.rating_scheme_entries SET rating_period_end = p_change_date, report_type = 'CR', workflow_status = 'completed'
  WHERE organization_id = p_organization_id AND id = p_entry_id;

  INSERT INTO public.rating_scheme_entries (
    organization_id, rated_person_id, eval_type, rater_person_id, rater_name,
    senior_rater_person_id, senior_rater_name, intermediate_rater_person_id, intermediate_rater_name,
    reviewer_person_id, reviewer_name, rating_period_start, rating_period_end, report_type
  ) VALUES (
    p_organization_id, v_row.rated_person_id, v_row.eval_type, p_rater_person_id, v_rater_name,
    v_row.senior_rater_person_id, v_row.senior_rater_name, v_row.intermediate_rater_person_id, v_row.intermediate_rater_name,
    v_row.reviewer_person_id, v_row.reviewer_name, v_start,
    -- calculateThruDate's annual rule: a month past the end rolls over (29 Feb 2028 runs through 28 Feb 2029).
    (pg_catalog.date_trunc('month', v_start) + interval '12 months')::date + (EXTRACT(DAY FROM v_start)::integer - 2),
    'AN'
  ) RETURNING id INTO v_successor;
  RETURN v_successor;
END;
$$;
REVOKE ALL ON FUNCTION public.change_rating_scheme_rater(uuid, uuid, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_rating_scheme_rater(uuid, uuid, date, uuid, text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.rating_scheme_entries FROM anon;
REVOKE INSERT, UPDATE ON public.rating_scheme_entries FROM authenticated;
GRANT INSERT (id, organization_id, rated_person_id, eval_type, rater_person_id, rater_name, senior_rater_person_id,
  senior_rater_name, intermediate_rater_person_id, intermediate_rater_name, reviewer_person_id, reviewer_name,
  rating_period_start, rating_period_end, notes, report_type)
  ON public.rating_scheme_entries TO authenticated;
GRANT UPDATE (rated_person_id, eval_type, rater_person_id, rater_name, senior_rater_person_id, senior_rater_name,
  intermediate_rater_person_id, intermediate_rater_name, reviewer_person_id, reviewer_name,
  rating_period_start, rating_period_end, notes, report_type)
  ON public.rating_scheme_entries TO authenticated;
