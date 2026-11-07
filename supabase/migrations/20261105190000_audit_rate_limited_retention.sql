-- #2013 The eight *_rate_limited kinds keep for 90 days, like the other rate-limit entries. Unlike the sign-in and
-- security.rate_limit_* kinds they stay visible in Logs, so this list is longer than the one Logs hides.
BEGIN;

CREATE OR REPLACE FUNCTION audit_private.short_retention_actions() RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'auth.login_success', 'auth.login_failure', 'auth.mfa_verify', 'security.rate_limit_violation',
    'security.rate_limit_exceeded',
    'member.invite_rate_limited', 'member.invite_resend_rate_limited', 'auth.forgot_password_rate_limited',
    'auth.password_update_rate_limited', 'account_setup.completion_rate_limited', 'account_setup.renewal_rate_limited',
    'access_request.account_setup_approval_rate_limited', 'access_request.account_setup_resend_rate_limited'
  ]::text[];
$$;
REVOKE ALL ON FUNCTION audit_private.short_retention_actions() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
