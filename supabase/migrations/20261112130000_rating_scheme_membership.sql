-- An Evaluation stays on the rating scheme until someone archives it. Being on the scheme and the progress of its
-- evaluation are separate: archived_at says whether the entry is listed, and workflow_status still says how far the
-- evaluation has come, so a completed evaluation stays listed and an open one can be taken off the scheme.
-- archived_by is the member who archived it, stamped by the database like the other archived_by columns. Neither
-- column joins the column grants of the lifecycle migration, so a signed-in client can write neither; archiving goes
-- through set_rating_scheme_entry_archived and change_rating_scheme_rater.
ALTER TABLE public.rating_scheme_entries
  ADD COLUMN archived_at timestamp with time zone NULL,
  ADD COLUMN archived_by text NULL;

CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.rating_scheme_entries
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();

-- Archiving or restoring alone is its own kind of entry. When it happens with other changes, as a change of rater does
-- to the entry it closes, the update notes that membership changed.
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
    IF (NEW.archived_at IS NULL) <> (OLD.archived_at IS NULL) THEN
      IF v_change = '{}'::jsonb THEN
        v_kind := CASE WHEN NEW.archived_at IS NULL THEN 'rating_scheme.restored' ELSE 'rating_scheme.archived' END;
      ELSE
        v_change := v_change || pg_catalog.jsonb_build_object('membership', true);
      END IF;
    ELSIF v_change = '{}'::jsonb THEN
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

-- The lifecycle migration dropped the status that said which entries were on the scheme, so the answer is rebuilt.
-- A completed entry is archived when a later entry of the same rated Person supersedes it, which covers every
-- Change of Rater predecessor and older history, or when the audit log shows its status last moved to completed.
-- A Person's newest entry otherwise stays listed even if its evaluation is completed. archived_at is the time the
-- status moved to completed when the log has it, else the last update; archived_by stays empty. Like the lifecycle
-- migration, the repair leaves updated_at alone and the audit trigger records it.
ALTER TABLE public.rating_scheme_entries DISABLE TRIGGER update_rating_scheme_entries_updated_at;
DO $$
DECLARE
  v_superseded integer;
  v_completed integer;
BEGIN
  WITH latest_status_change AS (
    SELECT DISTINCT ON (a.resource_id) a.resource_id, a."timestamp" AS changed_at,
      a.details -> 'change' -> 'status' ->> 'to' AS moved_to
    FROM public.audit_logs AS a
    WHERE a.action = 'rating_scheme.updated' AND (a.details -> 'change' -> 'status') IS NOT NULL
    ORDER BY a.resource_id, a."timestamp" DESC, a.id DESC
  ),
  closed AS (
    SELECT r.id,
      EXISTS (
        SELECT 1 FROM public.rating_scheme_entries AS later
        WHERE later.organization_id = r.organization_id AND later.rated_person_id = r.rated_person_id
          AND later.rating_period_start > r.rating_period_start
      ) AS superseded,
      COALESCE(l.moved_to = 'completed', false) AS finished,
      l.changed_at
    FROM public.rating_scheme_entries AS r
    LEFT JOIN latest_status_change AS l ON l.resource_id = r.id
    WHERE r.workflow_status = 'completed'
  ),
  archived AS (
    UPDATE public.rating_scheme_entries AS r
    SET archived_at = COALESCE(CASE WHEN c.finished THEN c.changed_at END, r.updated_at)
    FROM closed AS c
    WHERE c.id = r.id AND (c.superseded OR c.finished)
    RETURNING c.superseded
  )
  SELECT count(*) FILTER (WHERE superseded), count(*) FILTER (WHERE NOT superseded)
  INTO v_superseded, v_completed FROM archived;
  RAISE NOTICE 'Archived % completed evaluations that a later one supersedes', v_superseded;
  RAISE NOTICE 'Archived % other evaluations whose status was last moved to completed', v_completed;
END;
$$;
ALTER TABLE public.rating_scheme_entries ENABLE TRIGGER update_rating_scheme_entries_updated_at;

-- roster_signals reads an evaluation only while its entry is listed on the scheme.
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
    WHERE r.organization_id = p_organization_id AND r.archived_at IS NULL AND r.workflow_status IS DISTINCT FROM 'completed'
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

