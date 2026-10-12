ALTER TABLE "public"."access_requests" DROP CONSTRAINT "access_requests_status_check";
ALTER TABLE "public"."access_requests"
	ADD CONSTRAINT "access_requests_status_check"
	CHECK ("status" = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'rescinded'::text]));

ALTER TABLE "public"."access_requests" ADD COLUMN "approval_basis" text;
ALTER TABLE "public"."access_requests"
	ADD CONSTRAINT "access_requests_approval_basis_check"
	CHECK ("approval_basis" IS NULL OR "approval_basis" = ANY (ARRAY['platform_review'::text, 'organization_invitation'::text]));

WITH "platform_reviewed" AS (
	SELECT "audit_logs"."resource_id" AS "access_request_id"
	FROM "public"."audit_logs"
	WHERE "audit_logs"."action" = 'access_request.approved'
),
"invitation_vouched" AS (
	SELECT "link"."access_request_id"
	FROM "public"."access_request_organization_invitation_links" AS "link"
	JOIN "public"."access_requests" AS "request" ON "request"."id" = "link"."access_request_id"
	WHERE "link"."invited_by" = "request"."reviewed_by"
		AND "link"."invited_at" <= "request"."reviewed_at" + interval '5 minutes'
)
UPDATE "public"."access_requests" AS "request"
SET "approval_basis" = CASE
	WHEN "request"."id" IN (SELECT "access_request_id" FROM "platform_reviewed") THEN 'platform_review'
	WHEN "request"."id" IN (SELECT "access_request_id" FROM "invitation_vouched") THEN 'organization_invitation'
	ELSE 'platform_review'
END
WHERE "request"."status" = 'approved';

ALTER TABLE "public"."access_requests"
	ADD CONSTRAINT "access_requests_approval_basis_status_check"
	CHECK (("status" = ANY (ARRAY['approved'::text, 'rescinded'::text])) = ("approval_basis" IS NOT NULL));

CREATE OR REPLACE FUNCTION "public"."access_request_setup_grant_is_live"("p_access_request_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."access_requests" AS "request"
		WHERE "request"."id" = "p_access_request_id"
			AND "request"."status" = 'approved'
			AND "request"."setup_completed_at" IS NULL
			AND (
				"request"."approval_basis" = 'platform_review'
				OR EXISTS (
					SELECT 1
					FROM "public"."access_request_organization_invitation_links" AS "link"
					JOIN "public"."organization_invitations" AS "invitation"
						ON "invitation"."id" = "link"."organization_invitation_id"
					WHERE "link"."access_request_id" = "request"."id"
						AND "invitation"."status" <> ALL (
							ARRAY['revoked'::"public"."invitation_status", 'blocked'::"public"."invitation_status"]
						)
				)
			)
	);
$$;

