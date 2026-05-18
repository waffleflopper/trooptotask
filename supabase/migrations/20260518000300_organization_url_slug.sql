ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "url_slug" "text";

ALTER TABLE "public"."organizations"
  ADD CONSTRAINT "organizations_url_slug_format_check"
  CHECK (
    "url_slug" IS NULL OR (
      char_length("url_slug") BETWEEN 3 AND 48
      AND "url_slug" = lower("url_slug")
      AND "url_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
  ) NOT VALID;

ALTER TABLE "public"."organizations"
  VALIDATE CONSTRAINT "organizations_url_slug_format_check";

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_url_slug_key"
  ON "public"."organizations" USING "btree" ("url_slug")
  WHERE "url_slug" IS NOT NULL;
