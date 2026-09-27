-- Training records use their own lane and strict Personnel Group scope.
-- Their SQL policy must stand alone because the request DataStore no longer
-- queries Personnel through the user's Personnel-lane RLS first.
BEGIN;

CREATE FUNCTION public.training_personnel_scope_matches(
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

REVOKE ALL ON FUNCTION public.training_personnel_scope_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.training_record_type_matches(
  p_organization_id uuid, p_training_type_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.training_types t
    WHERE t.id = p_training_type_id AND t.organization_id = p_organization_id
  );
$$;

REVOKE ALL ON FUNCTION public.training_record_type_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_view_personnel_training_record(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'training', 'view')
     AND public.training_personnel_scope_matches(p_organization_id, p_personnel_id);
$$;

CREATE OR REPLACE FUNCTION public.can_edit_personnel_training_record(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'training', 'operate')
     AND public.training_personnel_scope_matches(p_organization_id, p_personnel_id);
$$;

CREATE FUNCTION public.can_edit_personnel_training_record_with_type(
  p_organization_id uuid, p_personnel_id uuid, p_training_type_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.can_edit_personnel_training_record(p_organization_id, p_personnel_id)
     AND public.training_record_type_matches(p_organization_id, p_training_type_id);
$$;

REVOKE ALL ON FUNCTION public.can_edit_personnel_training_record_with_type(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_personnel_training_record_with_type(uuid, uuid, uuid) TO authenticated;

ALTER POLICY "Users can insert personnel trainings if allowed by scoped train"
ON public.personnel_trainings
WITH CHECK (
  public.can_edit_personnel_training_record_with_type(organization_id, personnel_id, training_type_id)
);

ALTER POLICY "Users can update personnel trainings if allowed by scoped train"
ON public.personnel_trainings
USING (public.can_edit_personnel_training_record(organization_id, personnel_id))
WITH CHECK (
  public.can_edit_personnel_training_record_with_type(organization_id, personnel_id, training_type_id)
);

COMMIT;
