-- Rolls 20261113120000_rating_scheme_evaluation_split.sql back to one rating_scheme_entries table, keeping what was
-- entered after the split. Robert runs it by hand against a database at the split, never as a migration, following
-- docs/operations/eval-tracker-split-rollback.md. It refuses any other database and runs in one transaction, so a
-- failure changes nothing.
--
-- Each Evaluation becomes the entry with its id, its eval type, report, period, step, notes and times. Its chain is its
-- snapshot when it has one, else its scheme's current chain. What one entries table cannot hold is decided here:
--   * Listing. An entry is archived when its scheme is, keeping its own archive time and archiver if it was archived
--     before the split, else its scheme's. On a listed scheme an entry keeps the archive state it had at the split, and
--     an Evaluation started since is listed. If that lists nothing, the scheme's newest Evaluation is listed, so a
--     scheme restored since the split stays on the rating scheme.
--   * A scheme's own chain. When no Evaluation carries the scheme's current chain and eval type, as for a scheme with
--     no Evaluation or one whose chain changed after its last Evaluation completed, it becomes a not-tracked entry
--     with the scheme's id, chain, type, notes and archive state. Its period starts the day after the scheme's last
--     period ends, else on the day the scheme was created, and runs a year by calculateThruDate's annual rule.
--   * Scheme notes. The scheme's newest Evaluation, the one the split took the scheme's chain and notes from, keeps its
--     own notes followed by the scheme's when they differ.
--   * Audit history. Rows recorded since the split, including evaluation.* rows and rating_scheme.* rows that name a
--     scheme's id, stay as written. The rebuild itself records nothing.
--   * Updated times. Each entry keeps its Evaluation's updated_at; a later edit to its scheme alone does not move it.
BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run the rollback as postgres, the owner of the objects it restores';
  END IF;
  IF to_regclass('public.rating_schemes') IS NULL OR to_regclass('public.evaluations') IS NULL
    OR to_regclass('public.rating_scheme_entries') IS NULL
    OR (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20261113120000' THEN
    RAISE EXCEPTION 'This database is not at 20261113120000_rating_scheme_evaluation_split; nothing was changed';
  END IF;
END;
$$;

-- Writes made while the rollback reads the new tables would be lost when they are dropped.
LOCK TABLE public.rating_schemes, public.evaluations, public.rating_scheme_entries, public.deletion_requests
  IN ACCESS EXCLUSIVE MODE;

CREATE TEMPORARY TABLE rollback_evaluations ON COMMIT DROP AS
SELECT e.id, e.organization_id, e.rated_person_id, e.eval_type, e.report_type, e.rating_period_start,
  e.rating_period_end, e.workflow_status, e.notes, e.created_at, e.updated_at, e.rating_scheme_id,
  c.rater_person_id, c.rater_name, c.intermediate_rater_person_id, c.intermediate_rater_name,
  c.senior_rater_person_id, c.senior_rater_name, c.reviewer_person_id, c.reviewer_name,
  f.archived_at AS frozen_archived_at, f.archived_by AS frozen_archived_by,
  f.id IS NULL OR f.archived_at IS NULL AS listed_at_split
FROM public.evaluations AS e
JOIN public.rating_schemes AS s ON s.id = e.rating_scheme_id
LEFT JOIN public.rating_scheme_entries AS f ON f.id = e.id
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN e.chain_snapshot_at IS NULL THEN s.rater_person_id ELSE e.snapshot_rater_person_id END AS rater_person_id,
    CASE WHEN e.chain_snapshot_at IS NULL THEN s.rater_name ELSE e.snapshot_rater_name END AS rater_name,
    CASE WHEN e.chain_snapshot_at IS NULL THEN s.intermediate_rater_person_id
      ELSE e.snapshot_intermediate_rater_person_id END AS intermediate_rater_person_id,
    CASE WHEN e.chain_snapshot_at IS NULL THEN s.intermediate_rater_name
      ELSE e.snapshot_intermediate_rater_name END AS intermediate_rater_name,
    CASE WHEN e.chain_snapshot_at IS NULL THEN s.senior_rater_person_id
      ELSE e.snapshot_senior_rater_person_id END AS senior_rater_person_id,
    CASE WHEN e.chain_snapshot_at IS NULL THEN s.senior_rater_name ELSE e.snapshot_senior_rater_name END AS senior_rater_name,
    CASE WHEN e.chain_snapshot_at IS NULL THEN s.reviewer_person_id ELSE e.snapshot_reviewer_person_id END AS reviewer_person_id,
    CASE WHEN e.chain_snapshot_at IS NULL THEN s.reviewer_name ELSE e.snapshot_reviewer_name END AS reviewer_name
) AS c;

