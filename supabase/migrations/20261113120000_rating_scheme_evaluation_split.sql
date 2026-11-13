-- #2107: a rating_scheme_entries row held two things, a Rated Individual's standing rating chain and one Evaluation.
-- They split into rating_schemes, the chain, at most one listed per Rated Individual, and evaluations, each rating
-- period with its workflow step. An Evaluation shows its own chain snapshot when it has one and its scheme's current
-- chain otherwise. Completing an Evaluation snapshots the chain that signed it; reopening it clears the snapshot.
--
-- evaluations repeats the scheme's rated_person_id. A composite foreign key keeps the copy equal to the scheme's, so
-- row security, Group scope, retention and the audit label read the rated Person without a join, as they did before.
-- Each entry keeps its id as its Evaluation's id, so deletion requests, audit history and links still find it.

CREATE TABLE public.rating_schemes (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  rated_person_id uuid NOT NULL REFERENCES public.personnel (id) ON DELETE CASCADE,
  eval_type text NOT NULL CHECK (eval_type IN ('OER', 'NCOER', 'WOER')),
  rater_person_id uuid,
  rater_name text,
  intermediate_rater_person_id uuid,
  intermediate_rater_name text,
  senior_rater_person_id uuid,
  senior_rater_name text,
  reviewer_person_id uuid,
  reviewer_name text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  archived_at timestamp with time zone,
  archived_by text,
  CONSTRAINT rating_schemes_rated_person_key UNIQUE (id, organization_id, rated_person_id)
);

CREATE TABLE public.evaluations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  rating_scheme_id uuid NOT NULL,
  rated_person_id uuid NOT NULL,
  eval_type text NOT NULL CHECK (eval_type IN ('OER', 'NCOER', 'WOER')),
  report_type text,
  rating_period_start date NOT NULL,
  rating_period_end date NOT NULL,
  workflow_status text CHECK (workflow_status IS NULL OR workflow_status IN ('drafting', 'command-review', 'with-rater',
    'rater-signed', 'with-intermediate-rater', 'ir-signed', 'with-senior-rater', 'sr-signed', 'with-reviewer',
    'reviewer-signed', 'with-rated-soldier', 'sm-signed', 'submitted-to-hrc', 'completed')),
  notes text,
  chain_snapshot_at timestamp with time zone,
  snapshot_rater_person_id uuid,
  snapshot_rater_name text,
  snapshot_intermediate_rater_person_id uuid,
  snapshot_intermediate_rater_name text,
  snapshot_senior_rater_person_id uuid,
  snapshot_senior_rater_name text,
  snapshot_reviewer_person_id uuid,
  snapshot_reviewer_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT evaluations_rating_scheme_fkey FOREIGN KEY (rating_scheme_id, organization_id, rated_person_id)
    REFERENCES public.rating_schemes (id, organization_id, rated_person_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT evaluations_chain_snapshot_check CHECK (chain_snapshot_at IS NOT NULL OR (
    snapshot_rater_person_id IS NULL AND snapshot_rater_name IS NULL
    AND snapshot_intermediate_rater_person_id IS NULL AND snapshot_intermediate_rater_name IS NULL
    AND snapshot_senior_rater_person_id IS NULL AND snapshot_senior_rater_name IS NULL
    AND snapshot_reviewer_person_id IS NULL AND snapshot_reviewer_name IS NULL))
);

-- One scheme per rated Person. Its chain, type and notes come from the newest entry still on the scheme, else the
-- newest entry. It is archived only when every entry was, keeping the newest archive time and who archived it.
WITH people AS (
  SELECT r.organization_id, r.rated_person_id, bool_and(r.archived_at IS NOT NULL) AS all_archived,
    min(r.created_at) AS created_at, max(r.updated_at) AS updated_at
  FROM public.rating_scheme_entries AS r
  GROUP BY r.organization_id, r.rated_person_id
)
INSERT INTO public.rating_schemes (
  organization_id, rated_person_id, eval_type, rater_person_id, rater_name, intermediate_rater_person_id,
  intermediate_rater_name, senior_rater_person_id, senior_rater_name, reviewer_person_id, reviewer_name, notes,
  created_at, updated_at, archived_at, archived_by
)
SELECT p.organization_id, p.rated_person_id, n.eval_type, n.rater_person_id, n.rater_name,
  n.intermediate_rater_person_id, n.intermediate_rater_name, n.senior_rater_person_id, n.senior_rater_name,
  n.reviewer_person_id, n.reviewer_name, n.notes, p.created_at, p.updated_at,
  CASE WHEN p.all_archived THEN a.archived_at END, CASE WHEN p.all_archived THEN a.archived_by END
