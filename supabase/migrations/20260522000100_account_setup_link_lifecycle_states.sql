ALTER TABLE "public"."account_setup_links"
	ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "failed_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "failure_reason" text,
	ADD COLUMN IF NOT EXISTS "revocation_reason" text;

UPDATE "public"."account_setup_links"
SET "claimed_at" = "used_at"
WHERE "used_at" IS NOT NULL
	AND "claimed_at" IS NULL;

ALTER TABLE "public"."account_setup_links"
	DROP CONSTRAINT IF EXISTS "account_setup_links_failure_requires_claim_check";

ALTER TABLE "public"."account_setup_links"
	ADD CONSTRAINT "account_setup_links_failure_requires_claim_check"
	CHECK (("failed_at" IS NULL) OR ("claimed_at" IS NOT NULL));

ALTER TABLE "public"."account_setup_links"
	DROP CONSTRAINT IF EXISTS "account_setup_links_completion_requires_claim_check";

ALTER TABLE "public"."account_setup_links"
	ADD CONSTRAINT "account_setup_links_completion_requires_claim_check"
	CHECK (("used_at" IS NULL) OR ("claimed_at" IS NOT NULL));

ALTER TABLE "public"."account_setup_links"
	DROP CONSTRAINT IF EXISTS "account_setup_links_revocation_reason_check";

ALTER TABLE "public"."account_setup_links"
	ADD CONSTRAINT "account_setup_links_revocation_reason_check"
	CHECK (
		("revocation_reason" IS NULL)
		OR ("revocation_reason" = ANY (ARRAY['manual'::text, 'replaced'::text, 'cleanup'::text]))
	);

ALTER TABLE "public"."account_setup_links"
	DROP CONSTRAINT IF EXISTS "account_setup_links_failure_reason_check";

ALTER TABLE "public"."account_setup_links"
	ADD CONSTRAINT "account_setup_links_failure_reason_check"
	CHECK (
		("failure_reason" IS NULL)
		OR (
			("failed_at" IS NOT NULL)
			AND (
				"failure_reason" = ANY (
					ARRAY[
						'access-request-missing'::text,
						'access-request-completed'::text,
						'account-create-failed'::text,
						'completion-tracking-failed'::text
					]
				)
			)
		)
	);

ALTER TABLE "public"."account_setup_links"
	DROP CONSTRAINT IF EXISTS "account_setup_links_revocation_reason_requires_revocation_check";

ALTER TABLE "public"."account_setup_links"
	ADD CONSTRAINT "account_setup_links_revocation_reason_requires_revocation_check"
	CHECK (("revocation_reason" IS NULL) OR ("revoked_at" IS NOT NULL));

CREATE INDEX IF NOT EXISTS "account_setup_links_claimed_idx"
	ON "public"."account_setup_links" USING "btree" ("claimed_at")
	WHERE ("claimed_at" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "account_setup_links_failed_idx"
	ON "public"."account_setup_links" USING "btree" ("failed_at")
	WHERE ("failed_at" IS NOT NULL);

DROP INDEX IF EXISTS "public"."account_setup_links_one_active_per_request_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "account_setup_links_one_active_per_request_idx"
	ON "public"."account_setup_links" USING "btree" ("access_request_id")
	WHERE (
		("claimed_at" IS NULL)
		AND ("failed_at" IS NULL)
		AND ("used_at" IS NULL)
		AND ("revoked_at" IS NULL)
	);
