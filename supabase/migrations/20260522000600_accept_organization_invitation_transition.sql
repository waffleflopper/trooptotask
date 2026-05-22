DROP FUNCTION IF EXISTS "public"."accept_organization_invitation"("uuid");

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
		"organization_invitations"."can_view_calendar",
		"organization_invitations"."can_edit_calendar",
		"organization_invitations"."can_view_personnel",
		"organization_invitations"."can_edit_personnel",
		"organization_invitations"."can_view_training",
		"organization_invitations"."can_edit_training",
		"organization_invitations"."can_view_critical_tasks",
		"organization_invitations"."can_edit_critical_tasks",
		"organization_invitations"."can_view_onboarding",
		"organization_invitations"."can_edit_onboarding",
		"organization_invitations"."can_view_rating_scheme",
		"organization_invitations"."can_edit_rating_scheme",
		"organization_invitations"."can_manage_members",
		"organization_invitations"."scoped_group_id",
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
		"can_view_calendar",
		"can_edit_calendar",
		"can_view_personnel",
		"can_edit_personnel",
		"can_view_training",
		"can_edit_training",
		"can_view_critical_tasks",
		"can_edit_critical_tasks",
		"can_view_onboarding",
		"can_edit_onboarding",
		"can_view_rating_scheme",
		"can_edit_rating_scheme",
		"can_manage_members",
		"scoped_group_id",
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
		COALESCE("invitation"."can_view_calendar", TRUE),
		COALESCE("invitation"."can_edit_calendar", TRUE),
		COALESCE("invitation"."can_view_personnel", TRUE),
		COALESCE("invitation"."can_edit_personnel", TRUE),
		COALESCE("invitation"."can_view_training", TRUE),
		COALESCE("invitation"."can_edit_training", TRUE),
		COALESCE("invitation"."can_view_critical_tasks", TRUE),
		COALESCE("invitation"."can_edit_critical_tasks", TRUE),
		COALESCE("invitation"."can_view_onboarding", TRUE),
		COALESCE("invitation"."can_edit_onboarding", TRUE),
		COALESCE("invitation"."can_view_rating_scheme", "invitation"."can_view_personnel", TRUE),
		COALESCE("invitation"."can_edit_rating_scheme", "invitation"."can_edit_personnel", TRUE),
		COALESCE("invitation"."can_manage_members", FALSE),
		"invitation"."scoped_group_id",
		"invitation"."member_preset",
		COALESCE("invitation"."capability_overrides", '{}'::jsonb),
		"invitation"."access_scope_kind",
		COALESCE("invitation"."access_scope_group_ids", ARRAY[]::"uuid"[])
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
