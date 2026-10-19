-- Superseded Training completions, corrections, certificates and exemptions.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email)
SELECT ('f7100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'training-history-' || n || '@example.test'
FROM generate_series(1, 6) AS n;

INSERT INTO public.organizations (id, name, created_by) VALUES
('f7100000-0000-4000-8000-000000000101', 'History Alpha', 'f7100000-0000-4000-8000-000000000001'),
('f7100000-0000-4000-8000-000000000102', 'History Bravo', 'f7100000-0000-4000-8000-000000000006');
INSERT INTO public.groups (id, organization_id, name) VALUES
('f7100000-0000-4000-8000-000000000201', 'f7100000-0000-4000-8000-000000000101', 'Alpha One'),
('f7100000-0000-4000-8000-000000000202', 'f7100000-0000-4000-8000-000000000101', 'Alpha Two');

-- 1 owner, 2 Group viewer, 3 Group operator, 4 Group configurator,
-- 5 Organization configurator member, 6 Bravo owner.
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000002', 'member', 'viewer',
  '{"training":"view","personnel":"none"}', 'groups', ARRAY['f7100000-0000-4000-8000-000000000201']::uuid[]),
('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000003', 'member', 'viewer',
  '{"training":"operate","personnel":"none"}', 'groups', ARRAY['f7100000-0000-4000-8000-000000000201']::uuid[]),
('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000004', 'member', 'viewer',
  '{"training":"configure","personnel":"none"}', 'groups', ARRAY['f7100000-0000-4000-8000-000000000201']::uuid[]),
