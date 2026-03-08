-- Permission Enhancements Migration
-- Adds onboarding/leaders-book permission columns, deletion_requests table, notifications table.

-- 1. Add new permission columns to organization_memberships
ALTER TABLE public.organization_memberships
  ADD COLUMN IF NOT EXISTS can_view_onboarding BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_onboarding BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_leaders_book BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_leaders_book BOOLEAN NOT NULL DEFAULT true;

-- 2. Add same columns to organization_invitations
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS can_view_onboarding BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_onboarding BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_leaders_book BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_leaders_book BOOLEAN NOT NULL DEFAULT true;

-- 3. RLS helper functions (matching existing pattern)

CREATE OR REPLACE FUNCTION public.can_view_onboarding(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_onboarding = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_onboarding(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_onboarding = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_leaders_book(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_leaders_book = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_leaders_book(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_leaders_book = true)
  );
END;
$$;

-- 4. Create deletion_requests table
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_by_email TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  resource_description TEXT NOT NULL,
  resource_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  denial_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_org_status
  ON public.deletion_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_requested_by
  ON public.deletion_requests(requested_by);

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

-- Members can view their own deletion requests
CREATE POLICY deletion_requests_select_own ON public.deletion_requests
  FOR SELECT USING (requested_by = auth.uid());

-- Admins/owners can view all deletion requests in their org
CREATE POLICY deletion_requests_select_admin ON public.deletion_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = deletion_requests.organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Members can insert their own deletion requests
CREATE POLICY deletion_requests_insert_own ON public.deletion_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid());

-- Members can delete their own pending requests
CREATE POLICY deletion_requests_delete_own ON public.deletion_requests
  FOR DELETE USING (requested_by = auth.uid() AND status = 'pending');

-- Admins/owners can update deletion requests in their org
CREATE POLICY deletion_requests_update_admin ON public.deletion_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = deletion_requests.organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- 5. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_org
  ON public.notifications(user_id, organization_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE USING (user_id = auth.uid());
