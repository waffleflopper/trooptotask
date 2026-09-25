-- A held Auth outcome is released only after an authorized staff operator has
-- independently established that the prior provider operation is terminal or
-- quiescent. This function records the attestation; SQL cannot inspect Auth's
-- in-flight provider work. Elapsed time never releases a claim.
ALTER TABLE "public"."account_setup_links"
	DROP CONSTRAINT IF EXISTS "account_setup_links_failure_reason_check";

ALTER TABLE "public"."account_setup_links"
	ADD CONSTRAINT "account_setup_links_failure_reason_check"
	CHECK (
		("failure_reason" IS NULL)
		OR (
			("failed_at" IS NOT NULL)
			AND "failure_reason" = ANY (
				ARRAY[
					'access-request-missing'::text,
					'access-request-completed'::text,
					'access-request-not-approved'::text,
					'account-create-failed'::text,
					'completion-tracking-failed'::text,
					'operator-released'::text
				]
			)
		)
	);

CREATE OR REPLACE FUNCTION "public"."release_account_setup_claim_for_staff"(
	"p_setup_link_id" uuid,
	"p_access_request_id" uuid,
	"p_operator_user_id" uuid,
	"p_release_reason" text,
	"p_evidence_reference" text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	request_row public.access_requests%ROWTYPE;
	link_row public.account_setup_links%ROWTYPE;
BEGIN
	IF p_release_reason IS NULL OR p_release_reason NOT IN ('provider-terminal', 'provider-quiescent') THEN
		RAISE EXCEPTION 'A provider operation attestation is required' USING ERRCODE = '22023';
	END IF;
	-- Require a case/ticket ID such as INC-12345. A free-form string could
	-- accidentally persist a setup token or provider credential in audit_logs.
	IF p_evidence_reference IS NULL OR p_evidence_reference !~ '^[A-Z][A-Z0-9]{1,15}-[0-9]{3,12}$' THEN
		RAISE EXCEPTION 'A case or ticket ID is required' USING ERRCODE = '22023';
	END IF;

	-- The service-role operational caller authenticates the human operator at
	-- the application edge and supplies that actor's ID. SQL also requires the
	-- attested actor to remain active support or super admin for this write.
	PERFORM 1
	FROM public.platform_admins
	WHERE user_id = p_operator_user_id
		AND is_active = true
		AND role IN ('support', 'super_admin')
	FOR SHARE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Active support authorization is required' USING ERRCODE = '42501';
	END IF;

	-- Match claim admission's lock order: request row, normalized stored-email
	-- advisory lock, target link. A different request for this email cannot claim
	-- while the release and its audit record are uncommitted.
	SELECT * INTO request_row
	FROM public.access_requests
	WHERE id = p_access_request_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Access Request for claim release is missing' USING ERRCODE = '55000';
	END IF;

	PERFORM pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended('account-setup-claim:' || pg_catalog.lower(pg_catalog.btrim(request_row.email)), 0)
	);

	SELECT * INTO link_row
	FROM public.account_setup_links
	WHERE id = p_setup_link_id AND access_request_id = p_access_request_id
	FOR UPDATE;
	IF NOT FOUND OR link_row.claimed_at IS NULL OR link_row.used_at IS NOT NULL OR link_row.failed_at IS NOT NULL THEN
		RAISE EXCEPTION 'Account Setup claim is not held' USING ERRCODE = '55000';
	END IF;

	UPDATE public.account_setup_links
	SET failed_at = pg_catalog.clock_timestamp(), failure_reason = 'operator-released'
	WHERE id = p_setup_link_id
		AND access_request_id = p_access_request_id
		AND claimed_at IS NOT NULL
		AND used_at IS NULL
		AND failed_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Account Setup claim changed before release' USING ERRCODE = '40001';
	END IF;

	-- Audit and release are one transaction: a failed audit insert rolls back
	-- the terminal state. The evidence reference must never be a raw token or URL.
	INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details, severity)
	VALUES (
		p_operator_user_id,
		'account_setup.claim_released_by_staff',
		'account_setup_link',
		p_setup_link_id,
		pg_catalog.jsonb_build_object(
			'accessRequestId', p_access_request_id,
			'releaseReason', p_release_reason,
			'evidenceReference', p_evidence_reference,
			'priorClaimedAt', link_row.claimed_at
		),
		'warning'
	);

	RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION "public"."release_account_setup_claim_for_staff"(uuid, uuid, uuid, text, text) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_account_setup_claim_for_staff"(uuid, uuid, uuid, text, text) TO "service_role";