('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000005', 'member', 'viewer',
  '{"training":"configure","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
('f7100000-0000-4000-8000-000000000102', 'f7100000-0000-4000-8000-000000000006', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);

INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
('f7100000-0000-4000-8000-000000000301', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000201', 'SGT', 'Avery', 'One', 'history-one'),
('f7100000-0000-4000-8000-000000000302', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000202', 'SPC', 'Blake', 'Two', 'history-two'),
('f7100000-0000-4000-8000-000000000303', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000201', 'PFC', 'Casey', 'Leaves', 'history-leaves'),
('f7100000-0000-4000-8000-000000000304', 'f7100000-0000-4000-8000-000000000102', NULL, 'SSG', 'Drew', 'Bravo', 'history-bravo');
INSERT INTO public.training_types (id, organization_id, name, expiration_months, can_be_exempted, exempt_personnel_ids) VALUES
('f7100000-0000-4000-8000-000000000401', 'f7100000-0000-4000-8000-000000000101', 'Weapons', 12, true, '[]'),
('f7100000-0000-4000-8000-000000000402', 'f7100000-0000-4000-8000-000000000101', 'First Aid', 12, false, '[]'),
('f7100000-0000-4000-8000-000000000403', 'f7100000-0000-4000-8000-000000000101', 'Retired Type', 12, true, '[]'),
('f7100000-0000-4000-8000-000000000404', 'f7100000-0000-4000-8000-000000000102', 'Bravo Type', 12, true, '[]'),
('f7100000-0000-4000-8000-000000000405', 'f7100000-0000-4000-8000-000000000101', 'Never Expires', NULL, false, '[]'),
('f7100000-0000-4000-8000-000000000406', 'f7100000-0000-4000-8000-000000000101', 'Annual', 12, false, '[]');

CREATE FUNCTION pg_temp.cert(p_person text, p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT 'f7100000-0000-4000-8000-000000000101/personnel/f7100000-0000-4000-8000-000000000' || p_person
    || '/training-certificates/' || p_name
$$;
CREATE FUNCTION pg_temp.retirement(p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN object_name IS NULL THEN 'removed' ELSE 'pending' END
  FROM organization_private.file_retirements
  WHERE key_digest = sha256(convert_to('training-certificates/' || p_name, 'UTF8'))
$$;
CREATE FUNCTION pg_temp.history(p_record text) RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(concat_ws(' ', h.completion_date, h.expiration_date, h.notes, h.certificate_url)
    ORDER BY h.superseded_at, h.completion_date), ARRAY[]::text[])
  FROM public.personnel_training_history AS h
  JOIN public.personnel_trainings AS t
    ON t.personnel_id = h.personnel_id AND t.training_type_id = h.training_type_id
  WHERE t.id = ('f7100000-0000-4000-8000-000000000' || p_record)::uuid
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('role', 'authenticated', true),
    set_config('request.jwt.claim.sub', 'f7100000-0000-4000-8000-00000000000' || p_user, true),
    set_config('request.jwt.claims', json_build_object('sub', 'f7100000-0000-4000-8000-00000000000' || p_user,
      'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_service() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('role', 'service_role', true),
    set_config('request.jwt.claim.sub', '', true),
    set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
CREATE FUNCTION pg_temp.act_as_fixture() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('role', 'none', true),
    set_config('request.jwt.claim.sub', '', true),
    set_config('request.jwt.claims', '', true);
$$;

INSERT INTO public.personnel_trainings
  (id, organization_id, personnel_id, training_type_id, completion_date, expiration_date, notes, certificate_url) VALUES
('f7100000-0000-4000-8000-000000000501', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301',
  'f7100000-0000-4000-8000-000000000401', '2025-01-10', '2026-01-10', 'first', pg_temp.cert('301', 'first.pdf')),
('f7100000-0000-4000-8000-000000000502', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301',
  'f7100000-0000-4000-8000-000000000402', NULL, NULL, 'not yet', NULL),
('f7100000-0000-4000-8000-000000000503', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000302',
  'f7100000-0000-4000-8000-000000000401', '2025-02-01', '2026-02-01', 'two', NULL),
('f7100000-0000-4000-8000-000000000504', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000303',
  'f7100000-0000-4000-8000-000000000401', '2025-03-01', '2026-03-01', 'leaves', pg_temp.cert('303', 'leaves.pdf')),
('f7100000-0000-4000-8000-000000000505', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301',
  'f7100000-0000-4000-8000-000000000403', '2025-04-01', '2026-04-01', 'retired type', pg_temp.cert('301', 'type.pdf'));

SELECT is(
  ARRAY[
    has_function_privilege('anon', 'public.correct_training_completion(uuid, text, uuid, date, date, text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.correct_training_completion(uuid, text, uuid, date, date, text)', 'EXECUTE'),
    has_function_privilege('anon', 'public.set_training_exemption(uuid, uuid, uuid, boolean)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.set_training_exemption(uuid, uuid, uuid, boolean)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.record_superseded_training_completion()', 'EXECUTE')
  ],
  ARRAY[false, true, false, true, false],
  'members call the correction and exemption commands; nobody calls the history trigger');

SELECT pg_temp.act_as('3');
UPDATE public.personnel_trainings SET notes = 'notes only' WHERE id = 'f7100000-0000-4000-8000-000000000501';
SELECT is(pg_temp.history('501'), ARRAY[]::text[], 'a notes-only change keeps no history');
UPDATE public.personnel_trainings SET completion_date = '2026-01-05', expiration_date = '2027-01-05', notes = 'renewed',
  certificate_url = pg_temp.cert('301', 'renewed.pdf')
  WHERE id = 'f7100000-0000-4000-8000-000000000501';
SELECT is(pg_temp.history('501'),
  ARRAY['2025-01-10 2026-01-10 notes only ' || pg_temp.cert('301', 'first.pdf')],
  'a new completion keeps the superseded dates, notes and certificate');
UPDATE public.personnel_trainings SET completion_date = '2026-06-01' WHERE id = 'f7100000-0000-4000-8000-000000000502';
SELECT is(pg_temp.history('502'), ARRAY[]::text[], 'a first completion of a dated record without dates keeps no history');
UPDATE public.personnel_trainings SET expiration_date = '2027-02-01' WHERE id = 'f7100000-0000-4000-8000-000000000503';
SELECT is((SELECT count(*)::integer FROM public.personnel_training_history WHERE personnel_id = 'f7100000-0000-4000-8000-000000000302'), 0,
  'an operator outside the Group cannot supersede its record');

SELECT is((public.correct_training_completion('f7100000-0000-4000-8000-000000000101', 'current',
  'f7100000-0000-4000-8000-000000000501', '2026-01-04', '2027-01-04', 'typo fixed')) ->> 'completion_date', '2026-01-04',
  'a correction returns the corrected current record');
SELECT is(array_length(pg_temp.history('501'), 1), 1, 'correcting the current completion keeps no history');
SELECT is((SELECT concat_ws(' ', completion_date, expiration_date, notes, certificate_url) FROM public.personnel_trainings
  WHERE id = 'f7100000-0000-4000-8000-000000000501'),
  '2026-01-04 2027-01-04 typo fixed ' || pg_temp.cert('301', 'renewed.pdf'),
  'a correction keeps the certificate');
SELECT is((public.correct_training_completion('f7100000-0000-4000-8000-000000000101', 'history',
  (SELECT id FROM public.personnel_training_history WHERE personnel_id = 'f7100000-0000-4000-8000-000000000301'),
  '2025-01-09', '2026-01-09', 'history fixed')) ->> 'notes', 'history fixed', 'a correction returns the corrected history row');
SELECT is(pg_temp.history('501'),
  ARRAY['2025-01-09 2026-01-09 history fixed ' || pg_temp.cert('301', 'first.pdf')],
  'a history correction edits that row and adds none');
UPDATE public.personnel_trainings SET completion_date = '2026-01-06' WHERE id = 'f7100000-0000-4000-8000-000000000501';
SELECT is(array_length(pg_temp.history('501'), 1), 2, 'a later ordinary change in the same transaction still keeps history');
SELECT is(public.correct_training_completion('f7100000-0000-4000-8000-000000000101', 'current',
  'f7100000-0000-4000-8000-000000000503', '2020-01-01', NULL, NULL), NULL, 'an out-of-scope correction finds nothing');
SELECT throws_ok($$ SELECT public.correct_training_completion('f7100000-0000-4000-8000-000000000101', 'other',
  'f7100000-0000-4000-8000-000000000501', NULL, NULL, NULL) $$, '22023', NULL, 'an unknown correction kind is refused');

SELECT pg_temp.act_as('2');
SELECT is(public.correct_training_completion('f7100000-0000-4000-8000-000000000101', 'current',
  'f7100000-0000-4000-8000-000000000501', '2020-01-01', NULL, NULL), NULL, 'a viewer cannot correct');

SELECT pg_temp.act_as_fixture();
INSERT INTO public.personnel_training_history (id, organization_id, personnel_id, training_type_id, completion_date) VALUES
('f7100000-0000-4000-8000-000000000601', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000302',
  'f7100000-0000-4000-8000-000000000401', '2024-02-01'),
('f7100000-0000-4000-8000-000000000602', 'f7100000-0000-4000-8000-000000000102', 'f7100000-0000-4000-8000-000000000304',
  'f7100000-0000-4000-8000-000000000404', '2024-02-01');
SELECT pg_temp.act_as('2');
SELECT is((SELECT array_agg(DISTINCT personnel_id::text) FROM public.personnel_training_history),
  ARRAY['f7100000-0000-4000-8000-000000000301'], 'a Group viewer reads only its Group''s history');
SELECT throws_ok($$ INSERT INTO public.personnel_training_history (organization_id, personnel_id, training_type_id)
  VALUES ('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301', 'f7100000-0000-4000-8000-000000000401') $$,
  '42501', NULL, 'a viewer cannot add history');
SELECT pg_temp.act_as('3');
WITH changed AS (UPDATE public.personnel_training_history SET notes = 'forbidden'
  WHERE id = 'f7100000-0000-4000-8000-000000000601' RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'an operator cannot change another Group''s history');
SELECT throws_ok($$ INSERT INTO public.personnel_training_history (organization_id, personnel_id, training_type_id)
  VALUES ('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301', 'f7100000-0000-4000-8000-000000000404') $$,
  '42501', NULL, 'an operator cannot attach a foreign Training type');
WITH removed AS (DELETE FROM public.personnel_training_history RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'an operator cannot delete history');
SELECT pg_temp.act_as('5');
SELECT is((SELECT count(*)::integer FROM public.personnel_training_history), 3,
  'an Organization configurator reads every Group''s history but not another Organization''s');
SELECT pg_temp.act_as('6');
SELECT is((SELECT array_agg(id::text) FROM public.personnel_training_history), ARRAY['f7100000-0000-4000-8000-000000000602'],
  'another Organization''s owner reads only its own history');
SELECT pg_temp.act_as_fixture();
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.personnel_training_history), 0, 'anonymous reads no history');
RESET ROLE;

SELECT is(ARRAY[pg_temp.retirement(pg_temp.cert('301', 'first.pdf')), pg_temp.retirement(pg_temp.cert('301', 'renewed.pdf'))],
  ARRAY[NULL, NULL]::text[], 'certificates named by a history or current row are not retired');
SELECT is((SELECT count(*)::integer FROM organization_private.file_retirement_holds
  WHERE bucket_id = 'training-certificates'), 0, 'a certificate kept by history leaves no retirement hold');
SELECT pg_temp.act_as('4');
WITH removed AS (DELETE FROM public.personnel_training_history WHERE personnel_id = 'f7100000-0000-4000-8000-000000000301'
  AND certificate_url = pg_temp.cert('301', 'first.pdf') RETURNING id)
SELECT is((SELECT count(*)::integer FROM removed), 1, 'a Group configurator deletes its Group''s history');
SELECT pg_temp.act_as_fixture();
SELECT is(pg_temp.retirement(pg_temp.cert('301', 'first.pdf')), 'pending', 'the last reference going retires the certificate');
SELECT pg_temp.act_as('3');
SELECT throws_ok($$ UPDATE public.personnel_trainings SET certificate_url = pg_temp.cert('301', 'first.pdf')
  WHERE id = 'f7100000-0000-4000-8000-000000000501' $$,
  '23514', 'This stored file was deleted and cannot be attached', 'a retired certificate cannot be attached again');
SELECT throws_ok($$ UPDATE public.personnel_trainings SET certificate_url = pg_temp.cert('302', 'other.pdf')
  WHERE id = 'f7100000-0000-4000-8000-000000000501' $$,
  '23514', 'A stored certificate must belong to its Person', 'a stored certificate cannot point at another Person');
SELECT throws_ok($$ UPDATE public.personnel_trainings SET id = 'f7100000-0000-4000-8000-000000000599'
  WHERE id = 'f7100000-0000-4000-8000-000000000501' $$,
  '23514', 'Personnel file record identity cannot change', 'a record id cannot change');
SELECT lives_ok($$ UPDATE public.personnel_trainings SET certificate_url = 'https://example.test/cert.pdf'
  WHERE id = 'f7100000-0000-4000-8000-000000000501' $$, 'a legacy external link is still accepted');
SELECT pg_temp.act_as_fixture();
SELECT is(pg_temp.retirement(pg_temp.cert('301', 'renewed.pdf')), NULL,
  'a replaced certificate stays while the superseded completion names it');

DELETE FROM public.training_types WHERE id = 'f7100000-0000-4000-8000-000000000403';
UPDATE public.personnel_trainings SET completion_date = '2026-03-02' WHERE id = 'f7100000-0000-4000-8000-000000000504';
SELECT is((SELECT count(*)::integer FROM public.personnel_training_history WHERE personnel_id = 'f7100000-0000-4000-8000-000000000303'), 1,
  'the leaving Person has history before deletion');
DELETE FROM public.personnel WHERE id = 'f7100000-0000-4000-8000-000000000303';
SELECT is(
  ARRAY[
    (SELECT count(*)::integer FROM public.personnel_training_history WHERE personnel_id = 'f7100000-0000-4000-8000-000000000303'),
    (SELECT count(*)::integer FROM public.personnel_trainings WHERE training_type_id = 'f7100000-0000-4000-8000-000000000403')
  ],
  ARRAY[0, 0], 'deleting a Person or Training type removes its history and records');
SELECT is(ARRAY[pg_temp.retirement(pg_temp.cert('303', 'leaves.pdf')), pg_temp.retirement(pg_temp.cert('301', 'type.pdf'))],
  ARRAY['pending', 'pending'], 'cascaded deletions retire their certificates');

SELECT is((SELECT ARRAY[public::text, file_size_limit::text] FROM storage.buckets WHERE id = 'training-certificates'),
  ARRAY['false', '10485760'], 'the certificate bucket is private with a 10 MB limit');
SELECT pg_temp.act_as_service();
SELECT is(public.register_organization_file_upload('f7100000-0000-4000-8000-000000000701', 'f7100000-0000-4000-8000-000000000101',
  'f7100000-0000-4000-8000-000000000003', 'training-certificates', pg_temp.cert('301', 'upload.pdf')),
  'f7100000-0000-4000-8000-000000000701'::uuid, 'the server registers a certificate upload');
SELECT lives_ok($$ INSERT INTO storage.objects (id, bucket_id, name)
  VALUES ('f7100000-0000-4000-8000-000000000702', 'training-certificates', pg_temp.cert('301', 'upload.pdf')) $$,
  'the server writes registered certificate bytes');
SELECT throws_ok($$ INSERT INTO storage.objects (id, bucket_id, name)
  VALUES ('f7100000-0000-4000-8000-000000000703', 'training-certificates', pg_temp.cert('301', 'unregistered.pdf')) $$,
  '42501', NULL, 'unregistered certificate bytes are refused');
SELECT throws_ok($$ INSERT INTO storage.objects (id, bucket_id, name)
  VALUES ('f7100000-0000-4000-8000-000000000704', 'training-certificates', pg_temp.cert('301', 'first.pdf')) $$,
  '23514', 'This stored file was deleted and cannot be reused', 'retired certificate bytes cannot be written again');
SELECT pg_temp.act_as('2');
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'training-certificates'), 1,
  'a Group viewer reads its Person''s certificate bytes');
SELECT pg_temp.act_as('6');
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'training-certificates'), 0,
  'another Organization cannot read certificate bytes');
SELECT pg_temp.act_as('1');
SELECT is(public.organization_storage_object_is_owner_removable('training-certificates', pg_temp.cert('301', 'upload.pdf')), true,
  'an Organization owner may remove retained certificates');
SELECT pg_temp.act_as_service();
SELECT is(public.reconcile_personnel_file_attachment('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301',
  'certificate', pg_temp.cert('301', 'upload.pdf')), NULL, 'reconciling an unattached certificate finds no record');
SELECT pg_temp.act_as_fixture();
SELECT is(pg_temp.retirement(pg_temp.cert('301', 'upload.pdf')), 'pending', 'and retires its key');
DELETE FROM organization_private.file_uploads WHERE id = 'f7100000-0000-4000-8000-000000000701';
SELECT throws_ok($$ DELETE FROM public.organizations WHERE id = 'f7100000-0000-4000-8000-000000000101' $$,
  'P0001', 'Organization files must be removed before deletion', 'certificate bytes block Organization deletion');

SELECT pg_temp.act_as('5');
SELECT is(public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000401',
  'f7100000-0000-4000-8000-000000000301', true), true, 'an Organization configurator exempts a Person');
