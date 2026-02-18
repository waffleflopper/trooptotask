-- Migration: Add Leaders Book tables
-- Date: 2026-02-15
-- Description: Adds tables for Digital Leaders Book feature with extended soldier info,
--              counseling records, and development goals tracking

-- ============================================================
-- 1. Personnel Extended Info
-- One record per personnel with emergency contacts, spouse, vehicle, address
-- ============================================================

CREATE TABLE IF NOT EXISTS public.personnel_extended_info (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,

    -- Emergency contact
    emergency_contact_name text,
    emergency_contact_relationship text,
    emergency_contact_phone text,

    -- Spouse info
    spouse_name text,
    spouse_phone text,

    -- Vehicle info
    vehicle_make_model text,
    vehicle_plate text,
    vehicle_color text,

    -- Personal contact
    personal_email text,
    personal_phone text,

    -- Address
    address_street text,
    address_city text,
    address_state text,
    address_zip text,

    -- Leader notes
    leader_notes text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Each personnel can only have one extended info record
    UNIQUE(personnel_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_personnel_extended_info_org ON public.personnel_extended_info(organization_id);
CREATE INDEX IF NOT EXISTS idx_personnel_extended_info_personnel ON public.personnel_extended_info(personnel_id);

-- ============================================================
-- 2. Counseling Types
-- Templates for different types of counselings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.counseling_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    name text NOT NULL,
    description text,
    template_content text, -- Markdown template
    recurrence text CHECK (recurrence IN ('none', 'monthly', 'quarterly', 'annually')) DEFAULT 'none',
    color text NOT NULL DEFAULT '#6b7280',
    is_freeform boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counseling_types_org ON public.counseling_types(organization_id);

-- ============================================================
-- 3. Counseling Records
-- Individual counseling entries for personnel
-- ============================================================

CREATE TABLE IF NOT EXISTS public.counseling_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
    counseling_type_id uuid REFERENCES public.counseling_types(id) ON DELETE SET NULL,

    date_conducted date NOT NULL,
    subject text NOT NULL,
    key_points text,
    plan_of_action text,
    follow_up_date date,

    status text NOT NULL CHECK (status IN ('draft', 'completed', 'acknowledged')) DEFAULT 'draft',

    -- Signatures
    counselor_signed boolean NOT NULL DEFAULT false,
    counselor_signed_at timestamptz,
    soldier_signed boolean NOT NULL DEFAULT false,
    soldier_signed_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counseling_records_org ON public.counseling_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_counseling_records_personnel ON public.counseling_records(personnel_id);
CREATE INDEX IF NOT EXISTS idx_counseling_records_type ON public.counseling_records(counseling_type_id);
CREATE INDEX IF NOT EXISTS idx_counseling_records_date ON public.counseling_records(date_conducted);

-- ============================================================
-- 4. Development Goals
-- Career, education, physical, and personal goal tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.development_goals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,

    title text NOT NULL,
    description text,
    category text NOT NULL CHECK (category IN ('career', 'education', 'physical', 'personal')) DEFAULT 'career',
    priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    status text NOT NULL CHECK (status IN ('not-started', 'in-progress', 'completed', 'on-hold')) DEFAULT 'not-started',

    target_date date,
    progress_notes text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_development_goals_org ON public.development_goals(organization_id);
CREATE INDEX IF NOT EXISTS idx_development_goals_personnel ON public.development_goals(personnel_id);
CREATE INDEX IF NOT EXISTS idx_development_goals_category ON public.development_goals(category);
CREATE INDEX IF NOT EXISTS idx_development_goals_status ON public.development_goals(status);

-- ============================================================
-- Updated timestamp triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_personnel_extended_info_updated_at
    BEFORE UPDATE ON public.personnel_extended_info
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_counseling_types_updated_at
    BEFORE UPDATE ON public.counseling_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_counseling_records_updated_at
    BEFORE UPDATE ON public.counseling_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_development_goals_updated_at
    BEFORE UPDATE ON public.development_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Enable RLS
-- ============================================================

ALTER TABLE public.personnel_extended_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counseling_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counseling_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.development_goals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies - Using existing permission functions
-- ============================================================

-- Personnel Extended Info Policies
CREATE POLICY "Users can view extended info if can view personnel"
    ON public.personnel_extended_info
    FOR SELECT
    USING (can_view_personnel(organization_id));

CREATE POLICY "Users can insert extended info if can edit personnel"
    ON public.personnel_extended_info
    FOR INSERT
    WITH CHECK (can_edit_personnel(organization_id));

CREATE POLICY "Users can update extended info if can edit personnel"
    ON public.personnel_extended_info
    FOR UPDATE
    USING (can_edit_personnel(organization_id))
    WITH CHECK (can_edit_personnel(organization_id));

CREATE POLICY "Users can delete extended info if can edit personnel"
    ON public.personnel_extended_info
    FOR DELETE
    USING (can_edit_personnel(organization_id));

-- Counseling Types Policies
CREATE POLICY "Users can view counseling types if can view personnel"
    ON public.counseling_types
    FOR SELECT
    USING (can_view_personnel(organization_id));

CREATE POLICY "Users can insert counseling types if can edit personnel"
    ON public.counseling_types
    FOR INSERT
    WITH CHECK (can_edit_personnel(organization_id));

CREATE POLICY "Users can update counseling types if can edit personnel"
    ON public.counseling_types
    FOR UPDATE
    USING (can_edit_personnel(organization_id))
    WITH CHECK (can_edit_personnel(organization_id));

CREATE POLICY "Users can delete counseling types if can edit personnel"
    ON public.counseling_types
    FOR DELETE
    USING (can_edit_personnel(organization_id));

-- Counseling Records Policies
CREATE POLICY "Users can view counseling records if can view personnel"
    ON public.counseling_records
    FOR SELECT
    USING (can_view_personnel(organization_id));

CREATE POLICY "Users can insert counseling records if can edit personnel"
    ON public.counseling_records
    FOR INSERT
    WITH CHECK (can_edit_personnel(organization_id));

CREATE POLICY "Users can update counseling records if can edit personnel"
    ON public.counseling_records
    FOR UPDATE
    USING (can_edit_personnel(organization_id))
    WITH CHECK (can_edit_personnel(organization_id));

CREATE POLICY "Users can delete counseling records if can edit personnel"
    ON public.counseling_records
    FOR DELETE
    USING (can_edit_personnel(organization_id));

-- Development Goals Policies
CREATE POLICY "Users can view development goals if can view personnel"
    ON public.development_goals
    FOR SELECT
    USING (can_view_personnel(organization_id));

CREATE POLICY "Users can insert development goals if can edit personnel"
    ON public.development_goals
    FOR INSERT
    WITH CHECK (can_edit_personnel(organization_id));

CREATE POLICY "Users can update development goals if can edit personnel"
    ON public.development_goals
    FOR UPDATE
    USING (can_edit_personnel(organization_id))
    WITH CHECK (can_edit_personnel(organization_id));

CREATE POLICY "Users can delete development goals if can edit personnel"
    ON public.development_goals
    FOR DELETE
    USING (can_edit_personnel(organization_id));

-- ============================================================
-- Insert default counseling types for each organization
-- This will be done per-org via API, not globally
-- ============================================================
