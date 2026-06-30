DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM (
			SELECT lower(regexp_replace("access_requests"."email", '^[[:space:]]+|[[:space:]]+$', '', 'g')) AS "normalized_email"
			FROM "public"."access_requests"
			WHERE "access_requests"."status" = 'pending'
			GROUP BY lower(regexp_replace("access_requests"."email", '^[[:space:]]+|[[:space:]]+$', '', 'g'))
			HAVING count(*) > 1
		) AS "duplicate_pending_access_request_emails"
	) THEN
		RAISE EXCEPTION 'Duplicate pending access request emails would violate normalized access_requests.email storage';
	END IF;
END;
$$;

UPDATE "public"."access_requests"
SET "email" = lower(regexp_replace("email", '^[[:space:]]+|[[:space:]]+$', '', 'g'))
WHERE "email" <> lower(regexp_replace("email", '^[[:space:]]+|[[:space:]]+$', '', 'g'));

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "pg_constraint"
		JOIN "pg_class"
			ON "pg_class"."oid" = "pg_constraint"."conrelid"
		JOIN "pg_namespace"
			ON "pg_namespace"."oid" = "pg_class"."relnamespace"
		WHERE "pg_constraint"."conname" = 'access_requests_email_normalized_check'
			AND "pg_class"."relname" = 'access_requests'
			AND "pg_namespace"."nspname" = 'public'
	) THEN
		ALTER TABLE "public"."access_requests"
			ADD CONSTRAINT "access_requests_email_normalized_check"
			CHECK ("email" = lower(regexp_replace("email", '^[[:space:]]+|[[:space:]]+$', '', 'g')));
	END IF;
END;
$$;
