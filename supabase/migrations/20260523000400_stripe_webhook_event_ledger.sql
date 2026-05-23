ALTER TABLE "public"."stripe_webhook_events"
	ADD COLUMN IF NOT EXISTS "object_id" text,
	ADD COLUMN IF NOT EXISTS "secondary_dedupe_key" text,
	ADD COLUMN IF NOT EXISTS "event_created_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "processing_state" text NOT NULL DEFAULT 'retryable_failed'::text,
	ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS "last_error" text,
	ADD COLUMN IF NOT EXISTS "processing_result" text,
	ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL;

ALTER TABLE "public"."stripe_webhook_events"
	DROP CONSTRAINT IF EXISTS "stripe_webhook_events_processing_state_check";

ALTER TABLE "public"."stripe_webhook_events"
	ADD CONSTRAINT "stripe_webhook_events_processing_state_check"
	CHECK (
		"processing_state" = ANY (
			ARRAY[
				'processed'::text,
				'ignored'::text,
				'retryable_failed'::text,
				'permanently_failed'::text,
				'superseded'::text
			]
		)
	);

ALTER TABLE "public"."stripe_webhook_events"
	DROP CONSTRAINT IF EXISTS "stripe_webhook_events_attempt_count_check";

ALTER TABLE "public"."stripe_webhook_events"
	ADD CONSTRAINT "stripe_webhook_events_attempt_count_check"
	CHECK ("attempt_count" >= 0);

CREATE INDEX IF NOT EXISTS "stripe_webhook_events_processing_state_idx"
	ON "public"."stripe_webhook_events" USING "btree" ("processing_state", "updated_at");

CREATE INDEX IF NOT EXISTS "stripe_webhook_events_secondary_dedupe_idx"
	ON "public"."stripe_webhook_events" USING "btree" ("secondary_dedupe_key", "event_created_at")
	WHERE "secondary_dedupe_key" IS NOT NULL;

UPDATE "public"."stripe_webhook_events"
	SET
		"processing_state" = CASE
			WHEN "processed" IS TRUE THEN 'processed'::text
			WHEN "error" IS NOT NULL THEN 'retryable_failed'::text
			ELSE "processing_state"
		END,
		"processed_at" = CASE
			WHEN "processed" IS TRUE AND "processed_at" IS NULL THEN "created_at"
			ELSE "processed_at"
		END,
		"last_error" = COALESCE("last_error", "error"),
		"processing_result" = CASE
			WHEN "processed" IS TRUE THEN COALESCE("processing_result", 'processed before ledger state migration')
			WHEN "error" IS NOT NULL THEN COALESCE("processing_result", 'failed before ledger state migration')
			ELSE "processing_result"
		END;

CREATE OR REPLACE FUNCTION "public"."record_stripe_webhook_event_attempt"(
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
	INSERT INTO "public"."stripe_webhook_events" (
		"id",
		"type",
		"data",
		"object_id",
		"secondary_dedupe_key",
		"event_created_at",
		"processing_state",
		"attempt_count",
		"last_error",
		"processing_result"
	)
	VALUES (
		"p_id",
		"p_type",
		"p_data",
		"p_object_id",
		"p_secondary_dedupe_key",
		"p_event_created_at",
		'retryable_failed'::text,
		1,
		NULL,
		'processing started'
	)
	ON CONFLICT ("id") DO UPDATE
	SET
		"type" = EXCLUDED."type",
		"data" = EXCLUDED."data",
		"object_id" = EXCLUDED."object_id",
		"secondary_dedupe_key" = EXCLUDED."secondary_dedupe_key",
		"event_created_at" = EXCLUDED."event_created_at",
		"processing_state" = 'retryable_failed'::text,
		"attempt_count" = "stripe_webhook_events"."attempt_count" + 1,
		"last_error" = NULL,
		"processing_result" = 'processing started'
	RETURNING "attempt_count" INTO v_attempt_count;

	RETURN v_attempt_count;
END;
$$;

DROP TRIGGER IF EXISTS "update_stripe_webhook_events_updated_at" ON "public"."stripe_webhook_events";

CREATE TRIGGER "update_stripe_webhook_events_updated_at"
	BEFORE UPDATE ON "public"."stripe_webhook_events"
	FOR EACH ROW
	EXECUTE FUNCTION "public"."update_updated_at_column"();

REVOKE ALL ON TABLE "public"."stripe_webhook_events" FROM "anon";
REVOKE ALL ON TABLE "public"."stripe_webhook_events" FROM "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_stripe_webhook_event_attempt"(text, text, jsonb, text, text, timestamp with time zone) FROM "anon";
REVOKE ALL ON FUNCTION "public"."record_stripe_webhook_event_attempt"(text, text, jsonb, text, text, timestamp with time zone) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."record_stripe_webhook_event_attempt"(text, text, jsonb, text, text, timestamp with time zone) TO "service_role";
