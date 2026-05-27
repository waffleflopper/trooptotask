CREATE OR REPLACE FUNCTION "public"."accept_organization_invitation"("p_invitation_id" "uuid")
RETURNS TABLE("accept_status" "text", "accepted_organization_id" "uuid")
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
	"current_user_id" "uuid" := "auth"."uid"();
	"current_email" "text" := lower(btrim(COALESCE(("auth"."jwt"() ->> 'email'::"text"), '')));
	"invitation" "record";
	"inserted_count" integer := 0;
BEGIN
	IF "current_user_id" IS NULL OR "current_email" = '' THEN
		RETURN QUERY SELECT 'not_found'::"text", NULL::"uuid";
		RETURN;
	END IF;

	SELECT
		"organization_invitations"."id",
		"organization_invitations"."organization_id",
		"organization_invitations"."email",
		"organization_invitations"."normalized_email",
		"organization_invitations"."invited_by",
		"organization_invitations"."status",
		"organization_invitations"."expires_at",
		"organization_invitations"."role",
		"organization_invitations"."member_preset",
		"organization_invitations"."capability_overrides",
		"organization_invitations"."access_scope_kind",
		"organization_invitations"."access_scope_group_ids"
	INTO "invitation"
	FROM "public"."organization_invitations"
	WHERE "organization_invitations"."id" = "p_invitation_id"
	FOR UPDATE;

	IF NOT FOUND OR "invitation"."normalized_email" <> "current_email" THEN
		RETURN QUERY SELECT 'not_found'::"text", NULL::"uuid";
		RETURN;
	END IF;

	IF "invitation"."status" = 'accepted'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_accepted'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	IF "invitation"."status" = 'blocked'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'blocked'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	IF "invitation"."status" = 'expired'::"public"."invitation_status" OR "invitation"."expires_at" <= now() THEN
		UPDATE "public"."organization_invitations"
		SET
			"status" = 'expired'::"public"."invitation_status",
			"expired_at" = COALESCE("organization_invitations"."expired_at", now())
		WHERE "organization_invitations"."id" = "invitation"."id"
			AND "organization_invitations"."status" = 'pending'::"public"."invitation_status";

		RETURN QUERY SELECT 'expired'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	IF "invitation"."status" <> 'pending'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'not_found'::"text", NULL::"uuid";
		RETURN;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "public"."access_request_organization_invitation_links"
		WHERE "access_request_organization_invitation_links"."organization_invitation_id" = "invitation"."id"
	) AND NOT EXISTS (
		SELECT 1
		FROM "public"."access_request_organization_invitation_links"
		JOIN "public"."access_requests"
			ON "access_requests"."id" = "access_request_organization_invitation_links"."access_request_id"
		WHERE "access_request_organization_invitation_links"."organization_invitation_id" = "invitation"."id"
			AND lower(btrim("access_requests"."email")) = "current_email"
			AND "access_requests"."setup_completed_at" IS NOT NULL
	) THEN
		RETURN QUERY SELECT 'setup_required'::"text", NULL::"uuid";
		RETURN;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "invitation"."organization_id"
			AND "organization_memberships"."user_id" = "current_user_id"
	) THEN
		RETURN QUERY SELECT 'already_member'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	INSERT INTO "public"."organization_memberships" (
		"organization_id",
		"user_id",
		"email",
		"role",
		"invited_by",
		"member_preset",
		"capability_overrides",
		"access_scope_kind",
		"access_scope_group_ids"
	)
	VALUES (
		"invitation"."organization_id",
		"current_user_id",
		"current_email",
		COALESCE("invitation"."role", 'member'::"public"."organization_role"),
		"invitation"."invited_by",
		CASE
			WHEN "invitation"."role" = 'admin'::"public"."organization_role" THEN 'editor'
			ELSE COALESCE("invitation"."member_preset", 'editor')
		END,
		CASE
			WHEN "invitation"."role" = 'admin'::"public"."organization_role" THEN '{}'::jsonb
			ELSE COALESCE("invitation"."capability_overrides", '{}'::jsonb)
		END,
		CASE
			WHEN "invitation"."role" = 'admin'::"public"."organization_role" THEN 'organization'
			ELSE COALESCE("invitation"."access_scope_kind", 'organization')
		END,
		CASE
			WHEN "invitation"."role" = 'admin'::"public"."organization_role" THEN ARRAY[]::"uuid"[]
			ELSE COALESCE("invitation"."access_scope_group_ids", ARRAY[]::"uuid"[])
		END
	)
	ON CONFLICT ("organization_id", "user_id") DO NOTHING;

	GET DIAGNOSTICS "inserted_count" = ROW_COUNT;
	IF "inserted_count" = 0 THEN
		RETURN QUERY SELECT 'already_member'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	UPDATE "public"."organization_invitations"
	SET
		"status" = 'accepted'::"public"."invitation_status",
		"accepted_at" = now(),
		"accepted_by" = "current_user_id"
	WHERE "organization_invitations"."id" = "invitation"."id";

	RETURN QUERY SELECT 'accepted'::"text", "invitation"."organization_id";
END;
$$;

REVOKE ALL ON FUNCTION "public"."accept_organization_invitation"("uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."accept_organization_invitation"("uuid") TO "authenticated";
