CREATE TABLE IF NOT EXISTS "public"."durable_rate_limits" (
	"bucket_key" text PRIMARY KEY,
	"request_count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
	CONSTRAINT "durable_rate_limits_request_count_check" CHECK ("request_count" >= 0)
);

ALTER TABLE "public"."durable_rate_limits" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "durable_rate_limits_reset_at_idx"
	ON "public"."durable_rate_limits" USING "btree" ("reset_at");

CREATE OR REPLACE FUNCTION "public"."check_durable_rate_limit"(
	"p_bucket_key" text,
	"p_window_seconds" integer,
	"p_max_requests" integer,
	"p_checked_at" timestamp with time zone DEFAULT "now"()
)
RETURNS TABLE("limited" boolean, "retry_after_ms" integer)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
	current_count integer;
	current_reset_at timestamp with time zone;
	next_reset_at timestamp with time zone;
BEGIN
	IF "p_bucket_key" IS NULL OR length("p_bucket_key") = 0 THEN
		RAISE EXCEPTION 'bucket_key is required';
	END IF;

	IF "p_window_seconds" <= 0 OR "p_max_requests" <= 0 THEN
		RAISE EXCEPTION 'window_seconds and max_requests must be positive';
	END IF;

	DELETE FROM "public"."durable_rate_limits"
	WHERE "reset_at" < ("p_checked_at" - interval '1 day');

	next_reset_at := "p_checked_at" + make_interval(secs => "p_window_seconds");

	INSERT INTO "public"."durable_rate_limits" ("bucket_key", "request_count", "reset_at", "updated_at")
	VALUES ("p_bucket_key", 1, next_reset_at, "p_checked_at")
	ON CONFLICT ("bucket_key") DO UPDATE
	SET
		"request_count" = CASE
			WHEN "durable_rate_limits"."reset_at" < "p_checked_at" THEN 1
			ELSE "durable_rate_limits"."request_count" + 1
		END,
		"reset_at" = CASE
			WHEN "durable_rate_limits"."reset_at" < "p_checked_at" THEN next_reset_at
			ELSE "durable_rate_limits"."reset_at"
		END,
		"updated_at" = "p_checked_at"
	RETURNING "durable_rate_limits"."request_count", "durable_rate_limits"."reset_at"
	INTO current_count, current_reset_at;

	RETURN QUERY SELECT
		current_count > "p_max_requests",
		GREATEST(0, CEIL(EXTRACT(EPOCH FROM (current_reset_at - "p_checked_at")) * 1000)::integer);
END;
$$;

REVOKE ALL ON FUNCTION "public"."check_durable_rate_limit"(text, integer, integer, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."check_durable_rate_limit"(text, integer, integer, timestamp with time zone) FROM "anon";
REVOKE ALL ON FUNCTION "public"."check_durable_rate_limit"(text, integer, integer, timestamp with time zone) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_durable_rate_limit"(text, integer, integer, timestamp with time zone) TO "service_role";
