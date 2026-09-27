BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(32);

-- Independent provider contract: UUID tie-breaks and timestamp microseconds survive
-- bounded descending reads; scoped writes preserve persisted values.
-- HTTP composition/complete-array behavior is tested separately in TS.
INSERT INTO auth.users (id, email)
VALUES
 ('10000000-0000-4000-8000-000000070401', 'note-traversal@example.test'),
 ('10000000-0000-4000-8000-000000070402', 'note-viewer@example.test');

INSERT INTO public.organizations (id, name, created_by, url_slug)
VALUES
 ('20000000-0000-4000-8000-000000070401', 'Note traversal Alpha', '10000000-0000-4000-8000-000000070401', 'note-traversal-alpha'),
 ('20000000-0000-4000-8000-000000070402', 'Note traversal Bravo', '10000000-0000-4000-8000-000000070401', 'note-traversal-bravo');

INSERT INTO public.groups (id, organization_id, name, sort_order)
VALUES
 ('30000000-0000-4000-8000-000000070401', '20000000-0000-4000-8000-000000070401', 'Allowed', 1),
 ('30000000-0000-4000-8000-000000070402', '20000000-0000-4000-8000-000000070401', 'Denied', 2);

INSERT INTO public.organization_memberships
 (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email)
VALUES ('20000000-0000-4000-8000-000000070401', '10000000-0000-4000-8000-000000070401',
 'member', 'viewer', '{"personnel":"configure"}', 'groups',
 ARRAY['30000000-0000-4000-8000-000000070401']::uuid[], 'note-traversal@example.test'),
 ('20000000-0000-4000-8000-000000070401', '10000000-0000-4000-8000-000000070402',
 'member', 'viewer', '{}', 'groups',
 ARRAY['30000000-0000-4000-8000-000000070401']::uuid[], 'note-viewer@example.test');

INSERT INTO public.personnel (id, organization_id, group_id, rank, last_name, first_name, clinic_role, mos, slug)
VALUES
 ('50000000-0000-4000-8000-000000070401', '20000000-0000-4000-8000-000000070401', '30000000-0000-4000-8000-000000070401', 'SGT', 'Notes', 'Alpha', 'Medic', '68W', 'note-traversal-alpha'),
 ('50000000-0000-4000-8000-000000070402', '20000000-0000-4000-8000-000000070401', '30000000-0000-4000-8000-000000070401', 'SGT', 'Notes', 'Other', 'Medic', '68W', 'note-traversal-other'),
 ('50000000-0000-4000-8000-000000070403', '20000000-0000-4000-8000-000000070401', '30000000-0000-4000-8000-000000070402', 'SGT', 'Notes', 'Denied', 'Medic', '68W', 'note-traversal-denied'),
 ('50000000-0000-4000-8000-000000070404', '20000000-0000-4000-8000-000000070402', NULL, 'SGT', 'Notes', 'Foreign', 'Medic', '68W', 'note-traversal-foreign');

-- 205 tied active rows, 40 rows one microsecond older and 110 archived rows.
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, created_at, archived_at)
SELECT ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
 '20000000-0000-4000-8000-000000070401'::uuid, '50000000-0000-4000-8000-000000070401'::uuid,
 'Synthetic leader', 'Active tied note ' || n, '2026-09-24 12:00:00.123456+00'::timestamptz, NULL::timestamptz
