BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id, email, last_sign_in_at) VALUES
 ('e8690000-0000-4000-8000-000000000001', 'operator-dir@example.test', now()),
 ('e8690000-0000-4000-8000-000000000002', 'alpha-owner-dir@example.test', now() - interval '2 days'),
 ('e8690000-0000-4000-8000-000000000003', 'alpha-member-dir@example.test', NULL),
 ('e8690000-0000-4000-8000-000000000004', 'bravo-owner-dir@example.test', now() - interval '90 days'),
 ('e8690000-0000-4000-8000-000000000005', 'charlie-owner-dir@example.test', NULL),
 ('e8690000-0000-4000-8000-000000000006', 'delta-owner-dir@example.test', NULL),
 ('e8690000-0000-4000-8000-000000000007', 'suspended-operator-dir@example.test', NULL);
INSERT INTO public.platform_operators(user_id) VALUES
 ('e8690000-0000-4000-8000-000000000001'),
 ('e8690000-0000-4000-8000-000000000007');
INSERT INTO public.user_suspensions(user_id, suspended_by)
 VALUES ('e8690000-0000-4000-8000-000000000007', 'e8690000-0000-4000-8000-000000000001');

INSERT INTO public.organizations(id, name, created_by, url_slug, created_at) VALUES
 ('e8690000-0000-4000-8000-000000000101', 'Alpha Dirtest', 'e8690000-0000-4000-8000-000000000002', 'dir-alpha', now() - interval '100 days'),
 ('e8690000-0000-4000-8000-000000000102', 'Bravo Dirtest', 'e8690000-0000-4000-8000-000000000004', 'dir-bravo', now() - interval '100 days'),
 ('e8690000-0000-4000-8000-000000000103', 'Charlie Dirtest', 'e8690000-0000-4000-8000-000000000005', 'dir-charlie', now() - interval '100 days'),
 ('e8690000-0000-4000-8000-000000000104', 'Delta 100% Dirtest', 'e8690000-0000-4000-8000-000000000006', 'dir-delta', now() - interval '100 days');

INSERT INTO public.organization_memberships(id, organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email) VALUES
 ('e8690000-0000-4000-8000-000000000201', 'e8690000-0000-4000-8000-000000000101', 'e8690000-0000-4000-8000-000000000002', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'alpha-owner-dir@example.test'),
 ('e8690000-0000-4000-8000-000000000202', 'e8690000-0000-4000-8000-000000000101', 'e8690000-0000-4000-8000-000000000003', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], 'alpha-member-dir@example.test'),
 ('e8690000-0000-4000-8000-000000000203', 'e8690000-0000-4000-8000-000000000102', 'e8690000-0000-4000-8000-000000000004', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'bravo-owner-dir@example.test'),
 ('e8690000-0000-4000-8000-000000000204', 'e8690000-0000-4000-8000-000000000103', 'e8690000-0000-4000-8000-000000000005', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
 ('e8690000-0000-4000-8000-000000000205', 'e8690000-0000-4000-8000-000000000104', 'e8690000-0000-4000-8000-000000000006', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'delta-owner-dir@example.test');

INSERT INTO public.personnel(id, organization_id, rank, last_name, first_name, clinic_role, mos, slug, archived_at) VALUES
 ('e8690000-0000-4000-8000-000000000301', 'e8690000-0000-4000-8000-000000000101', 'SGT', 'One', 'Ann', 'Medic', '68W', 'dir-alpha-one', NULL),
 ('e8690000-0000-4000-8000-000000000302', 'e8690000-0000-4000-8000-000000000101', 'SGT', 'Two', 'Bo', 'Medic', '68W', 'dir-alpha-two', NULL),
 ('e8690000-0000-4000-8000-000000000303', 'e8690000-0000-4000-8000-000000000101', 'SGT', 'Gone', 'Cy', 'Medic', '68W', 'dir-alpha-gone', now());

INSERT INTO public.organization_invitations(id, organization_id, email, invited_by, status, expires_at, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, revoked_at) VALUES
 ('e8690000-0000-4000-8000-000000000401', 'e8690000-0000-4000-8000-000000000101', 'pending-dir@example.test', 'e8690000-0000-4000-8000-000000000002', 'pending', now() + interval '7 days', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], NULL),
 ('e8690000-0000-4000-8000-000000000402', 'e8690000-0000-4000-8000-000000000101', 'revoked-dir@example.test', 'e8690000-0000-4000-8000-000000000002', 'revoked', now() + interval '7 days', 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], now());

