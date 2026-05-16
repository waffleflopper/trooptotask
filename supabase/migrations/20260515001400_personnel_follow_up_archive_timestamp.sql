ALTER TABLE "public"."personnel_follow_ups"
    ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_personnel_follow_ups_personnel_status_archived"
    ON "public"."personnel_follow_ups" USING "btree" ("personnel_id", "status", "archived_at" DESC);
