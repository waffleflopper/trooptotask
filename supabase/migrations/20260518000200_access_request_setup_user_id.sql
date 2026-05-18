ALTER TABLE "public"."access_requests"
	ADD COLUMN IF NOT EXISTS "setup_user_id" "uuid";

CREATE INDEX IF NOT EXISTS "access_requests_setup_user_id_idx"
	ON "public"."access_requests" USING "btree" ("setup_user_id")
	WHERE ("setup_user_id" IS NOT NULL);
