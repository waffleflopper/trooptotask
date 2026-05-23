CREATE OR REPLACE FUNCTION "public"."claim_account_setup_link_for_session"(
	"p_setup_link_id" uuid,
	"p_access_request_id" uuid,
	"p_claimed_at" timestamp with time zone DEFAULT "now"()
)
RETURNS TABLE (
	"claim_status" text,
	"setup_link_id" uuid,
	"access_request_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	link_row public.account_setup_links%ROWTYPE;
	request_row public.access_requests%ROWTYPE;
BEGIN
	SELECT *
	INTO link_row
	FROM public.account_setup_links
	WHERE account_setup_links.id = p_setup_link_id
		AND account_setup_links.access_request_id = p_access_request_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT
			'missing'::text, NULL::uuid, NULL::uuid, NULL::timestamp with time zone, NULL::timestamp with time zone,
			NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::text, NULL::timestamp with time zone,
			NULL::timestamp with time zone, NULL::text;
		RETURN;
	END IF;

	SELECT *
	INTO request_row
	FROM public.access_requests
	WHERE access_requests.id = p_access_request_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT
			'missing'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.used_at IS NOT NULL THEN
		RETURN QUERY SELECT
			'used'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.failed_at IS NOT NULL THEN
		RETURN QUERY SELECT
			'failed'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.claimed_at IS NOT NULL THEN
		RETURN QUERY SELECT
			'claimed'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.revoked_at IS NOT NULL THEN
		RETURN QUERY SELECT
			CASE WHEN link_row.revocation_reason = 'replaced' THEN 'replaced'::text ELSE 'revoked'::text END,
			link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.expires_at <= p_claimed_at THEN
		RETURN QUERY SELECT
			'expired'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF request_row.status <> 'approved' THEN
		RETURN QUERY SELECT
			'access-request-not-approved'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF request_row.setup_completed_at IS NOT NULL THEN
		RETURN QUERY SELECT
			'access-request-completed'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	UPDATE public.account_setup_links
	SET claimed_at = p_claimed_at
	WHERE account_setup_links.id = link_row.id
	RETURNING * INTO link_row;

	RETURN QUERY SELECT
		'claim-started'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
		link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
		link_row.revoked_at, link_row.revocation_reason;
END;
$$;

REVOKE ALL ON FUNCTION "public"."claim_account_setup_link_for_session"(uuid, uuid, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."claim_account_setup_link_for_session"(uuid, uuid, timestamp with time zone) FROM "anon";
REVOKE ALL ON FUNCTION "public"."claim_account_setup_link_for_session"(uuid, uuid, timestamp with time zone) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."claim_account_setup_link_for_session"(uuid, uuid, timestamp with time zone) TO "service_role";
