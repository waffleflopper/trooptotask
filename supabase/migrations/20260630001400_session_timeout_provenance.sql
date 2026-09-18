-- Session start is provider-owned and does not change on token refresh or MFA.
-- No arguments: callers cannot request another session's facts, even for the same user.
CREATE FUNCTION public.get_current_session_started_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT session.created_at
  FROM auth.sessions AS session
  WHERE session.id = (NULLIF(auth.jwt() ->> 'session_id', ''))::uuid
    AND session.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_current_session_started_at() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_session_started_at() TO authenticated;
COMMENT ON FUNCTION public.get_current_session_started_at() IS
  'Original start of the bearer session owned by auth.uid(); null for an absent/revoked session. No account-wide sign-in fallback.';
