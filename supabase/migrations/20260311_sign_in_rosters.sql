-- Sign-In Rosters table
CREATE TABLE public.sign_in_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  roster_date date,
  blank_date boolean NOT NULL DEFAULT false,
  separate_by_group boolean NOT NULL DEFAULT false,
  sort_by text NOT NULL DEFAULT 'alphabetical' CHECK (sort_by IN ('alphabetical', 'rank')),
  personnel_snapshot jsonb NOT NULL,
  filter_config jsonb,
  signed_file_path text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for org-scoped queries ordered by date
CREATE INDEX idx_sign_in_rosters_org ON sign_in_rosters (organization_id, created_at DESC);

-- RLS
ALTER TABLE sign_in_rosters ENABLE ROW LEVEL SECURITY;

-- Read: org members with canViewTraining
CREATE POLICY "sign_in_rosters_select" ON sign_in_rosters FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = sign_in_rosters.organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_training = true)
  )
);

-- Insert: org members with canViewTraining
CREATE POLICY "sign_in_rosters_insert" ON sign_in_rosters FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = sign_in_rosters.organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_training = true)
  )
);

-- Update: org members with canEditTraining (for uploading signed scans)
CREATE POLICY "sign_in_rosters_update" ON sign_in_rosters FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = sign_in_rosters.organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_training = true)
  )
);

-- Delete: org members with canEditTraining
CREATE POLICY "sign_in_rosters_delete" ON sign_in_rosters FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = sign_in_rosters.organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_training = true)
  )
);
