-- The upgrade renames submitted-to-s1 to submitted-to-hrc. It leaves every other step and every saved fact as it was,
-- including updated_at, records the rename in the audit log with no member named, and accepts the new step names.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT results_eq(
  $$SELECT id, workflow_status FROM public.rating_scheme_entries
    WHERE organization_id = 'e7c10000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$VALUES ('e7c10000-0000-4000-8000-000000000401'::uuid, 'submitted-to-hrc'::text),
    ('e7c10000-0000-4000-8000-000000000402'::uuid, 'sm-signed'::text),
    ('e7c10000-0000-4000-8000-000000000403'::uuid, 'drafting'::text),
    ('e7c10000-0000-4000-8000-000000000404'::uuid, NULL::text)$$,
  'the entry submitted to S1 is submitted to HRC, and the other steps are untouched');
SELECT results_eq(
  $$SELECT id, to_jsonb(e) - 'workflow_status' FROM public.rating_scheme_entries e
    WHERE organization_id = 'e7c10000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT id, saved - ARRAY['workflow_status', 'status'] FROM upgrade_fixture.evaluation_jump_steps_before ORDER BY id$$,
  'the upgrade keeps every period, note and update time');
SELECT results_eq(
  $$SELECT resource_id, details -> 'change' FROM public.audit_logs
    WHERE org_id = 'e7c10000-0000-4000-8000-000000000101' AND action = 'rating_scheme.updated' AND user_id IS NULL
    ORDER BY resource_id$$,
  $$VALUES ('e7c10000-0000-4000-8000-000000000401'::uuid,
    '{"workflowStatus": {"from": "submitted-to-s1", "to": "submitted-to-hrc"}}'::jsonb)$$,
  'the audit log records the renamed entry only, with no member named');
SELECT is((SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.rating_scheme_entries'::regclass
    AND tgname = 'update_rating_scheme_entries_updated_at'), 'O'::"char",
  'the update-time trigger is enabled again');
SELECT lives_ok($$ UPDATE public.rating_scheme_entries SET workflow_status = 'command-review'
    WHERE id = 'e7c10000-0000-4000-8000-000000000403' $$, 'Command Review is a stored step');
SELECT throws_ok($$ UPDATE public.rating_scheme_entries SET workflow_status = 'submitted-to-s1'
    WHERE id = 'e7c10000-0000-4000-8000-000000000403' $$, '23514', NULL, 'the old step name is no longer stored');
SELECT * FROM finish();
ROLLBACK;
