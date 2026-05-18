CREATE OR REPLACE FUNCTION "public"."list_audit_log_actions"(
    "p_org_id" "uuid",
    "p_excluded_actions" "text"[] DEFAULT ARRAY[]::"text"[]
)
RETURNS TABLE("action" "text")
LANGUAGE "sql"
STABLE
SET "search_path" = "public"
AS $$
    SELECT DISTINCT "audit_logs"."action"
    FROM "public"."audit_logs"
    WHERE "audit_logs"."org_id" = "p_org_id"
      AND NOT ("audit_logs"."action" = ANY("p_excluded_actions"))
    ORDER BY "audit_logs"."action";
$$;

CREATE INDEX IF NOT EXISTS "idx_audit_logs_org_id_action"
    ON "public"."audit_logs" USING "btree" ("org_id", "action");

REVOKE ALL ON FUNCTION "public"."list_audit_log_actions"("uuid", "text"[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_audit_log_actions"("uuid", "text"[]) FROM "anon";
REVOKE ALL ON FUNCTION "public"."list_audit_log_actions"("uuid", "text"[]) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_audit_log_actions"("uuid", "text"[]) TO "service_role";