REVOKE ALL ON FUNCTION "public"."access_request_setup_grant_is_live"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."access_request_setup_grant_is_live"(uuid) FROM "anon";
REVOKE ALL ON FUNCTION "public"."access_request_setup_grant_is_live"(uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."access_request_setup_grant_is_live"(uuid) TO "service_role";

-- Computed field so service reads can select `setup_grant_live` with each request
-- instead of calling the grant function once per row.
CREATE OR REPLACE FUNCTION "public"."setup_grant_live"("request" "public"."access_requests")
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
	SELECT "public"."access_request_setup_grant_is_live"("request"."id");
$$;

REVOKE ALL ON FUNCTION "public"."setup_grant_live"("public"."access_requests") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."setup_grant_live"("public"."access_requests") FROM "anon";
REVOKE ALL ON FUNCTION "public"."setup_grant_live"("public"."access_requests") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."setup_grant_live"("public"."access_requests") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."issue_account_setup_link"(
	"p_access_request_id" uuid,
	"p_token_hash" text,
	"p_expires_at" timestamp with time zone,
	"p_created_at" timestamp with time zone DEFAULT "now"()
)
RETURNS TABLE (
	"issue_status" text,
	"setup_link_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"revoked_setup_link_ids" uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	"request_row" "public"."access_requests"%ROWTYPE;
	"link_row" "public"."account_setup_links"%ROWTYPE;
	"revoked_ids" uuid[];
BEGIN
	SELECT *
	INTO "request_row"
	FROM "public"."access_requests"
	WHERE "access_requests"."id" = "p_access_request_id"
	FOR SHARE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'access-request-missing'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END IF;

	IF "request_row"."status" <> 'approved' THEN
		RETURN QUERY SELECT 'access-request-not-approved'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END IF;

	IF "request_row"."setup_completed_at" IS NOT NULL THEN
		RETURN QUERY SELECT 'access-request-completed'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END IF;

	IF NOT "public"."access_request_setup_grant_is_live"("p_access_request_id") THEN
		RETURN QUERY SELECT 'access-request-not-approved'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END IF;

	BEGIN
		WITH "revoked" AS (
			UPDATE "public"."account_setup_links"
			SET "revoked_at" = "p_created_at", "revocation_reason" = 'replaced'
			WHERE "account_setup_links"."access_request_id" = "p_access_request_id"
				AND "account_setup_links"."claimed_at" IS NULL
				AND "account_setup_links"."used_at" IS NULL
				AND "account_setup_links"."revoked_at" IS NULL
			RETURNING "account_setup_links"."id"
		)
		SELECT coalesce(array_agg("revoked"."id"), ARRAY[]::uuid[]) INTO "revoked_ids" FROM "revoked";

		INSERT INTO "public"."account_setup_links" ("access_request_id", "token_hash", "expires_at", "created_at")
		VALUES ("p_access_request_id", "p_token_hash", "p_expires_at", "p_created_at")
		RETURNING * INTO "link_row";
	EXCEPTION WHEN unique_violation THEN
		RETURN QUERY SELECT 'concurrent-create'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END;

	RETURN QUERY SELECT 'created'::text, "link_row"."id", "link_row"."expires_at", "link_row"."created_at", "revoked_ids";
END;
$$;

REVOKE ALL ON FUNCTION "public"."issue_account_setup_link"(uuid, text, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."issue_account_setup_link"(uuid, text, timestamp with time zone, timestamp with time zone) FROM "anon";
REVOKE ALL ON FUNCTION "public"."issue_account_setup_link"(uuid, text, timestamp with time zone, timestamp with time zone) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."issue_account_setup_link"(uuid, text, timestamp with time zone, timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."link_organization_invitation_access_request"(
	"p_invitation_id" uuid,
	"p_organization_id" uuid,
	"p_email" text,
	"p_invited_by" uuid,
	"p_invited_at" timestamp with time zone,
	"p_role" text,
	"p_member_preset" text,
	"p_capability_overrides" jsonb,
	"p_access_scope_kind" text,
	"p_access_scope_group_ids" uuid[]
)
RETURNS TABLE ("bridge_status" text, "access_request_id" uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	"invitee_email" text := lower(btrim("p_email"));
	"request_id" uuid;
	"linked_request_id" uuid;
	"created_request" boolean := false;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('access-request-invitation-bridge:' || "invitee_email", 0));

	SELECT "link"."access_request_id"
	INTO "linked_request_id"
	FROM "public"."access_request_organization_invitation_links" AS "link"
	WHERE "link"."organization_invitation_id" = "p_invitation_id";

	IF FOUND THEN
		RETURN QUERY SELECT 'already-linked'::text, "linked_request_id";
		RETURN;
	END IF;

	PERFORM 1
	FROM "public"."organization_invitations" AS "invitation"
	WHERE "invitation"."id" = "p_invitation_id"
		AND "invitation"."organization_id" = "p_organization_id"
		AND "invitation"."normalized_email" = "invitee_email"
		AND "invitation"."status" = 'pending'::"public"."invitation_status";

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'invitation-not-pending'::text, NULL::uuid;
		RETURN;
	END IF;

	FOR "attempt" IN 1..3 LOOP
		SELECT "request"."id"
		INTO "request_id"
		FROM "public"."access_requests" AS "request"
		WHERE "request"."email" = "invitee_email"
			AND (
				"request"."status" = 'pending'
				OR (
					"request"."status" = 'approved'
					AND "request"."setup_completed_at" IS NULL
					AND coalesce("request"."reviewed_at", "request"."created_at") >= now() - interval '90 days'
				)
			)
		ORDER BY ("request"."status" = 'pending') DESC, "request"."reviewed_at" DESC NULLS LAST, "request"."created_at" DESC
		LIMIT 1
		FOR UPDATE;

		EXIT WHEN "request_id" IS NOT NULL;

		INSERT INTO "public"."access_requests" ("email", "name", "reason", "heard_about", "heard_about_details")
		VALUES (
			"invitee_email",
			"invitee_email",
			'Created from an Organization Invitation.',
			'other',
			'Organization Invitation'
		)
		ON CONFLICT (lower("email")) WHERE "status" = 'pending' DO NOTHING
		RETURNING "access_requests"."id" INTO "request_id";

		IF "request_id" IS NOT NULL THEN
			"created_request" := true;
			EXIT;
		END IF;
	END LOOP;

	IF "request_id" IS NULL THEN
		RAISE EXCEPTION 'Access Request for invitation % could not be found or created', "p_invitation_id";
	END IF;

	INSERT INTO "public"."access_request_organization_invitation_links" (
		"access_request_id",
		"organization_invitation_id",
		"organization_id",
		"invited_by",
		"invited_at",
		"intended_membership_role",
		"intended_member_preset",
		"intended_capability_overrides",
		"intended_access_scope_kind",
		"intended_access_scope_group_ids"
	)
	VALUES (
		"request_id",
		"p_invitation_id",
		"p_organization_id",
		"p_invited_by",
		"p_invited_at",
		"p_role",
		"p_member_preset",
		coalesce("p_capability_overrides", '{}'::jsonb),
		"p_access_scope_kind",
		coalesce("p_access_scope_group_ids", ARRAY[]::uuid[])
	);

	UPDATE "public"."access_requests"
	SET
		"status" = 'approved',
		"approval_basis" = 'organization_invitation',
		"reviewed_by" = "p_invited_by",
		"reviewed_at" = now()
	WHERE "access_requests"."id" = "request_id"
		AND "access_requests"."status" = 'pending';

	RETURN QUERY SELECT CASE WHEN "created_request" THEN 'created' ELSE 'linked' END::text, "request_id";
END;
$$;

REVOKE ALL ON FUNCTION "public"."link_organization_invitation_access_request"(uuid, uuid, text, uuid, timestamp with time zone, text, text, jsonb, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."link_organization_invitation_access_request"(uuid, uuid, text, uuid, timestamp with time zone, text, text, jsonb, text, uuid[]) FROM "anon";
REVOKE ALL ON FUNCTION "public"."link_organization_invitation_access_request"(uuid, uuid, text, uuid, timestamp with time zone, text, text, jsonb, text, uuid[]) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."link_organization_invitation_access_request"(uuid, uuid, text, uuid, timestamp with time zone, text, text, jsonb, text, uuid[]) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."rescind_access_request_and_block_linked_invitations"(
	"p_access_request_id" uuid,
	"p_reviewer_id" uuid
)
RETURNS TABLE(
	"rescind_status" text,
	"organization_invitation_id" uuid,
	"organization_id" uuid,
	"invitation_email" text,
	"blocked_at" timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	"request_row" "public"."access_requests"%ROWTYPE;
BEGIN
	SELECT *
	INTO "request_row"
	FROM "public"."access_requests"
	WHERE "access_requests"."id" = "p_access_request_id"
	FOR UPDATE;

	IF NOT FOUND OR "request_row"."status" <> 'approved' THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamp with time zone;
		RETURN;
	END IF;

	IF "request_row"."setup_completed_at" IS NOT NULL THEN
		RETURN QUERY SELECT 'completed'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamp with time zone;
		RETURN;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "public"."account_setup_links"
		WHERE "account_setup_links"."access_request_id" = "p_access_request_id"
			AND "account_setup_links"."claimed_at" IS NOT NULL
			AND "account_setup_links"."used_at" IS NULL
			AND "account_setup_links"."failed_at" IS NULL
	) THEN
		RETURN QUERY SELECT 'claim-held'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamp with time zone;
		RETURN;
	END IF;

	UPDATE "public"."access_requests"
	SET "status" = 'rescinded'
	WHERE "access_requests"."id" = "p_access_request_id";

	UPDATE "public"."account_setup_links"
	SET "revoked_at" = now(), "revocation_reason" = 'manual'
	WHERE "account_setup_links"."access_request_id" = "p_access_request_id"
		AND "account_setup_links"."claimed_at" IS NULL
		AND "account_setup_links"."used_at" IS NULL
		AND "account_setup_links"."revoked_at" IS NULL;

	RETURN QUERY
	WITH "linked_pending" AS (
		SELECT
			"organization_invitations"."id",
			"organization_invitations"."organization_id",
			"organization_invitations"."email"
		FROM "public"."access_request_organization_invitation_links"
		JOIN "public"."organization_invitations"
			ON "organization_invitations"."id" = "access_request_organization_invitation_links"."organization_invitation_id"
		WHERE "access_request_organization_invitation_links"."access_request_id" = "p_access_request_id"
			AND "organization_invitations"."status" = 'pending'::"public"."invitation_status"
			AND "organization_invitations"."normalized_email" = lower(btrim("request_row"."email"))
		FOR UPDATE OF "organization_invitations"
	),
	"blocked" AS (
		UPDATE "public"."organization_invitations"
		SET
			"status" = 'blocked'::"public"."invitation_status",
			"blocked_at" = now(),
			"blocked_by" = "p_reviewer_id"
		FROM "linked_pending"
		WHERE "organization_invitations"."id" = "linked_pending"."id"
		RETURNING
			"organization_invitations"."id",
			"organization_invitations"."organization_id",
			"organization_invitations"."email",
			"organization_invitations"."blocked_at"
	),
	"audit_insert" AS (
		INSERT INTO "public"."audit_logs" (
			"user_id",
			"org_id",
			"action",
			"resource_type",
			"resource_id",
			"details",
			"severity"
		)
		SELECT
			"p_reviewer_id",
			"blocked"."organization_id",
			'organization_invitation.blocked_by_access_request_rescission',
			'organization_invitation',
			"blocked"."id",
			jsonb_build_object(
				'accessRequestId', "p_access_request_id",
				'invitationId', "blocked"."id",
				'reason', 'linked_platform_access_rescinded'
			),
			'warning'
		FROM "blocked"
		RETURNING "audit_logs"."id"
	)
	SELECT
		'rescinded'::text,
		"blocked"."id",
		"blocked"."organization_id",
		"blocked"."email",
		"blocked"."blocked_at"
	FROM "blocked";

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'rescinded'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamp with time zone;
	END IF;
END;
$$;

REVOKE ALL ON FUNCTION "public"."rescind_access_request_and_block_linked_invitations"(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."rescind_access_request_and_block_linked_invitations"(uuid, uuid) FROM "anon";
REVOKE ALL ON FUNCTION "public"."rescind_access_request_and_block_linked_invitations"(uuid, uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rescind_access_request_and_block_linked_invitations"(uuid, uuid) TO "service_role";

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
	normalized_email text;
	other_claim_in_progress boolean;
BEGIN
	-- The separate scan below gets a fresh READ COMMITTED snapshot after any
	-- transaction that held the advisory lock has committed.
	SELECT *
	INTO request_row
	FROM public.access_requests
	WHERE access_requests.id = p_access_request_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT
			'missing'::text, NULL::uuid, NULL::uuid, NULL::timestamp with time zone, NULL::timestamp with time zone,
			NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::text, NULL::timestamp with time zone,
			NULL::timestamp with time zone, NULL::text;
		RETURN;
	END IF;

	normalized_email := lower(btrim(request_row.email));
	PERFORM pg_advisory_xact_lock(hashtextextended('account-setup-claim:' || normalized_email, 0));

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

	IF NOT public.access_request_setup_grant_is_live(request_row.id) THEN
		RETURN QUERY SELECT
			'access-request-not-approved'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	-- A claimed link remains a credential-mutation hold until it is completed or
	-- explicitly failed. Expiry and revocation do not establish that Auth stopped.
	-- This statement must run after the advisory lock as its own SQL command.
	SELECT EXISTS (
		SELECT 1
		FROM public.account_setup_links AS other_link
		JOIN public.access_requests AS other_request ON other_request.id = other_link.access_request_id
		WHERE lower(btrim(other_request.email)) = normalized_email
			AND other_link.id <> link_row.id
			AND other_link.claimed_at IS NOT NULL
			AND other_link.used_at IS NULL
			AND other_link.failed_at IS NULL
	) INTO other_claim_in_progress;

	IF other_claim_in_progress THEN
		RETURN QUERY SELECT
			'claim-in-progress'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
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
