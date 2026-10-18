-- Training and Critical Tasks completion reads decide visibility once per
-- statement. The per-row helpers ran several definer functions for every row a
-- read scanned, so one Organization-wide page cost seconds.
BEGIN;

-- Policies ask which People are visible. API callers cannot ask, so the answer
-- reveals no IDs beyond the rows the policies return.
CREATE SCHEMA member_access_private;
REVOKE ALL ON SCHEMA member_access_private FROM PUBLIC, anon, service_role;
GRANT USAGE ON SCHEMA member_access_private TO authenticated;

-- The same rule as training_personnel_scope_matches and
-- critical_tasks_personnel_scope_matches, as a set: an admitted member with view
-- in the lane sees every Person as owner, admin or Organization scope, and the
-- People of its listed Groups otherwise. Archived People stay visible.
CREATE FUNCTION member_access_private.viewable_personnel(p_lane text)
RETURNS TABLE(organization_id uuid, personnel_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.organization_id, p.id
  FROM public.organization_memberships m
  JOIN public.personnel p ON p.organization_id = m.organization_id
  WHERE m.user_id = auth.uid()
    AND public.member_access_has_capability(m.organization_id, p_lane, 'view')
    AND (
      m.role IN ('owner', 'admin')
      OR m.access_scope_kind = 'organization'
      OR (m.access_scope_kind = 'groups' AND p.group_id = ANY(m.access_scope_group_ids))
    );
$$;

REVOKE ALL ON FUNCTION member_access_private.viewable_personnel(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION member_access_private.viewable_personnel(text) TO authenticated;

ALTER POLICY "Users can view personnel trainings if allowed by scoped trainin"
ON public.personnel_trainings
TO authenticated
USING ((organization_id, personnel_id) IN (
  SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('training') v
));

ALTER POLICY "Users can view personnel ICT completions if allowed by scoped c"
ON public.personnel_ict_completions
TO authenticated
USING ((organization_id, personnel_id) IN (
  SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('criticalTasks') v
));

-- The Training SELECT policy was its only caller. The Critical Tasks per-row
-- helper stays for its two read-model RPCs.
DROP FUNCTION public.can_view_personnel_training_record(uuid, uuid);

COMMIT;