SELECT is(public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000401',
  'f7100000-0000-4000-8000-000000000301', true), true, 'exempting again succeeds');
SELECT is(public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000401',
  'f7100000-0000-4000-8000-000000000302', true), true, 'a second Person is added');
SELECT is((SELECT exempt_personnel_ids FROM public.training_types WHERE id = 'f7100000-0000-4000-8000-000000000401'),
  '["f7100000-0000-4000-8000-000000000301", "f7100000-0000-4000-8000-000000000302"]'::jsonb,
  'each Person is listed once');
SELECT is(public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000401',
  'f7100000-0000-4000-8000-000000000301', false), false, 'an exemption is removed');
SELECT is(public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000401',
  'f7100000-0000-4000-8000-000000000301', false), false, 'removing again succeeds');
SELECT is((SELECT exempt_personnel_ids FROM public.training_types WHERE id = 'f7100000-0000-4000-8000-000000000401'),
  '["f7100000-0000-4000-8000-000000000302"]'::jsonb, 'only that Person is removed');
SELECT throws_ok($$ SELECT public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000402',
  'f7100000-0000-4000-8000-000000000301', true) $$, '55000', 'This Training type does not allow exemptions',
  'a type without exemptions refuses one');
SELECT throws_ok($$ SELECT public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000404',
  'f7100000-0000-4000-8000-000000000301', true) $$, 'P0002', 'This Training type is no longer available',
  'another Organization''s type is unavailable');
