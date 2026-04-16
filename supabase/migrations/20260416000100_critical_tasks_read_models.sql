CREATE INDEX IF NOT EXISTS "idx_personnel_ict_completions_org_person_task_recency"
  ON "public"."personnel_ict_completions" USING "btree" (
    "organization_id",
    "personnel_id",
    "ict_task_id",
    "completed_at" DESC,
    "created_at" DESC
  );

CREATE INDEX IF NOT EXISTS "idx_personnel_ict_completions_org_completed_at"
  ON "public"."personnel_ict_completions" USING "btree" ("organization_id", "completed_at");

CREATE OR REPLACE FUNCTION "public"."latest_active_personnel_ict_completions"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[] DEFAULT NULL,
  "p_ict_task_ids" "uuid"[] DEFAULT NULL
)
RETURNS SETOF "public"."personnel_ict_completions"
LANGUAGE "sql"
STABLE
AS $$
  SELECT DISTINCT ON ("pic"."personnel_id", "pic"."ict_task_id") "pic".*
  FROM "public"."personnel_ict_completions" AS "pic"
  INNER JOIN "public"."personnel" AS "p"
    ON "p"."id" = "pic"."personnel_id"
    AND "p"."organization_id" = "pic"."organization_id"
    AND "p"."archived_at" IS NULL
  INNER JOIN "public"."ict_tasks" AS "t"
    ON "t"."id" = "pic"."ict_task_id"
    AND "t"."organization_id" = "pic"."organization_id"
    AND "t"."archived_at" IS NULL
  WHERE "pic"."organization_id" = "p_organization_id"
    AND ("p_personnel_ids" IS NULL OR "pic"."personnel_id" = ANY("p_personnel_ids"))
    AND ("p_ict_task_ids" IS NULL OR "pic"."ict_task_id" = ANY("p_ict_task_ids"))
  ORDER BY
    "pic"."personnel_id",
    "pic"."ict_task_id",
    "pic"."completed_at" DESC,
    "pic"."created_at" DESC;
$$;

ALTER FUNCTION "public"."latest_active_personnel_ict_completions"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[],
  "p_ict_task_ids" "uuid"[]
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."active_personnel_ict_completion_trend"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[] DEFAULT NULL,
  "p_ict_task_ids" "uuid"[] DEFAULT NULL
)
RETURNS TABLE("month" "text", "completions" integer)
LANGUAGE "sql"
STABLE
AS $$
  SELECT
    to_char("pic"."completed_at", 'YYYY-MM') AS "month",
    COUNT(*)::integer AS "completions"
  FROM "public"."personnel_ict_completions" AS "pic"
  INNER JOIN "public"."personnel" AS "p"
    ON "p"."id" = "pic"."personnel_id"
    AND "p"."organization_id" = "pic"."organization_id"
    AND "p"."archived_at" IS NULL
  INNER JOIN "public"."ict_tasks" AS "t"
    ON "t"."id" = "pic"."ict_task_id"
    AND "t"."organization_id" = "pic"."organization_id"
    AND "t"."archived_at" IS NULL
  WHERE "pic"."organization_id" = "p_organization_id"
    AND ("p_personnel_ids" IS NULL OR "pic"."personnel_id" = ANY("p_personnel_ids"))
    AND ("p_ict_task_ids" IS NULL OR "pic"."ict_task_id" = ANY("p_ict_task_ids"))
    AND (
      COALESCE(array_length("t"."mos", 1), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest("t"."mos") AS "task_mos"("value")
        WHERE upper(btrim("task_mos"."value")) = upper(btrim(COALESCE("p"."mos", '')))
      )
    )
  GROUP BY 1
  ORDER BY 1;
$$;

ALTER FUNCTION "public"."active_personnel_ict_completion_trend"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[],
  "p_ict_task_ids" "uuid"[]
) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."latest_active_personnel_ict_completions"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[],
  "p_ict_task_ids" "uuid"[]
) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."latest_active_personnel_ict_completions"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[],
  "p_ict_task_ids" "uuid"[]
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."latest_active_personnel_ict_completions"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[],
  "p_ict_task_ids" "uuid"[]
) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."active_personnel_ict_completion_trend"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[],
  "p_ict_task_ids" "uuid"[]
) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."active_personnel_ict_completion_trend"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[],
  "p_ict_task_ids" "uuid"[]
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."active_personnel_ict_completion_trend"(
  "p_organization_id" "uuid",
  "p_personnel_ids" "uuid"[],
  "p_ict_task_ids" "uuid"[]
) TO "service_role";
