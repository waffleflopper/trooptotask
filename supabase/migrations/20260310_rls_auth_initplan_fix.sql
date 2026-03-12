-- Fix auth_rls_initplan performance warnings
-- Wrap auth.uid() and auth.jwt() in (select ...) so they are evaluated once per query
-- instead of once per row. This dramatically reduces auth function calls at scale.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- =============================================================================
-- 1. Fix helper functions (these are used by many policies)
-- =============================================================================

-- is_org_member: SQL function, gets inlined — bare auth.uid() re-evaluates per row
CREATE OR REPLACE FUNCTION public.is_org_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = (select auth.uid())
  );
$$;

-- is_org_owner: SQL function, gets inlined
CREATE OR REPLACE FUNCTION public.is_org_owner(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = (select auth.uid()) AND role = 'owner'
  );
$$;

-- is_platform_admin: SQL function, gets inlined
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = (select auth.uid()) AND is_active = true
  );
$$;

-- can_manage_org_members: plpgsql function
CREATE OR REPLACE FUNCTION public.can_manage_org_members(p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = (select auth.uid())
    AND (role IN ('owner', 'admin') OR can_manage_members = true)
  );
END;
$$;

-- =============================================================================
-- 2. Fix direct RLS policies with bare auth.uid() / auth.jwt()
-- =============================================================================

-- assignment_types: Members and creators can insert assignment types
DROP POLICY IF EXISTS "Members and creators can insert assignment types" ON public.assignment_types;
CREATE POLICY "Members and creators can insert assignment types" ON public.assignment_types
  FOR INSERT WITH CHECK (
    is_org_member(organization_id) OR (EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = assignment_types.organization_id
      AND organizations.created_by = (select auth.uid())
    ))
  );

-- beta_feedback: Users can insert own feedback
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.beta_feedback;
CREATE POLICY "Users can insert own feedback" ON public.beta_feedback
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- beta_feedback: Users can view own feedback
DROP POLICY IF EXISTS "Users can view own feedback" ON public.beta_feedback;
CREATE POLICY "Users can view own feedback" ON public.beta_feedback
  FOR SELECT USING ((select auth.uid()) = user_id);

-- data_exports: Org members can read exports
DROP POLICY IF EXISTS "Org members can read exports" ON public.data_exports;
CREATE POLICY "Org members can read exports" ON public.data_exports
  FOR SELECT USING (
    org_id IN (
      SELECT organization_memberships.organization_id
      FROM organization_memberships
      WHERE organization_memberships.user_id = (select auth.uid())
    )
  );

-- data_exports: Org owner can create exports
DROP POLICY IF EXISTS "Org owner can create exports" ON public.data_exports;
CREATE POLICY "Org owner can create exports" ON public.data_exports
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT organizations.id
      FROM organizations
      WHERE organizations.created_by = (select auth.uid())
    )
  );

-- deletion_requests: deletion_requests_delete_own
DROP POLICY IF EXISTS "deletion_requests_delete_own" ON public.deletion_requests;
CREATE POLICY "deletion_requests_delete_own" ON public.deletion_requests
  FOR DELETE USING (requested_by = (select auth.uid()) AND status = 'pending');

-- deletion_requests: deletion_requests_insert_own
DROP POLICY IF EXISTS "deletion_requests_insert_own" ON public.deletion_requests;
CREATE POLICY "deletion_requests_insert_own" ON public.deletion_requests
  FOR INSERT WITH CHECK (requested_by = (select auth.uid()));

-- deletion_requests: deletion_requests_select_admin
DROP POLICY IF EXISTS "deletion_requests_select_admin" ON public.deletion_requests;
CREATE POLICY "deletion_requests_select_admin" ON public.deletion_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = deletion_requests.organization_id
      AND organization_memberships.user_id = (select auth.uid())
      AND organization_memberships.role = ANY (ARRAY['owner'::organization_role, 'admin'::organization_role])
    )
  );

-- deletion_requests: deletion_requests_select_own
DROP POLICY IF EXISTS "deletion_requests_select_own" ON public.deletion_requests;
CREATE POLICY "deletion_requests_select_own" ON public.deletion_requests
  FOR SELECT USING (requested_by = (select auth.uid()));

