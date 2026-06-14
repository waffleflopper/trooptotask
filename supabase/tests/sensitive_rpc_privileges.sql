BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(28);

SELECT is(
	has_function_privilege('anon', 'public.search_users_by_email(text, integer)', 'EXECUTE'),
	false,
	'anon cannot execute user email search RPC'
);
SELECT is(
	has_function_privilege('anon', 'public.cleanup_old_audit_logs()', 'EXECUTE'),
	false,
	'anon cannot execute audit-log cleanup RPC'
);
SELECT is(
	has_function_privilege('anon', 'public.cleanup_old_webhook_events()', 'EXECUTE'),
	false,
	'anon cannot execute webhook cleanup RPC'
);
SELECT is(
	has_function_privilege('anon', 'public.reject_access_request_and_block_linked_invitations(uuid, uuid)', 'EXECUTE'),
	false,
	'anon cannot execute access-request rejection mutation RPC'
);
SELECT is(
	has_function_privilege('anon', 'public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text)', 'EXECUTE'),
	false,
	'anon cannot execute member-cap invitation mutation RPC'
);
SELECT is(
	has_function_privilege('anon', 'public.count_platform_users()', 'EXECUTE'),
	false,
	'anon cannot execute platform user count RPC'
);
SELECT is(
	has_function_privilege('anon', 'public.daily_signups_last_30_days()', 'EXECUTE'),
	false,
	'anon cannot execute daily signup count RPC'
);
SELECT is(
	has_function_privilege('anon', 'public.count_org_personnel(uuid)', 'EXECUTE'),
	false,
	'anon cannot execute organization personnel count RPC'
);
SELECT is(
	has_function_privilege('anon', 'public.is_user_suspended(uuid)', 'EXECUTE'),
	false,
	'anon cannot execute user suspension state RPC'
);

SELECT is(
	has_function_privilege('authenticated', 'public.search_users_by_email(text, integer)', 'EXECUTE'),
	false,
	'authenticated users cannot execute user email search RPC'
);
SELECT is(
	has_function_privilege('authenticated', 'public.cleanup_old_audit_logs()', 'EXECUTE'),
	false,
	'authenticated users cannot execute audit-log cleanup RPC'
);
SELECT is(
	has_function_privilege('authenticated', 'public.cleanup_old_webhook_events()', 'EXECUTE'),
	false,
	'authenticated users cannot execute webhook cleanup RPC'
);
SELECT is(
	has_function_privilege(
		'authenticated',
		'public.reject_access_request_and_block_linked_invitations(uuid, uuid)',
		'EXECUTE'
	),
	false,
	'authenticated users cannot execute access-request rejection mutation RPC'
);
SELECT is(
	has_function_privilege(
		'authenticated',
		'public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text)',
		'EXECUTE'
	),
	false,
	'authenticated users cannot execute member-cap invitation mutation RPC'
);
SELECT is(
	has_function_privilege('authenticated', 'public.count_platform_users()', 'EXECUTE'),
	false,
	'authenticated users cannot execute platform user count RPC'
);
SELECT is(
	has_function_privilege('authenticated', 'public.daily_signups_last_30_days()', 'EXECUTE'),
	false,
	'authenticated users cannot execute daily signup count RPC'
);
SELECT is(
	has_function_privilege('authenticated', 'public.count_org_personnel(uuid)', 'EXECUTE'),
	false,
	'authenticated users cannot execute organization personnel count RPC'
);
SELECT is(
	has_function_privilege('authenticated', 'public.is_user_suspended(uuid)', 'EXECUTE'),
	true,
	'authenticated users can execute guarded self-scoped user suspension state RPC'
);

SELECT is(
	has_function_privilege('service_role', 'public.search_users_by_email(text, integer)', 'EXECUTE'),
	true,
	'service role can execute user email search RPC'
);
SELECT is(
	has_function_privilege('service_role', 'public.cleanup_old_audit_logs()', 'EXECUTE'),
	true,
	'service role can execute audit-log cleanup RPC'
);
SELECT is(
	has_function_privilege('service_role', 'public.cleanup_old_webhook_events()', 'EXECUTE'),
	true,
	'service role can execute webhook cleanup RPC'
);
SELECT is(
	has_function_privilege(
		'service_role',
		'public.reject_access_request_and_block_linked_invitations(uuid, uuid)',
		'EXECUTE'
	),
	true,
	'service role can execute access-request rejection mutation RPC'
);
SELECT is(
	has_function_privilege(
		'service_role',
		'public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text)',
		'EXECUTE'
	),
	true,
	'service role can execute member-cap invitation mutation RPC'
);
SELECT is(
	has_function_privilege('service_role', 'public.count_platform_users()', 'EXECUTE'),
	true,
	'service role can execute platform user count RPC'
);
SELECT is(
	has_function_privilege('service_role', 'public.daily_signups_last_30_days()', 'EXECUTE'),
	true,
	'service role can execute daily signup count RPC'
);
SELECT is(
	has_function_privilege('service_role', 'public.count_org_personnel(uuid)', 'EXECUTE'),
	true,
	'service role can execute organization personnel count RPC'
);
SELECT is(
	has_function_privilege('service_role', 'public.is_user_suspended(uuid)', 'EXECUTE'),
	true,
	'service role can execute user suspension state RPC'
);

SELECT is(
	to_regprocedure('public.create_clinic_with_owner(text)'),
	NULL::regprocedure,
	'legacy clinic owner RPC is absent'
);

SELECT * FROM finish();

ROLLBACK;