-- Takes an entry off the scheme or puts it back, whatever its evaluation has reached. Archiving needs the same Evals
-- operation access as moving an evaluation. The caller is stamped as the member who archived it by the trigger above.
-- The result carries the row as it stands: changed is false when the entry was already in the requested state.
CREATE FUNCTION public.set_rating_scheme_entry_archived(p_organization_id uuid, p_entry_id uuid, p_archived boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.rating_scheme_entries;
BEGIN
  IF p_archived IS NULL THEN
    RAISE EXCEPTION 'Choose whether to archive or restore the evaluation' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.rating_scheme_entries AS r
  WHERE r.organization_id = p_organization_id AND r.id = p_entry_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL
    OR public.can_view_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Evaluation not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.can_edit_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Archiving this evaluation needs Evals operation access for its scope' USING ERRCODE = '42501';
  END IF;

  IF (v_row.archived_at IS NOT NULL) = p_archived THEN
    RETURN pg_catalog.jsonb_build_object('changed', false, 'entry', pg_catalog.to_jsonb(v_row));
  END IF;

  UPDATE public.rating_scheme_entries
  SET archived_at = CASE WHEN p_archived THEN pg_catalog.now() END
  WHERE organization_id = p_organization_id AND id = p_entry_id
  RETURNING * INTO v_row;
  RETURN pg_catalog.jsonb_build_object('changed', true, 'entry', pg_catalog.to_jsonb(v_row));
END;
$$;
REVOKE ALL ON FUNCTION public.set_rating_scheme_entry_archived(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_rating_scheme_entry_archived(uuid, uuid, boolean) TO authenticated;

-- A change of rater also takes the entry it closes off the scheme, since its successor starts on it. An entry that was
-- already archived keeps its archive time and member.
CREATE OR REPLACE FUNCTION public.change_rating_scheme_rater(p_organization_id uuid, p_entry_id uuid, p_change_date date,
  p_rater_person_id uuid DEFAULT NULL, p_rater_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.rating_scheme_entries;
  v_rater_name text := NULLIF(pg_catalog.btrim(p_rater_name), '');
  v_start date := p_change_date + 1;
  v_successor public.rating_scheme_entries;
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
    SELECT * INTO v_successor FROM public.rating_scheme_entries AS s
    WHERE v_row.report_type = 'CR' AND v_row.rating_period_end = p_change_date
      AND s.organization_id = p_organization_id AND s.rated_person_id = v_row.rated_person_id
      AND s.eval_type IS NOT DISTINCT FROM v_row.eval_type AND s.rating_period_start = v_start
      AND (s.rater_person_id = p_rater_person_id
        OR (p_rater_person_id IS NULL AND s.rater_person_id IS NULL
          AND pg_catalog.lower(pg_catalog.btrim(s.rater_name)) = pg_catalog.lower(v_rater_name)))
    ORDER BY s.created_at DESC, s.id
    LIMIT 1;
    RETURN pg_catalog.jsonb_build_object('entry', pg_catalog.to_jsonb(v_row),
      'successor', CASE WHEN v_successor.id IS NULL THEN NULL ELSE pg_catalog.to_jsonb(v_successor) END);
  END IF;
  IF p_rater_person_id = v_row.rater_person_id
    OR (p_rater_person_id IS NULL AND v_row.rater_person_id IS NULL
      AND pg_catalog.lower(v_rater_name) = pg_catalog.lower(pg_catalog.btrim(v_row.rater_name))) THEN
    RAISE EXCEPTION 'The new rater is already this evaluation''s rater' USING ERRCODE = '22023';
  END IF;
  IF p_change_date < v_row.rating_period_start OR p_change_date > v_row.rating_period_end THEN
    RAISE EXCEPTION 'The last day with the current rater must fall within the rating period' USING ERRCODE = '22023';
  END IF;

  UPDATE public.rating_scheme_entries
  SET rating_period_end = p_change_date, report_type = 'CR', workflow_status = 'completed',
    archived_at = COALESCE(archived_at, pg_catalog.now())
  WHERE organization_id = p_organization_id AND id = p_entry_id
  RETURNING * INTO v_row;

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
  ) RETURNING * INTO v_successor;
  RETURN pg_catalog.jsonb_build_object('entry', pg_catalog.to_jsonb(v_row), 'successor', pg_catalog.to_jsonb(v_successor));
END;
$$;
