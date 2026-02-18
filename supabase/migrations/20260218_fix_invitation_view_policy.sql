-- Fix organization invitations RLS: Allow invited users to view and manage their own invitations
-- The current policy only allows org members to view invitations, but invited users
-- need to see their invitations BEFORE they become members (to accept them)

-- NOTE: Uses auth.jwt() ->> 'email' instead of querying auth.users table directly
-- because RLS policies cannot access auth.users with normal user permissions

-- Add a policy that allows users to view invitations addressed to their email
CREATE POLICY "Users can view invitations addressed to them"
  ON public.organization_invitations FOR SELECT
  USING (
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
  );

-- Add a policy that allows users to delete invitations addressed to them (for declining)
CREATE POLICY "Users can delete invitations addressed to them"
  ON public.organization_invitations FOR DELETE
  USING (
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
  );

-- Allow org admins to delete invitations (for revoking)
CREATE POLICY "Admins can delete invitations"
  ON public.organization_invitations FOR DELETE
  USING (public.can_manage_org_members(organization_id));

-- Allow users to see organizations they have pending invitations for
-- This is needed so they can see the org name when viewing their invitations
CREATE POLICY "Users can view organizations they are invited to"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_invitations
      WHERE organization_id = organizations.id
        AND LOWER(email) = LOWER(auth.jwt() ->> 'email')
        AND status = 'pending'
    )
  );

-- Allow invited users to insert themselves as members when accepting an invitation
CREATE POLICY "Invited users can insert themselves as members"
  ON public.organization_memberships FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_invitations
      WHERE organization_id = organization_memberships.organization_id
        AND LOWER(email) = LOWER(auth.jwt() ->> 'email')
        AND status = 'pending'
    )
  );
