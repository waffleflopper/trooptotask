ALTER TABLE "public"."counseling_records"
    ADD COLUMN IF NOT EXISTS "title" "text",
    ADD COLUMN IF NOT EXISTS "summary" "text",
    ADD COLUMN IF NOT EXISTS "uploaded_by" "text";

UPDATE "public"."counseling_records"
SET
    "title" = COALESCE("title", "subject"),
    "summary" = COALESCE("summary", "notes"),
    "uploaded_by" = COALESCE("uploaded_by", 'Leader upload')
WHERE "title" IS NULL OR "summary" IS NULL OR "uploaded_by" IS NULL;

ALTER TABLE "public"."counseling_records"
    ALTER COLUMN "title" SET NOT NULL,
    ALTER COLUMN "uploaded_by" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_counseling_records_personnel_created"
    ON "public"."counseling_records" USING "btree" ("personnel_id", "created_at" DESC);