FROM people AS p
CROSS JOIN LATERAL (
  SELECT r.* FROM public.rating_scheme_entries AS r
  WHERE r.organization_id = p.organization_id AND r.rated_person_id = p.rated_person_id
  ORDER BY (r.archived_at IS NULL) DESC, r.rating_period_end DESC, r.created_at DESC, r.id DESC
  LIMIT 1
) AS n
CROSS JOIN LATERAL (
  SELECT r.archived_at, r.archived_by FROM public.rating_scheme_entries AS r
  WHERE r.organization_id = p.organization_id AND r.rated_person_id = p.rated_person_id
  ORDER BY r.archived_at DESC NULLS LAST, r.id DESC
  LIMIT 1
) AS a;

-- One Evaluation per entry. A completed entry, or one whose chain differs from its scheme's, keeps its own chain.
INSERT INTO public.evaluations (
  id, organization_id, rating_scheme_id, rated_person_id, eval_type, report_type, rating_period_start,
  rating_period_end, workflow_status, notes, chain_snapshot_at, snapshot_rater_person_id, snapshot_rater_name,
  snapshot_intermediate_rater_person_id, snapshot_intermediate_rater_name, snapshot_senior_rater_person_id,
  snapshot_senior_rater_name, snapshot_reviewer_person_id, snapshot_reviewer_name, created_at, updated_at
)
SELECT r.id, r.organization_id, s.id, r.rated_person_id, r.eval_type, r.report_type, r.rating_period_start,
  r.rating_period_end, r.workflow_status, r.notes,
  CASE WHEN k.keeps THEN r.updated_at END,
  CASE WHEN k.keeps THEN r.rater_person_id END, CASE WHEN k.keeps THEN r.rater_name END,
  CASE WHEN k.keeps THEN r.intermediate_rater_person_id END, CASE WHEN k.keeps THEN r.intermediate_rater_name END,
  CASE WHEN k.keeps THEN r.senior_rater_person_id END, CASE WHEN k.keeps THEN r.senior_rater_name END,
  CASE WHEN k.keeps THEN r.reviewer_person_id END, CASE WHEN k.keeps THEN r.reviewer_name END,
  r.created_at, r.updated_at
FROM public.rating_scheme_entries AS r
JOIN public.rating_schemes AS s ON s.organization_id = r.organization_id AND s.rated_person_id = r.rated_person_id
CROSS JOIN LATERAL (
  SELECT r.workflow_status = 'completed'
    OR (r.rater_person_id, r.rater_name, r.intermediate_rater_person_id, r.intermediate_rater_name,
      r.senior_rater_person_id, r.senior_rater_name, r.reviewer_person_id, r.reviewer_name)
      IS DISTINCT FROM (s.rater_person_id, s.rater_name, s.intermediate_rater_person_id, s.intermediate_rater_name,
      s.senior_rater_person_id, s.senior_rater_name, s.reviewer_person_id, s.reviewer_name) AS keeps
) AS k;

DO $$
DECLARE
  v_schemes integer;
  v_evaluations integer;
  v_kept integer;
  v_open_archived integer;
  v_extra_open integer;
BEGIN
  SELECT count(*) INTO v_schemes FROM public.rating_schemes;
  SELECT count(*), count(*) FILTER (WHERE chain_snapshot_at IS NOT NULL) INTO v_evaluations, v_kept
  FROM public.evaluations;
  SELECT count(*) INTO v_open_archived FROM public.evaluations AS e
  JOIN public.rating_schemes AS s ON s.id = e.rating_scheme_id
  JOIN public.rating_scheme_entries AS r ON r.id = e.id
  WHERE e.workflow_status IS NOT NULL AND e.workflow_status <> 'completed' AND r.archived_at IS NOT NULL;
  SELECT coalesce(sum(n - 1), 0) INTO v_extra_open FROM (
    SELECT count(*) AS n FROM public.evaluations
    WHERE workflow_status IS NOT NULL AND workflow_status <> 'completed'
    GROUP BY rating_scheme_id HAVING count(*) > 1
  ) AS duplicates;
  IF v_evaluations <> (SELECT count(*) FROM public.rating_scheme_entries) THEN
    RAISE EXCEPTION 'The split lost rating scheme entries';
  END IF;
  RAISE NOTICE 'Split % rating scheme entries into % rating schemes; % evaluations keep their own chain',
    v_evaluations, v_schemes, v_kept;
  RAISE NOTICE '% open evaluations came from archived entries and return to tracking', v_open_archived;
  RAISE NOTICE '% rating schemes hold more than one open evaluation; % extra open evaluations', v_extra_open,
    v_extra_open;
