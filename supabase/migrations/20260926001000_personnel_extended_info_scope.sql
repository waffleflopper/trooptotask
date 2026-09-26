-- Soldier Data Sheet fields require the Personnel operate lane and the referenced
-- Person's strict Organization/Group scope for every table operation.
BEGIN;

CREATE FUNCTION public.personnel_extended_info_scope_matches(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel p
    WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
      AND public.can_edit_personnel_record(p_organization_id, p.group_id)
  );
$$;
REVOKE ALL ON FUNCTION public.personnel_extended_info_scope_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.personnel_extended_info_scope_matches(uuid, uuid) TO authenticated, service_role;

DROP POLICY "Users can view extended info if can view personnel" ON public.personnel_extended_info;
DROP POLICY "Users can insert extended info if can edit personnel" ON public.personnel_extended_info;
DROP POLICY "Users can update extended info if can edit personnel" ON public.personnel_extended_info;
DROP POLICY "Users can delete extended info if can edit personnel" ON public.personnel_extended_info;

CREATE POLICY "Operators can read scoped personnel extended info"
ON public.personnel_extended_info FOR SELECT TO authenticated
USING (public.personnel_extended_info_scope_matches(organization_id, personnel_id));

CREATE POLICY "Operators can insert scoped personnel extended info"
ON public.personnel_extended_info FOR INSERT TO authenticated
WITH CHECK (public.personnel_extended_info_scope_matches(organization_id, personnel_id));

CREATE POLICY "Operators can update scoped personnel extended info"
ON public.personnel_extended_info FOR UPDATE TO authenticated
USING (public.personnel_extended_info_scope_matches(organization_id, personnel_id))
WITH CHECK (public.personnel_extended_info_scope_matches(organization_id, personnel_id));

CREATE POLICY "Operators can delete scoped personnel extended info"
ON public.personnel_extended_info FOR DELETE TO authenticated
USING (public.personnel_extended_info_scope_matches(organization_id, personnel_id));

-- The roster and Dashboard show only an acknowledgement badge. Keep that
-- view-level read without exposing any Soldier Data Sheet fields.
CREATE FUNCTION public.list_personnel_award_tracking_acknowledged(p_organization_id uuid)
RETURNS TABLE(personnel_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT info.personnel_id
  FROM public.personnel_extended_info info
  JOIN public.personnel p
    ON p.id = info.personnel_id AND p.organization_id = info.organization_id
  WHERE info.organization_id = p_organization_id
    AND info.award_tracking_acknowledged_at IS NOT NULL
    AND public.can_view_personnel_record(p_organization_id, p.group_id)
  ORDER BY info.personnel_id;
$$;
REVOKE ALL ON FUNCTION public.list_personnel_award_tracking_acknowledged(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_personnel_award_tracking_acknowledged(uuid) TO authenticated, service_role;

COMMIT;