INSERT INTO public.audit_logs(org_id, user_id, action, resource_type, severity, "timestamp") VALUES
 ('e8690000-0000-4000-8000-000000000101', 'e8690000-0000-4000-8000-000000000002', 'personnel.create', 'personnel', 'info', now() - interval '1 hour'),
 ('e8690000-0000-4000-8000-000000000101', 'e8690000-0000-4000-8000-000000000002', 'personnel.create', 'personnel', 'info', now() - interval '40 days'),
 ('e8690000-0000-4000-8000-000000000102', 'e8690000-0000-4000-8000-000000000004', 'personnel.create', 'personnel', 'info', now() - interval '60 days'),
 ('e8690000-0000-4000-8000-000000000104', 'e8690000-0000-4000-8000-000000000006', 'personnel.create', 'personnel', 'info', now() - interval '5 days');

SELECT is(public.platform_suspend_organization('e8690000-0000-4000-8000-000000000001', 'e8690000-0000-4000-8000-000000000104', 'Synthetic abuse report', now() - interval '1 day'), true, 'an operator suspension reports the Organization was found');
SELECT is((SELECT reason FROM public.organization_suspensions WHERE organization_id = 'e8690000-0000-4000-8000-000000000104'), 'Synthetic abuse report', 'the suspension reason is saved with the suspension');
SELECT is((SELECT suspended_by FROM public.organization_suspensions WHERE organization_id = 'e8690000-0000-4000-8000-000000000104'), 'e8690000-0000-4000-8000-000000000001'::uuid, 'the suspension is attributed to the operator the server named');
SELECT is((SELECT suspended_at IS NOT NULL FROM public.organizations WHERE id = 'e8690000-0000-4000-8000-000000000104'), true, 'the Organization is suspended');
SELECT is(public.platform_suspend_organization('e8690000-0000-4000-8000-000000000001', 'e8690000-0000-4000-8000-000000000999', 'Nobody', now()), false, 'suspending a missing Organization reports it was not found');
SELECT throws_ok($$SELECT public.platform_suspend_organization('e8690000-0000-4000-8000-000000000002', 'e8690000-0000-4000-8000-000000000101', 'Forged', now())$$, '42501', NULL, 'a non-operator actor cannot suspend');
SELECT throws_ok($$SELECT public.platform_suspend_organization('e8690000-0000-4000-8000-000000000007', 'e8690000-0000-4000-8000-000000000101', 'Suspended operator', now())$$, '42501', NULL, 'a suspended operator cannot suspend');
SELECT throws_ok($$SELECT public.platform_suspend_organization('e8690000-0000-4000-8000-000000000001', 'e8690000-0000-4000-8000-000000000101', '   ', now())$$, '23514', NULL, 'a blank reason is rejected');

SELECT results_eq(
 $$SELECT name, status FROM public.platform_list_organizations('Dirtest', 'all', 1, 25) ORDER BY last_active_at DESC NULLS LAST, created_at DESC, organization_id DESC$$,
 $$VALUES ('Alpha Dirtest'::text, 'active'::text), ('Delta 100% Dirtest', 'suspended'), ('Bravo Dirtest', 'quiet'), ('Charlie Dirtest', 'quiet')$$,
 'the list carries status, with never-used and old units quiet and the suspended unit suspended');
