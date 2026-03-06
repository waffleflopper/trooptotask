-- Add report_type and workflow_status columns to rating_scheme_entries
ALTER TABLE rating_scheme_entries
  ADD COLUMN report_type text,
  ADD COLUMN workflow_status text;

-- Workflow status CHECK constraint
ALTER TABLE rating_scheme_entries
  ADD CONSTRAINT rating_scheme_entries_workflow_status_check
  CHECK (workflow_status IS NULL OR workflow_status IN (
    'drafting',
    'with-rater',
    'rater-signed',
    'with-senior-rater',
    'sr-signed',
    'with-intermediate-rater',
    'ir-signed',
    'with-reviewer',
    'reviewer-signed',
    'with-rated-soldier',
    'sm-signed',
    'submitted-to-s1',
    'completed'
  ));
