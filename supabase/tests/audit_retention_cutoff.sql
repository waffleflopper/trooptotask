-- Sign-in, failed sign-in, MFA and rate-limit entries keep for 90 days, every other entry for 3 years. Only the server
-- runs the cleanup, and it removes exactly the rows past their own limit.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('d2560000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

SELECT is((SELECT count(*)::integer FROM public.audit_logs
  WHERE "timestamp" < now() - interval '3 years'
    OR (action = ANY (ARRAY['auth.login_success', 'auth.login_failure', 'auth.mfa_verify', 'security.rate_limit_violation'])
      AND "timestamp" < now() - interval '90 days')),
  0, 'the disposable baseline has no unrelated expired Audit rows');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES (pg_temp.id('1'), 'authenticated', 'authenticated', 'audit-retention-cutoff@example.test', now());
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Audit retention Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Audit retention Bravo', pg_temp.id('1'));

INSERT INTO public.audit_logs (id, "timestamp", user_id, org_id, action, resource_type, details, severity) VALUES
  (pg_temp.id('301'), now() - interval '90 days' - interval '1 microsecond', pg_temp.id('1'), pg_temp.id('101'), 'auth.login_success', 'user', '{"saved": "short, past 90 days"}', 'info'),
  (pg_temp.id('302'), now() - interval '90 days' - interval '1 microsecond', NULL, NULL, 'auth.login_failure', 'user', '{"saved": "short, global, past 90 days"}', 'warning'),
  (pg_temp.id('303'), now() - interval '90 days' - interval '1 microsecond', pg_temp.id('1'), pg_temp.id('102'), 'auth.mfa_verify', 'user', '{"saved": "short, past 90 days"}', 'info'),
  (pg_temp.id('304'), now() - interval '90 days' - interval '1 microsecond', NULL, pg_temp.id('101'), 'security.rate_limit_violation', 'request', '{"saved": "short, past 90 days"}', 'warning'),
  (pg_temp.id('305'), now() - interval '90 days', pg_temp.id('1'), pg_temp.id('101'), 'auth.login_success', 'user', '{"saved": "short, exactly 90 days"}', 'info'),
  (pg_temp.id('306'), now() - interval '90 days' + interval '1 microsecond', pg_temp.id('1'), pg_temp.id('101'), 'auth.login_failure', 'user', '{"saved": "short, inside 90 days"}', 'warning'),
  (pg_temp.id('307'), now() - interval '2 years', pg_temp.id('1'), pg_temp.id('101'), 'availability.created', 'availability', '{"saved": "other, past 90 days"}', 'info'),
  (pg_temp.id('308'), now() - interval '3 years' - interval '1 microsecond', pg_temp.id('1'), pg_temp.id('101'), 'availability.created', 'availability', '{"saved": "other, past 3 years"}', 'info'),
  (pg_temp.id('309'), now() - interval '3 years' - interval '1 microsecond', NULL, NULL, 'platform.retired_action', 'synthetic', '{"saved": "other global, past 3 years"}', 'critical'),
  (pg_temp.id('310'), now() - interval '3 years' - interval '1 microsecond', pg_temp.id('1'), pg_temp.id('102'), 'auth.login_success', 'user', '{"saved": "short, past 3 years"}', 'info'),
  (pg_temp.id('311'), now() - interval '3 years', pg_temp.id('1'), pg_temp.id('102'), 'availability.deleted', 'availability', '{"saved": "other, exactly 3 years"}', 'info'),
  (pg_temp.id('312'), now() - interval '3 years' + interval '1 microsecond', pg_temp.id('1'), pg_temp.id('102'), 'personnel.document.opened', 'personnel_document', '{"saved": "other, inside 3 years"}', 'info'),
  (pg_temp.id('313'), now(), NULL, NULL, 'security.rate_limit_violation', 'request', '{"saved": "short, current"}', 'warning');
CREATE TEMP TABLE audit_retention_before AS SELECT id, to_jsonb(log) AS row_data FROM public.audit_logs AS log;

SELECT ok(NOT has_function_privilege('anon', 'public.cleanup_old_audit_logs()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.cleanup_old_audit_logs()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'audit_private.short_retention_actions()', 'EXECUTE'),
  'a signed-in client cannot run the cleanup');
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('1'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.cleanup_old_audit_logs() $$, '42501', NULL, 'a signed-in member is refused the cleanup');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role": "service_role"}', true);
SET LOCAL ROLE service_role;
SELECT is(public.cleanup_old_audit_logs(), 7,
  'cleanup deletes the short kinds past 90 days and every kind past 3 years, and nothing else');
RESET ROLE;
SELECT results_eq($$ SELECT id FROM public.audit_logs WHERE id::text LIKE 'd2560000-%' ORDER BY id $$,
  $$ SELECT unnest(ARRAY[pg_temp.id('305'), pg_temp.id('306'), pg_temp.id('307'), pg_temp.id('311'), pg_temp.id('312'), pg_temp.id('313')]) ORDER BY 1 $$,
  'exactly 90 days and exactly 3 years stay, and a long kind past 90 days stays');
SELECT results_eq($$ SELECT id, to_jsonb(log) FROM public.audit_logs AS log WHERE id::text LIKE 'd2560000-%' ORDER BY id $$,
  $$ SELECT * FROM audit_retention_before WHERE id::text LIKE 'd2560000-%' AND id IN
    (pg_temp.id('305'), pg_temp.id('306'), pg_temp.id('307'), pg_temp.id('311'), pg_temp.id('312'), pg_temp.id('313')) ORDER BY id $$,
  'the kept rows keep every actor, scope, timestamp and detail field');

SET LOCAL ROLE service_role;
SELECT is(public.cleanup_old_audit_logs(), 0, 'a second cleanup deletes nothing');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
