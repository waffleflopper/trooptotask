-- Add show_in_date_header to assignment_types
-- Only one type per org should have this set to true; enforced by partial unique index.
ALTER TABLE assignment_types
  ADD COLUMN IF NOT EXISTS show_in_date_header boolean NOT NULL DEFAULT false;

-- Ensure at most one type per org can be the date header
CREATE UNIQUE INDEX IF NOT EXISTS assignment_types_one_header_per_org
  ON assignment_types (organization_id)
  WHERE show_in_date_header = true;

-- Backward compat: auto-flag existing FDS types for orgs that have them
-- Only update one FDS row per organization (the one with smallest id)
UPDATE assignment_types
  SET show_in_date_header = true
  WHERE id IN (
    SELECT DISTINCT ON (organization_id) id
    FROM assignment_types
    WHERE short_name = 'FDS'
    ORDER BY organization_id, id
  );