-- R1/R6: Group assignments use the same tenant and positive Group grants as
-- person assignments. Replace both policy helpers in place; preserve grants,
-- callers, every saved row, and the append-only migration history.
CREATE OR REPLACE FUNCTION public.can_view_daily_assignment_record(
 p_organization_id uuid,
 p_assignment_type_id uuid,
 p_assignee_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
 SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view')
  AND EXISTS (
   SELECT 1
   FROM public.assignment_types AS assignment_type
   WHERE assignment_type.id = p_assignment_type_id
    AND assignment_type.organization_id = p_organization_id
    AND (
     (assignment_type.assign_to = 'personnel' AND EXISTS (
      SELECT 1 FROM public.personnel AS person
      WHERE person.id::text = p_assignee_id
       AND person.organization_id = p_organization_id
       AND public.member_access_group_scope_matches(p_organization_id, person.group_id)
     ))
     OR (assignment_type.assign_to = 'group' AND EXISTS (
      SELECT 1 FROM public.groups AS assigned_group
      WHERE assigned_group.id::text = p_assignee_id
       AND assigned_group.organization_id = p_organization_id
       AND public.member_access_group_scope_matches(p_organization_id, assigned_group.id)
     ))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_daily_assignment_record(
 p_organization_id uuid,
 p_assignment_type_id uuid,
 p_assignee_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
 SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
  AND EXISTS (
   SELECT 1
   FROM public.assignment_types AS assignment_type
   WHERE assignment_type.id = p_assignment_type_id
    AND assignment_type.organization_id = p_organization_id
    AND (
     (assignment_type.assign_to = 'personnel' AND EXISTS (
      SELECT 1 FROM public.personnel AS person
      WHERE person.id::text = p_assignee_id
       AND person.organization_id = p_organization_id
       AND public.member_access_group_scope_matches(p_organization_id, person.group_id)
     ))
     OR (assignment_type.assign_to = 'group' AND EXISTS (
      SELECT 1 FROM public.groups AS assigned_group
      WHERE assigned_group.id::text = p_assignee_id
       AND assigned_group.organization_id = p_organization_id
       AND public.member_access_group_scope_matches(p_organization_id, assigned_group.id)
     ))
    )
  );
$$;

