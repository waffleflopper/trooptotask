-- #2030 Training types are archived instead of deleted. An archived type keeps every record that uses it and can be
-- restored. A type with records can no longer be deleted: the composite foreign keys that cascaded the delete to its
-- records now refuse it (NO ACTION is checked at the end of the statement, so deleting an Organization, which removes
-- parent and child rows together, still works).
BEGIN;

ALTER TABLE public.training_types ADD COLUMN archived_at timestamptz;

ALTER TABLE public.personnel_trainings DROP CONSTRAINT personnel_trainings_org_training_type_fkey;
ALTER TABLE public.personnel_trainings
  ADD CONSTRAINT personnel_trainings_org_training_type_fkey
  FOREIGN KEY (organization_id, training_type_id) REFERENCES public.training_types (organization_id, id)
  ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.personnel_training_history DROP CONSTRAINT personnel_training_history_org_training_type_fkey;
ALTER TABLE public.personnel_training_history
  ADD CONSTRAINT personnel_training_history_org_training_type_fkey
  FOREIGN KEY (organization_id, training_type_id) REFERENCES public.training_types (organization_id, id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.personnel_training_history VALIDATE CONSTRAINT personnel_training_history_org_training_type_fkey;

-- The reference check on a type delete and the usage count both look up records by (Organization, type).
CREATE INDEX personnel_trainings_type_idx ON public.personnel_trainings (organization_id, training_type_id);

-- The archive time is the database's. A client may archive or restore a type but cannot choose when, and a type
-- starts active.
CREATE FUNCTION organization_private.stamp_catalog_archived_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.archived_at := NULL;
  ELSIF NEW.archived_at IS NOT NULL THEN
    NEW.archived_at := coalesce(OLD.archived_at, pg_catalog.now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.stamp_catalog_archived_at() FROM PUBLIC;

CREATE TRIGGER stamp_archived_at BEFORE INSERT OR UPDATE ON public.training_types
FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_catalog_archived_at();

-- Archiving and restoring are audited like the critical task library's.
CREATE OR REPLACE FUNCTION audit_private.audit_training_type() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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
    IF v_change = '{}'::jsonb AND NOT (OLD.exempt_personnel_ids IS DISTINCT FROM NEW.exempt_personnel_ids)
      AND NOT ((OLD.archived_at IS NULL) <> (NEW.archived_at IS NULL))
    THEN
      RETURN NULL;
    END IF;
    v_kind := CASE
      WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'training_type.archived'
      WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'training_type.restored'
      ELSE 'training_type.updated' END;
  END IF;
  v_details := '{}'::jsonb;
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  IF TG_OP <> 'UPDATE' OR v_change <> '{}'::jsonb OR v_kind <> 'training_type.updated' THEN
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

CREATE OR REPLACE FUNCTION public.set_training_type_order(p_organization_id uuid, p_training_type_ids uuid[], p_expected_training_type_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_saved uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_training_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_training_type_ids IS NULL OR p_expected_training_type_ids IS NULL
    OR pg_catalog.array_ndims(p_training_type_ids) > 1
    OR pg_catalog.array_ndims(p_expected_training_type_ids) > 1
    OR pg_catalog.array_position(p_training_type_ids, NULL) IS NOT NULL
    OR pg_catalog.array_position(p_expected_training_type_ids, NULL) IS NOT NULL
    OR pg_catalog.cardinality(p_training_type_ids) <> (
      SELECT pg_catalog.count(DISTINCT ids.id) FROM pg_catalog.unnest(p_training_type_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Choose every Training type once' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('training-type-order:' || p_organization_id::text, 0)
  );
  -- The order covers active types only; archived types keep their position.
  -- NO KEY UPDATE on every active type holds the set against delete and edits without
  -- blocking foreign-key checks from rows that reference a type. It also
  -- applies the update policy, so authority is rechecked after the waits.
  PERFORM 1 FROM public.training_types
  WHERE organization_id = p_organization_id AND archived_at IS NULL
  ORDER BY id
  FOR NO KEY UPDATE;
  IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}') INTO v_saved
  FROM public.training_types
  WHERE organization_id = p_organization_id AND archived_at IS NULL;
  -- A replay after a lost reply, or the same change from two people, converges
  -- before the precondition can report a false conflict.
  IF v_saved = p_training_type_ids THEN
    IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  -- TTO01, not 40001: PostgREST silently retries a serialization failure, so a
  -- stale command would loop and could later commit over the newer order. A
  -- type created or deleted since the client read also lands here, so a stale
  -- order never drops a new type.
  IF v_saved IS DISTINCT FROM p_expected_training_type_ids THEN
    RAISE EXCEPTION 'Training type order changed' USING ERRCODE = 'TTO01';
  END IF;
  IF pg_catalog.cardinality(p_training_type_ids) <> pg_catalog.cardinality(v_saved)
    OR NOT (p_training_type_ids @> v_saved)
  THEN
    RAISE EXCEPTION 'Choose every Training type once' USING ERRCODE = '22023';
  END IF;

  UPDATE public.training_types AS t SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_training_type_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE t.organization_id = p_organization_id AND t.archived_at IS NULL AND t.id = o.id AND t.sort_order <> o.ordinal - 1;

  -- Row security silently hides rows from a write whose author lost authority
  -- after the check above.
  IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}')
      FROM public.training_types WHERE organization_id = p_organization_id AND archived_at IS NULL)
     IS DISTINCT FROM p_training_type_ids
  THEN
    RAISE EXCEPTION 'Training type order was not saved' USING ERRCODE = 'TTO01';
  END IF;
END;
$$;

-- How many records use each type, for the Delete offer and the archive confirmation. The count covers every Person the
-- type touches, so it is definer-side behind the same authority that archives and deletes types.
CREATE FUNCTION public.training_type_record_counts(p_organization_id uuid)
RETURNS TABLE (training_type_id uuid, record_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_training_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id,
    (SELECT pg_catalog.count(*) FROM public.personnel_trainings r
      WHERE r.organization_id = t.organization_id AND r.training_type_id = t.id)
    + (SELECT pg_catalog.count(*) FROM public.personnel_training_history h
      WHERE h.organization_id = t.organization_id AND h.training_type_id = t.id)
  FROM public.training_types t
  WHERE t.organization_id = p_organization_id
  ORDER BY t.id;
END;
$$;

REVOKE ALL ON FUNCTION public.training_type_record_counts(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.training_type_record_counts(uuid) TO authenticated;

-- Readiness counts active Training types only.
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

COMMIT;
