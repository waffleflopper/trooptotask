-- Add show_in_date_header to assignment_types
-- Only one type per org should have this set to true; enforced by partial unique index.
ALTER TABLE assignment_types
  ADD COLUMN IF NOT EXISTS show_in_date_header boolean NOT NULL DEFAULT false;

-- Ensure at most one type per org can be the date header
CREATE UNIQUE INDEX IF NOT EXISTS assignment_types_one_header_per_org
  ON assignment_types (org_id)
  WHERE show_in_date_header = true;

-- Backward compat: auto-flag existing FDS types for orgs that have them
UPDATE assignment_types
  SET show_in_date_header = true
  WHERE short_name = 'FDS'
    AND show_in_date_header = false;
