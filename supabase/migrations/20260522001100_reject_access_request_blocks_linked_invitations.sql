CREATE OR REPLACE FUNCTION "public"."reject_access_request_and_block_linked_invitations"(
	"p_access_request_id" "uuid",
	"p_reviewer_id" "uuid"
)
RETURNS TABLE(
	"reject_status" "text",
	"organization_invitation_id" "uuid",
	"organization_id" "uuid",
	"invitation_email" "text",
	"blocked_at" timestamp with time zone
)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
	"request_email" "text";
BEGIN
	UPDATE "public"."access_requests"
	SET
		"status" = 'rejected',
		"reviewed_by" = "p_reviewer_id",
		"reviewed_at" = now()
	WHERE "access_requests"."id" = "p_access_request_id"
		AND "access_requests"."status" = 'pending'
	RETURNING "access_requests"."email"
	INTO "request_email";

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'not_found'::"text", NULL::"uuid", NULL::"uuid", NULL::"text", NULL::timestamp with time zone;
		RETURN;
	END IF;

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
			AND "organization_invitations"."normalized_email" = lower(btrim("request_email"))
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
			'organization_invitation.blocked_by_access_request_rejection',
			'organization_invitation',
			"blocked"."id",
			jsonb_build_object(
				'accessRequestId', "p_access_request_id",
				'invitationId', "blocked"."id",
				'reason', 'linked_platform_access_rejected'
			),
			'warning'
		FROM "blocked"
		RETURNING "audit_logs"."id"
	)
	SELECT
		'rejected'::"text",
		"blocked"."id",
		"blocked"."organization_id",
		"blocked"."email",
		"blocked"."blocked_at"
	FROM "blocked";

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'rejected'::"text", NULL::"uuid", NULL::"uuid", NULL::"text", NULL::timestamp with time zone;
	END IF;
END;
$$;

REVOKE ALL ON FUNCTION "public"."reject_access_request_and_block_linked_invitations"("uuid", "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."reject_access_request_and_block_linked_invitations"("uuid", "uuid") TO "service_role";
