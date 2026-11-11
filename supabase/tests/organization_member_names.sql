-- #2063 Owners and admins name members whose account has no name. Every write and permission proof below runs as an
-- ordinary signed-in role; setup and readback are the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a2063000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

-- Unit 101: 1 owner, 2 admin, 3 and 5 members with no account name, 4 a member whose account is named, 6 an ordinary
-- member, 9 an account with only a rank, 10 an account with only a first name.
-- Unit 102: 7 owner, 8 member.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'member-names-' || n || '@example.test', now()
FROM generate_series(1, 10) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES
  (pg_temp.id('2'), 'SFC', 'Ada', 'Admin'),
  (pg_temp.id('4'), 'SFC', 'Dana', 'Whitaker'),
  (pg_temp.id('9'), 'CPT', NULL, NULL),
  (pg_temp.id('10'), 'LTC', 'Solo', NULL);
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Names Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Names Bravo', pg_temp.id('7'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'owner@example.test'),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test'),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'three@example.test'),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'four@example.test'),
  (pg_temp.id('101'), pg_temp.id('5'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'five@example.test'),
  (pg_temp.id('101'), pg_temp.id('6'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'six@example.test'),
  (pg_temp.id('101'), pg_temp.id('9'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'nine@example.test'),
  (pg_temp.id('101'), pg_temp.id('10'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'ten@example.test'),
  (pg_temp.id('102'), pg_temp.id('7'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'seven@example.test'),
  (pg_temp.id('102'), pg_temp.id('8'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'eight@example.test');

-- Writers.
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT member_user_id, previous_rank, previous_first_name, previous_last_name, saved_rank, saved_first_name, saved_last_name
     FROM public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('3'), 'SGT', 'Pat', 'Smith') $$,
  $$ VALUES (pg_temp.id('3'), NULL::text, NULL::text, NULL::text, 'SGT'::text, 'Pat'::text, 'Smith'::text) $$,
  'an owner names a member and gets the stored values back');
SELECT results_eq(
  $$ SELECT previous_rank, previous_first_name, previous_last_name, saved_rank, saved_first_name, saved_last_name
     FROM public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('3'), 'SSG', 'Patricia', 'Smith') $$,
  $$ VALUES ('SGT'::text, 'Pat'::text, 'Smith'::text, 'SSG'::text, 'Patricia'::text, 'Smith'::text) $$,
  'a second save returns the values it replaced');
SELECT lives_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('4'), 'PV1', 'Org', 'Four') $$,
  'a name can be saved for a member whose account is named; the account still wins on display');
RESET ROLE;

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('5'), 'CIV', 'Chris', 'Fiveson') $$,
  'an admin names a member');
SELECT lives_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('9'), 'SSG', 'Org', 'Nine') $$,
  'an admin names a member whose account has only a rank');
SELECT lives_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('10'), 'MAJ', 'Org', 'Ten') $$,
  'an admin names a member whose account has only a first name');
RESET ROLE;

SELECT results_eq(
  $$ SELECT user_id, org_rank, org_first_name, org_last_name FROM public.organization_memberships
     WHERE organization_id = pg_temp.id('101') AND org_first_name IS NOT NULL ORDER BY user_id $$,
  $$ VALUES (pg_temp.id('3'), 'SSG'::text, 'Patricia'::text, 'Smith'::text),
            (pg_temp.id('4'), 'PV1'::text, 'Org'::text, 'Four'::text),
            (pg_temp.id('5'), 'CIV'::text, 'Chris'::text, 'Fiveson'::text),
            (pg_temp.id('9'), 'SSG'::text, 'Org'::text, 'Nine'::text),
            (pg_temp.id('10'), 'MAJ'::text, 'Org'::text, 'Ten'::text) $$,
  'the membership holds exactly what the writers saved');

-- Denials.
SELECT pg_temp.act_as('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('3'), 'CPL', 'Sneaky', 'Edit') $$,
  '42501', NULL, 'an ordinary member cannot name anyone');
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('6'), 'CPL', 'Self', 'Edit') $$,
  '42501', NULL, 'an ordinary member cannot name themselves');
RESET ROLE;

SELECT pg_temp.act_as('7');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('3'), 'CPL', 'Foreign', 'Edit') $$,
  '42501', NULL, 'the owner of another Organization cannot name a member of this one');
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('102'), pg_temp.id('3'), 'CPL', 'Foreign', 'Edit') $$,
  'P0002', NULL, 'an owner cannot name a member of another Organization through their own Organization');
RESET ROLE;

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('7'), 'CPL', 'Not', 'Member') $$,
  'P0002', NULL, 'a user who is not a member of the Organization is rejected');
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('3'), 'XYZ', 'Pat', 'Smith') $$,
  '23514', NULL, 'a rank outside the profile list is rejected');
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('3'), 'SGT', '   ', 'Smith') $$,
  '23514', NULL, 'a blank first name is rejected');
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('3'), 'SGT', 'Pat', '') $$,
  '23514', NULL, 'a blank last name is rejected');
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('101'), pg_temp.id('3'), 'SGT', NULL, 'Smith') $$,
  '22023', NULL, 'a missing field is rejected, so there is no way to clear a name');
SELECT throws_ok(
  $$ UPDATE public.organization_memberships SET org_first_name = 'Direct' WHERE user_id = pg_temp.id('3') $$,
  '42501', NULL, 'an admin cannot write the name columns directly');
