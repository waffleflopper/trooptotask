-- A claimed link and its Auth write witness are born in the same transaction.
-- Existing held claims deliberately have no witness and remain staff-only.
CREATE TABLE public.account_setup_attempts (
	setup_link_id uuid PRIMARY KEY REFERENCES public.account_setup_links(id) ON DELETE CASCADE,
	id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
	normalized_email text NOT NULL,
	state text NOT NULL CHECK (state IN ('started', 'committed', 'fenced')),
	auth_user_id uuid,
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK (normalized_email = lower(btrim(normalized_email)) AND normalized_email <> ''),
	CHECK ((state = 'committed') = (auth_user_id IS NOT NULL))
);
ALTER TABLE public.account_setup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_setup_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.account_setup_attempts TO service_role;

-- A setup link is authority for the email to which it was issued. An approved
-- request cannot change that email while a provider write may still be in flight.
CREATE FUNCTION public.prevent_account_setup_email_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
	IF OLD.email IS DISTINCT FROM NEW.email AND
		(OLD.status <> 'pending' OR NEW.status <> 'pending' OR EXISTS (
			SELECT 1 FROM public.account_setup_links WHERE access_request_id = OLD.id
		)) THEN
		RAISE EXCEPTION 'Access Request email cannot change after approval or setup-link issuance'
			USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_account_setup_email_change() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER prevent_account_setup_email_change
	BEFORE UPDATE OF email ON public.access_requests
	FOR EACH ROW EXECUTE FUNCTION public.prevent_account_setup_email_change();

CREATE FUNCTION public.start_account_setup_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE setup_email text;
BEGIN
	IF OLD.claimed_at IS NULL AND NEW.claimed_at IS NOT NULL AND NEW.used_at IS NULL THEN
		SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO setup_email
		FROM public.access_requests WHERE id = NEW.access_request_id;
		IF setup_email IS NULL OR setup_email = '' THEN
			RAISE EXCEPTION 'Account setup email missing' USING ERRCODE = '55000';
		END IF;
		INSERT INTO public.account_setup_attempts(setup_link_id, normalized_email, state)
		VALUES (NEW.id, setup_email, 'started');
	END IF;
	RETURN NEW;
END;
$$;

