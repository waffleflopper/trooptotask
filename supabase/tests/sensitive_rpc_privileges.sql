BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(9);

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

SELECT * FROM finish();

ROLLBACK;
