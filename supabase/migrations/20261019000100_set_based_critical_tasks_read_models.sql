-- The Critical Tasks read-model RPCs decide visibility once per statement, as
-- their table policy does since 20261018000100. Each call ran the per-row helper
-- for every completion it scanned, and the latest-completion stream pages the
-- whole RPC, so one large Organization-wide view paid that cost ten times.
BEGIN;

-- viewable_personnel('criticalTasks') is the per-row helper's rule as a set:
-- view in the lane, then every Person for owner, admin or Organization scope and
-- the People of the listed Groups otherwise.
CREATE OR REPLACE FUNCTION public.latest_active_personnel_ict_completions(
  p_organization_id uuid,
  p_personnel_ids uuid[] DEFAULT NULL,
  p_ict_task_ids uuid[] DEFAULT NULL
) RETURNS SETOF public.personnel_ict_completions
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (pic.personnel_id, pic.ict_task_id) pic.*
  FROM public.personnel_ict_completions pic
  JOIN public.personnel p
    ON p.id = pic.personnel_id AND p.organization_id = pic.organization_id AND p.archived_at IS NULL
  JOIN public.ict_tasks t
    ON t.id = pic.ict_task_id AND t.organization_id = pic.organization_id AND t.archived_at IS NULL
  WHERE pic.organization_id = p_organization_id
    AND (pic.organization_id, pic.personnel_id) IN (
      SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('criticalTasks') v
    )
    AND (p_personnel_ids IS NULL OR pic.personnel_id = ANY(p_personnel_ids))
    AND (p_ict_task_ids IS NULL OR pic.ict_task_id = ANY(p_ict_task_ids))
  ORDER BY pic.personnel_id, pic.ict_task_id, pic.completed_at DESC, pic.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.latest_active_personnel_ict_completions(uuid, uuid[], uuid[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.active_personnel_ict_completion_trend(
  p_organization_id uuid,
  p_personnel_ids uuid[] DEFAULT NULL,
  p_ict_task_ids uuid[] DEFAULT NULL
) RETURNS TABLE(month text, completions integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_char(pic.completed_at, 'YYYY-MM') AS month, COUNT(*)::integer AS completions
  FROM public.personnel_ict_completions pic
  JOIN public.personnel p
    ON p.id = pic.personnel_id AND p.organization_id = pic.organization_id AND p.archived_at IS NULL
  JOIN public.ict_tasks t
    ON t.id = pic.ict_task_id AND t.organization_id = pic.organization_id AND t.archived_at IS NULL
  WHERE pic.organization_id = p_organization_id
    AND (pic.organization_id, pic.personnel_id) IN (
      SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('criticalTasks') v
    )
    AND (p_personnel_ids IS NULL OR pic.personnel_id = ANY(p_personnel_ids))
    AND (p_ict_task_ids IS NULL OR pic.ict_task_id = ANY(p_ict_task_ids))
    AND (
      COALESCE(array_length(t.mos, 1), 0) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(t.mos) AS task_mos(value)
        WHERE upper(btrim(task_mos.value)) = upper(btrim(COALESCE(p.mos, '')))
      )
    )
  GROUP BY 1 ORDER BY 1;
$$;

REVOKE EXECUTE ON FUNCTION public.active_personnel_ict_completion_trend(uuid, uuid[], uuid[]) FROM PUBLIC;

-- The two RPCs were its last callers.
DROP FUNCTION public.can_view_personnel_ict_completion_record(uuid, uuid);

COMMIT;
