ALTER TYPE "public"."invitation_status" ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE "public"."invitation_status" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "public"."invitation_status" ADD VALUE IF NOT EXISTS 'blocked';

ALTER TABLE "public"."organization_invitations"
	ADD COLUMN IF NOT EXISTS "normalized_email" text GENERATED ALWAYS AS (lower(btrim("email"))) STORED,
	ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
	ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "accepted_by" uuid,
	ADD COLUMN IF NOT EXISTS "declined_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "declined_by" uuid,
	ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "revoked_by" uuid,
	ADD COLUMN IF NOT EXISTS "expired_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "blocked_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "blocked_by" uuid;

UPDATE "public"."organization_invitations"
SET "accepted_at" = COALESCE("accepted_at", "created_at")
WHERE "status" = 'accepted'::"public"."invitation_status";

UPDATE "public"."organization_invitations"
SET "revoked_at" = COALESCE("revoked_at", "created_at")
WHERE "status" = 'revoked'::"public"."invitation_status";

WITH ranked_pending_invitations AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "organization_id", "normalized_email"
			ORDER BY "created_at" DESC, "id" DESC
		) AS "pending_rank"
	FROM "public"."organization_invitations"
	WHERE "status" = 'pending'::"public"."invitation_status"
)
UPDATE "public"."organization_invitations" AS "organization_invitations"
SET
	"status" = 'revoked'::"public"."invitation_status",
	"revoked_at" = COALESCE("organization_invitations"."revoked_at", now())
FROM ranked_pending_invitations
WHERE "organization_invitations"."id" = ranked_pending_invitations."id"
	AND ranked_pending_invitations."pending_rank" > 1;

ALTER TABLE "public"."organization_invitations"
	DROP CONSTRAINT IF EXISTS "organization_invitations_accepted_by_fkey",
	ADD CONSTRAINT "organization_invitations_accepted_by_fkey"
		FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id"),
	DROP CONSTRAINT IF EXISTS "organization_invitations_declined_by_fkey",
	ADD CONSTRAINT "organization_invitations_declined_by_fkey"
		FOREIGN KEY ("declined_by") REFERENCES "auth"."users"("id"),
	DROP CONSTRAINT IF EXISTS "organization_invitations_revoked_by_fkey",
	ADD CONSTRAINT "organization_invitations_revoked_by_fkey"
		FOREIGN KEY ("revoked_by") REFERENCES "auth"."users"("id"),
	DROP CONSTRAINT IF EXISTS "organization_invitations_blocked_by_fkey",
	ADD CONSTRAINT "organization_invitations_blocked_by_fkey"
		FOREIGN KEY ("blocked_by") REFERENCES "auth"."users"("id");

