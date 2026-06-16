DROP FUNCTION IF EXISTS "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb);

CREATE OR REPLACE FUNCTION "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(
	"p_snapshot" jsonb,
	"p_mirror" jsonb,
	"p_event_position" jsonb DEFAULT NULL
) RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
	v_input_event_created_at timestamp with time zone;
	v_input_event_id text;
	v_snapshot_row_count integer;
	v_mirror_row_count integer;
BEGIN
	v_input_event_created_at := COALESCE(
		NULLIF("p_event_position" ->> 'eventCreatedAt', '')::timestamp with time zone,
		NULLIF("p_snapshot" ->> 'last_stripe_event_created_at', '')::timestamp with time zone
	);
	v_input_event_id := COALESCE("p_event_position" ->> 'eventId', "p_snapshot" ->> 'last_stripe_event_id', '');

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
		"last_reconciled_at",
		"reconciliation_result",
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
		("p_snapshot" ->> 'last_reconciled_at')::timestamp with time zone,
		"p_snapshot" ->> 'reconciliation_result',
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
		"last_reconciled_at" = EXCLUDED."last_reconciled_at",
		"reconciliation_result" = EXCLUDED."reconciliation_result",
		"drift_detected" = EXCLUDED."drift_detected"
		WHERE
			"organization_billing_snapshots"."last_stripe_event_created_at" IS NULL
			OR (
				v_input_event_created_at IS NOT NULL
				AND (
					"organization_billing_snapshots"."last_stripe_event_created_at" < v_input_event_created_at
					OR (
						"organization_billing_snapshots"."last_stripe_event_created_at" = v_input_event_created_at
						AND COALESCE("organization_billing_snapshots"."last_stripe_event_id", '') <= v_input_event_id
					)
				)
			);

	GET DIAGNOSTICS v_snapshot_row_count = ROW_COUNT;
	IF v_snapshot_row_count = 0 THEN
		RETURN false;
	END IF;

	UPDATE "public"."organizations"
	SET
		"tier" = CASE
			WHEN "p_mirror" ? 'tier' THEN COALESCE("p_mirror" ->> 'tier', "organizations"."tier")
			ELSE "organizations"."tier"
		END,
		"stripe_customer_id" = CASE
			WHEN "p_mirror" ? 'stripe_customer_id' THEN "p_mirror" ->> 'stripe_customer_id'
			ELSE "organizations"."stripe_customer_id"
		END,
		"stripe_subscription_id" = CASE
			WHEN "p_mirror" ? 'stripe_subscription_id' THEN "p_mirror" ->> 'stripe_subscription_id'
			ELSE "organizations"."stripe_subscription_id"
		END,
		"subscription_status" = CASE
			WHEN "p_mirror" ? 'subscription_status' THEN "p_mirror" ->> 'subscription_status'
			ELSE "organizations"."subscription_status"
		END,
		"current_period_end" = CASE
			WHEN "p_mirror" ? 'current_period_end' THEN ("p_mirror" ->> 'current_period_end')::timestamp with time zone
			ELSE "organizations"."current_period_end"
		END
	WHERE "id" = ("p_snapshot" ->> 'organization_id')::uuid;

	GET DIAGNOSTICS v_mirror_row_count = ROW_COUNT;
	RETURN v_mirror_row_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb, jsonb) FROM "anon";
REVOKE ALL ON FUNCTION "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb, jsonb) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb, jsonb) TO "service_role";
