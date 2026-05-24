CREATE TABLE IF NOT EXISTS "public"."organization_billing_snapshots" (
	"id" uuid DEFAULT "gen_random_uuid"() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" text NOT NULL DEFAULT 'stripe'::text,
	"commercial_plan" text NOT NULL DEFAULT 'free'::text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"subscription_status" text,
	"collection_status" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean NOT NULL DEFAULT false,
	"canceled_at" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"sync_status" text NOT NULL DEFAULT 'not_configured'::text,
	"last_stripe_event_id" text,
	"last_stripe_event_type" text,
	"last_stripe_event_created_at" timestamp with time zone,
	"last_processed_at" timestamp with time zone,
	"last_reconciled_at" timestamp with time zone,
	"reconciliation_result" text,
	"drift_detected" boolean NOT NULL DEFAULT false,
	"created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."organization_billing_snapshots" OWNER TO "postgres";

ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_pkey";

ALTER TABLE ONLY "public"."organization_billing_snapshots"
	ADD CONSTRAINT "organization_billing_snapshots_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX IF NOT EXISTS "organization_billing_snapshots_org_key"
	ON "public"."organization_billing_snapshots" USING "btree" ("organization_id");

CREATE INDEX IF NOT EXISTS "organization_billing_snapshots_subscription_idx"
	ON "public"."organization_billing_snapshots" USING "btree" ("stripe_subscription_id")
	WHERE "stripe_subscription_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "organization_billing_snapshots_sync_health_idx"
	ON "public"."organization_billing_snapshots" USING "btree" ("sync_status", "drift_detected", "updated_at" DESC);

ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_organization_id_fkey";

ALTER TABLE ONLY "public"."organization_billing_snapshots"
	ADD CONSTRAINT "organization_billing_snapshots_organization_id_fkey"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_source_check";

ALTER TABLE "public"."organization_billing_snapshots"
	ADD CONSTRAINT "organization_billing_snapshots_source_check"
	CHECK ("source" = ANY (ARRAY['stripe'::text, 'gift'::text, 'billing_disabled'::text, 'legacy_organization'::text]));

ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_commercial_plan_check";

ALTER TABLE "public"."organization_billing_snapshots"
	ADD CONSTRAINT "organization_billing_snapshots_commercial_plan_check"
	CHECK ("commercial_plan" = ANY (ARRAY['free'::text, 'team'::text, 'unit'::text]));

ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_subscription_status_check";

ALTER TABLE "public"."organization_billing_snapshots"
	ADD CONSTRAINT "organization_billing_snapshots_subscription_status_check"
	CHECK (
		"subscription_status" IS NULL
		OR "subscription_status" = ANY (
			ARRAY[
				'active'::text,
				'trialing'::text,
				'past_due'::text,
				'unpaid'::text,
				'canceled'::text,
				'incomplete'::text,
				'incomplete_expired'::text,
				'paused'::text
			]
		)
	);

ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_sync_status_check";

ALTER TABLE "public"."organization_billing_snapshots"
	ADD CONSTRAINT "organization_billing_snapshots_sync_status_check"
	CHECK (
		"sync_status" = ANY (
			ARRAY[
				'not_configured'::text,
				'synced'::text,
				'pending'::text,
				'needs_reconciliation'::text,
				'billing_disabled'::text
			]
		)
	);

DROP TRIGGER IF EXISTS "organization_billing_snapshots_updated_at"
	ON "public"."organization_billing_snapshots";

CREATE OR REPLACE TRIGGER "organization_billing_snapshots_updated_at"
	BEFORE UPDATE ON "public"."organization_billing_snapshots"
	FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."organization_billing_snapshots" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages organization billing snapshots"
	ON "public"."organization_billing_snapshots";

CREATE POLICY "Service role manages organization billing snapshots"
	ON "public"."organization_billing_snapshots"
	USING (("auth"."role"() = 'service_role'::text))
	WITH CHECK (("auth"."role"() = 'service_role'::text));

DROP POLICY IF EXISTS "Members can view organization billing snapshots"
	ON "public"."organization_billing_snapshots";

CREATE POLICY "Members can view organization billing snapshots"
	ON "public"."organization_billing_snapshots"
	FOR SELECT
	USING ("public"."is_org_member"("organization_id"));

REVOKE ALL ON TABLE "public"."organization_billing_snapshots" FROM "anon";
REVOKE ALL ON TABLE "public"."organization_billing_snapshots" FROM "authenticated";
GRANT SELECT ON TABLE "public"."organization_billing_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_billing_snapshots" TO "service_role";