FROM generate_series(1, 205) AS n
UNION ALL
SELECT ('61000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
 '20000000-0000-4000-8000-000000070401', '50000000-0000-4000-8000-000000070401',
 'Synthetic leader', 'Older microsecond note ' || n, '2026-09-24 12:00:00.123455+00', NULL
FROM generate_series(1, 40) AS n
UNION ALL
SELECT ('62000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
 '20000000-0000-4000-8000-000000070401', '50000000-0000-4000-8000-000000070401',
 'Synthetic leader', 'Archived note ' || n, '2026-09-24 12:00:00.123456+00', '2026-09-25 00:00:00+00'
FROM generate_series(1, 110) AS n;

INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, created_at)
VALUES
 ('63000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000070401', '50000000-0000-4000-8000-000000070402', 'Synthetic leader', 'Other Personnel', '2026-09-24 12:00:00.123456+00'),
 ('63000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000070401', '50000000-0000-4000-8000-000000070403', 'Synthetic leader', 'Other Group', '2026-09-24 12:00:00.123456+00'),
 ('63000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000070402', '50000000-0000-4000-8000-000000070404', 'Synthetic leader', 'Other Organization', '2026-09-24 12:00:00.123456+00');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070401', true);
SELECT set_config('request.jwt.claim.email', 'note-traversal@example.test', true);

-- No Organization/Personnel predicate here: these assertions exercise actual RLS.
SELECT is((SELECT count(*)::integer FROM public.leader_notes), 356, 'scoped reader sees own Group including a different in-scope Soldier');
SELECT is((SELECT count(*)::integer FROM public.leader_notes WHERE id = '63000000-0000-4000-8000-000000000002'), 0, 'note RLS denies another Group');
SELECT is((SELECT count(*)::integer FROM public.leader_notes WHERE id = '63000000-0000-4000-8000-000000000003'), 0, 'note RLS denies another Organization');

-- The view is SECURITY INVOKER so its reads retain the authenticated RLS context.
RESET ROLE;
CREATE TEMP VIEW active_notes WITH (security_invoker = true) AS
 SELECT * FROM public.leader_notes
 WHERE organization_id = '20000000-0000-4000-8000-000000070401'
 AND personnel_id = '50000000-0000-4000-8000-000000070401'
 AND archived_at IS NULL;
GRANT SELECT ON active_notes TO authenticated;
SET LOCAL ROLE authenticated;

SELECT results_eq(
 $$SELECT id FROM active_notes ORDER BY created_at DESC, id DESC LIMIT 100$$,
 $$SELECT ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(205, 106, -1) n$$,
 'first bounded page uses descending UUID ties');
SELECT results_eq(
 $$SELECT id FROM active_notes WHERE created_at = '2026-09-24 12:00:00.123456+00' AND id < '60000000-0000-4000-8000-000000000106' ORDER BY created_at DESC, id DESC LIMIT 100$$,
 $$SELECT ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(105, 6, -1) n$$,
 'second page neither repeats nor skips a tied UUID');
SELECT results_eq(
 $$SELECT id FROM active_notes WHERE created_at = '2026-09-24 12:00:00.123456+00' AND id < '60000000-0000-4000-8000-000000000006' ORDER BY created_at DESC, id DESC LIMIT 100$$,
 $$SELECT ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(5, 1, -1) n$$,
 'final tied tail contains exactly the five remaining notes');
SELECT results_eq(
 $$SELECT id FROM active_notes WHERE created_at < '2026-09-24 12:00:00.123456+00' ORDER BY created_at DESC, id DESC LIMIT 95$$,
 $$SELECT ('61000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(40, 1, -1) n$$,
 'older fill retains all forty notes only one microsecond earlier');
SELECT is((SELECT count(*)::integer FROM active_notes WHERE created_at = '2026-09-24 12:00:00.123455+00' AND id < '61000000-0000-4000-8000-000000000001'), 0, 'final cursor has no remaining tied rows');
SELECT is((SELECT count(*)::integer FROM active_notes WHERE created_at < '2026-09-24 12:00:00.123455+00'), 0, 'final cursor has no older rows');
SELECT results_eq(
 $$SELECT id FROM active_notes ORDER BY created_at DESC, id DESC LIMIT 1$$,
 $$VALUES ('60000000-0000-4000-8000-000000000205'::uuid)$$,
 'detail limit one selects the same first note');
SELECT results_eq(
 $$SELECT id FROM public.leader_notes WHERE organization_id = '20000000-0000-4000-8000-000000070401' AND personnel_id = '50000000-0000-4000-8000-000000070401' AND archived_at IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 100$$,
 $$SELECT ('62000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(110, 11, -1) n$$,
 'archived first page excludes active notes');
SELECT results_eq(
 $$SELECT id FROM public.leader_notes WHERE organization_id = '20000000-0000-4000-8000-000000070401' AND personnel_id = '50000000-0000-4000-8000-000000070401' AND archived_at IS NOT NULL AND created_at = '2026-09-24 12:00:00.123456+00' AND id < '62000000-0000-4000-8000-000000000011' ORDER BY created_at DESC, id DESC LIMIT 100$$,
 $$SELECT ('62000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(10, 1, -1) n$$,
 'archived continuation reaches all remaining tied notes');

-- Actual write RLS, independent of application lifecycle preconditions. The
-- existing policies require Personnel operate capability and matching parent
-- Organization/Group for both the old row and the proposed replacement row.
SELECT lives_ok(
 $$INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, created_at)
 VALUES ('64000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000070401',
 '50000000-0000-4000-8000-000000070401', '10000000-0000-4000-8000-000000070401',
 'Scoped write fixture', '2026-09-24 13:00:00.123456+00')$$,
 'scoped Personnel configurator can create a note');
SELECT results_eq(
 $$SELECT id, organization_id, personnel_id, author, text, created_at, archived_at
 FROM public.leader_notes WHERE id = '64000000-0000-4000-8000-000000000001'$$,
 $$VALUES ('64000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000070401'::uuid,
 '50000000-0000-4000-8000-000000070401'::uuid, '10000000-0000-4000-8000-000000070401'::text,
 'Scoped write fixture'::text, '2026-09-24 13:00:00.123456+00'::timestamptz, NULL::timestamptz)$$,
 'created note preserves identifiers, author, text and timestamp precision');
WITH archived AS (
 UPDATE public.leader_notes SET archived_at = '2026-09-25 13:00:00.654321+00'
 WHERE id = '64000000-0000-4000-8000-000000000001' RETURNING id, archived_at
)
SELECT is((SELECT archived_at FROM archived), '2026-09-25 13:00:00.654321+00'::timestamptz,
 'scoped configurator archives the note with its exact timestamp');
WITH restored AS (
 UPDATE public.leader_notes SET archived_at = NULL
 WHERE id = '64000000-0000-4000-8000-000000000001' RETURNING id, archived_at
)
SELECT is((SELECT count(*)::integer FROM restored WHERE archived_at IS NULL), 1,
 'scoped configurator restores the note to active');

SELECT throws_ok(
 $$INSERT INTO public.leader_notes (organization_id, personnel_id, author, text)
 VALUES ('20000000-0000-4000-8000-000000070401', '50000000-0000-4000-8000-000000070403', 'Synthetic', 'Denied Group')$$,
 '42501', 'new row violates row-level security policy for table "leader_notes"',
 'configurator cannot create a note for another Group');
SELECT throws_ok(
 $$INSERT INTO public.leader_notes (organization_id, personnel_id, author, text)
 VALUES ('20000000-0000-4000-8000-000000070402', '50000000-0000-4000-8000-000000070404', 'Synthetic', 'Denied Organization')$$,
 '42501', 'new row violates row-level security policy for table "leader_notes"',
 'configurator cannot create a note in another Organization');
SELECT throws_ok(
 $$INSERT INTO public.leader_notes (organization_id, personnel_id, author, text)
 VALUES ('20000000-0000-4000-8000-000000070401', '50000000-0000-4000-8000-000000070404', 'Synthetic', 'Mismatched parent')$$,
 '42501', 'new row violates row-level security policy for table "leader_notes"',
 'configurator cannot attach an own-Organization note to foreign Personnel');
SELECT throws_ok(
 $$UPDATE public.leader_notes SET personnel_id = '50000000-0000-4000-8000-000000070403'
 WHERE id = '64000000-0000-4000-8000-000000000001'$$,
 '42501', 'new row violates row-level security policy for table "leader_notes"',
 'configurator cannot move an allowed note to another Group');
SELECT throws_ok(
 $$UPDATE public.leader_notes SET organization_id = '20000000-0000-4000-8000-000000070402',
 personnel_id = '50000000-0000-4000-8000-000000070404'
 WHERE id = '64000000-0000-4000-8000-000000000001'$$,
 '42501', 'new row violates row-level security policy for table "leader_notes"',
 'configurator cannot move an allowed note to another Organization');
SELECT throws_ok(
 $$UPDATE public.leader_notes SET personnel_id = '50000000-0000-4000-8000-000000070404'
 WHERE id = '64000000-0000-4000-8000-000000000001'$$,
 '42501', 'new row violates row-level security policy for table "leader_notes"',
 'configurator cannot move an allowed note to mismatched foreign Personnel');
WITH updated AS (
 UPDATE public.leader_notes SET archived_at = '2026-09-25 13:00:00+00'
 WHERE id = '63000000-0000-4000-8000-000000000002' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'configurator cannot archive another Group note');
WITH updated AS (
 UPDATE public.leader_notes SET archived_at = '2026-09-25 13:00:00+00'
 WHERE id = '63000000-0000-4000-8000-000000000003' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'configurator cannot archive another Organization note');
WITH deleted AS (
 DELETE FROM public.leader_notes WHERE id = '63000000-0000-4000-8000-000000000002' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'configurator cannot delete another Group note');
WITH deleted AS (
 DELETE FROM public.leader_notes WHERE id = '63000000-0000-4000-8000-000000000003' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'configurator cannot delete another Organization note');

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070402', true);
SELECT set_config('request.jwt.claim.email', 'note-viewer@example.test', true);
SELECT throws_ok(
 $$INSERT INTO public.leader_notes (organization_id, personnel_id, author, text)
 VALUES ('20000000-0000-4000-8000-000000070401', '50000000-0000-4000-8000-000000070401', 'Synthetic', 'Viewer write')$$,
 '42501', 'new row violates row-level security policy for table "leader_notes"',
 'viewer cannot create a note for in-scope Personnel');
WITH updated AS (
 UPDATE public.leader_notes SET archived_at = '2026-09-25 13:00:00+00'
 WHERE id = '64000000-0000-4000-8000-000000000001' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM updated), 0, 'viewer cannot archive an in-scope note');
WITH deleted AS (
 DELETE FROM public.leader_notes WHERE id = '64000000-0000-4000-8000-000000000001' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM deleted), 0, 'viewer cannot delete an in-scope note');

-- Inspect persisted rows without RLS hiding a mistakenly altered fixture.
RESET ROLE;
SELECT results_eq(
 $$SELECT id, organization_id, personnel_id, text, archived_at FROM public.leader_notes
 WHERE id IN ('64000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000002',
 '63000000-0000-4000-8000-000000000003') ORDER BY id$$,
 $$VALUES
 ('63000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000070401'::uuid,
 '50000000-0000-4000-8000-000000070403'::uuid, 'Other Group'::text, NULL::timestamptz),
 ('63000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000070402'::uuid,
 '50000000-0000-4000-8000-000000070404'::uuid, 'Other Organization'::text, NULL::timestamptz),
 ('64000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000070401'::uuid,
 '50000000-0000-4000-8000-000000070401'::uuid, 'Scoped write fixture'::text, NULL::timestamptz)$$,
 'restore and denied mutations preserve note identity, scope, text and active state');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070401', true);
SELECT set_config('request.jwt.claim.email', 'note-traversal@example.test', true);
UPDATE public.leader_notes SET archived_at = '2026-09-25 13:00:00+00'
WHERE id = '64000000-0000-4000-8000-000000000001';
WITH deleted AS (
 DELETE FROM public.leader_notes WHERE id = '64000000-0000-4000-8000-000000000001' RETURNING id
)
SELECT is((SELECT id FROM deleted), '64000000-0000-4000-8000-000000000001'::uuid,
 'configurator deletes the intended archived note');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.leader_notes WHERE id = '64000000-0000-4000-8000-000000000001'),
 0, 'deleted note is absent from persisted state');
SELECT * FROM finish();
ROLLBACK;