SELECT throws_ok($$ SELECT public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000401',
  'f7100000-0000-4000-8000-000000000304', true) $$, 'P0002', 'Personnel not found',
  'another Organization''s Person cannot be exempted');
SELECT pg_temp.act_as('4');
SELECT throws_ok($$ SELECT public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000401',
  'f7100000-0000-4000-8000-000000000301', true) $$, '42501', NULL, 'a Group-scoped configurator cannot change a shared type');
SELECT pg_temp.act_as('3');
SELECT throws_ok($$ SELECT public.set_training_exemption('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000401',
  'f7100000-0000-4000-8000-000000000301', true) $$, '42501', NULL, 'an operator cannot exempt');
SELECT pg_temp.act_as_fixture();

INSERT INTO public.personnel_trainings
  (id, organization_id, personnel_id, training_type_id, completion_date, expiration_date, notes) VALUES
('f7100000-0000-4000-8000-000000000506', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301',
  'f7100000-0000-4000-8000-000000000405', NULL, NULL, 'undated completion'),
('f7100000-0000-4000-8000-000000000507', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301',
  'f7100000-0000-4000-8000-000000000406', '2025-01-01', '2026-01-01', 'Alpha prior'),
('f7100000-0000-4000-8000-000000000508', 'f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000302',
  'f7100000-0000-4000-8000-000000000406', '2025-02-01', '2026-02-01', 'Bravo prior');
