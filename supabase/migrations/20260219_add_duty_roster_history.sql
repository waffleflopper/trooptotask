-- Add exempt_personnel_ids column to assignment_types
ALTER TABLE public.assignment_types
  ADD COLUMN IF NOT EXISTS exempt_personnel_ids text[] NOT NULL DEFAULT '{}'::text[];

-- Create duty_roster_history table
CREATE TABLE IF NOT EXISTS public.duty_roster_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_type_id uuid NOT NULL REFERENCES public.assignment_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  roster jsonb NOT NULL,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.duty_roster_history ENABLE ROW LEVEL SECURITY;

-- Org members can SELECT
CREATE POLICY "org_members_can_select_roster_history"
  ON public.duty_roster_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = duty_roster_history.organization_id
        AND user_id = auth.uid()
    )
  );

-- Org editors/owners can INSERT
CREATE POLICY "org_editors_can_insert_roster_history"
  ON public.duty_roster_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = duty_roster_history.organization_id
        AND user_id = auth.uid()
        AND (role = 'owner' OR can_edit_calendar = true)
    )
  );

-- Org editors/owners can DELETE
CREATE POLICY "org_editors_can_delete_roster_history"
  ON public.duty_roster_history FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = duty_roster_history.organization_id
        AND user_id = auth.uid()
        AND (role = 'owner' OR can_edit_calendar = true)
    )
  );
