CREATE INDEX IF NOT EXISTS "idx_audit_logs_timestamp_desc"
ON "public"."audit_logs" USING "btree" ("timestamp" DESC);
