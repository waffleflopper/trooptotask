-- Permission Redesign Migration
-- Adds 'admin' role, scoped_group_id column, and updates RLS helper functions.

-- 1. Add 'admin' to organization_role enum
ALTER TYPE public.organization_role ADD VALUE IF NOT EXISTS 'admin' AFTER 'owner';

-- 2. Add scoped_group_id to organization_memberships
ALTER TABLE public.organization_memberships
  ADD COLUMN IF NOT EXISTS scoped_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- 3. Add scoped_group_id to organization_invitations
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS scoped_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- 4. Update can_edit_calendar: recognize 'admin' alongside 'owner'
CREATE OR REPLACE FUNCTION public.can_edit_calendar(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_calendar = true)
  );
END;
$$;

-- 5. Update can_edit_personnel: recognize 'admin' alongside 'owner'
CREATE OR REPLACE FUNCTION public.can_edit_personnel(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_personnel = true)
  );
END;
$$;

-- 6. Update can_edit_training: recognize 'admin' alongside 'owner'
CREATE OR REPLACE FUNCTION public.can_edit_training(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_training = true)
  );
END;
$$;

-- 7. Update can_view_calendar: recognize 'admin' alongside 'owner'
CREATE OR REPLACE FUNCTION public.can_view_calendar(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_calendar = true)
  );
END;
$$;

-- 8. Update can_view_personnel: recognize 'admin' alongside 'owner'
CREATE OR REPLACE FUNCTION public.can_view_personnel(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_personnel = true)
  );
END;
$$;

-- 9. Update can_view_training: recognize 'admin' alongside 'owner'
CREATE OR REPLACE FUNCTION public.can_view_training(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_training = true)
  );
END;
$$;

-- 10. Update can_manage_org_members: recognize 'admin' alongside 'owner'
CREATE OR REPLACE FUNCTION public.can_manage_org_members(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_manage_members = true)
  );
END;
$$;

-- NOTE: is_org_owner intentionally NOT updated — remains owner-only for destructive operations.

-- 11. Update transfer_org_ownership: demote old owner to 'admin', clear scoped_group_id on both
CREATE OR REPLACE FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Verify caller is current owner
  IF NOT public.is_org_owner(p_organization_id) THEN
    RAISE EXCEPTION 'Only the owner can transfer ownership';
  END IF;

  -- Verify new owner is a member
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'New owner must be an existing member';
  END IF;

  -- Demote current owner to admin (keeps full permissions, no group scope)
  UPDATE public.organization_memberships
  SET role = 'admin',
      scoped_group_id = NULL,
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  WHERE organization_id = p_organization_id AND user_id = auth.uid();

  -- Promote new owner (no group scope)
  UPDATE public.organization_memberships
  SET role = 'owner',
      scoped_group_id = NULL,
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  WHERE organization_id = p_organization_id AND user_id = p_new_owner_id;
END;
$$;
