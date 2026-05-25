ALTER TABLE "public"."organization_billing_snapshots"
	ADD COLUMN IF NOT EXISTS "cancellation_reason" text,
	ADD COLUMN IF NOT EXISTS "cancellation_feedback" text;

ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_cancellation_reason_check";

ALTER TABLE "public"."organization_billing_snapshots"
	ADD CONSTRAINT "organization_billing_snapshots_cancellation_reason_check"
	CHECK (
		"cancellation_reason" IS NULL
		OR "cancellation_reason" = ANY (
			ARRAY[
				'canceled_by_retention_policy'::text,
				'cancellation_requested'::text,
				'payment_disputed'::text,
				'payment_failed'::text
			]
		)
	);

ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_cancellation_feedback_check";

ALTER TABLE "public"."organization_billing_snapshots"
	ADD CONSTRAINT "organization_billing_snapshots_cancellation_feedback_check"
	CHECK (
		"cancellation_feedback" IS NULL
		OR "cancellation_feedback" = ANY (
			ARRAY[
				'customer_service'::text,
				'low_quality'::text,
				'missing_features'::text,
				'other'::text,
				'switched_service'::text,
				'too_complex'::text,
				'too_expensive'::text,
				'unused'::text
			]
		)
	);

CREATE OR REPLACE FUNCTION "public"."upsert_organization_billing_snapshot_if_current"(
	"p_snapshot" jsonb
) RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
	v_row_count integer;
BEGIN
	INSERT INTO "public"."organization_billing_snapshots" (
		"organization_id",
		"source",
		"commercial_plan",
		"stripe_customer_id",
		"stripe_subscription_id",
		"stripe_product_id",
		"stripe_price_id",
		"subscription_status",
		"collection_status",
		"current_period_start",
		"current_period_end",
		"cancel_at_period_end",
		"canceled_at",
		"cancellation_reason",
		"cancellation_feedback",
		"trial_end",
		"sync_status",
		"last_stripe_event_id",
		"last_stripe_event_type",
		"last_stripe_event_created_at",
		"last_processed_at",
		"drift_detected"
	)
	VALUES (
		("p_snapshot" ->> 'organization_id')::uuid,
		COALESCE("p_snapshot" ->> 'source', 'stripe'),
		COALESCE("p_snapshot" ->> 'commercial_plan', 'free'),
		"p_snapshot" ->> 'stripe_customer_id',
		"p_snapshot" ->> 'stripe_subscription_id',
		"p_snapshot" ->> 'stripe_product_id',
		"p_snapshot" ->> 'stripe_price_id',
		"p_snapshot" ->> 'subscription_status',
		"p_snapshot" ->> 'collection_status',
		("p_snapshot" ->> 'current_period_start')::timestamp with time zone,
		("p_snapshot" ->> 'current_period_end')::timestamp with time zone,
		COALESCE(("p_snapshot" ->> 'cancel_at_period_end')::boolean, false),
		("p_snapshot" ->> 'canceled_at')::timestamp with time zone,
		"p_snapshot" ->> 'cancellation_reason',
		"p_snapshot" ->> 'cancellation_feedback',
		("p_snapshot" ->> 'trial_end')::timestamp with time zone,
		COALESCE("p_snapshot" ->> 'sync_status', 'not_configured'),
		"p_snapshot" ->> 'last_stripe_event_id',
		"p_snapshot" ->> 'last_stripe_event_type',
		("p_snapshot" ->> 'last_stripe_event_created_at')::timestamp with time zone,
		("p_snapshot" ->> 'last_processed_at')::timestamp with time zone,
		COALESCE(("p_snapshot" ->> 'drift_detected')::boolean, false)
	)
	ON CONFLICT ("organization_id") DO UPDATE
	SET
		"source" = EXCLUDED."source",
		"commercial_plan" = EXCLUDED."commercial_plan",
		"stripe_customer_id" = EXCLUDED."stripe_customer_id",
		"stripe_subscription_id" = EXCLUDED."stripe_subscription_id",
		"stripe_product_id" = EXCLUDED."stripe_product_id",
		"stripe_price_id" = EXCLUDED."stripe_price_id",
		"subscription_status" = EXCLUDED."subscription_status",
		"collection_status" = EXCLUDED."collection_status",
		"current_period_start" = EXCLUDED."current_period_start",
		"current_period_end" = EXCLUDED."current_period_end",
		"cancel_at_period_end" = EXCLUDED."cancel_at_period_end",
		"canceled_at" = EXCLUDED."canceled_at",
		"cancellation_reason" = EXCLUDED."cancellation_reason",
		"cancellation_feedback" = EXCLUDED."cancellation_feedback",
		"trial_end" = EXCLUDED."trial_end",
		"sync_status" = EXCLUDED."sync_status",
		"last_stripe_event_id" = EXCLUDED."last_stripe_event_id",
		"last_stripe_event_type" = EXCLUDED."last_stripe_event_type",
		"last_stripe_event_created_at" = EXCLUDED."last_stripe_event_created_at",
		"last_processed_at" = EXCLUDED."last_processed_at",
		"drift_detected" = EXCLUDED."drift_detected"
		WHERE
			"organization_billing_snapshots"."last_stripe_event_created_at" IS NULL
			OR (
				EXCLUDED."last_stripe_event_created_at" IS NOT NULL
				AND (
					"organization_billing_snapshots"."last_stripe_event_created_at" < EXCLUDED."last_stripe_event_created_at"
					OR (
						"organization_billing_snapshots"."last_stripe_event_created_at" = EXCLUDED."last_stripe_event_created_at"
						AND COALESCE("organization_billing_snapshots"."last_stripe_event_id", '') <= COALESCE(EXCLUDED."last_stripe_event_id", '')
					)
				)
			);

	GET DIAGNOSTICS v_row_count = ROW_COUNT;
	RETURN v_row_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION "public"."upsert_organization_billing_snapshot_if_current"(jsonb) FROM "anon";
REVOKE ALL ON FUNCTION "public"."upsert_organization_billing_snapshot_if_current"(jsonb) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."upsert_organization_billing_snapshot_if_current"(jsonb) TO "service_role";