-- A scheme whose current chain and eval type no Evaluation carries becomes its own not-tracked entry.
CREATE TEMPORARY TABLE rollback_scheme_entries ON COMMIT DROP AS
SELECT s.id, s.organization_id, s.rated_person_id, s.eval_type, NULL::text AS report_type, p.period_start,
  ((pg_catalog.date_trunc('month', p.period_start) + interval '12 months')::date
    + (EXTRACT(DAY FROM p.period_start)::integer - 2)) AS period_end,
  NULL::text AS workflow_status, s.notes, s.created_at, s.updated_at, s.id AS rating_scheme_id,
  s.rater_person_id, s.rater_name, s.intermediate_rater_person_id, s.intermediate_rater_name, s.senior_rater_person_id,
  s.senior_rater_name, s.reviewer_person_id, s.reviewer_name, NULL::timestamptz AS frozen_archived_at,
  NULL::text AS frozen_archived_by, true AS listed_at_split
FROM public.rating_schemes AS s
CROSS JOIN LATERAL (
  SELECT COALESCE(max(e.rating_period_end) + 1, (s.created_at AT TIME ZONE 'UTC')::date) AS period_start
  FROM rollback_evaluations AS e WHERE e.rating_scheme_id = s.id
) AS p
WHERE NOT EXISTS (
  SELECT 1 FROM rollback_evaluations AS e
  WHERE e.rating_scheme_id = s.id
    AND (e.eval_type, e.rater_person_id, e.rater_name, e.intermediate_rater_person_id, e.intermediate_rater_name,
      e.senior_rater_person_id, e.senior_rater_name, e.reviewer_person_id, e.reviewer_name)
      IS NOT DISTINCT FROM (s.eval_type, s.rater_person_id, s.rater_name, s.intermediate_rater_person_id,
      s.intermediate_rater_name, s.senior_rater_person_id, s.senior_rater_name, s.reviewer_person_id, s.reviewer_name)
);

CREATE TEMPORARY TABLE rollback_entries ON COMMIT DROP AS
WITH candidates AS (
  SELECT * FROM rollback_evaluations
  UNION ALL
  SELECT * FROM rollback_scheme_entries
),
ranked AS (
  SELECT c.*, pg_catalog.row_number() OVER (PARTITION BY c.rating_scheme_id
      ORDER BY (c.id = c.rating_scheme_id) DESC, c.listed_at_split DESC, c.rating_period_end DESC, c.created_at DESC,
        c.id DESC) = 1 AS newest,
    bool_or(c.listed_at_split) OVER (PARTITION BY c.rating_scheme_id) AS scheme_lists_one
  FROM candidates AS c
)
SELECT r.id, r.organization_id, r.rated_person_id, r.eval_type, r.rater_person_id, r.rater_name,
  r.senior_rater_person_id, r.senior_rater_name, r.intermediate_rater_person_id, r.intermediate_rater_name,
  r.reviewer_person_id, r.reviewer_name, r.rating_period_start, r.rating_period_end,
  CASE
    WHEN NOT r.newest OR r.id = s.id OR s.notes IS NULL OR s.notes IS NOT DISTINCT FROM r.notes THEN r.notes
    WHEN r.notes IS NULL THEN s.notes
    ELSE r.notes || E'\n\n' || s.notes
  END AS notes,
  r.created_at, r.updated_at, r.report_type, r.workflow_status,
  CASE
    WHEN s.archived_at IS NOT NULL THEN COALESCE(r.frozen_archived_at, s.archived_at)
    WHEN r.listed_at_split OR (r.newest AND NOT r.scheme_lists_one) THEN NULL
    ELSE r.frozen_archived_at
  END AS archived_at,
  CASE
    WHEN s.archived_at IS NOT NULL AND r.frozen_archived_at IS NOT NULL THEN r.frozen_archived_by
    WHEN s.archived_at IS NOT NULL THEN s.archived_by
    WHEN r.listed_at_split OR (r.newest AND NOT r.scheme_lists_one) THEN NULL
    ELSE r.frozen_archived_by
  END AS archived_by
