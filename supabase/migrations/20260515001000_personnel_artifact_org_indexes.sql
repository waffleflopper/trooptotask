CREATE INDEX IF NOT EXISTS "idx_personnel_follow_ups_org"
    ON "public"."personnel_follow_ups" USING "btree" ("organization_id");

CREATE INDEX IF NOT EXISTS "idx_personnel_documents_org"
    ON "public"."personnel_documents" USING "btree" ("organization_id");
