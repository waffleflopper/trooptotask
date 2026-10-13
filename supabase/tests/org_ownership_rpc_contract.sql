BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

INSERT INTO auth.users (
	instance_id,
	id,
	aud,
	role,
	email,
	encrypted_password,
	email_confirmed_at,
	raw_app_meta_data,
	raw_user_meta_data,
	created_at,
	updated_at
)
VALUES
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000003001',
		'authenticated',
		'authenticated',
		'Org-RPC-Owner-3001@Example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000003002',
		'authenticated',
		'authenticated',
		'org-rpc-target-3002@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000003003',
		'authenticated',
		'authenticated',
		'org-rpc-unconfirmed-3003@example.test',
		'',
		NULL,
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	);

SELECT set_config(
	'trooptotask.test.defaults',
	$defaults${
		"groups": [
			{"name": "Group One", "sort_order": 0, "organization_id": "00000000-0000-4000-8000-0000000000ff"},
			{"name": "Group Two", "sort_order": 1}
		],
		"status_types": [{"name": "Status One", "color": "#111111", "text_color": "#ffffff", "sort_order": 0}],
		"assignment_types": [
			{"name": "Assignment One", "short_name": "A1", "assign_to": "personnel", "color": "#222222", "sort_order": 0}
		],
		"special_days": [{"date": "2026-01-01", "name": "Holiday One", "type": "federal-holiday"}],
		"rank_catalog": [
			{"code": "SGT", "label": "Sergeant", "service": "army", "category": "enlisted", "pay_grade": "E-5",
			 "state": "active", "source": "built-in", "sort_order": 0}
		]
	}$defaults$,
	true
);

CREATE FUNCTION pg_temp.totals() RETURNS jsonb LANGUAGE sql AS $$
	SELECT jsonb_build_object(
		'organizations', (SELECT count(*) FROM public.organizations),
		'memberships', (SELECT count(*) FROM public.organization_memberships),
		'groups', (SELECT count(*) FROM public.groups),
		'status_types', (SELECT count(*) FROM public.status_types),
		'assignment_types', (SELECT count(*) FROM public.assignment_types),
		'special_days', (SELECT count(*) FROM public.special_days),
		'rank_catalog', (SELECT count(*) FROM public.organization_rank_catalog),
		'requests', (SELECT count(*) FROM public.organization_creation_requests)
	)
$$;
CREATE TEMP TABLE baseline_totals AS SELECT pg_temp.totals() AS totals;