-- deletion_requests: deletion_requests_update_admin
DROP POLICY IF EXISTS "deletion_requests_update_admin" ON public.deletion_requests;
CREATE POLICY "deletion_requests_update_admin" ON public.deletion_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = deletion_requests.organization_id
      AND organization_memberships.user_id = (select auth.uid())
      AND organization_memberships.role = ANY (ARRAY['owner'::organization_role, 'admin'::organization_role])
    )
  );

-- duty_roster_history: org_editors_can_delete_roster_history
DROP POLICY IF EXISTS "org_editors_can_delete_roster_history" ON public.duty_roster_history;
CREATE POLICY "org_editors_can_delete_roster_history" ON public.duty_roster_history
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = duty_roster_history.organization_id
      AND organization_memberships.user_id = (select auth.uid())
      AND (organization_memberships.role = 'owner'::organization_role OR organization_memberships.can_edit_calendar = true)
    )
  );

-- duty_roster_history: org_editors_can_insert_roster_history
DROP POLICY IF EXISTS "org_editors_can_insert_roster_history" ON public.duty_roster_history;
CREATE POLICY "org_editors_can_insert_roster_history" ON public.duty_roster_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = duty_roster_history.organization_id
      AND organization_memberships.user_id = (select auth.uid())
      AND (organization_memberships.role = 'owner'::organization_role OR organization_memberships.can_edit_calendar = true)
    )
  );

-- duty_roster_history: org_members_can_select_roster_history
DROP POLICY IF EXISTS "org_members_can_select_roster_history" ON public.duty_roster_history;
CREATE POLICY "org_members_can_select_roster_history" ON public.duty_roster_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = duty_roster_history.organization_id
      AND organization_memberships.user_id = (select auth.uid())
    )
  );

-- groups: Members and creators can insert groups
DROP POLICY IF EXISTS "Members and creators can insert groups" ON public.groups;
CREATE POLICY "Members and creators can insert groups" ON public.groups
  FOR INSERT WITH CHECK (
    is_org_member(organization_id) OR (EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = groups.organization_id
      AND organizations.created_by = (select auth.uid())
    ))
  );

-- notifications: notifications_delete_own
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE USING (user_id = (select auth.uid()));

-- notifications: notifications_select_own
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (user_id = (select auth.uid()));

-- notifications: notifications_update_own
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (user_id = (select auth.uid()));

-- organization_memberships: Creators and owners can insert memberships
DROP POLICY IF EXISTS "Creators and owners can insert memberships" ON public.organization_memberships;
CREATE POLICY "Creators and owners can insert memberships" ON public.organization_memberships
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND (
      is_org_owner(organization_id)
      OR (
        user_id = (select auth.uid())
        AND EXISTS (
          SELECT 1 FROM organizations
          WHERE organizations.id = organization_memberships.organization_id
          AND organizations.created_by = (select auth.uid())
        )
      )
    )
  );

-- organization_memberships: Invited users can insert themselves as members
DROP POLICY IF EXISTS "Invited users can insert themselves as members" ON public.organization_memberships;
CREATE POLICY "Invited users can insert themselves as members" ON public.organization_memberships
  FOR INSERT WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM organization_invitations
      WHERE organization_invitations.organization_id = organization_memberships.organization_id
      AND lower(organization_invitations.email) = lower(((select auth.jwt()) ->> 'email'::text))
      AND organization_invitations.status = 'pending'::invitation_status
    )
  );

-- organization_invitations: Users can delete invitations addressed to them
DROP POLICY IF EXISTS "Users can delete invitations addressed to them" ON public.organization_invitations;
CREATE POLICY "Users can delete invitations addressed to them" ON public.organization_invitations
  FOR DELETE USING (lower(email) = lower(((select auth.jwt()) ->> 'email'::text)));

-- organization_invitations: Users can view invitations addressed to them
DROP POLICY IF EXISTS "Users can view invitations addressed to them" ON public.organization_invitations;
CREATE POLICY "Users can view invitations addressed to them" ON public.organization_invitations
  FOR SELECT USING (lower(email) = lower(((select auth.jwt()) ->> 'email'::text)));

