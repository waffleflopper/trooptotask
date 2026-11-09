BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- created_at and updated_at describe row storage, not domain transitions. All other
-- *_at columns are reviewed, including operational timers and user-entered dates.
CREATE TEMP TABLE lifecycle_allowlist (
  table_name text, columns text[], privileges text[], reason text NOT NULL CHECK (length(reason) > 0)
);
INSERT INTO lifecycle_allowlist VALUES
  ('rating_scheme_entries', ARRAY['status','workflow_status'], ARRAY['INSERT','UPDATE'], 'pending #2072'),
  ('counseling_records', ARRAY['uploaded_by'], ARRAY['INSERT'], 'stamped by trigger stamp_author / organization_private.stamp_record_author'),
  ('counseling_records', ARRAY['conducted_by'], ARRAY['INSERT','UPDATE'], 'Typed counselor name, not actor attribution; scoped counseling INSERT/UPDATE policies'),
  ('counseling_records', ARRAY['archived_at','archived_by'], ARRAY['UPDATE'], 'Archive input under scoped counseling UPDATE policy; actor stamped by stamp_archived_by'),
  ('personnel_follow_ups', ARRAY['created_by'], ARRAY['INSERT'], 'stamped by trigger stamp_author / organization_private.stamp_record_author'),
  ('personnel_follow_ups', ARRAY['status'], ARRAY['INSERT','UPDATE'], 'transition enforced by stamp_completed_by / organization_private.stamp_follow_up_completed_by and stamp_archived_by'),
  ('personnel_follow_ups', ARRAY['completed_at','completed_by'], ARRAY['UPDATE'], 'stamped by trigger stamp_completed_by / organization_private.stamp_follow_up_completed_by'),
  ('personnel_follow_ups', ARRAY['archived_at','archived_by'], ARRAY['UPDATE'], 'Archive input under scoped follow-up UPDATE policy; actor stamped by stamp_archived_by'),
  ('data_exports', ARRAY['requested_by'], ARRAY['INSERT'], 'pinned by policy Authorized members can create exports to auth.uid()'),
  ('organization_invitations', ARRAY['invited_by'], ARRAY['INSERT'], 'pinned by policy Governors can create invitations to auth.uid()'),
  ('organization_invitations', ARRAY['status','declined_at','declined_by','revoked_at','revoked_by','expired_at'], ARRAY['UPDATE'], 'transition enforced by policies Governors can revoke pending invitations / Users can decline invitations addressed to them and organization_invitations_lifecycle_state_check'),
  ('sign_in_rosters', ARRAY['created_by'], ARRAY['INSERT','UPDATE'], 'stamped by trigger stamp_author / organization_private.stamp_record_author'),
  ('sign_in_rosters', ARRAY['sort_by'], ARRAY['INSERT','UPDATE'], 'Sort preference, not attribution; sign_in_rosters_insert/update policies enforce scope'),
  ('training_views', ARRAY['created_by'], ARRAY['INSERT','UPDATE'], 'stamped by trigger stamp_author / organization_private.stamp_record_author'),
  ('personnel_documents', ARRAY['uploaded_by'], ARRAY['INSERT','UPDATE'], 'stamped by trigger stamp_author / organization_private.stamp_record_author'),
  ('personnel_documents', ARRAY['archived_at','archived_by'], ARRAY['INSERT','UPDATE'], 'Archive input under scoped document policies; actor stamped by stamp_archived_by'),
  ('leader_notes', ARRAY['archived_at','archived_by'], ARRAY['INSERT','UPDATE'], 'Archive input under scoped leader note policies; actor stamped by stamp_archived_by'),
  ('personnel_ict_completions', ARRAY['logged_by'], ARRAY['INSERT','UPDATE'], 'stamped by trigger stamp_author / organization_private.stamp_record_author'),
  ('personnel_ict_completions', ARRAY['completed_at','validated_by'], ARRAY['INSERT','UPDATE'], 'User-entered completion date and validator, not actor attribution; can_edit_personnel_ict_completion_record policies'),
  ('personnel_extended_info', ARRAY['updated_by'], ARRAY['INSERT','UPDATE'], 'stamped by trigger stamp_personnel_extended_info_saver'),
  ('personnel_extended_info', ARRAY['award_tracking_acknowledged_at'], ARRAY['INSERT','UPDATE'], 'Acknowledgement input enforced by require_award_tracking_enabled and scoped extended-info policies'),
  ('personnel_onboardings', ARRAY['status','completed_at','cancelled_at'], ARRAY['UPDATE'], 'transition enforced by require_onboarding_operation_rules trigger'),
  ('personnel', ARRAY['archived_at'], ARRAY['INSERT','UPDATE'], 'transition enforced by require_personnel_lifecycle_authority and personnel INSERT/UPDATE policies'),
  ('personnel_training_history', ARRAY['superseded_at'], ARRAY['INSERT','UPDATE'], 'Historical supersession input under can_edit_personnel_training_record policies'),
  ('status_types', ARRAY['archived_at'], ARRAY['INSERT','UPDATE'], 'stamped by trigger stamp_archived_at / organization_private.stamp_catalog_archived_at'),
  ('training_types', ARRAY['archived_at'], ARRAY['INSERT','UPDATE'], 'stamped by trigger stamp_archived_at / organization_private.stamp_catalog_archived_at'),
  ('ict_tasks', ARRAY['archived_at'], ARRAY['INSERT','UPDATE'], 'Catalog archive input under scoped critical-task INSERT/UPDATE policies'),
  ('assignment_types', ARRAY['archived_at'], ARRAY['INSERT','UPDATE'], 'Calendar lane archive input under calendar assignment-type INSERT/UPDATE policies'),
  ('organization_rank_catalog', ARRAY['state'], ARRAY['INSERT','UPDATE'], 'Governor-authored catalog state under Organization governors can insert/update organization rank catalog policies'),
  ('organization_memberships', ARRAY['invited_by'], ARRAY['INSERT'], 'No authenticated INSERT policy; membership creation uses guarded functions'),
  ('organizations', ARRAY['created_by','suspended_at'], ARRAY['INSERT'], 'No authenticated INSERT policy; organization creation uses guarded functions'),
  ('auth_email_outbox', ARRAY['status','sent_at'], ARRAY['INSERT','UPDATE'], 'Policy Service role manages auth email outbox denies ordinary signed-in writes'),
  ('account_setup_rate_limits', ARRAY['reset_at'], ARRAY['INSERT','UPDATE'], 'No authenticated write policy; service-owned operational timer'),
  ('durable_rate_limits', ARRAY['reset_at'], ARRAY['INSERT','UPDATE'], 'No authenticated write policy; service-owned operational timer'),
  ('announcement_dismissals', ARRAY['dismissed_at'], ARRAY['INSERT','UPDATE'], 'Own dismissal time under policy Users can manage own dismissals');