SELECT ok(
	NOT has_function_privilege('anon', 'public.create_organization(text, uuid, jsonb)', 'EXECUTE')
		AND has_function_privilege('authenticated', 'public.create_organization(text, uuid, jsonb)', 'EXECUTE'),
	'only authenticated may execute create_organization'
);
SELECT ok(
	to_regprocedure('public.create_org_with_owner(text)') IS NULL,
	'the unrecoverable create_org_with_owner is gone'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
	$$ SELECT public.create_organization('Anonymous Unit', gen_random_uuid(), current_setting('trooptotask.test.defaults')::jsonb) $$,
	'42501',
	'permission denied for function create_organization',
	'anonymous creation is denied'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000003003', true);
SELECT throws_ok(
	$$ SELECT public.create_organization('Unconfirmed Unit', gen_random_uuid(), current_setting('trooptotask.test.defaults')::jsonb) $$,
	'42501',
	'Confirm your email before creating an organization',
	'an unconfirmed email cannot create an Organization'
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000003001', true);

SELECT throws_ok(
	$$ SELECT public.create_organization(NULL::text, gen_random_uuid(), current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'Organization name is required',
	'create_organization rejects null names'
);
SELECT throws_ok(
	$$ SELECT public.create_organization('   ', gen_random_uuid(), current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'Organization name is required',
	'create_organization rejects blank names'
);
SELECT throws_ok(
	$$ SELECT public.create_organization(repeat('x', 101), gen_random_uuid(), current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'Organization name must be 100 characters or fewer',
	'create_organization rejects overlong names'
);
SELECT throws_ok(
	$$ SELECT public.create_organization('Missing Request', NULL::uuid, current_setting('trooptotask.test.defaults')::jsonb) $$,
	'22023',
	'Organization creation request id is required',
	'create_organization requires a request id'
);
SELECT throws_ok(
	$$ SELECT public.create_organization('Missing Defaults', gen_random_uuid(), NULL::jsonb) $$,
	'22023',
	'Organization defaults must be an object',
	'create_organization requires a defaults object'
);
SELECT throws_ok(
	$$ SELECT public.create_organization('Array Defaults', gen_random_uuid(), '[]'::jsonb) $$,
	'22023',
	'Organization defaults must be an object',
	'create_organization rejects array defaults'
);
SELECT throws_ok(
	format(
		$$ SELECT public.create_organization('Missing Key', gen_random_uuid(), %L::jsonb - %L) $$,
		current_setting('trooptotask.test.defaults'),
		key
	),
	'22023',
	format('Organization defaults require a %s array', key),
	format('create_organization rejects defaults without %s', key)
)
FROM unnest(ARRAY['groups', 'status_types', 'assignment_types', 'special_days', 'rank_catalog']) AS key;
SELECT throws_ok(
	format(
		$$ SELECT public.create_organization('Object Key', gen_random_uuid(),
			jsonb_set(%L::jsonb, ARRAY[%L], '{}'::jsonb)) $$,
		current_setting('trooptotask.test.defaults'),
		key
	),
	'22023',
	format('Organization defaults require a %s array', key),
	format('create_organization rejects a non-array %s', key)
)
FROM unnest(ARRAY['groups', 'status_types', 'assignment_types', 'special_days', 'rank_catalog']) AS key;
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM baseline_totals), 'rejected input writes nothing');

CREATE FUNCTION pg_temp.reject_test_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = current_setting('trooptotask.test.fail_table', true) THEN
		RAISE EXCEPTION 'synthetic % insert failure', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END $$;
CREATE TRIGGER reject_test_insert BEFORE INSERT ON public.organizations
	FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_insert();
CREATE TRIGGER reject_test_insert BEFORE INSERT ON public.organization_memberships
	FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_insert();
CREATE TRIGGER reject_test_insert BEFORE INSERT ON public.groups
	FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_insert();
CREATE TRIGGER reject_test_insert BEFORE INSERT ON public.status_types
	FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_insert();
CREATE TRIGGER reject_test_insert BEFORE INSERT ON public.assignment_types
	FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_insert();
CREATE TRIGGER reject_test_insert BEFORE INSERT ON public.special_days
	FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_insert();
CREATE TRIGGER reject_test_insert BEFORE INSERT ON public.organization_rank_catalog
	FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_insert();

-- A failure at any write must roll back the creation request, the Organization and every earlier row.
SELECT set_config('trooptotask.test.fail_table', 'organizations', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.create_organization('Rollback Unit', '30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'synthetic organizations insert failure',
	'an Organization insert failure propagates'
);
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM baseline_totals), 'a failed Organization insert leaves no request or row');

SELECT set_config('trooptotask.test.fail_table', 'organization_memberships', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.create_organization('Rollback Unit', '30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'synthetic organization_memberships insert failure',
	'an owner membership insert failure propagates'
);
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM baseline_totals), 'a failed owner insert leaves no request, Organization or row');

SELECT set_config('trooptotask.test.fail_table', 'groups', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.create_organization('Rollback Unit', '30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'synthetic groups insert failure',
	'a Group default failure propagates'
);
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM baseline_totals), 'a failed Group default leaves no request, Organization or row');

SELECT set_config('trooptotask.test.fail_table', 'status_types', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.create_organization('Rollback Unit', '30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'synthetic status_types insert failure',
	'a status type default failure propagates'
);
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM baseline_totals), 'a failed status type default leaves no request, Organization or row');

SELECT set_config('trooptotask.test.fail_table', 'assignment_types', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.create_organization('Rollback Unit', '30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'synthetic assignment_types insert failure',
	'an assignment type default failure propagates'
);
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM baseline_totals), 'a failed assignment type default leaves no request, Organization or row');

SELECT set_config('trooptotask.test.fail_table', 'special_days', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.create_organization('Rollback Unit', '30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'synthetic special_days insert failure',
	'a holiday default failure propagates'
);
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM baseline_totals), 'a failed holiday default leaves no request, Organization or row');

SELECT set_config('trooptotask.test.fail_table', 'organization_rank_catalog', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
	$$ SELECT public.create_organization('Rollback Unit', '30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb) $$,
	'P0001',
	'synthetic organization_rank_catalog insert failure',
	'a rank default failure propagates'
);
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM baseline_totals), 'a failed rank default leaves no request, Organization or row');

DROP TRIGGER reject_test_insert ON public.organizations;
DROP TRIGGER reject_test_insert ON public.organization_memberships;
DROP TRIGGER reject_test_insert ON public.groups;
DROP TRIGGER reject_test_insert ON public.status_types;
DROP TRIGGER reject_test_insert ON public.assignment_types;
DROP TRIGGER reject_test_insert ON public.special_days;
DROP TRIGGER reject_test_insert ON public.organization_rank_catalog;

