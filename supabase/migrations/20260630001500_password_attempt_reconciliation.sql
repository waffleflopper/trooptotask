-- The attempt contains no credentials. Only the auth edge's service client may
-- admit/fence attempts or acknowledge revocation; browser roles have no access.
CREATE TABLE public.password_change_attempts (
  actor uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  flow text CHECK (flow IN ('recovery', 'invite')),
  expires_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('started', 'pending', 'complete', 'failed'))
);
ALTER TABLE public.password_change_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_change_attempts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.password_change_attempt(
  p_actor uuid, p_session uuid, p_action text,
  p_flow text DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL, p_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  attempt public.password_change_attempts%ROWTYPE;
  acquired boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id = p_session AND user_id = p_actor)
    THEN RAISE EXCEPTION 'Inactive password session' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('read', 'begin', 'reconcile', 'complete', 'restart')
    THEN RAISE EXCEPTION 'Invalid password action'; END IF;
  -- Serialize admission even before a row exists. A single actor cannot have
  -- simultaneous password mutations from different sessions or app instances.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text, 195));
  SELECT * INTO attempt FROM public.password_change_attempts WHERE actor = p_actor FOR UPDATE;
  IF p_action = 'begin' AND attempt.actor IS NULL THEN
    IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '24 hours'
      THEN RAISE EXCEPTION 'Invalid password expiry'; END IF;
    INSERT INTO public.password_change_attempts(actor, session_id, flow, expires_at, state)
      VALUES (p_actor, p_session, p_flow, p_expires_at, 'started') RETURNING * INTO attempt;
    acquired := true;
  END IF;
  IF attempt.actor IS NULL THEN RETURN jsonb_build_object('state', NULL); END IF;
  -- A new authenticated session may explicitly retire an expired attempt. The
  -- absent/changed ID fences delayed provider writes, including after a crash.
  IF p_action = 'restart' AND (
    (attempt.session_id = p_session AND attempt.state = 'failed') OR
    (attempt.session_id = p_session AND attempt.state = 'complete' AND p_flow IS NULL) OR
    (attempt.session_id <> p_session AND attempt.expires_at <= clock_timestamp())
  ) THEN
    DELETE FROM public.password_change_attempts WHERE actor = p_actor;
    RETURN jsonb_build_object('state', NULL);
  END IF;
  IF attempt.session_id <> p_session OR attempt.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  IF attempt.flow IS DISTINCT FROM p_flow AND NOT (attempt.state = 'complete' AND p_flow IS NULL) THEN
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  IF p_action IN ('reconcile', 'complete') AND p_id IS DISTINCT FROM attempt.id
    THEN RAISE EXCEPTION 'Password attempt changed' USING ERRCODE = '40001'; END IF;
  IF p_action = 'reconcile' AND attempt.state = 'started' THEN
    -- The row lock races the provider commit. Either its transaction confirmed
    -- first, or this fence makes its later marker fail and rolls it back.
    UPDATE public.password_change_attempts SET state = 'failed' WHERE actor = p_actor RETURNING * INTO attempt;
  ELSIF p_action = 'complete' AND attempt.state = 'pending' THEN
    UPDATE public.password_change_attempts SET state = 'complete' WHERE actor = p_actor RETURNING * INTO attempt;
  END IF;
  RETURN jsonb_build_object('state', attempt.state, 'id', attempt.id, 'flow', attempt.flow,
    'expiresAt', extract(epoch FROM attempt.expires_at), 'acquired', acquired);
END;
$$;
REVOKE ALL ON FUNCTION public.password_change_attempt(uuid, uuid, text, text, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.password_change_attempt(uuid, uuid, text, text, timestamptz, uuid) TO service_role;

-- GoTrue updates encrypted_password, then metadata in the same transaction.
-- A transaction-local witness prevents a metadata-only call from claiming a
-- password change. The marker is consumed, never left in public user metadata.
CREATE FUNCTION public.confirm_password_change_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE marker text;
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    PERFORM set_config('app.password_changed_actor', NEW.id::text, true);
  END IF;
  marker := NEW.raw_user_meta_data ->> 'ttt_password_attempt';
  IF marker IS NOT NULL THEN
    IF current_setting('app.password_changed_actor', true) IS DISTINCT FROM NEW.id::text THEN
      RAISE EXCEPTION 'Password change witness missing' USING ERRCODE = '42501';
    END IF;
    UPDATE public.password_change_attempts SET state = 'pending'
      WHERE actor = NEW.id AND id::text = marker AND state = 'started'
        AND expires_at > clock_timestamp()
        AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = session_id AND s.user_id = NEW.id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Password attempt fenced' USING ERRCODE = '42501'; END IF;
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'ttt_password_attempt';
    PERFORM set_config('app.password_changed_actor', '', true);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_password_change_attempt() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER confirm_password_change_attempt BEFORE UPDATE OF encrypted_password, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.confirm_password_change_attempt();
