-- Rating Scheme references a Person without borrowing the Personnel lane.
-- Its Group scope must treat an unassigned Person as Organization-wide;
-- the shared legacy helper still accepts a NULL Group for other callers.
BEGIN;

CREATE FUNCTION public.rating_scheme_personnel_group_scope_matches(
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
REVOKE ALL ON FUNCTION public.rating_scheme_personnel_group_scope_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_view_rating_scheme_record(
  p_organization_id uuid, p_rated_person_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'ratingScheme', 'view')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_rated_person_id AND p.organization_id = p_organization_id
        AND public.rating_scheme_personnel_group_scope_matches(p_organization_id, p.group_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_rating_scheme_record(
  p_organization_id uuid, p_rated_person_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'ratingScheme', 'operate')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_rated_person_id AND p.organization_id = p_organization_id
        AND public.rating_scheme_personnel_group_scope_matches(p_organization_id, p.group_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.list_rating_scheme_personnel_lookup(p_organization_id uuid)
RETURNS TABLE(id uuid, rank text, last_name text, first_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.rank, p.last_name, p.first_name
  FROM public.personnel p
  WHERE p.organization_id = p_organization_id
    AND p.archived_at IS NULL
    AND public.member_access_has_capability(p_organization_id, 'ratingScheme', 'view')
    AND public.rating_scheme_personnel_group_scope_matches(p_organization_id, p.group_id)
  ORDER BY p.last_name ASC, p.first_name ASC;
$$;

COMMIT;
