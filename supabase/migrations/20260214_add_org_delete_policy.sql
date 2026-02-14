-- Add delete policy for organizations table
-- This was missing, causing organization deletion to silently fail due to RLS

create policy "Organization owners can delete their organizations"
  on public.organizations for delete
  using (public.is_org_owner(id));
