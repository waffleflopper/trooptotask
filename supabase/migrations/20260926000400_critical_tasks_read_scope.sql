-- Critical Tasks completion reads stand on their own lane and strict Group scope.
-- Read-model RPCs need a guarded definer because their active Personnel joins
-- otherwise borrow the caller's Personnel SELECT RLS.
BEGIN;

CREATE FUNCTION public.critical_tasks_personnel_scope_matches(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel p
    WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
      AND (
        (p.group_id IS NOT NULL AND public.member_access_group_scope_matches(p_organization_id, p.group_id))
        OR (p.group_id IS NULL AND EXISTS (
          SELECT 1 FROM public.organization_memberships m
          WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
            AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
        ))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.critical_tasks_personnel_scope_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_view_personnel_ict_completion_record(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'criticalTasks', 'view')
     AND public.critical_tasks_personnel_scope_matches(p_organization_id, p_personnel_id);
$$;

CREATE OR REPLACE FUNCTION public.can_edit_personnel_ict_completion_record(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'criticalTasks', 'operate')
     AND public.critical_tasks_personnel_scope_matches(p_organization_id, p_personnel_id);
$$;

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
    AND public.can_view_personnel_ict_completion_record(pic.organization_id, pic.personnel_id)
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
    AND public.can_view_personnel_ict_completion_record(pic.organization_id, pic.personnel_id)
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

COMMIT;
