-- #1352: Calendar catalogs are Organization configuration, and an availability
-- status reference must belong to the availability row's Organization.
-- This forward repair changes no existing rows or the original status-ID FK.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_calendar_configuration(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;

ALTER FUNCTION public.can_manage_calendar_configuration(uuid) OWNER TO postgres;

DROP POLICY "Users can manage special days if they can edit calendar data"
ON public.special_days;

CREATE POLICY "Calendar configurators can manage special days"
ON public.special_days FOR ALL
USING (public.can_manage_calendar_configuration(organization_id))
WITH CHECK (public.can_manage_calendar_configuration(organization_id));

-- The original availability_entries_status_type_id_fkey retains its name and
-- ON DELETE CASCADE behavior. The composite FK checks new/changed references
-- without asserting that unknown historical rows are already valid.
ALTER TABLE public.status_types
  ADD CONSTRAINT status_types_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.availability_entries
  ADD CONSTRAINT availability_entries_org_status_type_fkey
  FOREIGN KEY (organization_id, status_type_id)
  REFERENCES public.status_types (organization_id, id)
  ON DELETE CASCADE
  NOT VALID;

COMMIT;
