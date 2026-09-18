BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
 ('10000000-0000-4000-8000-000000000201', 'session-owner@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
 ('10000000-0000-4000-8000-000000000202', 'session-other@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now());
INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
VALUES
 ('20000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000201', '2026-09-14T12:00:00Z', '2026-09-16T12:00:00Z'),
 ('20000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000201', '2026-09-16T11:00:00Z', '2026-09-16T12:00:00Z'),
 ('20000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000202', '2026-09-16T10:00:00Z', '2026-09-16T12:00:00Z');

SELECT ok(NOT has_function_privilege('anon', 'public.get_current_session_started_at()', 'EXECUTE'), 'anonymous cannot read session provenance');
SELECT ok(NOT has_function_privilege('service_role', 'public.get_current_session_started_at()', 'EXECUTE'), 'service role is not a caller of session provenance');
SELECT ok(has_function_privilege('authenticated', 'public.get_current_session_started_at()', 'EXECUTE'), 'authenticated session can request its own start');
SELECT ok(NOT has_table_privilege('authenticated', 'auth.sessions', 'SELECT'), 'no direct session-table grant added');
SELECT is((SELECT proconfig FROM pg_proc WHERE oid = 'public.get_current_session_started_at()'::regprocedure), ARRAY['search_path=""'], 'definer has an empty search path');

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT public.get_current_session_started_at()', '42501', NULL, 'anonymous execution denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000201","session_id":"20000000-0000-4000-8000-000000000201","role":"authenticated","iat":1789559999,"aal":"aal2","amr":[{"method":"totp","timestamp":1789559999}]}', true);
SELECT is(public.get_current_session_started_at(), '2026-09-14T12:00:00Z'::timestamptz, 'fresh issue/MFA claims do not renew the old session');
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000201","session_id":"20000000-0000-4000-8000-000000000202"}', true);
SELECT is(public.get_current_session_started_at(), '2026-09-16T11:00:00Z'::timestamptz, 'another session of the same account has a distinct start');
RESET ROLE;
UPDATE auth.users SET last_sign_in_at = '2026-09-16T12:00:00Z' WHERE id = '10000000-0000-4000-8000-000000000201';
UPDATE auth.sessions SET updated_at = '2026-09-16T13:00:00Z', aal = 'aal2' WHERE id = '20000000-0000-4000-8000-000000000201';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000201","session_id":"20000000-0000-4000-8000-000000000201"}', true);
SELECT is(public.get_current_session_started_at(), '2026-09-14T12:00:00Z'::timestamptz, 'account login and session updates preserve original provenance');
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000202","session_id":"20000000-0000-4000-8000-000000000201"}', true);
SELECT is(public.get_current_session_started_at(), NULL::timestamptz, 'another user cannot read the session');
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000202","session_id":"20000000-0000-4000-8000-000000000203"}', true);
SELECT is(public.get_current_session_started_at(), '2026-09-16T10:00:00Z'::timestamptz, 'second user can read only its own session');
SELECT set_config('request.jwt.claims', '{"session_id":"20000000-0000-4000-8000-000000000203"}', true);
SELECT is(public.get_current_session_started_at(), NULL::timestamptz, 'absent user has no provenance');
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000201"}', true);
SELECT is(public.get_current_session_started_at(), NULL::timestamptz, 'absent session claim has no provenance');
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000201","session_id":""}', true);
SELECT is(public.get_current_session_started_at(), NULL::timestamptz, 'empty session claim has no provenance');
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000201","session_id":"malformed"}', true);
SELECT throws_ok('SELECT public.get_current_session_started_at()', '22P02', NULL, 'malformed session claim fails closed');
RESET ROLE;
DELETE FROM auth.sessions WHERE id = '20000000-0000-4000-8000-000000000201';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000201","session_id":"20000000-0000-4000-8000-000000000201"}', true);
SELECT is(public.get_current_session_started_at(), NULL::timestamptz, 'revoked session cannot fall back to another same-account session');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
