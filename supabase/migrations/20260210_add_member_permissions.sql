-- Migration: Add granular permission columns to clinic_memberships
-- Date: 2026-02-10
-- Description: Adds page-level permission controls for clinic members

-- ============================================================
-- Add permission columns to clinic_memberships
-- ============================================================

ALTER TABLE public.clinic_memberships
ADD COLUMN IF NOT EXISTS can_view_calendar boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_edit_calendar boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_view_personnel boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_edit_personnel boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_view_training boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_edit_training boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_manage_members boolean NOT NULL DEFAULT false;

-- ============================================================
-- Add permission columns to clinic_invitations for default permissions
-- ============================================================

ALTER TABLE public.clinic_invitations
ADD COLUMN IF NOT EXISTS can_view_calendar boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_edit_calendar boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_view_personnel boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_edit_personnel boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_view_training boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_edit_training boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_manage_members boolean NOT NULL DEFAULT false;

-- ============================================================
-- Permission helper functions
-- ============================================================

-- Calendar permissions (availability, assignments, special_days, status_types)
CREATE OR REPLACE FUNCTION public.can_view_calendar(p_clinic_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_calendar = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_edit_calendar(p_clinic_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_calendar = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Personnel permissions (personnel, groups)
CREATE OR REPLACE FUNCTION public.can_view_personnel(p_clinic_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_personnel = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_edit_personnel(p_clinic_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_personnel = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Training permissions (training_types, personnel_trainings)
CREATE OR REPLACE FUNCTION public.can_view_training(p_clinic_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_training = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_edit_training(p_clinic_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_training = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Member management permission
CREATE OR REPLACE FUNCTION public.can_manage_clinic_members(p_clinic_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_manage_members = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Ownership transfer function
-- ============================================================

CREATE OR REPLACE FUNCTION public.transfer_clinic_ownership(
  p_clinic_id uuid,
  p_new_owner_id uuid
) RETURNS void AS $$
BEGIN
  -- Verify caller is current owner
  IF NOT public.is_clinic_owner(p_clinic_id) THEN
    RAISE EXCEPTION 'Only the owner can transfer ownership';
  END IF;

  -- Verify new owner is a member
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id AND user_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'New owner must be an existing member';
  END IF;

  -- Demote current owner to admin member (keeps full permissions)
  UPDATE public.clinic_memberships
  SET role = 'member',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  WHERE clinic_id = p_clinic_id AND user_id = auth.uid();

  -- Promote new owner
  UPDATE public.clinic_memberships
  SET role = 'owner',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  WHERE clinic_id = p_clinic_id AND user_id = p_new_owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
