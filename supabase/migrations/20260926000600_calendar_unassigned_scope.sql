-- Calendar's saved Person rows must use strict Group scope even when the
-- shared legacy scope helper accepts a NULL Group. Keep that helper, Personnel
-- RLS, persisted rows and the existing Calendar policy/grant signatures intact.
BEGIN;

CREATE FUNCTION public.calendar_personnel_group_scope_matches(
  p_organization_id uuid, p_group_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_group_id IS NOT NULL THEN
      public.member_access_group_scope_matches(p_organization_id, p_group_id)
    ELSE EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.calendar_personnel_group_scope_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_view_availability_record(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
        AND public.calendar_personnel_group_scope_matches(p_organization_id, p.group_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_availability_record(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
        AND public.calendar_personnel_group_scope_matches(p_organization_id, p.group_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_daily_assignment_record(
  p_organization_id uuid, p_assignment_type_id uuid, p_assignee_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view')
    AND EXISTS (
      SELECT 1 FROM public.assignment_types t
      WHERE t.id = p_assignment_type_id AND t.organization_id = p_organization_id
        AND (
          (t.assign_to = 'personnel' AND EXISTS (
            SELECT 1 FROM public.personnel p
            WHERE p.id::text = p_assignee_id AND p.organization_id = p_organization_id
              AND public.calendar_personnel_group_scope_matches(p_organization_id, p.group_id)
          ))
          OR (t.assign_to = 'group' AND EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id::text = p_assignee_id AND g.organization_id = p_organization_id
              AND public.member_access_group_scope_matches(p_organization_id, g.id)
          ))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_daily_assignment_record(
  p_organization_id uuid, p_assignment_type_id uuid, p_assignee_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND EXISTS (
      SELECT 1 FROM public.assignment_types t
      WHERE t.id = p_assignment_type_id AND t.organization_id = p_organization_id
        AND (
          (t.assign_to = 'personnel' AND EXISTS (
            SELECT 1 FROM public.personnel p
            WHERE p.id::text = p_assignee_id AND p.organization_id = p_organization_id
              AND public.calendar_personnel_group_scope_matches(p_organization_id, p.group_id)
          ))
          OR (t.assign_to = 'group' AND EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id::text = p_assignee_id AND g.organization_id = p_organization_id
              AND public.member_access_group_scope_matches(p_organization_id, g.id)
          ))
        )
    );
$$;

-- These old two-argument helpers have no policy or application callers. Their
-- authenticated RPC grants would otherwise keep exposing the old NULL scope.
DROP FUNCTION public.can_view_daily_assignment_record(uuid, text) RESTRICT;
DROP FUNCTION public.can_edit_daily_assignment_record(uuid, text) RESTRICT;

COMMIT;
