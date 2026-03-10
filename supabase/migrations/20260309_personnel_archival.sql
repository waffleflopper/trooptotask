-- Add archived_at to personnel
ALTER TABLE personnel ADD COLUMN archived_at timestamptz DEFAULT NULL;
CREATE INDEX idx_personnel_archived ON personnel (organization_id, archived_at);

-- Add retention setting to organizations
ALTER TABLE organizations ADD COLUMN archive_retention_months integer DEFAULT 36;

-- Update count_org_personnel to exclude archived
CREATE OR REPLACE FUNCTION count_org_personnel(p_org_id uuid) RETURNS integer AS $$
  SELECT COUNT(*)::integer FROM public.personnel
  WHERE organization_id = p_org_id AND archived_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER;
