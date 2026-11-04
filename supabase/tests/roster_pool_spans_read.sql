-- Calendar readers get the pool each DA 6 form drew from, whatever their Group scope, and never a form's record.
-- Run only against the isolated synthetic SQL test database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('e1986000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(actor)::text, true);
END; $$;
CREATE FUNCTION pg_temp.spans(org integer, from_day date, through_day date) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(s.assignment_type_id, s.starts_on, s.ends_on, s.pool) ORDER BY s.ordinal), '[]')
  FROM ROWS FROM (public.roster_pool_spans(pg_temp.id(org), from_day, through_day)) WITH ORDINALITY AS s(
    assignment_type_id, starts_on, ends_on, pool, ordinal);
$$;
CREATE FUNCTION pg_temp.form_edits(on_off boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('trooptotask.roster_close', CASE WHEN on_off THEN 'on' ELSE '' END, true);
$$;

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  WHERE p.proname = 'roster_pool_spans' AND p.pronamespace = 'public'::regnamespace
    AND acl.privilege_type = 'EXECUTE' AND (acl.grantee = 0 OR acl.grantee = 'anon'::regrole OR acl.grantee = 'service_role'::regrole)
), 'the pool spans read has no PUBLIC, anon or service_role execute grant');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p
  WHERE p.proname = 'roster_pool_spans' AND p.pronamespace = 'public'::regnamespace
    AND p.prosecdef AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=""']
), 'the pool spans definer read is stable with an empty search path');
SELECT is(pg_get_function_result('public.roster_pool_spans(uuid,date,date)'::regprocedure),
  'TABLE(assignment_type_id uuid, starts_on date, ends_on date, pool jsonb)',
  'the pool spans read returns the type, the dates and the pool, and no record');

INSERT INTO auth.users (id, email) SELECT pg_temp.id(n), 'pool-spans-' || n || '@example.test' FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id(101), 'Pool Spans Alpha', pg_temp.id(1)),
  (pg_temp.id(102), 'Pool Spans Bravo', pg_temp.id(5));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id(501), pg_temp.id(101), 'Pool Spans Platoon');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'member', 'viewer', '{"calendar":"view","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"calendar":"view","personnel":"none"}', 'groups', ARRAY[pg_temp.id(501)]),
  (pg_temp.id(101), pg_temp.id(3), 'member', 'viewer', '{"calendar":"none","personnel":"view"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(6), 'member', 'viewer', '{"calendar":"none","personnel":"view"}', 'groups', ARRAY[pg_temp.id(501)]),
  (pg_temp.id(102), pg_temp.id(5), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  (pg_temp.id(401), pg_temp.id(101), 'Staff Duty', 'SD', 'personnel'),
  (pg_temp.id(402), pg_temp.id(101), 'Charge of Quarters', 'CQ', 'personnel'),
  (pg_temp.id(403), pg_temp.id(102), 'Bravo Duty', 'BD', 'personnel');

-- Staff Duty drew from everyone, then from 68W up to SGT, then from NCOICs only. Each closed form keeps a record.
SELECT pg_temp.form_edits(true);
UPDATE public.roster_forms SET starts_on = '2026-10-01',
  rules = '{"pool": {"mos": [], "role": ["NCOIC"], "groupIds": [], "rank": null}, "weekendMode": "same"}'
  WHERE assignment_type_id = pg_temp.id(401);
INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, ends_on, rules, record) VALUES
  (pg_temp.id(101), pg_temp.id(401), '2026-08-01', '2026-09-14', '{"pool": null, "weekendMode": "same"}',
    '{"rows": [{"name": "Closed Record Able"}]}'),
  (pg_temp.id(101), pg_temp.id(401),
    '2026-09-15', '2026-09-30',
    '{"pool": {"mos": ["68W"], "role": [], "groupIds": [], "rank": {"from": "PV1", "to": "SGT"}}, "weekendMode": "same"}',
    '{"rows": [{"name": "Closed Record Baker"}]}');
UPDATE public.roster_forms SET starts_on = '2026-01-01' WHERE assignment_type_id = pg_temp.id(402);
UPDATE public.roster_forms SET starts_on = '2026-09-01' WHERE assignment_type_id = pg_temp.id(403);
SELECT pg_temp.form_edits(false);

SET LOCAL ROLE authenticated;

SELECT pg_temp.act(2);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'),
  '[
    ["e1986000-0000-4000-8000-000000000402", "2026-01-01", null, null],
    ["e1986000-0000-4000-8000-000000000401", "2026-08-01", "2026-09-14", null],
    ["e1986000-0000-4000-8000-000000000401", "2026-09-15", "2026-09-30",
      {"mos": ["68W"], "role": [], "groupIds": [], "rank": {"from": "PV1", "to": "SGT"}}],
    ["e1986000-0000-4000-8000-000000000401", "2026-10-01", null,
      {"mos": [], "role": ["NCOIC"], "groupIds": [], "rank": null}]
  ]'::jsonb,
  'a Group-scoped Calendar viewer gets each form''s pool, closed and open, in start order');