-- organizations: Authenticated users can create organizations
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations" ON public.organizations
  FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = created_by);

-- organizations: Users can view organizations they are invited to
DROP POLICY IF EXISTS "Users can view organizations they are invited to" ON public.organizations;
CREATE POLICY "Users can view organizations they are invited to" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_invitations
      WHERE organization_invitations.organization_id = organizations.id
      AND lower(organization_invitations.email) = lower(((select auth.jwt()) ->> 'email'::text))
      AND organization_invitations.status = 'pending'::invitation_status
    )
  );

-- platform_admins: Super admins can manage platform_admins
DROP POLICY IF EXISTS "Super admins can manage platform_admins" ON public.platform_admins;
CREATE POLICY "Super admins can manage platform_admins" ON public.platform_admins
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true AND pa.role = 'super_admin'
    )
  );

-- platform_admins: Users can check own admin status
DROP POLICY IF EXISTS "Users can check own admin status" ON public.platform_admins;
CREATE POLICY "Users can check own admin status" ON public.platform_admins
  FOR SELECT USING ((select auth.uid()) = user_id);

-- registration_invites: Authenticated users can create invites
DROP POLICY IF EXISTS "Authenticated users can create invites" ON public.registration_invites;
CREATE POLICY "Authenticated users can create invites" ON public.registration_invites
  FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);

-- registration_invites: Users can delete their own invites
DROP POLICY IF EXISTS "Users can delete their own invites" ON public.registration_invites;
CREATE POLICY "Users can delete their own invites" ON public.registration_invites
  FOR DELETE USING ((select auth.uid()) = created_by AND used_by IS NULL);

-- special_days: Members and creators can insert special days
DROP POLICY IF EXISTS "Members and creators can insert special days" ON public.special_days;
CREATE POLICY "Members and creators can insert special days" ON public.special_days
  FOR INSERT WITH CHECK (
    is_org_member(organization_id) OR (EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = special_days.organization_id
      AND organizations.created_by = (select auth.uid())
    ))
  );

-- status_types: Members and creators can insert status types
DROP POLICY IF EXISTS "Members and creators can insert status types" ON public.status_types;
CREATE POLICY "Members and creators can insert status types" ON public.status_types
  FOR INSERT WITH CHECK (
    is_org_member(organization_id) OR (EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = status_types.organization_id
      AND organizations.created_by = (select auth.uid())
    ))
  );

-- training_types: Members and creators can insert training types
DROP POLICY IF EXISTS "Members and creators can insert training types" ON public.training_types;
CREATE POLICY "Members and creators can insert training types" ON public.training_types
  FOR INSERT WITH CHECK (
    is_org_member(organization_id) OR (EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = training_types.organization_id
      AND organizations.created_by = (select auth.uid())
    ))
  );

-- user_pinned_groups: Users can delete their own pinned groups
DROP POLICY IF EXISTS "Users can delete their own pinned groups" ON public.user_pinned_groups;
CREATE POLICY "Users can delete their own pinned groups" ON public.user_pinned_groups
  FOR DELETE USING ((select auth.uid()) = user_id AND is_org_member(organization_id));

-- user_pinned_groups: Users can insert their own pinned groups
DROP POLICY IF EXISTS "Users can insert their own pinned groups" ON public.user_pinned_groups;
CREATE POLICY "Users can insert their own pinned groups" ON public.user_pinned_groups
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id AND is_org_member(organization_id));

-- user_pinned_groups: Users can update their own pinned groups
DROP POLICY IF EXISTS "Users can update their own pinned groups" ON public.user_pinned_groups;
CREATE POLICY "Users can update their own pinned groups" ON public.user_pinned_groups
  FOR UPDATE USING ((select auth.uid()) = user_id AND is_org_member(organization_id));

-- user_pinned_groups: Users can view their own pinned groups
DROP POLICY IF EXISTS "Users can view their own pinned groups" ON public.user_pinned_groups;
CREATE POLICY "Users can view their own pinned groups" ON public.user_pinned_groups
  FOR SELECT USING ((select auth.uid()) = user_id AND is_org_member(organization_id));