FROM ranked AS r
JOIN public.rating_schemes AS s ON s.id = r.rating_scheme_id;

-- Main's evaluator keys skip legacy rows, such as a cross-Organization rater, and the split carried those links over
-- for separate review. Rebuilt rows would be checked again, so the keys come back as main had them after the rebuild.
ALTER TABLE public.rating_scheme_entries
  DROP CONSTRAINT rating_scheme_entries_organization_rater_fkey,
  DROP CONSTRAINT rating_scheme_entries_organization_intermediate_rater_fkey,
  DROP CONSTRAINT rating_scheme_entries_organization_senior_rater_fkey,
  DROP CONSTRAINT rating_scheme_entries_organization_reviewer_fkey,
  DROP CONSTRAINT rating_scheme_entries_rater_person_id_fkey,
  DROP CONSTRAINT rating_scheme_entries_intermediate_rater_person_id_fkey,
  DROP CONSTRAINT rating_scheme_entries_senior_rater_person_id_fkey,
  DROP CONSTRAINT rating_scheme_entries_reviewer_person_id_fkey;
DELETE FROM public.rating_scheme_entries;
INSERT INTO public.rating_scheme_entries (
  id, organization_id, rated_person_id, eval_type, rater_person_id, rater_name, senior_rater_person_id,
  senior_rater_name, intermediate_rater_person_id, intermediate_rater_name, reviewer_person_id, reviewer_name,
  rating_period_start, rating_period_end, notes, created_at, updated_at, report_type, workflow_status, archived_at,
  archived_by
)
SELECT id, organization_id, rated_person_id, eval_type, rater_person_id, rater_name, senior_rater_person_id,
  senior_rater_name, intermediate_rater_person_id, intermediate_rater_name, reviewer_person_id, reviewer_name,
  rating_period_start, rating_period_end, notes, created_at, updated_at, report_type, workflow_status, archived_at,
  archived_by
FROM rollback_entries;
ALTER TABLE public.rating_scheme_entries
  ADD CONSTRAINT rating_scheme_entries_organization_rater_fkey FOREIGN KEY (organization_id, rater_person_id) REFERENCES public.personnel(organization_id, id) ON DELETE SET NULL (rater_person_id) NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_organization_intermediate_rater_fkey FOREIGN KEY (organization_id, intermediate_rater_person_id) REFERENCES public.personnel(organization_id, id) ON DELETE SET NULL (intermediate_rater_person_id) NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_organization_senior_rater_fkey FOREIGN KEY (organization_id, senior_rater_person_id) REFERENCES public.personnel(organization_id, id) ON DELETE SET NULL (senior_rater_person_id) NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_organization_reviewer_fkey FOREIGN KEY (organization_id, reviewer_person_id) REFERENCES public.personnel(organization_id, id) ON DELETE SET NULL (reviewer_person_id) NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_rater_person_id_fkey FOREIGN KEY (rater_person_id) REFERENCES public.personnel(id) DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_intermediate_rater_person_id_fkey FOREIGN KEY (intermediate_rater_person_id) REFERENCES public.personnel(id) DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_senior_rater_person_id_fkey FOREIGN KEY (senior_rater_person_id) REFERENCES public.personnel(id) DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_reviewer_person_id_fkey FOREIGN KEY (reviewer_person_id) REFERENCES public.personnel(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.rating_scheme_entries)
    <> (SELECT count(*) FROM public.evaluations) + (SELECT count(*) FROM rollback_scheme_entries) THEN
    RAISE EXCEPTION 'The rollback lost Evaluations';
  END IF;
  RAISE NOTICE 'Rebuilt % rating scheme entries: % Evaluations and % schemes with a chain no Evaluation carries',
    (SELECT count(*) FROM public.rating_scheme_entries), (SELECT count(*) FROM public.evaluations),
    (SELECT count(*) FROM rollback_scheme_entries);
