DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM (
			SELECT lower(btrim("auth"."users"."email")) AS "normalized_email"
			FROM "auth"."users"
			WHERE "auth"."users"."email" IS NOT NULL
				AND btrim("auth"."users"."email") <> ''
			GROUP BY lower(btrim("auth"."users"."email"))
			HAVING count(*) > 1
		) AS "duplicate_normalized_auth_emails"
	) THEN
		RAISE EXCEPTION 'Duplicate normalized auth.users emails would violate public.user_email_identities.normalized_email';
	END IF;
END;
$$;

CREATE TABLE "public"."user_email_identities" (
	"user_id" uuid NOT NULL,
	"normalized_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_identities_pkey" PRIMARY KEY ("user_id"),
	CONSTRAINT "user_email_identities_normalized_email_key" UNIQUE ("normalized_email"),
	CONSTRAINT "user_email_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
	CONSTRAINT "user_email_identities_normalized_email_check" CHECK (
		"normalized_email" = lower(btrim("normalized_email"))
		AND "normalized_email" <> ''
	)
);

CREATE OR REPLACE TRIGGER "update_user_email_identities_updated_at"
	BEFORE UPDATE ON "public"."user_email_identities"
	FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."user_email_identities" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage user email identities"
	ON "public"."user_email_identities";

CREATE POLICY "Service role can manage user email identities"
	ON "public"."user_email_identities"
	FOR ALL
	TO "service_role"
	USING (("auth"."role"() = 'service_role'::"text"))
	WITH CHECK (("auth"."role"() = 'service_role'::"text"));

REVOKE ALL ON TABLE "public"."user_email_identities" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."user_email_identities" FROM "anon";
REVOKE ALL ON TABLE "public"."user_email_identities" FROM "authenticated";
GRANT ALL ON TABLE "public"."user_email_identities" TO "service_role";

INSERT INTO "public"."user_email_identities" ("user_id", "normalized_email")
SELECT "auth"."users"."id", lower(btrim("auth"."users"."email"))
FROM "auth"."users"
WHERE "auth"."users"."email" IS NOT NULL
	AND btrim("auth"."users"."email") <> ''
ON CONFLICT ("user_id") DO UPDATE
SET "normalized_email" = EXCLUDED."normalized_email";

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

	INSERT INTO "public"."user_email_identities" ("user_id", "normalized_email")
	VALUES ("current_user_id", "current_email")
	ON CONFLICT ("user_id") DO UPDATE
	SET "normalized_email" = EXCLUDED."normalized_email";

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