END;
$$;

UPDATE public.deletion_requests SET resource_type = 'evaluation' WHERE resource_type = 'rating_scheme_entry';

-- Evaluator links keep the integrity rules of 20260930000100: in-Organization links clear when their Person is
-- deleted, and a legacy link to another Organization's Person rejects that Person's deletion. Historical mismatches
-- copied from the entries stay for separate review, so the constraints skip existing rows.
DO $$
DECLARE
  v_target record;
BEGIN
  FOR v_target IN
    SELECT t.table_name, t.prefix || r.role AS role_column
    FROM (VALUES ('rating_schemes', ''), ('evaluations', 'snapshot_')) AS t(table_name, prefix)
    CROSS JOIN (VALUES ('rater'), ('intermediate_rater'), ('senior_rater'), ('reviewer')) AS r(role)
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%1$I ADD CONSTRAINT %2$I FOREIGN KEY (organization_id, %3$I) '
        'REFERENCES public.personnel (organization_id, id) ON DELETE SET NULL (%3$I) NOT VALID, '
        'ADD CONSTRAINT %4$I FOREIGN KEY (%3$I) REFERENCES public.personnel (id) '
        'ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID',
      v_target.table_name, v_target.table_name || '_organization_' || v_target.role_column || '_fkey',
      v_target.role_column || '_person_id', v_target.table_name || '_' || v_target.role_column || '_person_id_fkey');
    EXECUTE pg_catalog.format('CREATE INDEX %I ON public.%I (%I) WHERE %3$I IS NOT NULL',
      v_target.table_name || '_' || v_target.role_column || '_idx', v_target.table_name,
      v_target.role_column || '_person_id');
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX rating_schemes_listed_person_key ON public.rating_schemes (organization_id, rated_person_id)
  WHERE archived_at IS NULL;
CREATE INDEX rating_schemes_rated_idx ON public.rating_schemes (rated_person_id);
CREATE INDEX evaluations_org_idx ON public.evaluations (organization_id);
CREATE INDEX evaluations_rated_idx ON public.evaluations (rated_person_id);
CREATE INDEX evaluations_scheme_idx ON public.evaluations (rating_scheme_id, organization_id, rated_person_id);

-- The old row's lifecycle functions and the table go before the new functions take the names they read.
DROP FUNCTION public.transition_rating_scheme_entry(uuid, uuid, text, text);
DROP FUNCTION public.change_rating_scheme_rater(uuid, uuid, date, uuid, text);
DROP FUNCTION public.set_rating_scheme_entry_archived(uuid, uuid, boolean);
DROP TABLE public.rating_scheme_entries;

ALTER TABLE public.rating_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rating schemes are visible within rating scheme scope" ON public.rating_schemes
  FOR SELECT USING (public.can_view_rating_scheme_record(organization_id, rated_person_id));
CREATE POLICY "Rating schemes are added within rating scheme scope" ON public.rating_schemes
  FOR INSERT WITH CHECK (public.can_edit_rating_scheme_record(organization_id, rated_person_id));
CREATE POLICY "Rating schemes are changed within rating scheme scope" ON public.rating_schemes
  FOR UPDATE USING (public.can_edit_rating_scheme_record(organization_id, rated_person_id))
  WITH CHECK (public.can_edit_rating_scheme_record(organization_id, rated_person_id));
CREATE POLICY "Evaluations are visible within rating scheme scope" ON public.evaluations
  FOR SELECT USING (public.can_view_rating_scheme_record(organization_id, rated_person_id));
CREATE POLICY "Evaluations are changed within rating scheme scope" ON public.evaluations
  FOR UPDATE USING (public.can_edit_rating_scheme_record(organization_id, rated_person_id))
  WITH CHECK (public.can_edit_rating_scheme_record(organization_id, rated_person_id));
CREATE POLICY "Evaluations are deleted by privileged members within rating scheme scope" ON public.evaluations
  FOR DELETE USING (public.can_edit_rating_scheme_record(organization_id, rated_person_id)
    AND public.is_org_privileged(organization_id));

-- A client writes a scheme's chain and an Evaluation's period, report type and notes. Archive state, attribution,
-- workflow steps and the chain snapshot are written only by the functions below and their triggers, and an
-- Evaluation is created only by start_evaluation or change_evaluation_rater.
REVOKE ALL ON public.rating_schemes, public.evaluations FROM anon;
GRANT SELECT ON public.rating_schemes, public.evaluations TO anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.rating_schemes FROM authenticated;
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.evaluations FROM authenticated;
GRANT INSERT (id, organization_id, rated_person_id, eval_type, rater_person_id, rater_name,
  intermediate_rater_person_id, intermediate_rater_name, senior_rater_person_id, senior_rater_name,
  reviewer_person_id, reviewer_name, notes)
  ON public.rating_schemes TO authenticated;
