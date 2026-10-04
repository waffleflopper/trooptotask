BEGIN;

CREATE FUNCTION public.delete_expired_unreferenced_critical_tasks(
  p_org_id uuid,
  p_cutoff timestamptz
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_task_id uuid;
  v_deleted integer := 0;
  v_count integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Critical task retention requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF p_org_id IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization and cutoff are required' USING ERRCODE = '22023';
  END IF;

  FOR v_task_id IN
    SELECT task.id
    FROM public.ict_tasks AS task
    WHERE task.organization_id = p_org_id AND task.archived_at < p_cutoff
    ORDER BY task.id
    FOR UPDATE OF task
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.personnel_ict_completions
      WHERE ict_task_id = v_task_id
    ) THEN
      CONTINUE;
    END IF;

    DELETE FROM public.ict_tasks
    WHERE id = v_task_id AND organization_id = p_org_id AND archived_at < p_cutoff;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + v_count;
  END LOOP;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expired_unreferenced_critical_tasks(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_unreferenced_critical_tasks(uuid, timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
