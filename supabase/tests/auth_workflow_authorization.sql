BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

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
		'10000000-0000-4000-8000-000000001034',
		'authenticated',
		'authenticated',
		'authz-platform-1034@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000001035',
		'authenticated',
		'authenticated',
		'authz-manager-1034@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000001036',
		'authenticated',
		'authenticated',
		'authz-viewer-1034@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	);

INSERT INTO public.organizations (id, name, created_by)
VALUES (
	'20000000-0000-4000-8000-000000001034',
	'Auth Workflow Authorization Test',
	'10000000-0000-4000-8000-000000001035'
);

INSERT INTO public.organization_memberships (
	id,
	organization_id,
	user_id,
	role,
	member_preset,
	capability_overrides,
	access_scope_kind,
	access_scope_group_ids
)
VALUES
	(
		'30000000-0000-4000-8000-000000001034',
		'20000000-0000-4000-8000-000000001034',
		'10000000-0000-4000-8000-000000001035',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	),
	(
		'30000000-0000-4000-8000-000000001035',
		'20000000-0000-4000-8000-000000001034',
		'10000000-0000-4000-8000-000000001036',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	);

INSERT INTO public.platform_admins (id, user_id, role, is_active)
VALUES (
	'40000000-0000-4000-8000-000000001034',
	'10000000-0000-4000-8000-000000001034',
	'support',
	true
);

INSERT INTO public.access_requests (id, email, name, status)
VALUES
	(
		'50000000-0000-4000-8000-000000001034',
		'authz-request-1034@example.test',
		'Authz Request',
		'approved'
	),
	(
		'50000000-0000-4000-8000-000000001035',
		'authz-request-1035@example.test',
		'Authz Request Two',
		'approved'
	);

INSERT INTO public.organization_invitations (
	id,
	organization_id,
	email,
	invited_by,
	status,
	role,
	member_preset,
	capability_overrides,
	access_scope_kind,
	access_scope_group_ids
)
VALUES
	(
		'60000000-0000-4000-8000-000000001034',
		'20000000-0000-4000-8000-000000001034',
		'authz-request-1034@example.test',
		'10000000-0000-4000-8000-000000001035',
		'pending',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	),
	(
		'60000000-0000-4000-8000-000000001035',
		'20000000-0000-4000-8000-000000001034',
		'authz-request-1035@example.test',
		'10000000-0000-4000-8000-000000001035',
		'pending',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	);

INSERT INTO public.access_request_organization_invitation_links (
	id,
	access_request_id,
	organization_invitation_id,
	organization_id,
	invited_by,
	invited_at,
	intended_membership_role,
	intended_permissions,
	intended_member_preset,
	intended_capability_overrides,
	intended_access_scope_kind,
	intended_access_scope_group_ids
)
VALUES (
	'70000000-0000-4000-8000-000000001034',
	'50000000-0000-4000-8000-000000001034',
	'60000000-0000-4000-8000-000000001034',
	'20000000-0000-4000-8000-000000001034',
	'10000000-0000-4000-8000-000000001035',
	now(),
	'member',
	'{}'::jsonb,
	'viewer',
	'{}'::jsonb,
	'organization',
	ARRAY[]::uuid[]
);

