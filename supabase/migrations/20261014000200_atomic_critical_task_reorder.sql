-- A library move changes every affected task's sort order in one transaction.
-- Each change carries the sort order the caller saw, so a stale or repeated
-- move is refused instead of applied to an order the caller never displayed.
BEGIN;

CREATE FUNCTION public.reorder_ict_tasks(p_organization_id uuid, p_changes jsonb)
RETURNS SETOF public.ict_tasks
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_found integer;
  v_current integer;
  v_changed integer;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_ict_task_library(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Critical Tasks library configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
    OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 1000
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_changes) AS item(value)
      WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
        OR jsonb_typeof(item.value->'id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(item.value->'expected_sort_order') IS DISTINCT FROM 'number'
        OR jsonb_typeof(item.value->'sort_order') IS DISTINCT FROM 'number'
    )
  THEN
    RAISE EXCEPTION 'Invalid task order' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), count(DISTINCT c.id) FILTER (
      WHERE c.expected_sort_order >= 0 AND c.sort_order >= 0 AND c.sort_order <> c.expected_sort_order
    )
  INTO v_count, v_found
  FROM jsonb_to_recordset(p_changes) AS c(id uuid, expected_sort_order integer, sort_order integer);
  IF v_found <> v_count THEN
    RAISE EXCEPTION 'Invalid task order' USING ERRCODE = '22023';
  END IF;

  -- NO KEY UPDATE also applies the update policy, so authority is rechecked
  -- below before a hidden row is reported as missing.
  PERFORM 1 FROM public.ict_tasks AS t
  WHERE t.organization_id = p_organization_id
    AND t.id IN (SELECT c.id FROM jsonb_to_recordset(p_changes) AS c(id uuid))
  ORDER BY t.id
  FOR NO KEY UPDATE;
  IF public.can_manage_ict_task_library(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Critical Tasks library configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE t.sort_order = c.expected_sort_order)
  INTO v_found, v_current
  FROM public.ict_tasks AS t
  JOIN jsonb_to_recordset(p_changes) AS c(id uuid, expected_sort_order integer) ON c.id = t.id
  WHERE t.organization_id = p_organization_id AND t.archived_at IS NULL;
  IF v_found <> v_count THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_current <> v_count THEN
    -- A business conflict must not trigger PostgREST's serialization retries.
    RAISE EXCEPTION 'Task order changed' USING ERRCODE = 'PT409';
  END IF;

  RETURN QUERY
    WITH changed AS (
      UPDATE public.ict_tasks AS t SET sort_order = c.sort_order
      FROM jsonb_to_recordset(p_changes) AS c(id uuid, expected_sort_order integer, sort_order integer)
      WHERE t.organization_id = p_organization_id AND t.id = c.id
        AND t.archived_at IS NULL AND t.sort_order = c.expected_sort_order
      RETURNING t.*
    )
    SELECT * FROM changed ORDER BY changed.id;
  -- The rows are locked, so only row security can hide one from the update.
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> v_count THEN
    RAISE EXCEPTION 'Critical Tasks library configuration is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_ict_tasks(uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_ict_tasks(uuid, jsonb) TO authenticated;

COMMIT;
