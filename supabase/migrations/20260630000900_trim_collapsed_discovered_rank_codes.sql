WITH normalized_discovered_ranks AS (
  SELECT
    "organization_rank_catalog"."id",
    "organization_rank_catalog"."organization_id",
    btrim(regexp_replace("organization_rank_catalog"."code", '[[:space:]]+', ' ', 'g')) AS "normalized_code",
    row_number() OVER (
      PARTITION BY
        "organization_rank_catalog"."organization_id",
        btrim(regexp_replace("organization_rank_catalog"."code", '[[:space:]]+', ' ', 'g'))
      ORDER BY "organization_rank_catalog"."sort_order", "organization_rank_catalog"."id"
    ) AS "normalized_rank_order",
    EXISTS (
      SELECT 1
      FROM "public"."organization_rank_catalog" AS "existing_rank"
      WHERE "existing_rank"."organization_id" = "organization_rank_catalog"."organization_id"
        AND "existing_rank"."id" <> "organization_rank_catalog"."id"
        AND "existing_rank"."code" = btrim(
          regexp_replace("organization_rank_catalog"."code", '[[:space:]]+', ' ', 'g')
        )
    ) AS "normalized_code_already_exists"
  FROM "public"."organization_rank_catalog"
  WHERE "organization_rank_catalog"."source" = 'discovered'
    AND btrim(regexp_replace("organization_rank_catalog"."code", '[[:space:]]+', ' ', 'g')) <> ''
    AND "organization_rank_catalog"."code" <> btrim(regexp_replace(
      "organization_rank_catalog"."code",
      '[[:space:]]+',
      ' ',
      'g'
    ))
),
deleted_duplicate_ranks AS (
  DELETE FROM "public"."organization_rank_catalog"
  USING "normalized_discovered_ranks"
  WHERE "organization_rank_catalog"."id" = "normalized_discovered_ranks"."id"
    AND (
      "normalized_discovered_ranks"."normalized_rank_order" > 1
      OR "normalized_discovered_ranks"."normalized_code_already_exists"
    )
  RETURNING "organization_rank_catalog"."id"
)
UPDATE "public"."organization_rank_catalog"
SET
  "code" = "normalized_discovered_ranks"."normalized_code",
  "label" = CASE
    WHEN "organization_rank_catalog"."label" = "organization_rank_catalog"."code"
      THEN "normalized_discovered_ranks"."normalized_code"
    ELSE btrim(regexp_replace("organization_rank_catalog"."label", '[[:space:]]+', ' ', 'g'))
  END,
  "updated_at" = now()
FROM "normalized_discovered_ranks"
WHERE "organization_rank_catalog"."id" = "normalized_discovered_ranks"."id"
  AND "normalized_discovered_ranks"."normalized_rank_order" = 1
  AND NOT "normalized_discovered_ranks"."normalized_code_already_exists"
  AND NOT EXISTS (
    SELECT 1
    FROM "deleted_duplicate_ranks"
    WHERE "deleted_duplicate_ranks"."id" = "normalized_discovered_ranks"."id"
  );
