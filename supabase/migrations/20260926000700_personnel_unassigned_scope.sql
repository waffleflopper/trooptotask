-- Personnel rows without a Group are Organization-wide resources. The shared
-- legacy scope helper accepts NULL for any member, so keep this repair in the
-- two Personnel row policy functions without changing other feature lanes.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_personnel_record(
  p_organization_id uuid, p_group_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'personnel', 'view')
    AND CASE
      WHEN p_group_id IS NOT NULL THEN
        public.member_access_group_scope_matches(p_organization_id, p_group_id)
      ELSE EXISTS (
        SELECT 1 FROM public.organization_memberships m
        WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
          AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
      )
    END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_personnel_record(
  p_organization_id uuid, p_group_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'personnel', 'operate')
    AND CASE
      WHEN p_group_id IS NOT NULL THEN
        public.member_access_group_scope_matches(p_organization_id, p_group_id)
      ELSE EXISTS (
        SELECT 1 FROM public.organization_memberships m
        WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
          AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
      )
    END;
$$;

COMMIT;