ALTER TABLE "public"."organization_invitations"
	DROP CONSTRAINT IF EXISTS "organization_invitations_pending_expiry_check",
	ADD CONSTRAINT "organization_invitations_pending_expiry_check"
		CHECK (("status"::text <> 'pending') OR ("expires_at" IS NOT NULL)),
	DROP CONSTRAINT IF EXISTS "organization_invitations_lifecycle_state_check",
	ADD CONSTRAINT "organization_invitations_lifecycle_state_check"
		CHECK (
			(
				("status"::text = 'pending')
				AND ("accepted_at" IS NULL)
				AND ("declined_at" IS NULL)
				AND ("revoked_at" IS NULL)
				AND ("expired_at" IS NULL)
				AND ("blocked_at" IS NULL)
			)
			OR (
				("status"::text = 'accepted')
				AND ("accepted_at" IS NOT NULL)
				AND ("declined_at" IS NULL)
				AND ("revoked_at" IS NULL)
				AND ("expired_at" IS NULL)
				AND ("blocked_at" IS NULL)
			)
			OR (
				("status"::text = 'declined')
				AND ("accepted_at" IS NULL)
				AND ("declined_at" IS NOT NULL)
				AND ("revoked_at" IS NULL)
				AND ("expired_at" IS NULL)
				AND ("blocked_at" IS NULL)
			)
			OR (
				("status"::text = 'revoked')
				AND ("accepted_at" IS NULL)
				AND ("declined_at" IS NULL)
				AND ("revoked_at" IS NOT NULL)
				AND ("expired_at" IS NULL)
				AND ("blocked_at" IS NULL)
			)
			OR (
				("status"::text = 'expired')
				AND ("accepted_at" IS NULL)
				AND ("declined_at" IS NULL)
				AND ("revoked_at" IS NULL)
				AND ("expired_at" IS NOT NULL)
				AND ("blocked_at" IS NULL)
			)
			OR (
				("status"::text = 'blocked')
				AND ("accepted_at" IS NULL)
				AND ("declined_at" IS NULL)
				AND ("revoked_at" IS NULL)
				AND ("expired_at" IS NULL)
				AND ("blocked_at" IS NOT NULL)
			)
		),
	DROP CONSTRAINT IF EXISTS "organization_invitations_actor_timestamp_check",
	ADD CONSTRAINT "organization_invitations_actor_timestamp_check"
		CHECK (
			(("accepted_by" IS NULL) OR ("accepted_at" IS NOT NULL))
			AND (("declined_by" IS NULL) OR ("declined_at" IS NOT NULL))
			AND (("revoked_by" IS NULL) OR ("revoked_at" IS NOT NULL))
			AND (("blocked_by" IS NULL) OR ("blocked_at" IS NOT NULL))
		);

ALTER TABLE "public"."organization_invitations"
	DROP CONSTRAINT IF EXISTS "clinic_invitations_clinic_id_email_key";

CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_one_pending_per_org_email_idx"
	ON "public"."organization_invitations" USING "btree" ("organization_id", "normalized_email")
	WHERE ("status" = 'pending'::"public"."invitation_status");

CREATE UNIQUE INDEX IF NOT EXISTS "organization_memberships_one_per_org_user_idx"
	ON "public"."organization_memberships" USING "btree" ("organization_id", "user_id");

DROP INDEX IF EXISTS "public"."idx_organization_invitations_email";

CREATE INDEX IF NOT EXISTS "organization_invitations_normalized_email_idx"
	ON "public"."organization_invitations" USING "btree" ("normalized_email");

CREATE INDEX IF NOT EXISTS "organization_invitations_pending_expiry_idx"
	ON "public"."organization_invitations" USING "btree" ("expires_at")
	WHERE ("status" = 'pending'::"public"."invitation_status");

DROP POLICY IF EXISTS "Users can view invitations addressed to them" ON "public"."organization_invitations";

CREATE POLICY "Users can view invitations addressed to them"
	ON "public"."organization_invitations"
	FOR SELECT
	USING ("normalized_email" = lower(btrim((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::text))));

DROP POLICY IF EXISTS "Users can delete invitations addressed to them" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Admins can delete invitations" ON "public"."organization_invitations";

DROP POLICY IF EXISTS "Members can view invitations for their organizations" ON "public"."organization_invitations";
DROP POLICY IF EXISTS "Governors can view invitations for their organizations" ON "public"."organization_invitations";

CREATE POLICY "Governors can view invitations for their organizations"
	ON "public"."organization_invitations"
	FOR SELECT
	USING ("public"."can_manage_org_members"("organization_id"));

DROP POLICY IF EXISTS "Users can view organizations they are invited to" ON "public"."organizations";

CREATE POLICY "Users can view organizations they are invited to"
	ON "public"."organizations"
	FOR SELECT
	USING (
		EXISTS (
			SELECT 1
			FROM "public"."organization_invitations"
			WHERE
				("organization_invitations"."organization_id" = "organizations"."id")
				AND (
					"organization_invitations"."normalized_email" =
					lower(btrim((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::text)))
				)
				AND ("organization_invitations"."status" = 'pending'::"public"."invitation_status")
		)
	);
