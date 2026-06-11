BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

SELECT is(
	pg_get_functiondef('public.create_org_with_owner(text)'::regprocedure)
		~ '(can_view_|can_edit_|can_manage_members|scoped_group_id)',
	false,
	'create_org_with_owner does not reference dropped membership access columns'
);

SELECT is(
	pg_get_functiondef('public.transfer_org_ownership(uuid, uuid)'::regprocedure)
		~ '(can_view_|can_edit_|can_manage_members|scoped_group_id)',
	false,
	'transfer_org_ownership does not reference dropped membership access columns'
);

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
		'org-rpc-owner-3001@example.test',
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
	);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000003001', true);
SELECT set_config('request.jwt.claim.email', 'org-rpc-owner-3001@example.test', true);
SELECT set_config('trooptotask.test.created_org_id', public.create_org_with_owner('RPC Contract Unit')::text, true);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT is(
	(
		SELECT created_by
		FROM public.organizations
		WHERE id = current_setting('trooptotask.test.created_org_id')::uuid
	),
	'10000000-0000-4000-8000-000000003001'::uuid,
	'create_org_with_owner records the authenticated user as creator'
);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.organization_memberships
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid
			AND user_id = '10000000-0000-4000-8000-000000003001'
			AND role = 'owner'
	),
	1,
	'create_org_with_owner creates one owner membership for the authenticated user'
);

SELECT ok(
	EXISTS (
		SELECT 1
		FROM public.organization_memberships
		WHERE organization_id = current_setting('trooptotask.test.created_org_id')::uuid
			AND user_id = '10000000-0000-4000-8000-000000003001'
			AND role = 'owner'
			AND member_preset = 'editor'
			AND capability_overrides = '{}'::jsonb
			AND access_scope_kind = 'organization'
			AND cardinality(access_scope_group_ids) = 0
	),
	'create_org_with_owner stores replacement access fields for the owner membership'
);

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