SELECT results_eq(
 $$SELECT name FROM public.platform_list_organizations('Dirtest', 'all', 1, 25)$$,
 $$VALUES ('Alpha Dirtest'::text), ('Delta 100% Dirtest'), ('Bravo Dirtest'), ('Charlie Dirtest')$$,
 'the list is sorted by last active, newest first, with never-used units last');
SELECT results_eq(
 $$SELECT member_count, personnel_count, owner_count, owner_email FROM public.platform_list_organizations('Alpha Dirtest', 'all', 1, 25)$$,
 $$VALUES (2::bigint, 2::bigint, 1::bigint, 'alpha-owner-dir@example.test'::text)$$,
 'the list counts members, active personnel and names the single owner');
SELECT is((SELECT owner_email FROM public.platform_list_organizations('Charlie Dirtest', 'all', 1, 25)), 'charlie-owner-dir@example.test', 'an owner without a saved membership email falls back to the account email');
SELECT is((SELECT last_active_at IS NULL FROM public.platform_list_organizations('Charlie Dirtest', 'all', 1, 25)), true, 'a unit with no audit events has no last active time');
SELECT results_eq($$SELECT name FROM public.platform_list_organizations('bravo-owner', 'all', 1, 25)$$, $$VALUES ('Bravo Dirtest'::text)$$, 'the list searches by owner email');
SELECT results_eq($$SELECT name FROM public.platform_list_organizations('100%', 'all', 1, 25)$$, $$VALUES ('Delta 100% Dirtest'::text)$$, 'a percent sign in the search matches itself');
SELECT is((SELECT count(*)::integer FROM public.platform_list_organizations('% Dirtest', 'all', 1, 25) WHERE organization_id IS NOT NULL), 1, 'a percent sign is not a wildcard');
SELECT results_eq($$SELECT name FROM public.platform_list_organizations('Dirtest', 'active-week', 1, 25)$$, $$VALUES ('Alpha Dirtest'::text)$$, 'the active-this-week filter excludes suspended and older units');
SELECT results_eq($$SELECT name FROM public.platform_list_organizations('Dirtest', 'quiet', 1, 25)$$, $$VALUES ('Bravo Dirtest'::text), ('Charlie Dirtest')$$, 'the quiet filter lists units idle for 30 days or more');
SELECT results_eq($$SELECT name FROM public.platform_list_organizations('Dirtest', 'suspended', 1, 25)$$, $$VALUES ('Delta 100% Dirtest'::text)$$, 'the suspended filter lists suspended units');
SELECT results_eq(
 $$SELECT page, total_count, name FROM public.platform_list_organizations('Dirtest', 'all', 2, 2)$$,
 $$VALUES (2, 4::bigint, 'Bravo Dirtest'::text), (2, 4::bigint, 'Charlie Dirtest')$$,
 'a page returns its slice with the total');
SELECT results_eq(
 $$SELECT page, total_count, name FROM public.platform_list_organizations('Dirtest', 'all', 99, 3)$$,
 $$VALUES (2, 4::bigint, 'Charlie Dirtest'::text)$$,
 'a page past the end returns the last page');
SELECT results_eq(
 $$SELECT page, total_count, organization_id FROM public.platform_list_organizations('no-such-unit', 'all', 1, 25)$$,
 $$VALUES (1, 0::bigint, NULL::uuid)$$,
 'an empty result still returns its total in one row');

