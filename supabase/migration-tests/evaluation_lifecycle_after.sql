-- The upgrade keeps workflow_status as the one lifecycle. A closed status completes its entry; every other entry keeps
-- its step, and every other saved fact stays as it was.
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
    ('e7b10000-0000-4000-8000-000000000406'::uuid, 'completed'::text)$$,
  'open entries keep their step and an entry whose status was closed becomes completed');
SELECT results_eq(
  $$SELECT id, to_jsonb(e) - 'workflow_status' FROM public.rating_scheme_entries e
    WHERE organization_id = 'e7b10000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT id, saved - ARRAY['workflow_status', 'status'] FROM upgrade_fixture.evaluation_lifecycle_before ORDER BY id$$,
  'the upgrade keeps every period, report type, note and update time');
SELECT hasnt_column('public', 'rating_scheme_entries', 'status', 'the second lifecycle column is gone');
SELECT results_eq(
  $$SELECT resource_id, details -> 'change' FROM public.audit_logs
    WHERE org_id = 'e7b10000-0000-4000-8000-000000000101' AND action = 'rating_scheme.updated' AND user_id IS NULL
    ORDER BY resource_id$$,
  $$VALUES ('e7b10000-0000-4000-8000-000000000404'::uuid, '{"workflowStatus": {"from": "with-rater", "to": "completed"}}'::jsonb),
    ('e7b10000-0000-4000-8000-000000000405'::uuid, '{"workflowStatus": {"from": null, "to": "completed"}}'::jsonb)$$,
  'the audit log records each entry the upgrade completed, with no member named');
SELECT is((SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.rating_scheme_entries'::regclass
    AND tgname = 'update_rating_scheme_entries_updated_at'), 'O'::"char",
  'the update-time trigger is enabled again');
SELECT * FROM finish();
ROLLBACK;