INSERT INTO public.organization_invitation_email_outbox (
	id,
	organization_id,
	invitation_id,
	recipient
)
VALUES (
	'80000000-0000-4000-8000-000000001034',
	'20000000-0000-4000-8000-000000001034',
	'60000000-0000-4000-8000-000000001034',
	'authz-request-1034@example.test'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
	$$ SELECT count(*) FROM public.access_request_organization_invitation_links $$,
	'42501',
	'permission denied for table access_request_organization_invitation_links',
	'anon cannot read access-request invitation links'
);
SELECT throws_ok(
	$$ SELECT count(*) FROM public.organization_invitation_email_outbox $$,
	'42501',
	'permission denied for table organization_invitation_email_outbox',
	'anon cannot read organization invitation email outbox'
);
SELECT is(
	has_function_privilege(
		'anon',
		'public.check_account_setup_rate_limit(text, integer, integer, timestamp with time zone)',
		'EXECUTE'
	),
	false,
	'anon cannot execute account setup rate-limit RPC'
);
SELECT is(
	has_function_privilege(
		'anon',
		'public.check_durable_rate_limit(text, integer, integer, timestamp with time zone)',
		'EXECUTE'
	),
	false,
	'anon cannot execute durable rate-limit RPC'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000001036', true);
SELECT set_config('request.jwt.claim.email', 'authz-viewer-1034@example.test', true);
SELECT is(
	(SELECT count(*)::integer FROM public.access_request_organization_invitation_links),
	0,
	'ordinary authenticated users cannot see access-request invitation links'
);
SELECT is(
	(SELECT count(*)::integer FROM public.organization_invitation_email_outbox),
	0,
	'ordinary authenticated users cannot see organization invitation email outbox rows'
);
SELECT is(
	has_function_privilege(
		'authenticated',
		'public.check_account_setup_rate_limit(text, integer, integer, timestamp with time zone)',
		'EXECUTE'
	),
	false,
	'ordinary authenticated users cannot execute account setup rate-limit RPC'
);
SELECT is(
	has_function_privilege(
		'authenticated',
		'public.check_durable_rate_limit(text, integer, integer, timestamp with time zone)',
		'EXECUTE'
	),
	false,
	'ordinary authenticated users cannot execute durable rate-limit RPC'
);
SELECT throws_ok(
	$$
		INSERT INTO public.access_request_organization_invitation_links (
			access_request_id,
			organization_invitation_id,
			organization_id,
			invited_by,
			invited_at,
			intended_membership_role,
			intended_permissions,
			intended_capability_overrides,
			intended_access_scope_kind,
			intended_access_scope_group_ids
		)
		VALUES (
			'50000000-0000-4000-8000-000000001035',
			'60000000-0000-4000-8000-000000001035',
			'20000000-0000-4000-8000-000000001034',
			'10000000-0000-4000-8000-000000001036',
			now(),
			'member',
			'{}'::jsonb,
			'{}'::jsonb,
			'organization',
			ARRAY[]::uuid[]
		)
	$$,
	'42501',
	'permission denied for table access_request_organization_invitation_links',
	'ordinary authenticated users cannot manage access-request invitation links'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000001034', true);
SELECT set_config('request.jwt.claim.email', 'authz-platform-1034@example.test', true);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.access_request_organization_invitation_links
		WHERE id = '70000000-0000-4000-8000-000000001034'
	),
	1,
	'platform admins can read access-request invitation links'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000001035', true);
SELECT set_config('request.jwt.claim.email', 'authz-manager-1034@example.test', true);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.organization_invitation_email_outbox
		WHERE id = '80000000-0000-4000-8000-000000001034'
	),
	1,
	'member-management users can read organization invitation email outbox rows'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(
	$$
		INSERT INTO public.access_request_organization_invitation_links (
			id,
			access_request_id,
			organization_invitation_id,
			organization_id,
			invited_by,
			invited_at,
			intended_membership_role,
			intended_permissions,
			intended_member_preset,
			intended_capability_overrides,
			intended_access_scope_kind,
			intended_access_scope_group_ids
		)
		VALUES (
			'70000000-0000-4000-8000-000000001035',
			'50000000-0000-4000-8000-000000001035',
			'60000000-0000-4000-8000-000000001035',
			'20000000-0000-4000-8000-000000001034',
			'10000000-0000-4000-8000-000000001035',
			now(),
			'member',
			'{}'::jsonb,
			'viewer',
			'{}'::jsonb,
			'organization',
			ARRAY[]::uuid[]
		)
	$$,
	'service role can manage access-request invitation links'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.access_request_organization_invitation_links
		WHERE id IN (
			'70000000-0000-4000-8000-000000001034',
			'70000000-0000-4000-8000-000000001035'
		)
	),
	2,
	'service role can read access-request invitation links'
);
SELECT lives_ok(
	$$
		UPDATE public.organization_invitation_email_outbox
		SET status = 'sent', sent_at = now()
		WHERE id = '80000000-0000-4000-8000-000000001034'
	$$,
	'service role can update organization invitation email outbox rows'
);
SELECT is(
	(SELECT status FROM public.organization_invitation_email_outbox WHERE id = '80000000-0000-4000-8000-000000001034'),
	'sent',
	'service role can read organization invitation email outbox rows'
);
SELECT is(
	(SELECT limited FROM public.check_account_setup_rate_limit('authz:service:account-setup', 60, 1, now())),
	false,
	'service role can execute account setup rate-limit RPC'
);
SELECT is(
	(SELECT limited FROM public.check_durable_rate_limit('authz:service:durable', 60, 1, now())),
	false,
	'service role can execute durable rate-limit RPC'
);

RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
