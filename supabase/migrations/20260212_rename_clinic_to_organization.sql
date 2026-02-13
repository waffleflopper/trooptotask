-- Migration: Rename clinic to organization
-- This migration renames all clinic-related tables, columns, and functions to use organization naming

-- ============================================================
-- Step 1: Drop ALL existing RLS policies on tables that will be renamed
-- Using DO block to dynamically drop all policies
-- ============================================================

DO $$
DECLARE
    policy_rec RECORD;
BEGIN
    -- Drop all policies on clinics
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'clinics' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.clinics', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on clinic_memberships
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'clinic_memberships' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.clinic_memberships', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on clinic_invitations
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'clinic_invitations' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.clinic_invitations', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on groups
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'groups' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.groups', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on personnel
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'personnel' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.personnel', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on status_types
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'status_types' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.status_types', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on availability_entries
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'availability_entries' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.availability_entries', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on special_days
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'special_days' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.special_days', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on assignment_types
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'assignment_types' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.assignment_types', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on daily_assignments
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'daily_assignments' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.daily_assignments', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on user_pinned_groups
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'user_pinned_groups' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_pinned_groups', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on training_types
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'training_types' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.training_types', policy_rec.policyname);
    END LOOP;

    -- Drop all policies on personnel_trainings
    FOR policy_rec IN
        SELECT policyname FROM pg_policies WHERE tablename = 'personnel_trainings' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.personnel_trainings', policy_rec.policyname);
    END LOOP;
END $$;

-- ============================================================
-- Step 2: Drop existing functions (CASCADE to drop any remaining dependent objects)
-- ============================================================