-- Finalize the witnessed Auth write and both approved requests as one unit.
-- The target may be the source link or a newer link for the same email.
CREATE FUNCTION public.complete_account_setup_recovery(
	p_source_setup_link_id uuid, p_target_setup_link_id uuid, p_target_access_request_id uuid,
	p_first_name text DEFAULT NULL, p_last_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
	source_request public.access_requests%ROWTYPE;
	target_request public.access_requests%ROWTYPE;
	source_link public.account_setup_links%ROWTYPE;
	target_link public.account_setup_links%ROWTYPE;
	attempt public.account_setup_attempts%ROWTYPE;
	setup_email text;
	completed_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
	-- Discover the source request without a lock, then lock both request rows
	-- in UUID order before taking the email advisory lock. Recheck everything
	-- after those locks; this also matches concurrent claim/staff lock order.
	SELECT * INTO source_link FROM public.account_setup_links WHERE id = p_source_setup_link_id;
	IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	PERFORM 1 FROM public.access_requests
	WHERE id IN (source_link.access_request_id, p_target_access_request_id)
	ORDER BY id FOR NO KEY UPDATE;
	SELECT * INTO source_request FROM public.access_requests WHERE id = source_link.access_request_id;
	SELECT * INTO target_request FROM public.access_requests WHERE id = p_target_access_request_id;
	IF source_request.id IS NULL OR target_request.id IS NULL THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;
	setup_email := pg_catalog.lower(pg_catalog.btrim(target_request.email));
	IF setup_email IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(source_request.email)) THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;
	PERFORM pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended('account-setup-claim:' || setup_email, 0));
	PERFORM 1 FROM public.account_setup_links
	WHERE id IN (p_source_setup_link_id, p_target_setup_link_id) ORDER BY id FOR UPDATE;
	SELECT * INTO source_link FROM public.account_setup_links WHERE id = p_source_setup_link_id;
	SELECT * INTO target_link FROM public.account_setup_links
	WHERE id = p_target_setup_link_id AND access_request_id = p_target_access_request_id;
	SELECT * INTO attempt FROM public.account_setup_attempts
	WHERE setup_link_id = p_source_setup_link_id FOR UPDATE;
	IF target_link.id IS NULL OR source_link.access_request_id <> source_request.id
		OR attempt.state IS DISTINCT FROM 'committed' OR attempt.auth_user_id IS NULL
		OR attempt.normalized_email <> setup_email OR source_link.claimed_at IS NULL
		OR source_link.failed_at IS NOT NULL OR target_request.status <> 'approved'
		OR source_request.status <> 'approved'
		OR (source_request.setup_user_id IS NOT NULL
			AND source_request.setup_user_id IS DISTINCT FROM attempt.auth_user_id)
		OR (target_request.setup_user_id IS NOT NULL
			AND target_request.setup_user_id IS DISTINCT FROM attempt.auth_user_id)
		OR NOT EXISTS (SELECT 1 FROM public.user_email_identities i
			WHERE i.user_id = attempt.auth_user_id AND i.normalized_email = setup_email)
	THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;

	-- A repeated call is harmless after the first complete transaction. Before
	-- that transaction, only a live target credential can authorize recovery.
	IF target_request.setup_completed_at IS NOT NULL AND target_link.used_at IS NOT NULL THEN
		IF source_request.setup_completed_at IS NULL OR source_link.used_at IS NULL THEN
			RETURN pg_catalog.jsonb_build_object('state', 'support-required');
		END IF;
	ELSE
		IF target_link.failed_at IS NOT NULL OR target_link.used_at IS NOT NULL
			OR target_link.revoked_at IS NOT NULL OR target_link.expires_at <= completed_at
			OR (target_link.claimed_at IS NOT NULL AND target_link.id <> source_link.id)
		THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	END IF;

	IF p_first_name IS NOT NULL AND pg_catalog.btrim(p_first_name) <> ''
		AND p_last_name IS NOT NULL AND pg_catalog.btrim(p_last_name) <> '' THEN
		INSERT INTO public.user_profiles(user_id, first_name, last_name)
		VALUES (attempt.auth_user_id, pg_catalog.btrim(p_first_name), pg_catalog.btrim(p_last_name))
		ON CONFLICT (user_id) DO NOTHING;
	END IF;
	UPDATE public.access_requests
	SET setup_completed_at = COALESCE(setup_completed_at, completed_at),
		setup_user_id = attempt.auth_user_id
	WHERE id IN (source_request.id, target_request.id)
		AND (setup_completed_at IS NULL OR setup_user_id IS NULL);
	UPDATE public.account_setup_links
	SET used_at = COALESCE(used_at, completed_at),
		claimed_at = COALESCE(claimed_at, completed_at)
	WHERE id IN (source_link.id, target_link.id) AND used_at IS NULL;
	RETURN pg_catalog.jsonb_build_object('state', 'completed', 'userId', attempt.auth_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_account_setup_recovery(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_account_setup_recovery(uuid, uuid, uuid, text, text) TO service_role;

-- The route has already verified possession of the target link's cookie or
-- emailed token. SQL rechecks its stored authority and the email-wide hold.
CREATE FUNCTION public.reconcile_account_setup_claim(
	p_target_setup_link_id uuid, p_target_access_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
	target_request public.access_requests%ROWTYPE;
	target_link public.account_setup_links%ROWTYPE;
	source_link public.account_setup_links%ROWTYPE;
	attempt public.account_setup_attempts%ROWTYPE;
	setup_email text;
	held_count integer;
	source_id uuid;
BEGIN
	SELECT * INTO target_request FROM public.access_requests
	WHERE id = p_target_access_request_id FOR NO KEY UPDATE;
	IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	setup_email := pg_catalog.lower(pg_catalog.btrim(target_request.email));
	IF setup_email IS NULL OR setup_email = '' THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;
	PERFORM pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended('account-setup-claim:' || setup_email, 0));
	SELECT * INTO target_link FROM public.account_setup_links
	WHERE id = p_target_setup_link_id AND access_request_id = p_target_access_request_id FOR UPDATE;
	IF NOT FOUND OR target_request.status <> 'approved'
		OR target_link.failed_at IS NOT NULL OR target_link.used_at IS NOT NULL
		OR target_link.revoked_at IS NOT NULL OR target_link.expires_at <= pg_catalog.clock_timestamp()
	THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;

	-- A held claim is the only source of an Auth write to reconcile. The scan is
	-- a separate statement after the advisory lock for a fresh READ COMMITTED view.
	SELECT count(*)::integer, min(l.id::text)::uuid INTO held_count, source_id
	FROM public.account_setup_links l
	JOIN public.access_requests r ON r.id = l.access_request_id
	WHERE pg_catalog.lower(pg_catalog.btrim(r.email)) = setup_email
		AND l.claimed_at IS NOT NULL AND l.used_at IS NULL AND l.failed_at IS NULL;
	IF held_count = 0 THEN RETURN pg_catalog.jsonb_build_object('state', 'clear'); END IF;
	IF held_count <> 1 THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	SELECT * INTO source_link FROM public.account_setup_links WHERE id = source_id FOR UPDATE;
	IF NOT FOUND OR source_link.claimed_at IS NULL OR source_link.used_at IS NOT NULL
		OR source_link.failed_at IS NOT NULL
	THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	SELECT * INTO attempt FROM public.account_setup_attempts WHERE setup_link_id = source_id FOR UPDATE;
	IF NOT FOUND OR attempt.normalized_email <> setup_email THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;

	IF attempt.state = 'committed' THEN
		IF target_request.setup_completed_at IS NOT NULL AND
			target_request.setup_user_id IS DISTINCT FROM attempt.auth_user_id THEN
			RETURN pg_catalog.jsonb_build_object('state', 'support-required');
		END IF;
		RETURN pg_catalog.jsonb_build_object('state', 'committed',
			'sourceLinkId', source_id, 'sourceAccessRequestId', source_link.access_request_id,
			'userId', attempt.auth_user_id);
	END IF;
	IF attempt.state <> 'started' THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;
	IF target_request.setup_completed_at IS NOT NULL THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;

	UPDATE public.account_setup_attempts SET state = 'fenced'
	WHERE setup_link_id = source_id AND state = 'started';
	UPDATE public.account_setup_links
	SET failed_at = pg_catalog.clock_timestamp(), failure_reason = 'reconciled-no-write'
	WHERE id = source_id AND claimed_at IS NOT NULL AND used_at IS NULL AND failed_at IS NULL;
	IF NOT FOUND THEN RAISE EXCEPTION 'Account setup claim changed' USING ERRCODE = '40001'; END IF;
	RETURN pg_catalog.jsonb_build_object('state', 'fenced',
		'sourceLinkId', source_id, 'sourceAccessRequestId', source_link.access_request_id);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_account_setup_claim(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_account_setup_claim(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.start_account_setup_attempt() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER start_account_setup_attempt
	AFTER UPDATE OF claimed_at ON public.account_setup_links
	FOR EACH ROW EXECUTE FUNCTION public.start_account_setup_attempt();

-- Every release of a claimed link fences an uncommitted Auth write. A delayed
-- provider transaction then fails at its witness trigger and rolls back.
CREATE FUNCTION public.fence_failed_account_setup_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
	IF OLD.failed_at IS NULL AND NEW.failed_at IS NOT NULL THEN
		UPDATE public.account_setup_attempts SET state = 'fenced'
		WHERE setup_link_id = NEW.id AND state = 'started';
	END IF;
	RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fence_failed_account_setup_attempt() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER fence_failed_account_setup_attempt
	BEFORE UPDATE OF failed_at ON public.account_setup_links
	FOR EACH ROW EXECUTE FUNCTION public.fence_failed_account_setup_attempt();

ALTER TABLE public.account_setup_links DROP CONSTRAINT account_setup_links_failure_reason_check;
ALTER TABLE public.account_setup_links ADD CONSTRAINT account_setup_links_failure_reason_check
CHECK (failure_reason IS NULL OR (failed_at IS NOT NULL AND failure_reason IN (
	'access-request-missing', 'access-request-completed', 'access-request-not-approved',
	'account-create-failed', 'completion-tracking-failed', 'operator-released',
	'reconciled-no-write'
)));

-- Admin createUser constructs auth.users with metadata before its transaction.
-- The witness update rolls back if any later GoTrue step fails.
CREATE FUNCTION public.confirm_account_setup_create() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE marker text;
BEGIN
	marker := NEW.raw_user_meta_data ->> 'ttt_setup_attempt';
	IF marker IS NULL THEN RETURN NEW; END IF;
	UPDATE public.account_setup_attempts SET state = 'committed', auth_user_id = NEW.id
	WHERE id::text = marker AND state = 'started'
		AND normalized_email = pg_catalog.lower(pg_catalog.btrim(NEW.email))
		AND NEW.encrypted_password IS NOT NULL;
	IF NOT FOUND THEN RAISE EXCEPTION 'Account setup attempt fenced' USING ERRCODE = '42501'; END IF;
	NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'ttt_setup_attempt';
	-- GoTrue can echo its in-memory metadata in later UPDATEs during this same
	-- create transaction. Only that transaction may consume the echoed marker.
	PERFORM pg_catalog.set_config('app.setup_created_actor', NEW.id::text, true);
	RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_account_setup_create() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER confirm_account_setup_create BEFORE INSERT ON auth.users
	FOR EACH ROW EXECUTE FUNCTION public.confirm_account_setup_create();

-- Admin updateUserById writes password then user metadata in one transaction.
-- Extend the existing password witness so trigger ordering cannot bypass it.
CREATE OR REPLACE FUNCTION public.confirm_password_change_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE password_marker text; setup_marker text;
BEGIN
	IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
		PERFORM pg_catalog.set_config('app.password_changed_actor', NEW.id::text, true);
	END IF;
	password_marker := NEW.raw_user_meta_data ->> 'ttt_password_attempt';
	setup_marker := NEW.raw_user_meta_data ->> 'ttt_setup_attempt';
	IF password_marker IS NOT NULL AND setup_marker IS NOT NULL THEN
		RAISE EXCEPTION 'Conflicting password attempt markers' USING ERRCODE = '42501';
	END IF;
	IF password_marker IS NOT NULL THEN
		IF pg_catalog.current_setting('app.password_changed_actor', true) IS DISTINCT FROM NEW.id::text THEN
			RAISE EXCEPTION 'Password change witness missing' USING ERRCODE = '42501';
		END IF;
		UPDATE public.password_change_attempts SET state = 'pending'
		WHERE actor = NEW.id AND id::text = password_marker AND state = 'started'
			AND expires_at > pg_catalog.clock_timestamp()
			AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = session_id AND s.user_id = NEW.id);
		IF NOT FOUND THEN RAISE EXCEPTION 'Password attempt fenced' USING ERRCODE = '42501'; END IF;
		NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'ttt_password_attempt';
		PERFORM pg_catalog.set_config('app.password_changed_actor', '', true);
	END IF;
	IF setup_marker IS NOT NULL THEN
		IF pg_catalog.current_setting('app.setup_created_actor', true) = NEW.id::text THEN
			PERFORM 1 FROM public.account_setup_attempts
			WHERE id::text = setup_marker AND state = 'committed' AND auth_user_id = NEW.id
				AND normalized_email = pg_catalog.lower(pg_catalog.btrim(NEW.email));
			IF NOT FOUND THEN RAISE EXCEPTION 'Account setup attempt fenced' USING ERRCODE = '42501'; END IF;
		ELSE
			IF pg_catalog.current_setting('app.password_changed_actor', true) IS DISTINCT FROM NEW.id::text THEN
				RAISE EXCEPTION 'Account setup password witness missing' USING ERRCODE = '42501';
			END IF;
			UPDATE public.account_setup_attempts SET state = 'committed', auth_user_id = NEW.id
			WHERE id::text = setup_marker AND state = 'started'
				AND normalized_email = pg_catalog.lower(pg_catalog.btrim(NEW.email));
			IF NOT FOUND THEN RAISE EXCEPTION 'Account setup attempt fenced' USING ERRCODE = '42501'; END IF;
		END IF;
		NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'ttt_setup_attempt';
		PERFORM pg_catalog.set_config('app.password_changed_actor', '', true);
	END IF;
	RETURN NEW;
END;
$$;