-- The same request id that just failed now completes, since nothing was left behind.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000003001', true);
SELECT set_config(
	'trooptotask.test.created_org_id',
	public.create_organization(
		'RPC Contract Unit',
		'30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb
	)::text,
	true
);
RESET ROLE;

SELECT is(
	(SELECT created_by FROM public.organizations WHERE id = current_setting('trooptotask.test.created_org_id')::uuid),
	'10000000-0000-4000-8000-000000003001'::uuid,
	'create_organization records the authenticated user as creator'
);
SELECT is(
	(SELECT count(*)::integer FROM public.organizations WHERE name = 'RPC Contract Unit'),
	1,
	'the failed attempts left no duplicate Organization'
);
SELECT results_eq(
	$$ SELECT user_id, role::text, email, member_preset, capability_overrides, access_scope_kind, cardinality(access_scope_group_ids)
		FROM public.organization_memberships
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid $$,
	$$ VALUES (
		'10000000-0000-4000-8000-000000003001'::uuid,
		'owner',
		'org-rpc-owner-3001@example.test',
		'editor',
		'{}'::jsonb,
		'organization',
		0
	) $$,
	'create_organization creates one owner membership with the normalized auth.users email'
);
SELECT results_eq(
	$$ SELECT name, sort_order FROM public.groups
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid ORDER BY sort_order $$,
	$$ VALUES ('Group One'::text, 0), ('Group Two', 1) $$,
	'create_organization creates the payload Groups for the new Organization only'
);
SELECT results_eq(
	$$ SELECT name, color, text_color, sort_order FROM public.status_types
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid $$,
	$$ VALUES ('Status One'::text, '#111111', '#ffffff', 0) $$,
	'create_organization creates the payload status types'
);
SELECT results_eq(
	$$ SELECT name, short_name, assign_to, color, sort_order FROM public.assignment_types
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid $$,
	$$ VALUES ('Assignment One'::text, 'A1', 'personnel', '#222222', 0) $$,
	'create_organization creates the payload assignment types'
);
SELECT results_eq(
	$$ SELECT date, name, type FROM public.special_days
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid $$,
	$$ VALUES ('2026-01-01'::date, 'Holiday One'::text, 'federal-holiday') $$,
	'create_organization creates the payload special days'
);
SELECT results_eq(
	$$ SELECT code, label, service, category, pay_grade, state, source, sort_order FROM public.organization_rank_catalog
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid $$,
	$$ VALUES ('SGT'::text, 'Sergeant', 'army', 'enlisted', 'E-5', 'active', 'built-in', 0) $$,
	'create_organization creates the payload rank catalog'
);
SELECT is(
	(SELECT count(*)::integer FROM public.groups WHERE organization_id = '00000000-0000-4000-8000-0000000000ff'),
	0,
	'a payload organization_id is ignored'
);
SELECT is(
	(SELECT organization_id FROM public.organization_creation_requests
		WHERE user_id = '10000000-0000-4000-8000-000000003001' AND request_id = '30000000-0000-4000-8000-000000000001'),
	current_setting('trooptotask.test.created_org_id')::uuid,
	'the request identity points at the created Organization'
);

CREATE TEMP TABLE after_first_totals AS SELECT pg_temp.totals() AS totals;

-- Retrying the same request returns the same Organization and writes nothing.
SET LOCAL ROLE authenticated;
SELECT is(
	public.create_organization('Retry With Another Name', '30000000-0000-4000-8000-000000000001', '{"groups": [{"name": "Extra", "sort_order": 9}], "status_types": [], "assignment_types": [], "special_days": [], "rank_catalog": []}'::jsonb),
	current_setting('trooptotask.test.created_org_id')::uuid,
	'the same user and request id returns the same Organization'
);
RESET ROLE;
SELECT is(pg_temp.totals(), (SELECT totals FROM after_first_totals), 'a retried request adds no rows');

