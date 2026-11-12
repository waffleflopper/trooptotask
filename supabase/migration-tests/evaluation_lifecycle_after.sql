-- The upgrade keeps workflow_status as the one lifecycle. A closed status completes its entry, and a change-of-rater
-- entry becomes a Change of Rater (CR) report. An open entry past its senior rater steps back so its intermediate rater
-- signs next; every other entry keeps its step, and every other saved fact stays as it was.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT results_eq(
  $$SELECT id, workflow_status FROM public.rating_scheme_entries
    WHERE organization_id = 'e7b10000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$VALUES ('e7b10000-0000-4000-8000-000000000401'::uuid, NULL::text),
    ('e7b10000-0000-4000-8000-000000000402'::uuid, 'sr-signed'::text),
    ('e7b10000-0000-4000-8000-000000000403'::uuid, 'completed'::text),
    ('e7b10000-0000-4000-8000-000000000404'::uuid, 'completed'::text),
    ('e7b10000-0000-4000-8000-000000000405'::uuid, 'completed'::text),
    ('e7b10000-0000-4000-8000-000000000406'::uuid, 'completed'::text),
    ('e7b10000-0000-4000-8000-000000000407'::uuid, 'completed'::text),
    ('e7b10000-0000-4000-8000-000000000408'::uuid, 'rater-signed'::text),
    ('e7b10000-0000-4000-8000-000000000409'::uuid, 'rater-signed'::text),
    ('e7b10000-0000-4000-8000-000000000410'::uuid, 'sr-signed'::text),
    ('e7b10000-0000-4000-8000-000000000411'::uuid, 'with-intermediate-rater'::text)$$,
  'an entry whose status was closed becomes completed, and an entry past its senior rater reaches its intermediate rater next');
SELECT results_eq(
  $$SELECT id, to_jsonb(e) - ARRAY['workflow_status', 'archived_at', 'archived_by'] FROM public.rating_scheme_entries e
    WHERE organization_id = 'e7b10000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT id, CASE WHEN id IN ('e7b10000-0000-4000-8000-000000000405', 'e7b10000-0000-4000-8000-000000000407')
      THEN saved - ARRAY['workflow_status', 'status'] || '{"report_type": "CR"}'
      ELSE saved - ARRAY['workflow_status', 'status'] END
    FROM upgrade_fixture.evaluation_lifecycle_before ORDER BY id$$,
  'the upgrade keeps every period, note and update time, and every report type but the change-of-rater entries''');
SELECT results_eq(
  $$SELECT report_type FROM public.rating_scheme_entries
    WHERE id IN ('e7b10000-0000-4000-8000-000000000405', 'e7b10000-0000-4000-8000-000000000407') ORDER BY id$$,
  $$VALUES ('CR'::text), ('CR'::text)$$,
  'an entry whose status was change-of-rater is a Change of Rater report, even when its workflow was already completed');
SELECT hasnt_column('public', 'rating_scheme_entries', 'status', 'the second lifecycle column is gone');
SELECT results_eq(
  $$SELECT resource_id, details -> 'change' FROM public.audit_logs
    WHERE org_id = 'e7b10000-0000-4000-8000-000000000101' AND action = 'rating_scheme.updated' AND user_id IS NULL
    ORDER BY resource_id$$,
  $$VALUES ('e7b10000-0000-4000-8000-000000000404'::uuid, '{"workflowStatus": {"from": "with-rater", "to": "completed"}}'::jsonb),
    ('e7b10000-0000-4000-8000-000000000405'::uuid, '{"workflowStatus": {"from": null, "to": "completed"}, "reportType": {"from": "AN", "to": "CR"}}'::jsonb),
    ('e7b10000-0000-4000-8000-000000000407'::uuid, '{"reportType": {"from": "AN", "to": "CR"}}'::jsonb),
    ('e7b10000-0000-4000-8000-000000000408'::uuid, '{"workflowStatus": {"from": "with-senior-rater", "to": "rater-signed"}}'::jsonb),
    ('e7b10000-0000-4000-8000-000000000409'::uuid, '{"workflowStatus": {"from": "sr-signed", "to": "rater-signed"}}'::jsonb),
    ('e7b10000-0000-4000-8000-000000000410'::uuid, '{"workflowStatus": {"from": "ir-signed", "to": "sr-signed"}}'::jsonb)$$,
  'the audit log records each entry the upgrade changed, with no member named');
SELECT is((SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.rating_scheme_entries'::regclass
    AND tgname = 'update_rating_scheme_entries_updated_at'), 'O'::"char",
  'the update-time trigger is enabled again');
SELECT * FROM finish();
ROLLBACK;
