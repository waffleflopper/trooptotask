ALTER TABLE "public"."leader_notes"
    ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

ALTER TABLE "public"."counseling_records"
    ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

ALTER TABLE "public"."personnel_documents"
    ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_leader_notes_personnel_archived_created"
    ON "public"."leader_notes" USING "btree" ("personnel_id", "archived_at", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_counseling_records_personnel_archived_created"
    ON "public"."counseling_records" USING "btree" ("personnel_id", "archived_at", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_personnel_documents_personnel_archived_created"
    ON "public"."personnel_documents" USING "btree" ("personnel_id", "archived_at", "created_at" DESC);