SELECT is(public.platform_organization_detail('e8690000-0000-4000-8000-000000000999'), NULL::jsonb, 'a missing Organization has no detail');
SELECT is((public.platform_organization_detail('e8690000-0000-4000-8000-000000000101')->>'personnelCount')::integer, 2, 'detail counts active personnel');
SELECT is(public.platform_organization_detail('e8690000-0000-4000-8000-000000000101')->'members'->0->>'email', 'alpha-owner-dir@example.test', 'detail lists the owner first');
SELECT is(public.platform_organization_detail('e8690000-0000-4000-8000-000000000101')->'members'->1->>'role', 'member', 'detail lists members with their roles');
SELECT isnt(public.platform_organization_detail('e8690000-0000-4000-8000-000000000101')->'members'->0->>'lastSignInAt', NULL, 'detail carries the last sign-in');
SELECT is(jsonb_array_length(public.platform_organization_detail('e8690000-0000-4000-8000-000000000101')->'invitations'), 1, 'detail lists pending invitations only');
SELECT is(public.platform_organization_detail('e8690000-0000-4000-8000-000000000104')->'suspension'->>'reason', 'Synthetic abuse report', 'detail carries the suspension reason');
SELECT is(public.platform_organization_detail('e8690000-0000-4000-8000-000000000104')->'suspension'->>'suspendedByEmail', 'operator-dir@example.test', 'detail names the operator who suspended');
SELECT is(public.platform_organization_detail('e8690000-0000-4000-8000-000000000101')->'suspension', 'null'::jsonb, 'an active Organization has no suspension');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e8690000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"aal":"aal2"}', true);
SELECT throws_ok($$SELECT * FROM public.platform_list_organizations('', 'all', 1, 25)$$, '42501', NULL, 'a signed-in non-operator cannot call the list');
SELECT throws_ok($$SELECT public.platform_organization_detail('e8690000-0000-4000-8000-000000000101')$$, '42501', NULL, 'a signed-in non-operator cannot read Organization detail');
SELECT throws_ok($$SELECT public.platform_suspend_organization('e8690000-0000-4000-8000-000000000001', 'e8690000-0000-4000-8000-000000000101', 'Forged', now())$$, '42501', NULL, 'a signed-in non-operator cannot forge the actor of a suspension');
SELECT throws_ok($$SELECT public.platform_unsuspend_organization('e8690000-0000-4000-8000-000000000001', 'e8690000-0000-4000-8000-000000000104')$$, '42501', NULL, 'a signed-in non-operator cannot unsuspend');
SELECT throws_ok($$SELECT count(*) FROM public.organization_suspensions$$, '42501', NULL, 'an Organization owner cannot read the operator note');
SELECT throws_ok($$INSERT INTO public.organization_suspensions(organization_id, reason, suspended_at) VALUES ('e8690000-0000-4000-8000-000000000101', 'self-service', now())$$, '42501', NULL, 'a signed-in account cannot write a suspension note');
SELECT set_config('request.jwt.claim.sub', 'e8690000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$SELECT * FROM public.platform_list_organizations('', 'all', 1, 25)$$, '42501', NULL, 'an operator session cannot call the list directly, only the server can');
SELECT throws_ok($$SELECT public.platform_suspend_organization('e8690000-0000-4000-8000-000000000001', 'e8690000-0000-4000-8000-000000000101', 'Direct', now())$$, '42501', NULL, 'an operator session cannot suspend directly, bypassing MFA and audit');
SELECT throws_ok($$DELETE FROM public.organization_suspensions$$, '42501', NULL, 'an operator session cannot clear a suspension directly');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.platform_list_organizations('', 'all', 1, 25)$$, '42501', NULL, 'an anonymous caller cannot call the list');
RESET ROLE;

SELECT is(public.platform_unsuspend_organization('e8690000-0000-4000-8000-000000000001', 'e8690000-0000-4000-8000-000000000104'), true, 'an operator can unsuspend');
SELECT is((SELECT count(*)::integer FROM public.organization_suspensions WHERE organization_id = 'e8690000-0000-4000-8000-000000000104'), 0, 'unsuspending clears the reason');
SELECT is((SELECT suspended_at IS NULL FROM public.organizations WHERE id = 'e8690000-0000-4000-8000-000000000104'), true, 'unsuspending lifts the suspension');

SELECT * FROM finish();
ROLLBACK;
