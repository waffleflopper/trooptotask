-- Add show_in_date_header to assignment_types
-- Only one type per org should have this set to true; enforced by application logic.
ALTER TABLE assignment_types
  ADD COLUMN IF NOT EXISTS show_in_date_header boolean NOT NULL DEFAULT false;
