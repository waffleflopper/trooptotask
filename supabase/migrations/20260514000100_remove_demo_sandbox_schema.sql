-- Remove deprecated demo/sandbox schema support after runtime callers were removed.

DROP FUNCTION IF EXISTS "public"."create_demo_sandbox"(text);
DROP FUNCTION IF EXISTS "public"."cleanup_expired_demo_sandboxes"();

DROP INDEX IF EXISTS "public"."idx_organizations_demo_expires";

ALTER TABLE "public"."organizations"
  DROP CONSTRAINT IF EXISTS "organizations_demo_type_check",
  DROP COLUMN IF EXISTS "demo_type",
  DROP COLUMN IF EXISTS "demo_expires_at";
