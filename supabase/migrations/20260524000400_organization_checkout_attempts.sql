CREATE TABLE IF NOT EXISTS "public"."organization_checkout_attempts" (
	"id" uuid DEFAULT "gen_random_uuid"() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_customer_id" text,
	"commercial_plan" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"checkout_url" text,
	"status" text NOT NULL DEFAULT 'in_progress'::text,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."organization_checkout_attempts" OWNER TO "postgres";

ALTER TABLE "public"."organization_checkout_attempts"
	DROP CONSTRAINT IF EXISTS "organization_checkout_attempts_pkey";

ALTER TABLE ONLY "public"."organization_checkout_attempts"
	ADD CONSTRAINT "organization_checkout_attempts_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."organization_checkout_attempts"
	DROP CONSTRAINT IF EXISTS "organization_checkout_attempts_organization_id_fkey";

ALTER TABLE ONLY "public"."organization_checkout_attempts"
	ADD CONSTRAINT "organization_checkout_attempts_organization_id_fkey"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE "public"."organization_checkout_attempts"
	DROP CONSTRAINT IF EXISTS "organization_checkout_attempts_commercial_plan_check";

ALTER TABLE "public"."organization_checkout_attempts"
	ADD CONSTRAINT "organization_checkout_attempts_commercial_plan_check"
	CHECK ("commercial_plan" = ANY (ARRAY['team'::text, 'unit'::text]));

ALTER TABLE "public"."organization_checkout_attempts"
	DROP CONSTRAINT IF EXISTS "organization_checkout_attempts_status_check";

ALTER TABLE "public"."organization_checkout_attempts"
	ADD CONSTRAINT "organization_checkout_attempts_status_check"
	CHECK ("status" = ANY (ARRAY['in_progress'::text, 'completed'::text, 'canceled'::text, 'expired'::text, 'failed'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS "organization_checkout_attempts_active_org_key"
	ON "public"."organization_checkout_attempts" USING "btree" ("organization_id")
	WHERE "status" = 'in_progress'::text;

CREATE UNIQUE INDEX IF NOT EXISTS "organization_checkout_attempts_session_key"
	ON "public"."organization_checkout_attempts" USING "btree" ("stripe_checkout_session_id")
	WHERE "stripe_checkout_session_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "organization_checkout_attempts_org_status_expires_idx"
	ON "public"."organization_checkout_attempts" USING "btree" ("organization_id", "status", "expires_at");

DROP TRIGGER IF EXISTS "organization_checkout_attempts_updated_at"
	ON "public"."organization_checkout_attempts";

CREATE OR REPLACE TRIGGER "organization_checkout_attempts_updated_at"
	BEFORE UPDATE ON "public"."organization_checkout_attempts"
	FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."organization_checkout_attempts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages organization checkout attempts"
	ON "public"."organization_checkout_attempts";

CREATE POLICY "Service role manages organization checkout attempts"
	ON "public"."organization_checkout_attempts"
	USING (("auth"."role"() = 'service_role'::text))
	WITH CHECK (("auth"."role"() = 'service_role'::text));

DROP POLICY IF EXISTS "Members can view organization checkout attempts"
	ON "public"."organization_checkout_attempts";

DROP POLICY IF EXISTS "Owners can view organization checkout attempts"
	ON "public"."organization_checkout_attempts";

CREATE POLICY "Owners can view organization checkout attempts"
	ON "public"."organization_checkout_attempts"
	FOR SELECT
	USING ("public"."is_org_owner"("organization_id"));

REVOKE ALL ON TABLE "public"."organization_checkout_attempts" FROM "anon";
REVOKE ALL ON TABLE "public"."organization_checkout_attempts" FROM "authenticated";
GRANT SELECT ON TABLE "public"."organization_checkout_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_checkout_attempts" TO "service_role";