END;
$$;

UPDATE public.deletion_requests SET resource_type = 'rating_scheme_entry' WHERE resource_type = 'evaluation';

DROP TABLE public.evaluations;
DROP TABLE public.rating_schemes;
DROP FUNCTION public.transition_evaluation(uuid, uuid, text, text);
DROP FUNCTION public.start_evaluation(uuid, uuid, text, date, date, boolean, text);
DROP FUNCTION IF EXISTS public.change_evaluation_rater(uuid, uuid, date, uuid, text);
DROP FUNCTION public.set_rating_scheme_archived(uuid, uuid, boolean);
DROP FUNCTION audit_private.audit_evaluation();
DROP FUNCTION organization_private.require_one_open_evaluation();
DROP FUNCTION organization_private.keep_evaluation_chain_snapshot();
DROP FUNCTION organization_private.keep_completed_report();
DROP FUNCTION organization_private.follow_scheme_eval_type();
DROP FUNCTION organization_private.require_rater_change_report();
DROP FUNCTION organization_private.delete_frozen_rating_scheme_entry();

-- Main's definitions, as supabase/current-schema.sql held them before the split.
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

CREATE OR REPLACE FUNCTION public.approve_record_deletion_request(p_organization_id uuid, p_request_id uuid, p_resource_type text, p_resource_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
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

CREATE OR REPLACE FUNCTION public.delete_expired_personnel(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_ids uuid[];
  v_request_ids uuid[];
  v_request_people uuid[];
BEGIN
  IF p_org_id IS NULL OR p_candidate_ids IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization, candidate IDs and cutoff are required' USING ERRCODE = '22023';
  END IF;

  -- Training and rating approvals delete their record before approving its request, and archive approval
  -- locks its request before the Person. The purge takes records, then requests, then People.
  PERFORM 1 FROM (SELECT record.id FROM public.personnel_trainings AS record
    WHERE record.organization_id = p_org_id AND record.personnel_id = ANY (p_candidate_ids)
    ORDER BY record.id FOR UPDATE) AS locked;
  PERFORM 1 FROM (SELECT record.id FROM public.rating_scheme_entries AS record
    WHERE record.organization_id = p_org_id AND record.rated_person_id = ANY (p_candidate_ids)
    ORDER BY record.id FOR UPDATE) AS locked;

  SELECT coalesce(pg_catalog.array_agg(pending.id), '{}'), coalesce(pg_catalog.array_agg(pending.person_id), '{}')
  INTO v_request_ids, v_request_people FROM (
    SELECT request.id, target.person_id FROM public.deletion_requests AS request
    CROSS JOIN LATERAL (SELECT CASE request.resource_type
      WHEN 'personnel' THEN request.resource_id
      WHEN 'counseling_record' THEN (SELECT record.personnel_id FROM public.counseling_records AS record
        WHERE record.organization_id = p_org_id AND record.id = request.resource_id)
      WHEN 'personnel_training' THEN (SELECT record.personnel_id FROM public.personnel_trainings AS record
        WHERE record.organization_id = p_org_id AND record.id = request.resource_id)
      WHEN 'rating_scheme_entry' THEN (SELECT record.rated_person_id FROM public.rating_scheme_entries AS record
        WHERE record.organization_id = p_org_id AND record.id = request.resource_id)
    END AS person_id) AS target
    WHERE request.organization_id = p_org_id AND request.status = 'pending'
      AND target.person_id = ANY (p_candidate_ids)
    ORDER BY request.id
    FOR UPDATE OF request
  ) AS pending;

  SELECT coalesce(pg_catalog.array_agg(expired.id), '{}') INTO v_ids FROM (
    SELECT person.id FROM public.personnel AS person
    WHERE person.organization_id = p_org_id
      AND person.id = ANY (p_candidate_ids)
      AND person.archived_at IS NOT NULL
      AND person.archived_at < p_cutoff
      AND NOT EXISTS (
        SELECT 1 FROM public.calendar_tasking_participants AS p
        WHERE p.organization_id = person.organization_id AND p.personnel_id = person.id
      )
    ORDER BY person.id
    FOR UPDATE
  ) AS expired;

  UPDATE public.deletion_requests AS request SET status = 'cancelled'
  FROM ROWS FROM (pg_catalog.unnest(v_request_ids), pg_catalog.unnest(v_request_people)) AS pending(id, person_id)
  WHERE request.organization_id = p_org_id AND request.id = pending.id AND request.status = 'pending'
    AND pending.person_id = ANY (v_ids);

  DELETE FROM public.personnel AS person
  WHERE person.organization_id = p_org_id AND person.id = ANY (v_ids);
  RETURN pg_catalog.cardinality(v_ids);
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

CREATE OR REPLACE FUNCTION public.submit_deletion_request(p_organization_id uuid, p_requested_by uuid, p_requester_email text, p_resource_type text, p_resource_id uuid, p_description text, p_resource_url text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_request public.deletion_requests;
BEGIN
  -- The pending check after the wait must see the earlier submission's commit.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Deletion request submission requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF p_organization_id IS NULL OR p_requested_by IS NULL OR p_resource_id IS NULL
    OR p_requester_email IS NULL OR p_description IS NULL
    OR p_resource_type IS NULL OR p_resource_type NOT IN (
      'personnel', 'training_type', 'personnel_training', 'rating_scheme_entry', 'counseling_record'
    )
  THEN
    RAISE EXCEPTION 'Invalid deletion request submission' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'deletion-request-pending:' || p_organization_id::text || ':' || p_resource_type || ':' || p_resource_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.deletion_requests AS request
    WHERE request.organization_id = p_organization_id AND request.resource_type = p_resource_type
      AND request.resource_id = p_resource_id AND request.status = 'pending'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'duplicate');
  END IF;

  INSERT INTO public.deletion_requests (
    organization_id, requested_by, requested_by_email, resource_type, resource_id,
    resource_description, resource_url, status
  ) VALUES (
    p_organization_id, p_requested_by, p_requester_email, p_resource_type, p_resource_id,
    p_description, p_resource_url, 'pending'
  ) RETURNING * INTO v_request;
  RETURN pg_catalog.jsonb_build_object('outcome', 'created', 'request', pg_catalog.to_jsonb(v_request));
END;
$$;

CREATE OR REPLACE FUNCTION public.change_rating_scheme_rater(p_organization_id uuid, p_entry_id uuid, p_change_date date, p_rater_person_id uuid DEFAULT NULL::uuid, p_rater_name text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  IF v_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'The evaluation is archived' USING ERRCODE = '55000';
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
    archived_at = pg_catalog.now()
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

CREATE OR REPLACE FUNCTION public.set_rating_scheme_entry_archived(p_organization_id uuid, p_entry_id uuid, p_archived boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE OR REPLACE FUNCTION public.transition_rating_scheme_entry(p_organization_id uuid, p_entry_id uuid, p_from text DEFAULT NULL::text, p_to text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_steps CONSTANT text[] := ARRAY['drafting', 'command-review', 'with-rater', 'rater-signed', 'with-intermediate-rater',
    'ir-signed', 'with-senior-rater', 'sr-signed', 'with-reviewer', 'reviewer-signed', 'with-rated-soldier', 'sm-signed',
    'submitted-to-hrc', 'completed'];
  v_row public.rating_scheme_entries;
  v_absent text[] := '{}';
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
    RETURN pg_catalog.jsonb_build_object('moved', false, 'entry', pg_catalog.to_jsonb(v_row));
  END IF;
  IF v_row.workflow_status IS DISTINCT FROM p_from THEN
    RAISE EXCEPTION 'The evaluation is at %, not %',
      COALESCE(v_row.workflow_status, 'not tracked'), COALESCE(p_from, 'not tracked') USING ERRCODE = '55000';
  END IF;

  IF v_row.intermediate_rater_person_id IS NULL AND NULLIF(pg_catalog.btrim(v_row.intermediate_rater_name), '') IS NULL THEN
    v_absent := v_absent || ARRAY['with-intermediate-rater', 'ir-signed'];
  END IF;
  IF v_row.reviewer_person_id IS NULL AND NULLIF(pg_catalog.btrim(v_row.reviewer_name), '') IS NULL THEN
    v_absent := v_absent || ARRAY['with-reviewer', 'reviewer-signed'];
  END IF;

  -- A row that differs from Not tracked is at a step, so stopping tracking asks only that the step be drafting or completed.
  IF NOT ((p_to IS NULL AND v_row.workflow_status IN ('drafting', 'completed'))
    OR (p_to IS NOT NULL AND NOT p_to = ANY (v_absent))) THEN
    RAISE EXCEPTION 'An evaluation at % cannot move to %',
      COALESCE(v_row.workflow_status, 'not tracked'), COALESCE(p_to, 'not tracked') USING ERRCODE = '55000';
  END IF;

  UPDATE public.rating_scheme_entries SET workflow_status = p_to
  WHERE organization_id = p_organization_id AND id = p_entry_id
  RETURNING * INTO v_row;
  RETURN pg_catalog.jsonb_build_object('moved', true, 'entry', pg_catalog.to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.change_rating_scheme_rater(p_organization_id uuid, p_entry_id uuid, p_change_date date, p_rater_person_id uuid, p_rater_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.change_rating_scheme_rater(p_organization_id uuid, p_entry_id uuid, p_change_date date, p_rater_person_id uuid, p_rater_name text) TO authenticated;
GRANT ALL ON FUNCTION public.change_rating_scheme_rater(p_organization_id uuid, p_entry_id uuid, p_change_date date, p_rater_person_id uuid, p_rater_name text) TO service_role;

REVOKE ALL ON FUNCTION public.set_rating_scheme_entry_archived(p_organization_id uuid, p_entry_id uuid, p_archived boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_rating_scheme_entry_archived(p_organization_id uuid, p_entry_id uuid, p_archived boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_rating_scheme_entry_archived(p_organization_id uuid, p_entry_id uuid, p_archived boolean) TO service_role;

REVOKE ALL ON FUNCTION public.transition_rating_scheme_entry(p_organization_id uuid, p_entry_id uuid, p_from text, p_to text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.transition_rating_scheme_entry(p_organization_id uuid, p_entry_id uuid, p_from text, p_to text) TO authenticated;
GRANT ALL ON FUNCTION public.transition_rating_scheme_entry(p_organization_id uuid, p_entry_id uuid, p_from text, p_to text) TO service_role;

CREATE TRIGGER audit_rating_scheme AFTER INSERT OR DELETE OR UPDATE ON public.rating_scheme_entries FOR EACH ROW EXECUTE FUNCTION audit_private.audit_rating_scheme();

GRANT SELECT,MAINTAIN ON TABLE public.rating_scheme_entries TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.rating_scheme_entries TO authenticated;
GRANT ALL ON TABLE public.rating_scheme_entries TO service_role;

GRANT INSERT(id) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(organization_id) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(rated_person_id),UPDATE(rated_person_id) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(eval_type),UPDATE(eval_type) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(rater_person_id),UPDATE(rater_person_id) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(rater_name),UPDATE(rater_name) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(senior_rater_person_id),UPDATE(senior_rater_person_id) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(senior_rater_name),UPDATE(senior_rater_name) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(intermediate_rater_person_id),UPDATE(intermediate_rater_person_id) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(intermediate_rater_name),UPDATE(intermediate_rater_name) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(reviewer_person_id),UPDATE(reviewer_person_id) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(reviewer_name),UPDATE(reviewer_name) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(rating_period_start),UPDATE(rating_period_start) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(rating_period_end),UPDATE(rating_period_end) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(notes),UPDATE(notes) ON TABLE public.rating_scheme_entries TO authenticated;

GRANT INSERT(report_type),UPDATE(report_type) ON TABLE public.rating_scheme_entries TO authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261113120000';

COMMIT;
