CREATE OR REPLACE FUNCTION "public"."block_invitation_if_member_cap_exceeded"(
	"p_org_id" "uuid",
	"p_invitation_id" "uuid",
	"p_blocked_by" "uuid",
	"p_member_limit" integer,
	"p_block_reason" text
)
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
	"used_seats" integer;
BEGIN
	PERFORM "pg_advisory_xact_lock"("hashtextextended"("p_org_id"::text, 1068));

	SELECT
		(
			SELECT count(*)
			FROM "public"."organization_memberships"
			WHERE "organization_memberships"."organization_id" = "p_org_id"
		)
		+
		(
			SELECT count(DISTINCT "organization_invitations"."normalized_email")
			FROM "public"."organization_invitations"
			WHERE "organization_invitations"."organization_id" = "p_org_id"
				AND "organization_invitations"."status" = 'pending'::"public"."invitation_status"
				AND "organization_invitations"."normalized_email" IS NOT NULL
				AND (
					"organization_invitations"."expires_at" IS NULL
					OR "organization_invitations"."expires_at" > now()
				)
		)
	INTO "used_seats";

	IF "used_seats" <= "p_member_limit" THEN
		RETURN false;
	END IF;

	UPDATE "public"."organization_invitations"
	SET
		"status" = 'blocked'::"public"."invitation_status",
		"blocked_at" = now(),
		"blocked_by" = "p_blocked_by"
	WHERE "organization_invitations"."id" = "p_invitation_id"
		AND "organization_invitations"."organization_id" = "p_org_id"
		AND "organization_invitations"."status" = 'pending'::"public"."invitation_status";

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Pending organization invitation % could not be blocked for plan limit enforcement', "p_invitation_id";
	END IF;

	RETURN true;
END;
$$;

ALTER FUNCTION "public"."block_invitation_if_member_cap_exceeded"("uuid", "uuid", "uuid", integer, text) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."block_invitation_if_member_cap_exceeded"("uuid", "uuid", "uuid", integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."block_invitation_if_member_cap_exceeded"("uuid", "uuid", "uuid", integer, text) TO "service_role";
