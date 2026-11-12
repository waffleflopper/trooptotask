-- An Evaluation can jump to any step, not only the next or previous one: when everyone has signed and command wants a
-- change, it goes back several steps at once. Command Review is a new step after Drafting, and the step after the rated
-- Soldier signs is renamed from submitted-to-s1 to submitted-to-hrc, because the senior rater submits it to HRC.
-- The rename is a repair, not an edit by a person: with the stamp trigger off it leaves updated_at alone. The audit trigger
-- stays on, so the change is still recorded.
ALTER TABLE public.rating_scheme_entries DROP CONSTRAINT rating_scheme_entries_workflow_status_check;
ALTER TABLE public.rating_scheme_entries DISABLE TRIGGER update_rating_scheme_entries_updated_at;
UPDATE public.rating_scheme_entries SET workflow_status = 'submitted-to-hrc' WHERE workflow_status = 'submitted-to-s1';
ALTER TABLE public.rating_scheme_entries ENABLE TRIGGER update_rating_scheme_entries_updated_at;
ALTER TABLE public.rating_scheme_entries ADD CONSTRAINT rating_scheme_entries_workflow_status_check CHECK (
  workflow_status IS NULL OR workflow_status = ANY (ARRAY['drafting', 'command-review', 'with-rater', 'rater-signed',
    'with-intermediate-rater', 'ir-signed', 'with-senior-rater', 'sr-signed', 'with-reviewer', 'reviewer-signed',
    'with-rated-soldier', 'sm-signed', 'submitted-to-hrc', 'completed']));

-- Any step to any present step. A step is absent when its evaluator is: the intermediate-rater steps without an
-- intermediate rater, the reviewer steps without a reviewer. Not tracked is reached only from drafting or completed.
-- Not tracked can start at any present step. The same rule is asserted in evaluationWorkflow.test.ts. The caller names
-- the step it saw, so a move made from a stale view is refused instead of overwriting newer progress. The result
-- carries the row as it stands, so the caller needs no second read: moved is false when the entry was already at the
-- requested step.
CREATE OR REPLACE FUNCTION public.transition_rating_scheme_entry(p_organization_id uuid, p_entry_id uuid, p_from text DEFAULT NULL,
  p_to text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