GRANT UPDATE (rated_person_id, eval_type, rater_person_id, rater_name, intermediate_rater_person_id,
  intermediate_rater_name, senior_rater_person_id, senior_rater_name, reviewer_person_id, reviewer_name, notes)
  ON public.rating_schemes TO authenticated;
GRANT UPDATE (eval_type, report_type, rating_period_start, rating_period_end, notes)
  ON public.evaluations TO authenticated;

CREATE TRIGGER update_rating_schemes_updated_at BEFORE UPDATE ON public.rating_schemes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_evaluations_updated_at BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.rating_schemes
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();

-- A scheme holds at most one open Evaluation, one with a step other than completed. Opening one locks its scheme,
-- so two concurrent opens on one scheme take turns and the second sees the first. Rows copied above may break the
-- rule; they keep their steps, and the rule applies once one of them moves.
CREATE FUNCTION organization_private.require_one_open_evaluation() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.workflow_status IS NULL OR NEW.workflow_status = 'completed'
    OR (TG_OP = 'UPDATE' AND OLD.workflow_status IS NOT NULL AND OLD.workflow_status <> 'completed') THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.rating_schemes AS s WHERE s.id = NEW.rating_scheme_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.evaluations AS e
    WHERE e.rating_scheme_id = NEW.rating_scheme_id AND e.id <> NEW.id
      AND e.workflow_status IS NOT NULL AND e.workflow_status <> 'completed'
  ) THEN
    RAISE EXCEPTION 'Another evaluation is already open on this rating scheme' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_one_open_evaluation() FROM PUBLIC;
CREATE TRIGGER require_one_open_evaluation BEFORE INSERT OR UPDATE OF workflow_status ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION organization_private.require_one_open_evaluation();

-- Completing an Evaluation keeps the chain that signed it: its own snapshot when it has one, else its scheme's
-- current chain. Reopening it clears the snapshot, so it follows its scheme again.
CREATE FUNCTION organization_private.keep_evaluation_chain_snapshot() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.workflow_status = 'completed' THEN
    IF NEW.chain_snapshot_at IS NULL THEN
      SELECT pg_catalog.now(), s.rater_person_id, s.rater_name, s.intermediate_rater_person_id,
        s.intermediate_rater_name, s.senior_rater_person_id, s.senior_rater_name, s.reviewer_person_id, s.reviewer_name
      INTO NEW.chain_snapshot_at, NEW.snapshot_rater_person_id, NEW.snapshot_rater_name,
        NEW.snapshot_intermediate_rater_person_id, NEW.snapshot_intermediate_rater_name,
        NEW.snapshot_senior_rater_person_id, NEW.snapshot_senior_rater_name, NEW.snapshot_reviewer_person_id,
        NEW.snapshot_reviewer_name
      FROM public.rating_schemes AS s WHERE s.id = NEW.rating_scheme_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.workflow_status = 'completed' THEN
    NEW.chain_snapshot_at := NULL;
    NEW.snapshot_rater_person_id := NULL;
    NEW.snapshot_rater_name := NULL;
    NEW.snapshot_intermediate_rater_person_id := NULL;
    NEW.snapshot_intermediate_rater_name := NULL;
    NEW.snapshot_senior_rater_person_id := NULL;
    NEW.snapshot_senior_rater_name := NULL;
    NEW.snapshot_reviewer_person_id := NULL;
    NEW.snapshot_reviewer_name := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.keep_evaluation_chain_snapshot() FROM PUBLIC;
CREATE TRIGGER keep_evaluation_chain_snapshot BEFORE INSERT OR UPDATE OF workflow_status ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION organization_private.keep_evaluation_chain_snapshot();

-- Intermediate rater, senior rater and reviewer edits apply live to the open Evaluation. The rater it is rated by
-- changes only through change_evaluation_rater, which completes it as a Change of Rater report first.
CREATE FUNCTION organization_private.require_rater_change_report() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.rater_person_id, NEW.rater_name) IS DISTINCT FROM (OLD.rater_person_id, OLD.rater_name)
    AND pg_catalog.current_setting('trooptotask.rater_change', true) IS DISTINCT FROM 'on'
    AND EXISTS (
      SELECT 1 FROM public.evaluations AS e
      WHERE e.rating_scheme_id = NEW.id AND e.workflow_status IS NOT NULL AND e.workflow_status <> 'completed'
    ) THEN
    RAISE EXCEPTION 'Change the rater of an open evaluation with Change rater' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_rater_change_report() FROM PUBLIC;
