DROP FUNCTION IF EXISTS "public"."decline_organization_invitation"(uuid);

CREATE OR REPLACE FUNCTION "public"."decline_organization_invitation"("p_invitation_id" uuid)
RETURNS TABLE("decline_status" text, "declined_organization_id" uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	"current_user_id" uuid := "auth"."uid"();
	"current_email" text := lower(btrim(("auth"."jwt"() ->> 'email'::text)));
	"invitation_record" "public"."organization_invitations"%ROWTYPE;
BEGIN
	IF "current_user_id" IS NULL OR "current_email" IS NULL OR "current_email" = '' THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
		RETURN;
	END IF;

	SELECT *
	INTO "invitation_record"
	FROM "public"."organization_invitations"
	WHERE "id" = "p_invitation_id"
	FOR UPDATE;

	IF NOT FOUND OR "invitation_record"."normalized_email" <> "current_email" THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'accepted'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_accepted'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'declined'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_declined'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'revoked'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'revoked'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'blocked'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'blocked'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF
		"invitation_record"."status" = 'expired'::"public"."invitation_status"
		OR "invitation_record"."expires_at" <= now()
	THEN
		UPDATE "public"."organization_invitations"
		SET
			"status" = 'expired'::"public"."invitation_status",
			"expired_at" = COALESCE("expired_at", now())
		WHERE "id" = "invitation_record"."id";

		RETURN QUERY SELECT 'expired'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF "invitation_record"."status" <> 'pending'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
		RETURN;
	END IF;

	UPDATE "public"."organization_invitations"
	SET
		"status" = 'declined'::"public"."invitation_status",
		"declined_at" = now(),
		"declined_by" = "current_user_id"
	WHERE "id" = "invitation_record"."id";

	RETURN QUERY SELECT 'declined'::text, "invitation_record"."organization_id";
END;
$$;

DROP FUNCTION IF EXISTS "public"."revoke_organization_invitation"(uuid, uuid);

CREATE OR REPLACE FUNCTION "public"."revoke_organization_invitation"(
	"p_invitation_id" uuid,
	"p_organization_id" uuid
)
RETURNS TABLE("revoke_status" text, "revoked_email" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	"current_user_id" uuid := "auth"."uid"();
	"invitation_record" "public"."organization_invitations"%ROWTYPE;
BEGIN
	IF "current_user_id" IS NULL THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::text;
		RETURN;
	END IF;

	SELECT *
	INTO "invitation_record"
	FROM "public"."organization_invitations"
	WHERE
		"id" = "p_invitation_id"
		AND "organization_id" = "p_organization_id"
	FOR UPDATE;

	IF NOT FOUND OR NOT "public"."can_manage_org_members"("invitation_record"."organization_id") THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::text;
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'accepted'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_accepted'::text, "invitation_record"."email";
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'declined'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_declined'::text, "invitation_record"."email";
		RETURN;
	END IF;

	IF
		"invitation_record"."status" = 'expired'::"public"."invitation_status"
		OR "invitation_record"."expires_at" <= now()
	THEN
		UPDATE "public"."organization_invitations"
		SET
			"status" = 'expired'::"public"."invitation_status",
			"expired_at" = COALESCE("expired_at", now())
		WHERE "id" = "invitation_record"."id";

		RETURN QUERY SELECT 'expired'::text, "invitation_record"."email";
		RETURN;
	END IF;

	IF "invitation_record"."status" <> 'pending'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'not_found'::text, "invitation_record"."email";
		RETURN;
	END IF;

	UPDATE "public"."organization_invitations"
	SET
		"status" = 'revoked'::"public"."invitation_status",
		"revoked_at" = now(),
		"revoked_by" = "current_user_id"
	WHERE "id" = "invitation_record"."id";

	RETURN QUERY SELECT 'revoked'::text, "invitation_record"."email";
END;
$$;

REVOKE ALL ON FUNCTION "public"."decline_organization_invitation"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."decline_organization_invitation"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."revoke_organization_invitation"(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."revoke_organization_invitation"(uuid, uuid) TO "authenticated";

DROP POLICY IF EXISTS "Users can delete invitations addressed to them" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Admins can delete invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Admins can update invitations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Users can decline invitations addressed to them" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Governors can revoke pending invitations" ON "public"."organization_invitations";

CREATE POLICY "Users can decline invitations addressed to them"
	ON "public"."organization_invitations"
	FOR UPDATE
	USING (
		("normalized_email" = lower(btrim(("auth"."jwt"() ->> 'email'::text))))
		AND ("status" = 'pending'::"public"."invitation_status")
	)
	WITH CHECK (
		("normalized_email" = lower(btrim(("auth"."jwt"() ->> 'email'::text))))
		AND ("status" IN ('declined'::"public"."invitation_status", 'expired'::"public"."invitation_status"))
		AND ("accepted_at" IS NULL)
		AND ("revoked_at" IS NULL)
		AND (("declined_by" IS NULL) OR ("declined_by" = "auth"."uid"()))
	);

CREATE POLICY "Governors can revoke pending invitations"
	ON "public"."organization_invitations"
	FOR UPDATE
	USING (
		"public"."can_manage_org_members"("organization_id")
		AND ("status" = 'pending'::"public"."invitation_status")
	)
	WITH CHECK (
		"public"."can_manage_org_members"("organization_id")
		AND ("status" IN ('revoked'::"public"."invitation_status", 'expired'::"public"."invitation_status"))
		AND ("accepted_at" IS NULL)
		AND ("declined_at" IS NULL)
		AND (("revoked_by" IS NULL) OR ("revoked_by" = "auth"."uid"()))
	);