SELECT pg_temp.act_as('3');
UPDATE public.personnel_trainings SET completion_date = '2026-10-19', notes = NULL
  WHERE id = 'f7100000-0000-4000-8000-000000000506';
SELECT is(pg_temp.history('506'), ARRAY['undated completion'],
  'a never-expiring completion without dates is kept when a new completion replaces it');
SELECT pg_temp.act_as('1');
INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id, completion_date, expiration_date, notes) VALUES
('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000301', 'f7100000-0000-4000-8000-000000000406',
  '2026-01-01', '2027-01-01', 'Alpha new'),
('f7100000-0000-4000-8000-000000000101', 'f7100000-0000-4000-8000-000000000302', 'f7100000-0000-4000-8000-000000000406',
  '2026-02-01', '2027-02-01', 'Bravo new')
ON CONFLICT (organization_id, personnel_id, training_type_id) DO UPDATE
  SET completion_date = EXCLUDED.completion_date, expiration_date = EXCLUDED.expiration_date, notes = EXCLUDED.notes;
SELECT is((SELECT array_agg(concat_ws(' ', completion_date, expiration_date, notes) ORDER BY completion_date)
  FROM public.personnel_training_history WHERE training_type_id = 'f7100000-0000-4000-8000-000000000406'),
  ARRAY['2025-01-01 2026-01-01 Alpha prior', '2025-02-01 2026-02-01 Bravo prior'],
  'a multi-row import keeps each superseded completion once');
SELECT pg_temp.act_as_fixture();

SELECT * FROM finish();
ROLLBACK;