DROP FUNCTION IF EXISTS public.is_clinic_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_clinic_owner(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_view_calendar(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_edit_calendar(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_view_personnel(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_edit_personnel(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_view_training(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_edit_training(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_clinic_members(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_clinic_ownership(uuid, uuid) CASCADE;

-- ============================================================
-- Step 3: Drop indexes that reference old column names
-- ============================================================

DROP INDEX IF EXISTS idx_clinic_memberships_user;
DROP INDEX IF EXISTS idx_clinic_memberships_clinic;
DROP INDEX IF EXISTS idx_personnel_clinic;
DROP INDEX IF EXISTS idx_groups_clinic;
DROP INDEX IF EXISTS idx_status_types_clinic;
DROP INDEX IF EXISTS idx_availability_clinic;
DROP INDEX IF EXISTS idx_special_days_clinic;
DROP INDEX IF EXISTS idx_assignment_types_clinic;
DROP INDEX IF EXISTS idx_daily_assignments_clinic;
DROP INDEX IF EXISTS idx_user_pinned_groups_user_clinic;
DROP INDEX IF EXISTS idx_clinic_invitations_email;
DROP INDEX IF EXISTS idx_training_types_clinic;
DROP INDEX IF EXISTS idx_personnel_trainings_clinic;

-- ============================================================
-- Step 4: Rename tables
-- ============================================================

ALTER TABLE public.clinics RENAME TO organizations;
ALTER TABLE public.clinic_memberships RENAME TO organization_memberships;
ALTER TABLE public.clinic_invitations RENAME TO organization_invitations;

-- ============================================================
-- Step 5: Rename enum type
-- ============================================================

ALTER TYPE public.clinic_role RENAME TO organization_role;

-- ============================================================
-- Step 6: Rename columns
-- ============================================================

-- organization_memberships: clinic_id -> organization_id
ALTER TABLE public.organization_memberships RENAME COLUMN clinic_id TO organization_id;

-- organization_invitations: clinic_id -> organization_id
ALTER TABLE public.organization_invitations RENAME COLUMN clinic_id TO organization_id;

-- Domain tables: clinic_id -> organization_id
ALTER TABLE public.groups RENAME COLUMN clinic_id TO organization_id;
ALTER TABLE public.personnel RENAME COLUMN clinic_id TO organization_id;
-- Note: personnel.clinic_role stays as-is since it refers to the person's role in the org, not the table
ALTER TABLE public.status_types RENAME COLUMN clinic_id TO organization_id;
ALTER TABLE public.availability_entries RENAME COLUMN clinic_id TO organization_id;
ALTER TABLE public.special_days RENAME COLUMN clinic_id TO organization_id;
ALTER TABLE public.assignment_types RENAME COLUMN clinic_id TO organization_id;
ALTER TABLE public.daily_assignments RENAME COLUMN clinic_id TO organization_id;
ALTER TABLE public.user_pinned_groups RENAME COLUMN clinic_id TO organization_id;
ALTER TABLE public.training_types RENAME COLUMN clinic_id TO organization_id;
ALTER TABLE public.personnel_trainings RENAME COLUMN clinic_id TO organization_id;

-- ============================================================
-- Step 7: Recreate indexes with new names
-- ============================================================

CREATE INDEX idx_organization_memberships_user ON public.organization_memberships(user_id);
CREATE INDEX idx_organization_memberships_org ON public.organization_memberships(organization_id);
CREATE INDEX idx_personnel_org ON public.personnel(organization_id);
CREATE INDEX idx_groups_org ON public.groups(organization_id);
CREATE INDEX idx_status_types_org ON public.status_types(organization_id);
CREATE INDEX idx_availability_org ON public.availability_entries(organization_id);
CREATE INDEX idx_special_days_org ON public.special_days(organization_id);
CREATE INDEX idx_assignment_types_org ON public.assignment_types(organization_id);
CREATE INDEX idx_daily_assignments_org ON public.daily_assignments(organization_id);
CREATE INDEX idx_user_pinned_groups_user_org ON public.user_pinned_groups(user_id, organization_id);
CREATE INDEX idx_organization_invitations_email ON public.organization_invitations(email);
CREATE INDEX idx_training_types_org ON public.training_types(organization_id);
CREATE INDEX idx_personnel_trainings_org ON public.personnel_trainings(organization_id);

-- ============================================================
-- Step 8: Recreate helper functions with new names
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_member(p_organization_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(p_organization_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- Page-level permission helper functions
CREATE OR REPLACE FUNCTION public.can_view_calendar(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_calendar = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_calendar(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_calendar = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_personnel(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_personnel = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_personnel(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_personnel = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_training(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_training = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_training(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_training = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org_members(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_manage_members = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_org_ownership(
  p_organization_id uuid,
  p_new_owner_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- Demote current owner to admin member (keeps full permissions)
  UPDATE public.organization_memberships
  SET role = 'member',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  WHERE organization_id = p_organization_id AND user_id = auth.uid();

  -- Promote new owner
  UPDATE public.organization_memberships
  SET role = 'owner',
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

-- ============================================================
-- Step 9: Recreate RLS policies with new names
-- ============================================================

-- Organizations
CREATE POLICY "Users can view organizations they are members of"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id));

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Organization owners can update their organizations"
  ON public.organizations FOR UPDATE
  USING (public.is_org_owner(id));

-- Organization Memberships
CREATE POLICY "Members can view memberships of their organizations"
  ON public.organization_memberships FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Creators and owners can insert memberships"
  ON public.organization_memberships FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      public.is_org_owner(organization_id)
      OR (user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.organizations WHERE id = organization_id AND created_by = auth.uid()
      ))
    )
  );

CREATE POLICY "Admins can delete memberships"
  ON public.organization_memberships FOR DELETE
  USING (public.can_manage_org_members(organization_id));

CREATE POLICY "Admins can update memberships"
  ON public.organization_memberships FOR UPDATE
  USING (public.can_manage_org_members(organization_id));

-- Organization Invitations
CREATE POLICY "Members can view invitations for their organizations"
  ON public.organization_invitations FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Admins can create invitations"
  ON public.organization_invitations FOR INSERT
  WITH CHECK (public.can_manage_org_members(organization_id));

CREATE POLICY "Admins can update invitations"
  ON public.organization_invitations FOR UPDATE
  USING (public.can_manage_org_members(organization_id));

-- Groups
CREATE POLICY "Members can view groups" ON public.groups
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members and creators can insert groups" ON public.groups
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    OR EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND created_by = auth.uid())
  );
CREATE POLICY "Members can update groups" ON public.groups
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete groups" ON public.groups
  FOR DELETE USING (public.is_org_member(organization_id));

-- Personnel
CREATE POLICY "Members can view personnel" ON public.personnel
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members can insert personnel" ON public.personnel
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members can update personnel" ON public.personnel
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete personnel" ON public.personnel
  FOR DELETE USING (public.is_org_member(organization_id));

-- Status Types
CREATE POLICY "Members can view status types" ON public.status_types
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members and creators can insert status types" ON public.status_types
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    OR EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND created_by = auth.uid())
  );
CREATE POLICY "Members can update status types" ON public.status_types
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete status types" ON public.status_types
  FOR DELETE USING (public.is_org_member(organization_id));

-- Availability Entries
CREATE POLICY "Members can view availability" ON public.availability_entries
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members can insert availability" ON public.availability_entries
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members can update availability" ON public.availability_entries
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete availability" ON public.availability_entries
  FOR DELETE USING (public.is_org_member(organization_id));

-- Special Days
CREATE POLICY "Members can view special days" ON public.special_days
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members and creators can insert special days" ON public.special_days
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    OR EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND created_by = auth.uid())
  );
CREATE POLICY "Members can update special days" ON public.special_days
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete special days" ON public.special_days
  FOR DELETE USING (public.is_org_member(organization_id));

-- Assignment Types
CREATE POLICY "Members can view assignment types" ON public.assignment_types
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members and creators can insert assignment types" ON public.assignment_types
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    OR EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND created_by = auth.uid())
  );
CREATE POLICY "Members can update assignment types" ON public.assignment_types
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete assignment types" ON public.assignment_types
  FOR DELETE USING (public.is_org_member(organization_id));

-- Daily Assignments
CREATE POLICY "Members can view daily assignments" ON public.daily_assignments
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members can insert daily assignments" ON public.daily_assignments
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members can update daily assignments" ON public.daily_assignments
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete daily assignments" ON public.daily_assignments
  FOR DELETE USING (public.is_org_member(organization_id));

-- User Pinned Groups
CREATE POLICY "Users can view their own pinned groups"
  ON public.user_pinned_groups FOR SELECT
  USING (auth.uid() = user_id AND public.is_org_member(organization_id));

CREATE POLICY "Users can insert their own pinned groups"
  ON public.user_pinned_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(organization_id));

CREATE POLICY "Users can update their own pinned groups"
  ON public.user_pinned_groups FOR UPDATE
  USING (auth.uid() = user_id AND public.is_org_member(organization_id));

CREATE POLICY "Users can delete their own pinned groups"
  ON public.user_pinned_groups FOR DELETE
  USING (auth.uid() = user_id AND public.is_org_member(organization_id));

-- Training Types
CREATE POLICY "Members can view training types" ON public.training_types
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members and creators can insert training types" ON public.training_types
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    OR EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND created_by = auth.uid())
  );
CREATE POLICY "Members can update training types" ON public.training_types
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete training types" ON public.training_types
  FOR DELETE USING (public.is_org_member(organization_id));

-- Personnel Trainings
CREATE POLICY "Members can view personnel trainings" ON public.personnel_trainings
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Members can insert personnel trainings" ON public.personnel_trainings
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members can update personnel trainings" ON public.personnel_trainings
  FOR UPDATE USING (public.is_org_member(organization_id));
CREATE POLICY "Members can delete personnel trainings" ON public.personnel_trainings
  FOR DELETE USING (public.is_org_member(organization_id));
