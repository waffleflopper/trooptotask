BEGIN;

-- Table policies call Personnel's authorization helpers per scanned row. This read instead evaluates
-- the same visible cohort once per lane, including Personnel, before joining each source's facts.
-- Catalogs and Organization settings have separate guards because an empty cohort alone cannot protect them.
-- IS TRUE keeps cohort membership hashed; the SQL function's generic plan otherwise rescans it per Person.

CREATE FUNCTION public.roster_signals(
  p_organization_id uuid, p_as_of date, p_since date, p_sources text[], p_personnel_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
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
      r.rated_person_id, r.id, r.eval_type, r.report_type, r.rating_period_start, r.rating_period_end, r.status,
      r.workflow_status
    FROM public.rating_scheme_entries r
    JOIN evaluation_cohort c ON c.id = r.rated_person_id
    WHERE r.organization_id = p_organization_id AND r.status IS DISTINCT FROM 'completed'
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
        WHERE t.organization_id = p_organization_id
          AND (SELECT public.member_access_has_capability(p_organization_id, 'training', 'view'))
      ), '[]'::jsonb),
      'completions', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(pt.personnel_id, pt.training_type_id, pt.completion_date, pt.expiration_date)
          ORDER BY pt.personnel_id, pt.training_type_id)
        FROM public.personnel_trainings pt
        JOIN training_cohort c ON c.id = pt.personnel_id
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
          a.rated_person_id, a.id, a.eval_type, a.report_type, a.rating_period_start, a.rating_period_end, a.status,
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

ALTER FUNCTION public.roster_signals(uuid, date, date, text[], uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.roster_signals(uuid, date, date, text[], uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.roster_signals(uuid, date, date, text[], uuid[]) TO authenticated;

COMMIT;
