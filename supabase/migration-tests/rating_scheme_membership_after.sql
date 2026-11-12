-- The upgrade archives a completed evaluation that a later one supersedes, or whose status last moved to completed.
-- It leaves every other entry on the scheme, names no member, and changes nothing else about any entry.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT results_eq(
  $$SELECT id, archived_at IS NOT NULL, archived_by FROM public.rating_scheme_entries
    WHERE organization_id = 'e7c20000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$VALUES ('e7c20000-0000-4000-8000-000000000501'::uuid, true, NULL::text),
    ('e7c20000-0000-4000-8000-000000000502'::uuid, false, NULL::text),
    ('e7c20000-0000-4000-8000-000000000503'::uuid, true, NULL::text),
    ('e7c20000-0000-4000-8000-000000000504'::uuid, false, NULL::text),
    ('e7c20000-0000-4000-8000-000000000505'::uuid, false, NULL::text),
    ('e7c20000-0000-4000-8000-000000000506'::uuid, false, NULL::text)$$,
  'a superseded or finished completed evaluation is archived, and an open, newest or reopened evaluation stays listed');
SELECT results_eq(
  $$SELECT archived_at FROM public.rating_scheme_entries WHERE id = 'e7c20000-0000-4000-8000-000000000501'$$,
  $$VALUES ('2026-02-01Z'::timestamptz)$$,
  'a superseded evaluation is archived at its last update');
SELECT results_eq(
  $$SELECT archived_at FROM public.rating_scheme_entries WHERE id = 'e7c20000-0000-4000-8000-000000000503'$$,
  $$VALUES ('2026-03-01 09:00Z'::timestamptz)$$,
  'an evaluation whose status moved to completed is archived at that time');
SELECT results_eq(
  $$SELECT id, to_jsonb(e) - ARRAY['workflow_status', 'archived_at', 'archived_by'] FROM public.rating_scheme_entries e
    WHERE organization_id = 'e7c20000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT id, saved - ARRAY['workflow_status', 'status']
    FROM upgrade_fixture.rating_scheme_membership_before ORDER BY id$$,
  'the upgrade keeps every period, note and update time');
SELECT results_eq(
  $$SELECT resource_id, action FROM public.audit_logs
    WHERE org_id = 'e7c20000-0000-4000-8000-000000000101' AND user_id IS NULL AND action = 'rating_scheme.archived'
    ORDER BY resource_id$$,
  $$VALUES ('e7c20000-0000-4000-8000-000000000501'::uuid, 'rating_scheme.archived'::text),
    ('e7c20000-0000-4000-8000-000000000503'::uuid, 'rating_scheme.archived'::text)$$,
  'the audit log records each archived entry with no member named');
SELECT is((SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.rating_scheme_entries'::regclass
    AND tgname = 'update_rating_scheme_entries_updated_at'), 'O'::"char",
  'the update-time trigger is enabled again');
SELECT * FROM finish();
ROLLBACK;