SELECT throws_ok(
  $$ UPDATE public.organization_memberships SET org_rank = 'GEN' WHERE user_id = pg_temp.id('3') $$,
  '42501', NULL, 'an admin cannot write the rank column directly');
SELECT throws_ok($$ SELECT * FROM organization_private.member_names(pg_temp.id('101')) $$,
  '42501', NULL, 'the resolver is not callable by clients');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name('a2063000-0000-4000-8000-000000000101', 'a2063000-0000-4000-8000-000000000003', 'SGT', 'Pat', 'Smith') $$,
  '42501', NULL, 'a signed-out caller cannot run the writer');
RESET ROLE;

SELECT results_eq(
  $$ SELECT org_rank, org_first_name, org_last_name FROM public.organization_memberships
     WHERE organization_id = pg_temp.id('101') AND user_id = pg_temp.id('3') $$,
  $$ VALUES ('SSG'::text, 'Patricia'::text, 'Smith'::text) $$,
  'every refused write left the stored name as it was');

-- Precedence, read as an ordinary member.
SELECT pg_temp.act_as('6');
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT user_id, rank, first_name, last_name, email, name_source
     FROM public.organization_member_labels(pg_temp.id('101')) WHERE user_id = ANY (ARRAY[
       pg_temp.id('3'), pg_temp.id('4'), pg_temp.id('6'), pg_temp.id('9'), pg_temp.id('10')]) ORDER BY user_id $$,
  $$ VALUES
    (pg_temp.id('3'), 'SSG'::text, 'Patricia'::text, 'Smith'::text, 'three@example.test'::text, 'organization'::text),
    (pg_temp.id('4'), 'SFC'::text, 'Dana'::text, 'Whitaker'::text, 'four@example.test'::text, 'account'::text),
    (pg_temp.id('6'), NULL::text, NULL::text, NULL::text, 'six@example.test'::text, NULL::text),
    (pg_temp.id('9'), 'SSG'::text, 'Org'::text, 'Nine'::text, 'nine@example.test'::text, 'organization'::text),
    (pg_temp.id('10'), 'LTC'::text, 'Solo'::text, NULL::text, 'ten@example.test'::text, 'account'::text) $$,
  'the account wins when it has a first or last name, the Organization fills a blank account, and the rank never mixes sources');
SELECT results_eq(
  $$ SELECT user_id FROM public.organization_member_labels(pg_temp.id('101'), ARRAY[pg_temp.id('5'), pg_temp.id('7')]) $$,
  $$ VALUES (pg_temp.id('5')) $$,
  'asking for specific people returns only those who are members');
SELECT is((SELECT count(*) FROM public.organization_member_labels(pg_temp.id('101'))), 8::bigint,
  'with no list every member is returned');
SELECT is((SELECT count(*) FROM public.user_profiles WHERE user_id = pg_temp.id('4')), 0::bigint,
  'the profile table stays self-only for the reader');
RESET ROLE;

SELECT pg_temp.act_as('7');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.organization_member_labels(pg_temp.id('101'))), 0::bigint,
  'a member of another Organization reads no labels of this one');
RESET ROLE;

-- Audit actor labels use the same precedence.
SELECT is(audit_private.member_label(pg_temp.id('101'), pg_temp.id('3')), 'SSG Smith, Patricia',
  'an audit label uses the Organization name when the account is blank');
SELECT is(audit_private.member_label(pg_temp.id('101'), pg_temp.id('4')), 'SFC Whitaker, Dana',
  'an audit label uses the account name over the Organization value');
SELECT is(audit_private.member_label(pg_temp.id('101'), pg_temp.id('10')), 'LTC Solo',
  'an audit label with one account name does not borrow the Organization name');
SELECT is(audit_private.member_label(pg_temp.id('101'), pg_temp.id('6')), 'six@example.test',
  'an audit label falls back to the membership email');
SELECT is(audit_private.member_label(pg_temp.id('101'), pg_temp.id('7')), 'member-names-7@example.test',
  'an audit label for a user outside the Organization falls back to the account email');

-- The audit entry a member writes names the Organization name too.
SELECT is(
  (SELECT audit_private.member_label(pg_temp.id('101'), user_id) FROM public.organization_memberships
    WHERE organization_id = pg_temp.id('101') AND user_id = pg_temp.id('5')),
  'CIV Fiveson, Chris', 'an admin-named member is labelled by that name on their audit entries');

-- A suspended Organization takes the writer away from its owner.
UPDATE public.organizations SET suspended_at = now() WHERE id = pg_temp.id('102');
SELECT pg_temp.act_as('7');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.set_organization_member_name(pg_temp.id('102'), pg_temp.id('8'), 'CPL', 'Late', 'Edit') $$,
  '42501', NULL, 'the owner of a suspended Organization cannot name a member');
RESET ROLE;

-- A member's own "left" entry is written after their membership is gone, as the server does it: the leaver's request
-- deletes the row and records the entry through the service role, and the owner reads it back.
SELECT pg_temp.act_as('4');
SET LOCAL ROLE service_role;
DELETE FROM public.organization_memberships WHERE organization_id = pg_temp.id('101') AND user_id = pg_temp.id('4');
SELECT public.record_app_audit_entry('member.left', 'organization', 'info', '{}'::jsonb, pg_temp.id('4'),
  pg_temp.id('101'), pg_temp.id('4'));
RESET ROLE;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT actor_label FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action = 'member.left'),
  'SFC Whitaker, Dana', 'a member who left is named by their account on their own leave entry');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
