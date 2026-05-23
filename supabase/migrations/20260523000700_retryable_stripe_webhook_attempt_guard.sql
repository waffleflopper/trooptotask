CREATE OR REPLACE FUNCTION "public"."record_retryable_stripe_webhook_event_attempt"(
	"p_id" text,
	"p_type" text,
	"p_data" jsonb,
	"p_object_id" text,
	"p_secondary_dedupe_key" text,
	"p_event_created_at" timestamp with time zone
) RETURNS integer
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
	v_attempt_count integer;
BEGIN
	UPDATE "public"."stripe_webhook_events"
	SET
		"type" = "p_type",
		"data" = "p_data",
		"object_id" = "p_object_id",
		"secondary_dedupe_key" = "p_secondary_dedupe_key",
		"event_created_at" = "p_event_created_at",
		"processing_state" = 'retryable_failed'::text,
		"attempt_count" = "stripe_webhook_events"."attempt_count" + 1,
		"last_error" = NULL,
		"processing_result" = 'processing started'
	WHERE
		"id" = "p_id"
		AND "processed" IS NOT TRUE
		AND "processing_state" = 'retryable_failed'::text
	RETURNING "attempt_count" INTO v_attempt_count;

	RETURN v_attempt_count;
END;
$$;

REVOKE ALL ON FUNCTION "public"."record_retryable_stripe_webhook_event_attempt"(text, text, jsonb, text, text, timestamp with time zone) FROM "anon";
REVOKE ALL ON FUNCTION "public"."record_retryable_stripe_webhook_event_attempt"(text, text, jsonb, text, text, timestamp with time zone) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."record_retryable_stripe_webhook_event_attempt"(text, text, jsonb, text, text, timestamp with time zone) TO "service_role";
