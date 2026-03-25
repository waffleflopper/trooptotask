-- Allow admins (not just owners) to update organization settings.
-- Previous policy only allowed owners, which caused silent failures for admin role.

-- Create helper function: is_org_privileged (owner OR admin)
CREATE OR REPLACE FUNCTION public.is_org_privileged(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

ALTER FUNCTION public.is_org_privileged(uuid) OWNER TO postgres;

-- Drop the old owner-only UPDATE policy
DROP POLICY IF EXISTS "Organization owners can update their organizations" ON public.organizations;

-- Create new policy allowing owner OR admin
CREATE POLICY "Privileged members can update their organizations"
  ON public.organizations
  FOR UPDATE
  USING (public.is_org_privileged(id));