CREATE TEMP VIEW reviewed_lifecycle_privileges AS
SELECT 'public'::text AS table_schema, table_name, unnest(columns) AS column_name,
  privilege AS privilege_type
FROM lifecycle_allowlist CROSS JOIN LATERAL unnest(privileges) privilege;

CREATE TEMP VIEW actual_lifecycle_privileges AS
WITH grants AS (
  SELECT table_schema, table_name, column_name, privilege_type
  FROM information_schema.column_privileges WHERE grantee IN ('authenticated', 'PUBLIC')
  UNION
  SELECT p.table_schema, p.table_name, c.column_name, p.privilege_type
  FROM information_schema.table_privileges p
  JOIN information_schema.columns c USING (table_catalog, table_schema, table_name)
  WHERE p.grantee IN ('authenticated', 'PUBLIC')
)
SELECT DISTINCT * FROM grants
WHERE table_schema NOT IN ('pg_catalog','information_schema') AND privilege_type IN ('INSERT','UPDATE')
  AND (column_name IN ('status','state','workflow_status') OR column_name LIKE '%\_by' ESCAPE '\'
    OR (column_name LIKE '%\_at' ESCAPE '\' AND column_name NOT IN ('created_at','updated_at')));

GRANT SELECT ON lifecycle_allowlist, reviewed_lifecycle_privileges, actual_lifecycle_privileges TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"f9200000-0000-4000-8000-000000000001"}', true);
SELECT results_eq(
  $$ SELECT (table_schema || '.' || table_name || '.' || column_name || ' ' || privilege_type)::text COLLATE "C"
     FROM actual_lifecycle_privileges ORDER BY 1 $$,
  $$ SELECT (table_schema || '.' || table_name || '.' || column_name || ' ' || privilege_type)::text COLLATE "C"
     FROM reviewed_lifecycle_privileges ORDER BY 1 $$,
  'Every authenticated lifecycle or attribution grant has a reviewed reason'
);
SELECT * FROM finish();
ROLLBACK;
