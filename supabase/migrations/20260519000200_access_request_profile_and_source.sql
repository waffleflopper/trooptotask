ALTER TABLE "public"."access_requests"
	ADD COLUMN IF NOT EXISTS "first_name" "text",
	ADD COLUMN IF NOT EXISTS "last_name" "text",
	ADD COLUMN IF NOT EXISTS "heard_about" "text",
	ADD COLUMN IF NOT EXISTS "heard_about_details" "text";

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "pg_constraint" "constraint"
		JOIN "pg_class" "table" ON "table"."oid" = "constraint"."conrelid"
		JOIN "pg_namespace" "schema" ON "schema"."oid" = "table"."relnamespace"
		WHERE "constraint"."conname" = 'access_requests_first_name_check'
			AND "schema"."nspname" = 'public'
			AND "table"."relname" = 'access_requests'
	) THEN
		ALTER TABLE "public"."access_requests"
			ADD CONSTRAINT "access_requests_first_name_check"
			CHECK (("first_name" IS NULL OR length(btrim("first_name")) > 0)) NOT VALID;
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "pg_constraint" "constraint"
		JOIN "pg_class" "table" ON "table"."oid" = "constraint"."conrelid"
		JOIN "pg_namespace" "schema" ON "schema"."oid" = "table"."relnamespace"
		WHERE "constraint"."conname" = 'access_requests_last_name_check'
			AND "schema"."nspname" = 'public'
			AND "table"."relname" = 'access_requests'
	) THEN
		ALTER TABLE "public"."access_requests"
			ADD CONSTRAINT "access_requests_last_name_check"
			CHECK (("last_name" IS NULL OR length(btrim("last_name")) > 0)) NOT VALID;
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "pg_constraint" "constraint"
		JOIN "pg_class" "table" ON "table"."oid" = "constraint"."conrelid"
		JOIN "pg_namespace" "schema" ON "schema"."oid" = "table"."relnamespace"
		WHERE "constraint"."conname" = 'access_requests_heard_about_check'
			AND "schema"."nspname" = 'public'
			AND "table"."relname" = 'access_requests'
	) THEN
		ALTER TABLE "public"."access_requests"
			ADD CONSTRAINT "access_requests_heard_about_check"
			CHECK (("heard_about" IS NULL OR "heard_about" = ANY (ARRAY[
				'word_of_mouth'::text,
				'unit_peer'::text,
				'search_engine'::text,
				'social_media'::text,
				'reddit'::text,
				'army_community'::text,
				'other'::text
			]))) NOT VALID;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "access_requests_heard_about_idx"
	ON "public"."access_requests" USING "btree" ("heard_about")
	WHERE ("heard_about" IS NOT NULL);