SELECT is(pg_temp.spans(101, '2026-09-20', '2026-09-25'),
  '[
    ["e1986000-0000-4000-8000-000000000402", "2026-01-01", null, null],
    ["e1986000-0000-4000-8000-000000000401", "2026-09-15", "2026-09-30",
      {"mos": ["68W"], "role": [], "groupIds": [], "rank": {"from": "PV1", "to": "SGT"}}]
  ]'::jsonb,
  'a Group-scoped viewer gets only the forms that overlap the span');
SELECT is((SELECT count(*)::integer FROM public.roster_forms), 0,
  'a Group-scoped viewer still reads no DA 6 form row');
SELECT is((SELECT count(*)::integer FROM public.roster_forms WHERE record IS NOT NULL), 0,
  'a Group-scoped viewer reads no DA 6 record');
SELECT is(pg_temp.spans(102, '2026-08-01', '2026-12-31'), '[]'::jsonb,
  'a viewer of one Organization gets nothing from another');

SELECT pg_temp.act(1);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'),
  '[
    ["e1986000-0000-4000-8000-000000000402", "2026-01-01", null, null],
    ["e1986000-0000-4000-8000-000000000401", "2026-08-01", "2026-09-14", null],
    ["e1986000-0000-4000-8000-000000000401", "2026-09-15", "2026-09-30",
      {"mos": ["68W"], "role": [], "groupIds": [], "rank": {"from": "PV1", "to": "SGT"}}],
    ["e1986000-0000-4000-8000-000000000401", "2026-10-01", null,
      {"mos": [], "role": ["NCOIC"], "groupIds": [], "rank": null}]
  ]'::jsonb,
  'an Organization-wide Calendar viewer gets the same spans');
SELECT is((SELECT count(*)::integer FROM public.roster_forms WHERE record IS NOT NULL), 2,
  'an Organization-wide viewer still reads the closed records through the table policy');

SELECT pg_temp.act(5);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'), '[]'::jsonb,
  'another Organization''s owner gets nothing');
SELECT is(pg_temp.spans(102, '2026-08-01', '2026-12-31'),
  '[["e1986000-0000-4000-8000-000000000403", "2026-09-01", null, null]]'::jsonb,
  'an owner gets the spans of their own Organization');

SELECT pg_temp.act(3);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'), '[]'::jsonb,
  'a member without Calendar view gets nothing');
SELECT pg_temp.act(6);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'), '[]'::jsonb,
  'a Group-scoped member without Calendar view gets nothing');
SELECT pg_temp.act(4);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'), '[]'::jsonb,
  'a signed-in non-member gets nothing');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.roster_pool_spans(
  'e1986000-0000-4000-8000-000000000101', '2026-08-01', '2026-12-31')$$, '42501', NULL,
  'a signed-out caller cannot run the pool spans read');
RESET ROLE;

INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES (pg_temp.id(2), pg_temp.id(1), 'Synthetic fixture');
SET LOCAL ROLE authenticated;
SELECT pg_temp.act(2);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'), '[]'::jsonb, 'a suspended user gets nothing');
RESET ROLE;
DELETE FROM public.user_suspensions WHERE user_id = pg_temp.id(2);

UPDATE public.organizations SET suspended_at = now() WHERE id = pg_temp.id(101);
SET LOCAL ROLE authenticated;
SELECT pg_temp.act(2);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'), '[]'::jsonb,
  'a Group-scoped viewer gets nothing once the Organization is suspended');
SELECT pg_temp.act(1);
SELECT is(pg_temp.spans(101, '2026-08-01', '2026-12-31'), '[]'::jsonb,
  'an Organization-wide viewer gets nothing once the Organization is suspended');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
