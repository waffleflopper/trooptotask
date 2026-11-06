-- #1999 A Critical Tasks import writes every row in one command. The audit triggers take the batch from the
-- transaction, so one import is one batch in the log. Each row runs in its own block: a row that fails is undone with
-- its audit entry and reported by its SQLSTATE and constraint, and the rest still save. The commands run as the
-- signed-in member, so row security decides each row and the triggers name that member. Only the columns an import
-- sets are read from a row; the unit, the actor and who logged a completion never come from the caller.
BEGIN;

CREATE FUNCTION public.import_ict_tasks(p_organization_id uuid, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_saved public.ict_tasks;
  v_results jsonb := '[]'::jsonb;
  v_code text;
  v_constraint text;
BEGIN
  IF p_organization_id IS NULL OR pg_catalog.jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION 'Invalid task import' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT item.value FROM pg_catalog.jsonb_array_elements(p_rows) AS item LOOP
    BEGIN
      IF v_item ->> 'op' = 'insert' THEN
        INSERT INTO public.ict_tasks AS task (
          id, organization_id, task_code, title, description, category, mos, expiration_months, sort_order, archived_at
        )
        SELECT (v_item ->> 'id')::uuid, p_organization_id, r.task_code, r.title, r.description, r.category,
          coalesce(r.mos, '{}'), r.expiration_months, coalesce(r.sort_order, 0), r.archived_at
        FROM pg_catalog.jsonb_populate_record(NULL::public.ict_tasks, v_item -> 'values') AS r
        RETURNING task.* INTO v_saved;
      ELSIF v_item ->> 'op' = 'update' THEN
        UPDATE public.ict_tasks AS task
        SET (title, description, category, mos, expiration_months, sort_order, archived_at) = (
          SELECT r.title, r.description, r.category, r.mos, r.expiration_months, r.sort_order, r.archived_at
          FROM pg_catalog.jsonb_populate_record(task, v_item -> 'values') AS r
        )
        WHERE task.organization_id = p_organization_id AND task.id = (v_item ->> 'id')::uuid
        RETURNING task.* INTO v_saved;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid task import row' USING ERRCODE = '22023';
      END IF;
      v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('row', pg_catalog.to_jsonb(v_saved)));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME;
      v_results := v_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('code', v_code, 'constraint', NULLIF(v_constraint, '')));
    END;
  END LOOP;
  RETURN v_results;
END;
$$;
REVOKE ALL ON FUNCTION public.import_ict_tasks(uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.import_ict_tasks(uuid, jsonb) TO authenticated;

CREATE FUNCTION public.import_ict_completions(p_organization_id uuid, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_saved public.personnel_ict_completions;
  v_results jsonb := '[]'::jsonb;
  v_code text;
  v_constraint text;
BEGIN
  IF p_organization_id IS NULL OR pg_catalog.jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION 'Invalid completion import' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT item.value FROM pg_catalog.jsonb_array_elements(p_rows) AS item LOOP
    BEGIN
      IF v_item ->> 'op' = 'insert' THEN
        INSERT INTO public.personnel_ict_completions AS completion (
          id, organization_id, personnel_id, ict_task_id, completed_at, validation_method, validated_by, notes
        )
        SELECT (v_item ->> 'id')::uuid, p_organization_id, r.personnel_id, r.ict_task_id, r.completed_at,
          r.validation_method, r.validated_by, r.notes
        FROM pg_catalog.jsonb_populate_record(NULL::public.personnel_ict_completions, v_item -> 'values') AS r
        RETURNING completion.* INTO v_saved;
      ELSIF v_item ->> 'op' = 'update' THEN
        UPDATE public.personnel_ict_completions AS completion
        SET (validation_method, validated_by, notes) = (
          SELECT r.validation_method, r.validated_by, r.notes
          FROM pg_catalog.jsonb_populate_record(completion, v_item -> 'values') AS r
        )
        WHERE completion.organization_id = p_organization_id AND completion.id = (v_item ->> 'id')::uuid
        RETURNING completion.* INTO v_saved;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Completion not found' USING ERRCODE = 'P0002';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid completion import row' USING ERRCODE = '22023';
      END IF;
      v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('row', pg_catalog.to_jsonb(v_saved)));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME;
      v_results := v_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('code', v_code, 'constraint', NULLIF(v_constraint, '')));
    END;
  END LOOP;
  RETURN v_results;
END;
$$;
REVOKE ALL ON FUNCTION public.import_ict_completions(uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.import_ict_completions(uuid, jsonb) TO authenticated;

COMMIT;
