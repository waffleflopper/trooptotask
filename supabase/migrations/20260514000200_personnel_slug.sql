ALTER TABLE "public"."personnel"
  ADD COLUMN IF NOT EXISTS "slug" "text";

WITH "source" AS (
  SELECT
    "id",
    "organization_id",
    COALESCE(
      NULLIF(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            LOWER("last_name" || '-' || "first_name"),
            '[^a-z0-9]+',
            '-',
            'g'
          ),
          '(^-+|-+$)',
          '',
          'g'
        ),
        ''
      ),
      'personnel'
    ) AS "base_slug",
    "created_at"
  FROM "public"."personnel"
  WHERE "slug" IS NULL OR "slug" = ''
),
"ranked" AS (
  SELECT
    "id",
    "base_slug",
    ROW_NUMBER() OVER (PARTITION BY "organization_id", "base_slug" ORDER BY "created_at", "id") AS "ordinal"
  FROM "source"
)
UPDATE "public"."personnel"
SET "slug" = CASE
  WHEN "ranked"."ordinal" = 1 THEN "ranked"."base_slug"
  ELSE "ranked"."base_slug" || '-' || "ranked"."ordinal"::"text"
END
FROM "ranked"
WHERE "personnel"."id" = "ranked"."id";

ALTER TABLE "public"."personnel"
  ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "public"."personnel"
  DROP CONSTRAINT IF EXISTS "personnel_slug_check",
  ADD CONSTRAINT "personnel_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"));

CREATE UNIQUE INDEX IF NOT EXISTS "personnel_org_slug_key"
  ON "public"."personnel" USING "btree" ("organization_id", "slug");