-- A new request is a new, intentional creation even with the same name.
SET LOCAL ROLE authenticated;
SELECT set_config(
	'trooptotask.test.second_org_id',
	public.create_organization('RPC Contract Unit', '30000000-0000-4000-8000-000000000002',
		current_setting('trooptotask.test.defaults')::jsonb)::text,
	true
);
RESET ROLE;
SELECT isnt(
	current_setting('trooptotask.test.second_org_id')::uuid,
	current_setting('trooptotask.test.created_org_id')::uuid,
	'a new request id creates a second Organization'
);
SELECT is(
	(SELECT count(*)::integer FROM public.organizations WHERE name = 'RPC Contract Unit'),
	2,
	'both same-name Organizations exist'
);
SELECT is(
	(SELECT count(*)::integer FROM public.groups
		WHERE organization_id = current_setting('trooptotask.test.second_org_id')::uuid),
	2,
	'the second Organization receives its own defaults'
);

-- Request ids belong to the user, so another user's identical id is a separate creation.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000003002', true);
SELECT set_config(
	'trooptotask.test.other_org_id',
	public.create_organization('Other User Unit', '30000000-0000-4000-8000-000000000001',
		current_setting('trooptotask.test.defaults')::jsonb)::text,
	true
);
RESET ROLE;
SELECT results_eq(
	$$ SELECT m.user_id, m.role::text, o.created_by FROM public.organization_memberships m
		JOIN public.organizations o ON o.id = m.organization_id
		WHERE m.organization_id = current_setting('trooptotask.test.other_org_id')::uuid $$,
	$$ VALUES ('10000000-0000-4000-8000-000000003002'::uuid, 'owner', '10000000-0000-4000-8000-000000003002'::uuid) $$,
	'a different user reusing a request id gets their own Organization'
);
SELECT isnt(
	current_setting('trooptotask.test.other_org_id')::uuid,
	current_setting('trooptotask.test.created_org_id')::uuid,
	'the other user does not receive the first user''s Organization'
);

-- Only the definer function may touch the request identity.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000003001', true);
SELECT throws_ok(
	$$ SELECT count(*) FROM public.organization_creation_requests $$,
	'42501',
	'permission denied for table organization_creation_requests',
	'authenticated cannot read creation requests'
);
SELECT throws_ok(
	$$ INSERT INTO public.organization_creation_requests (user_id, request_id, organization_id)
		VALUES ('10000000-0000-4000-8000-000000003001', gen_random_uuid(), current_setting('trooptotask.test.created_org_id')::uuid) $$,
	'42501',
	'permission denied for table organization_creation_requests',
	'authenticated cannot insert creation requests'
);
SELECT throws_ok(
	$$ UPDATE public.organization_creation_requests SET request_id = gen_random_uuid() $$,
	'42501',
	'permission denied for table organization_creation_requests',
	'authenticated cannot update creation requests'
);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
	$$ SELECT count(*) FROM public.organization_creation_requests $$,
	'42501',
	'permission denied for table organization_creation_requests',
	'anonymous callers cannot read creation requests'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000003001', true);
RESET ROLE;
SET LOCAL ROLE service_role;

INSERT INTO public.organization_memberships (
	organization_id,
	user_id,
	role,
	member_preset,
	capability_overrides,
	access_scope_kind,
	access_scope_group_ids
)
VALUES (
	current_setting('trooptotask.test.created_org_id')::uuid,
	'10000000-0000-4000-8000-000000003002',
	'member',
	'viewer',
	'{"calendar": "view"}'::jsonb,
	'groups',
	ARRAY['20000000-0000-4000-8000-000000003002']::uuid[]
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000003001', true);
SELECT set_config('request.jwt.claim.email', 'org-rpc-owner-3001@example.test', true);
SELECT set_config('request.jwt.claims', '{"aal":"aal2"}', true);
SELECT public.transfer_org_ownership(
	current_setting('trooptotask.test.created_org_id')::uuid,
	'10000000-0000-4000-8000-000000003002'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT ok(
	EXISTS (
		SELECT 1
		FROM public.organization_memberships
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid
			AND user_id = '10000000-0000-4000-8000-000000003002'
			AND role = 'owner'
			AND member_preset = 'editor'
			AND capability_overrides = '{}'::jsonb
			AND access_scope_kind = 'organization'
			AND cardinality(access_scope_group_ids) = 0
	),
	'transfer_org_ownership promotes the target to owner with replacement access fields'
);

SELECT ok(
	EXISTS (
		SELECT 1
		FROM public.organization_memberships
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid
			AND user_id = '10000000-0000-4000-8000-000000003001'
			AND role = 'admin'
			AND member_preset = 'editor'
			AND capability_overrides = '{}'::jsonb
			AND access_scope_kind = 'organization'
			AND cardinality(access_scope_group_ids) = 0
	),
	'transfer_org_ownership demotes the caller to admin with replacement access fields'
);

RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
