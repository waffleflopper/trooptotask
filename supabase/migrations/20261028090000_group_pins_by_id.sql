-- Group pins point at the Group id instead of its name, so a rename keeps
-- every pin without a sync trigger and a later Group may share a name.
-- Pins order the whole Organization's bands, so only Organization-wide readers
-- read or write them. A Group-scoped reader's saved pins stay stored, unread.

ALTER TABLE public.user_pinned_groups ADD COLUMN group_id uuid;

UPDATE public.user_pinned_groups AS pin
SET group_id = g.id
FROM public.groups AS g
WHERE g.organization_id = pin.organization_id AND g.name = pin.group_name;

-- A pin whose name matches no Group already pointed at nothing.
DELETE FROM public.user_pinned_groups WHERE group_id IS NULL;

DROP TRIGGER sync_group_pins ON public.groups;
DROP FUNCTION personnel_private.sync_group_pins();

DROP INDEX public.idx_user_pinned_groups_user_org;
ALTER TABLE public.user_pinned_groups
  DROP CONSTRAINT user_pinned_groups_user_id_clinic_id_group_name_key,
  DROP COLUMN group_name,
  ALTER COLUMN group_id SET NOT NULL,
  ADD CONSTRAINT user_pinned_groups_user_id_organization_id_group_id_key UNIQUE (user_id, organization_id, group_id),
  ADD CONSTRAINT user_pinned_groups_group_fkey FOREIGN KEY (organization_id, group_id)
    REFERENCES public.groups (organization_id, id) ON DELETE CASCADE;
CREATE INDEX user_pinned_groups_group_idx ON public.user_pinned_groups (organization_id, group_id);

CREATE FUNCTION personnel_private.can_use_group_pins(p_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_org_member(p_organization_id) AND EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
      AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
  );
$$;
REVOKE ALL ON FUNCTION personnel_private.can_use_group_pins(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION personnel_private.can_use_group_pins(uuid) TO authenticated;

DROP POLICY "Users can view their own pinned groups" ON public.user_pinned_groups;
DROP POLICY "Users can insert their own pinned groups" ON public.user_pinned_groups;
DROP POLICY "Users can update their own pinned groups" ON public.user_pinned_groups;
DROP POLICY "Users can delete their own pinned groups" ON public.user_pinned_groups;

CREATE POLICY "Organization-wide readers manage their own pinned groups" ON public.user_pinned_groups
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id AND personnel_private.can_use_group_pins(organization_id))
  WITH CHECK ((SELECT auth.uid()) = user_id AND personnel_private.can_use_group_pins(organization_id));