CREATE TRIGGER require_rater_change_report BEFORE UPDATE OF rater_person_id, rater_name ON public.rating_schemes
  FOR EACH ROW EXECUTE FUNCTION organization_private.require_rater_change_report();

-- rating_scheme.* keeps describing the chain. Entries recorded before the split carry a rating period; scheme rows
-- do not. Archiving or restoring alone is its own kind of entry.
CREATE OR REPLACE FUNCTION audit_private.audit_rating_scheme() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.rating_schemes;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb := '{}'::jsonb;
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
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"evalType": "eval_type"}');
    IF (NEW.rater_person_id, NEW.rater_name, NEW.intermediate_rater_person_id, NEW.intermediate_rater_name,
      NEW.senior_rater_person_id, NEW.senior_rater_name, NEW.reviewer_person_id, NEW.reviewer_name)
      IS DISTINCT FROM (OLD.rater_person_id, OLD.rater_name, OLD.intermediate_rater_person_id, OLD.intermediate_rater_name,
      OLD.senior_rater_person_id, OLD.senior_rater_name, OLD.reviewer_person_id, OLD.reviewer_name) THEN
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
    IF v_change <> '{}'::jsonb THEN
      v_details := pg_catalog.jsonb_build_object('change', v_change);
    END IF;
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'rating_scheme', v_row.id, v_row.eval_type,
    v_row.rated_person_id, v_who, v_details
  );
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_rating_scheme AFTER INSERT OR DELETE OR UPDATE ON public.rating_schemes
  FOR EACH ROW EXECUTE FUNCTION audit_private.audit_rating_scheme();

CREATE FUNCTION audit_private.audit_evaluation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.evaluations;
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
  -- Rows removed with their scheme, Person or unit: that deletion is the audited event.
  IF NOT audit_private.unit_exists(v_row.organization_id) OR v_who IS NULL
    OR (TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.rating_schemes AS s WHERE s.id = v_row.rating_scheme_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'evaluation.created' WHEN 'UPDATE' THEN 'evaluation.updated' WHEN 'DELETE' THEN 'evaluation.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"evalType": "eval_type", "workflowStatus": "workflow_status", "reportType": "report_type", "periodStart": "rating_period_start", "periodEnd": "rating_period_end"}');
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      v_change := v_change || pg_catalog.jsonb_build_object('notes', true);
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('periodStart', v_row.rating_period_start, 'periodEnd', v_row.rating_period_end);
  IF TG_OP = 'UPDATE' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'evaluation', v_row.id, v_row.eval_type,
    v_row.rated_person_id, v_who, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_evaluation() FROM PUBLIC;
CREATE TRIGGER audit_evaluation AFTER INSERT OR DELETE OR UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION audit_private.audit_evaluation();

