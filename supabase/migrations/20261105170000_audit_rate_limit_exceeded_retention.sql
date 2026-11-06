-- #1999 The app records a blocked request as security.rate_limit_exceeded. It keeps for 90 days like the older
-- security.rate_limit_violation entries, which stay on the list so rows already saved under that name expire too.
BEGIN;

CREATE OR REPLACE FUNCTION audit_private.short_retention_actions() RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'auth.login_success', 'auth.login_failure', 'auth.mfa_verify', 'security.rate_limit_violation',
    'security.rate_limit_exceeded'
  ]::text[];
$$;
REVOKE ALL ON FUNCTION audit_private.short_retention_actions() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