-- Moves an Evaluation one step, or jumps to any step its chain has, as 20261112120000 did for entries. Its chain is
-- its snapshot when it has one, else its scheme's. The triggers above keep one open Evaluation per scheme and the
-- snapshot of a completed one. A move works whether or not the scheme is archived.
CREATE FUNCTION public.transition_evaluation(p_organization_id uuid, p_evaluation_id uuid, p_from text DEFAULT NULL,
  p_to text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_steps CONSTANT text[] := ARRAY['drafting', 'command-review', 'with-rater', 'rater-signed', 'with-intermediate-rater',
    'ir-signed', 'with-senior-rater', 'sr-signed', 'with-reviewer', 'reviewer-signed', 'with-rated-soldier', 'sm-signed',
    'submitted-to-hrc', 'completed'];
  v_row public.evaluations;
  v_scheme public.rating_schemes;
  v_has_ir boolean;
  v_has_reviewer boolean;
  v_absent text[] := '{}';
BEGIN
  IF p_to IS NOT NULL AND NOT p_to = ANY (v_steps) THEN
    RAISE EXCEPTION 'Unknown evaluation step' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.evaluations AS e
  WHERE e.organization_id = p_organization_id AND e.id = p_evaluation_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL
    OR public.can_view_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Evaluation not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.can_edit_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Moving this evaluation needs Evals operation access for its scope' USING ERRCODE = '42501';
  END IF;

  IF v_row.workflow_status IS NOT DISTINCT FROM p_to THEN
    RETURN pg_catalog.jsonb_build_object('moved', false, 'evaluation', pg_catalog.to_jsonb(v_row));
  END IF;
  IF v_row.workflow_status IS DISTINCT FROM p_from THEN
    RAISE EXCEPTION 'The evaluation is at %, not %',
      COALESCE(v_row.workflow_status, 'not tracked'), COALESCE(p_from, 'not tracked') USING ERRCODE = '55000';
  END IF;

  IF v_row.chain_snapshot_at IS NOT NULL THEN
    v_has_ir := v_row.snapshot_intermediate_rater_person_id IS NOT NULL
      OR NULLIF(pg_catalog.btrim(v_row.snapshot_intermediate_rater_name), '') IS NOT NULL;
    v_has_reviewer := v_row.snapshot_reviewer_person_id IS NOT NULL
      OR NULLIF(pg_catalog.btrim(v_row.snapshot_reviewer_name), '') IS NOT NULL;
  ELSE
    SELECT * INTO v_scheme FROM public.rating_schemes AS s WHERE s.id = v_row.rating_scheme_id;
    v_has_ir := v_scheme.intermediate_rater_person_id IS NOT NULL
      OR NULLIF(pg_catalog.btrim(v_scheme.intermediate_rater_name), '') IS NOT NULL;
    v_has_reviewer := v_scheme.reviewer_person_id IS NOT NULL
      OR NULLIF(pg_catalog.btrim(v_scheme.reviewer_name), '') IS NOT NULL;
  END IF;
  IF NOT v_has_ir THEN
    v_absent := v_absent || ARRAY['with-intermediate-rater', 'ir-signed'];
  END IF;
  IF NOT v_has_reviewer THEN
    v_absent := v_absent || ARRAY['with-reviewer', 'reviewer-signed'];
  END IF;

  -- A row that differs from Not tracked is at a step, so stopping tracking asks only that the step be drafting or completed.
  IF NOT ((p_to IS NULL AND v_row.workflow_status IN ('drafting', 'completed'))
    OR (p_to IS NOT NULL AND NOT p_to = ANY (v_absent))) THEN
    RAISE EXCEPTION 'An evaluation at % cannot move to %',
      COALESCE(v_row.workflow_status, 'not tracked'), COALESCE(p_to, 'not tracked') USING ERRCODE = '55000';
  END IF;

  UPDATE public.evaluations SET workflow_status = p_to
  WHERE organization_id = p_organization_id AND id = p_evaluation_id
  RETURNING * INTO v_row;
  RETURN pg_catalog.jsonb_build_object('moved', true, 'evaluation', pg_catalog.to_jsonb(v_row));
END;
$$;
REVOKE ALL ON FUNCTION public.transition_evaluation(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_evaluation(uuid, uuid, text, text) TO authenticated;

-- Opens an Evaluation on a listed scheme at drafting with the scheme's eval type, or records a completed one, which
-- snapshots the scheme's current chain. Opening is refused while another Evaluation is open; a replay of the same
-- opening, sent again after its response was lost, returns the Evaluation it opened.
CREATE FUNCTION public.start_evaluation(p_organization_id uuid, p_rating_scheme_id uuid, p_report_type text,
  p_rating_period_start date, p_rating_period_end date, p_completed boolean DEFAULT false, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_scheme public.rating_schemes;
  v_row public.evaluations;
BEGIN
  IF p_rating_period_start IS NULL OR p_rating_period_end IS NULL OR p_rating_period_end < p_rating_period_start THEN
    RAISE EXCEPTION 'Choose a rating period that ends on or after it starts' USING ERRCODE = '22023';
  END IF;
  IF p_completed IS NULL THEN
    RAISE EXCEPTION 'Choose whether the evaluation is completed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_scheme FROM public.rating_schemes AS s
  WHERE s.organization_id = p_organization_id AND s.id = p_rating_scheme_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL
    OR public.can_view_rating_scheme_record(p_organization_id, v_scheme.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Rating scheme not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.can_edit_rating_scheme_record(p_organization_id, v_scheme.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Starting an evaluation needs Evals operation access for its scope' USING ERRCODE = '42501';
  END IF;
  IF v_scheme.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'The rating scheme is archived' USING ERRCODE = '55000';
  END IF;

  IF NOT p_completed THEN
    SELECT * INTO v_row FROM public.evaluations AS e
    WHERE e.rating_scheme_id = p_rating_scheme_id AND e.workflow_status IS NOT NULL AND e.workflow_status <> 'completed'
    ORDER BY e.created_at DESC, e.id
    LIMIT 1;
    IF FOUND THEN
      IF v_row.report_type IS NOT DISTINCT FROM NULLIF(pg_catalog.btrim(p_report_type), '')
        AND v_row.rating_period_start = p_rating_period_start AND v_row.rating_period_end = p_rating_period_end THEN
        RETURN pg_catalog.jsonb_build_object('created', false, 'evaluation', pg_catalog.to_jsonb(v_row));
      END IF;
      RAISE EXCEPTION 'Another evaluation is already open on this rating scheme' USING ERRCODE = '55000';
    END IF;
  END IF;

  INSERT INTO public.evaluations (
    organization_id, rating_scheme_id, rated_person_id, eval_type, report_type, rating_period_start,
    rating_period_end, workflow_status, notes
  ) VALUES (
    p_organization_id, v_scheme.id, v_scheme.rated_person_id, v_scheme.eval_type,
    NULLIF(pg_catalog.btrim(p_report_type), ''), p_rating_period_start, p_rating_period_end,
    CASE WHEN p_completed THEN 'completed' ELSE 'drafting' END, NULLIF(pg_catalog.btrim(p_notes), '')
  ) RETURNING * INTO v_row;
  RETURN pg_catalog.jsonb_build_object('created', true, 'evaluation', pg_catalog.to_jsonb(v_row));
END;
$$;
REVOKE ALL ON FUNCTION public.start_evaluation(uuid, uuid, text, date, date, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_evaluation(uuid, uuid, text, date, date, boolean, text) TO authenticated;

-- A change of rater completes the Evaluation as a Change of Rater report through the change date, which snapshots
-- the chain that signed it, gives the scheme the new rater, and opens an Annual for the new rater the next day. A
-- completed Evaluation has already been closed, so a repeat changes nothing; a replay of the same change returns the
-- successor it opened.
CREATE FUNCTION public.change_evaluation_rater(p_organization_id uuid, p_evaluation_id uuid, p_change_date date,
  p_rater_person_id uuid DEFAULT NULL, p_rater_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.evaluations;
  v_scheme public.rating_schemes;
  v_rater_name text := NULLIF(pg_catalog.btrim(p_rater_name), '');
  v_start date := p_change_date + 1;
  v_successor public.evaluations;
  v_same_rater boolean;
BEGIN
  IF (p_rater_person_id IS NULL) = (v_rater_name IS NULL) THEN
    RAISE EXCEPTION 'Choose one new rater' USING ERRCODE = '22023';
  END IF;
  IF p_change_date IS NULL THEN
    RAISE EXCEPTION 'Choose the last day with the current rater' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.evaluations AS e
  WHERE e.organization_id = p_organization_id AND e.id = p_evaluation_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL
    OR public.can_view_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Evaluation not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.can_edit_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing this rater needs Evals operation access for its scope' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_scheme FROM public.rating_schemes AS s WHERE s.id = v_row.rating_scheme_id FOR UPDATE;
  v_same_rater := p_rater_person_id = v_scheme.rater_person_id
    OR (p_rater_person_id IS NULL AND v_scheme.rater_person_id IS NULL
      AND pg_catalog.lower(v_rater_name) = pg_catalog.lower(pg_catalog.btrim(v_scheme.rater_name)));

  IF v_row.workflow_status = 'completed' THEN
    SELECT * INTO v_successor FROM public.evaluations AS s
    WHERE v_row.report_type = 'CR' AND v_row.rating_period_end = p_change_date AND v_same_rater
      AND s.rating_scheme_id = v_row.rating_scheme_id AND s.rating_period_start = v_start
    ORDER BY s.created_at DESC, s.id
    LIMIT 1;
    RETURN pg_catalog.jsonb_build_object('evaluation', pg_catalog.to_jsonb(v_row),
      'ratingScheme', pg_catalog.to_jsonb(v_scheme) - 'archived_by',
      'successor', CASE WHEN v_successor.id IS NULL THEN NULL ELSE pg_catalog.to_jsonb(v_successor) END);
  END IF;
  IF v_scheme.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'The rating scheme is archived' USING ERRCODE = '55000';
  END IF;
  IF v_same_rater THEN
    RAISE EXCEPTION 'The new rater is already this evaluation''s rater' USING ERRCODE = '22023';
  END IF;
  IF p_change_date < v_row.rating_period_start OR p_change_date > v_row.rating_period_end THEN
    RAISE EXCEPTION 'The last day with the current rater must fall within the rating period' USING ERRCODE = '22023';
  END IF;

  UPDATE public.evaluations SET rating_period_end = p_change_date, report_type = 'CR', workflow_status = 'completed'
  WHERE organization_id = p_organization_id AND id = p_evaluation_id
  RETURNING * INTO v_row;

  PERFORM pg_catalog.set_config('trooptotask.rater_change', 'on', true);
  UPDATE public.rating_schemes SET rater_person_id = p_rater_person_id, rater_name = v_rater_name
  WHERE id = v_scheme.id
  RETURNING * INTO v_scheme;
  PERFORM pg_catalog.set_config('trooptotask.rater_change', '', true);

  INSERT INTO public.evaluations (
    organization_id, rating_scheme_id, rated_person_id, eval_type, report_type, rating_period_start,
    rating_period_end, workflow_status
  ) VALUES (
    p_organization_id, v_scheme.id, v_scheme.rated_person_id, v_scheme.eval_type, 'AN', v_start,
    -- calculateThruDate's annual rule: a month past the end rolls over (29 Feb 2028 runs through 28 Feb 2029).
    (pg_catalog.date_trunc('month', v_start) + interval '12 months')::date + (EXTRACT(DAY FROM v_start)::integer - 2),
    'drafting'
  ) RETURNING * INTO v_successor;
  RETURN pg_catalog.jsonb_build_object('evaluation', pg_catalog.to_jsonb(v_row),
    'ratingScheme', pg_catalog.to_jsonb(v_scheme) - 'archived_by', 'successor', pg_catalog.to_jsonb(v_successor));
END;
$$;
REVOKE ALL ON FUNCTION public.change_evaluation_rater(uuid, uuid, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_evaluation_rater(uuid, uuid, date, uuid, text) TO authenticated;

-- Takes a scheme off the rating scheme or puts it back. Its open Evaluation stays on the tracker until it is
-- completed. Restoring fails while the rated Person has another listed scheme. changed is false when the scheme was
-- already in the requested state.
CREATE FUNCTION public.set_rating_scheme_archived(p_organization_id uuid, p_rating_scheme_id uuid, p_archived boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.rating_schemes;
BEGIN
  IF p_archived IS NULL THEN
    RAISE EXCEPTION 'Choose whether to archive or restore the rating scheme' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.rating_schemes AS s
  WHERE s.organization_id = p_organization_id AND s.id = p_rating_scheme_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL
    OR public.can_view_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Rating scheme not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.can_edit_rating_scheme_record(p_organization_id, v_row.rated_person_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Archiving this rating scheme needs Evals operation access for its scope' USING ERRCODE = '42501';
  END IF;

  IF (v_row.archived_at IS NOT NULL) = p_archived THEN
    RETURN pg_catalog.jsonb_build_object('changed', false, 'ratingScheme', pg_catalog.to_jsonb(v_row) - 'archived_by');
  END IF;

  BEGIN
    UPDATE public.rating_schemes
    SET archived_at = CASE WHEN p_archived THEN pg_catalog.now() END
    WHERE organization_id = p_organization_id AND id = p_rating_scheme_id
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This person already has a rating scheme' USING ERRCODE = '23505';
  END;
  RETURN pg_catalog.jsonb_build_object('changed', true, 'ratingScheme', pg_catalog.to_jsonb(v_row) - 'archived_by');
END;
$$;
REVOKE ALL ON FUNCTION public.set_rating_scheme_archived(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_rating_scheme_archived(uuid, uuid, boolean) TO authenticated;

-- An Evaluation is on the tracker while it is open, and while it is not tracked on a listed scheme.
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
    SELECT DISTINCT ON (e.rated_person_id)
      e.rated_person_id, e.id, e.eval_type, e.report_type, e.rating_period_start, e.rating_period_end,
      e.workflow_status
    FROM public.evaluations e
    JOIN public.rating_schemes s ON s.id = e.rating_scheme_id
    JOIN evaluation_cohort c ON c.id = e.rated_person_id
    WHERE e.organization_id = p_organization_id AND e.workflow_status IS DISTINCT FROM 'completed'
      AND (s.archived_at IS NULL OR e.workflow_status IS NOT NULL)
    ORDER BY e.rated_person_id, e.rating_period_end DESC, e.id DESC
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


-- An Evaluation is the deletable record; its deletion request keeps the entry's id. A scheme leaves by archiving, and
-- goes with its rated Person.
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
		WHEN 'evaluation' THEN 'evaluations'
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
	ELSIF p_resource_type = 'evaluation' THEN
		DELETE FROM public.evaluations
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
      'personnel', 'training_type', 'personnel_training', 'evaluation', 'counseling_record'
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
  PERFORM 1 FROM (SELECT record.id FROM public.evaluations AS record
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
      WHEN 'evaluation' THEN (SELECT record.rated_person_id FROM public.evaluations AS record
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

