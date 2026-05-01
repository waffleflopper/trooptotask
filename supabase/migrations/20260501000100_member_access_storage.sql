ALTER TABLE "public"."organization_memberships"
  ADD COLUMN IF NOT EXISTS "member_preset" text,
  ADD COLUMN IF NOT EXISTS "capability_overrides" jsonb,
  ADD COLUMN IF NOT EXISTS "access_scope_kind" text,
  ADD COLUMN IF NOT EXISTS "access_scope_group_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "access_scope_personnel_ids" uuid[];

ALTER TABLE "public"."organization_invitations"
  ADD COLUMN IF NOT EXISTS "member_preset" text,
  ADD COLUMN IF NOT EXISTS "capability_overrides" jsonb,
  ADD COLUMN IF NOT EXISTS "access_scope_kind" text,
  ADD COLUMN IF NOT EXISTS "access_scope_group_ids" uuid[],
  ADD COLUMN IF NOT EXISTS "access_scope_personnel_ids" uuid[];

CREATE OR REPLACE FUNCTION "public"."member_access_capability_level"("p_can_view" boolean, "p_can_edit" boolean)
RETURNS text
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN "p_can_edit" THEN 'configure'
    WHEN "p_can_view" THEN 'view'
    ELSE 'none'
  END;
$$;

CREATE OR REPLACE FUNCTION "public"."member_access_capability_override"(
  "p_base_level" text,
  "p_can_view" boolean,
  "p_can_edit" boolean
) RETURNS text
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN "public"."member_access_capability_level"("p_can_view", "p_can_edit") = "p_base_level" THEN NULL
    ELSE "public"."member_access_capability_level"("p_can_view", "p_can_edit")
  END;
$$;

-- Backfill current boolean permission flags into transitional member-access storage.
-- This keeps the legacy flags as compatibility scaffolding while the destination model
-- persists platform Member Preset lineage, explicit capability overrides, and shared Scope Set data.
UPDATE "public"."organization_memberships"
SET
  "member_preset" = CASE
    WHEN "scoped_group_id" IS NOT NULL THEN 'operator'
    WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks"
      AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'editor'
    WHEN "can_view_calendar" AND NOT "can_edit_calendar" AND "can_view_personnel" AND NOT "can_edit_personnel"
      AND "can_view_training" AND NOT "can_edit_training" AND "can_view_critical_tasks" AND NOT "can_edit_critical_tasks"
      AND "can_view_onboarding" AND NOT "can_edit_onboarding" AND "can_view_rating_scheme" AND NOT "can_edit_rating_scheme" THEN 'viewer'
    ELSE 'viewer'
  END,
  "capability_overrides" = jsonb_strip_nulls(jsonb_build_object('calendar',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_calendar",
      "can_edit_calendar"
    ), 'personnel',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_personnel",
      "can_edit_personnel"
    ), 'training',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_training",
      "can_edit_training"
    ), 'criticalTasks',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_critical_tasks",
      "can_edit_critical_tasks"
    ), 'onboarding',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_onboarding",
      "can_edit_onboarding"
    ), 'ratingScheme',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_rating_scheme",
      "can_edit_rating_scheme"
    ))),
  "access_scope_kind" = CASE WHEN "scoped_group_id" IS NOT NULL THEN 'groups' ELSE 'organization' END,
  "access_scope_group_ids" = CASE WHEN "scoped_group_id" IS NOT NULL THEN ARRAY["scoped_group_id"] ELSE ARRAY[]::uuid[] END,
  "access_scope_personnel_ids" = ARRAY[]::uuid[]
WHERE "member_preset" IS NULL
   OR "capability_overrides" IS NULL
   OR "access_scope_kind" IS NULL
   OR "access_scope_group_ids" IS NULL
   OR "access_scope_personnel_ids" IS NULL;

UPDATE "public"."organization_invitations"
SET
  "member_preset" = CASE
    WHEN "scoped_group_id" IS NOT NULL THEN 'operator'
    WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks"
      AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'editor'
    WHEN "can_view_calendar" AND NOT "can_edit_calendar" AND "can_view_personnel" AND NOT "can_edit_personnel"
      AND "can_view_training" AND NOT "can_edit_training" AND "can_view_critical_tasks" AND NOT "can_edit_critical_tasks"
      AND "can_view_onboarding" AND NOT "can_edit_onboarding" AND "can_view_rating_scheme" AND NOT "can_edit_rating_scheme" THEN 'viewer'
    ELSE 'viewer'
  END,
  "capability_overrides" = jsonb_strip_nulls(jsonb_build_object('calendar',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_calendar",
      "can_edit_calendar"
    ), 'personnel',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_personnel",
      "can_edit_personnel"
    ), 'training',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_training",
      "can_edit_training"
    ), 'criticalTasks',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_critical_tasks",
      "can_edit_critical_tasks"
    ), 'onboarding',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_onboarding",
      "can_edit_onboarding"
    ), 'ratingScheme',
    "public"."member_access_capability_override"(
      CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
      "can_view_rating_scheme",
      "can_edit_rating_scheme"
    ))),
  "access_scope_kind" = CASE WHEN "scoped_group_id" IS NOT NULL THEN 'groups' ELSE 'organization' END,
  "access_scope_group_ids" = CASE WHEN "scoped_group_id" IS NOT NULL THEN ARRAY["scoped_group_id"] ELSE ARRAY[]::uuid[] END,
  "access_scope_personnel_ids" = ARRAY[]::uuid[]
WHERE "member_preset" IS NULL
   OR "capability_overrides" IS NULL
   OR "access_scope_kind" IS NULL
   OR "access_scope_group_ids" IS NULL
   OR "access_scope_personnel_ids" IS NULL;

ALTER TABLE "public"."organization_memberships"
  ALTER COLUMN "member_preset" SET DEFAULT 'viewer',
  ALTER COLUMN "member_preset" SET NOT NULL,
  ALTER COLUMN "capability_overrides" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "capability_overrides" SET NOT NULL,
  ALTER COLUMN "access_scope_kind" SET DEFAULT 'organization',
  ALTER COLUMN "access_scope_kind" SET NOT NULL,
  ALTER COLUMN "access_scope_group_ids" SET DEFAULT ARRAY[]::uuid[],
  ALTER COLUMN "access_scope_group_ids" SET NOT NULL,
  ALTER COLUMN "access_scope_personnel_ids" SET DEFAULT ARRAY[]::uuid[],
  ALTER COLUMN "access_scope_personnel_ids" SET NOT NULL;

ALTER TABLE "public"."organization_invitations"
  ALTER COLUMN "member_preset" SET DEFAULT 'viewer',
  ALTER COLUMN "member_preset" SET NOT NULL,
  ALTER COLUMN "capability_overrides" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "capability_overrides" SET NOT NULL,
  ALTER COLUMN "access_scope_kind" SET DEFAULT 'organization',
  ALTER COLUMN "access_scope_kind" SET NOT NULL,
  ALTER COLUMN "access_scope_group_ids" SET DEFAULT ARRAY[]::uuid[],
  ALTER COLUMN "access_scope_group_ids" SET NOT NULL,
  ALTER COLUMN "access_scope_personnel_ids" SET DEFAULT ARRAY[]::uuid[],
  ALTER COLUMN "access_scope_personnel_ids" SET NOT NULL;

ALTER TABLE "public"."organization_memberships"
  DROP CONSTRAINT IF EXISTS "organization_memberships_member_preset_check",
  ADD CONSTRAINT "organization_memberships_member_preset_check"
    CHECK ("member_preset" IN ('viewer', 'operator', 'editor')),
  DROP CONSTRAINT IF EXISTS "organization_memberships_access_scope_kind_check",
  ADD CONSTRAINT "organization_memberships_access_scope_kind_check"
    CHECK ("access_scope_kind" IN ('organization', 'groups')),
  DROP CONSTRAINT IF EXISTS "organization_memberships_capability_overrides_check",
  ADD CONSTRAINT "organization_memberships_capability_overrides_check"
    CHECK (jsonb_typeof("capability_overrides") = 'object');

ALTER TABLE "public"."organization_invitations"
  DROP CONSTRAINT IF EXISTS "organization_invitations_member_preset_check",
  ADD CONSTRAINT "organization_invitations_member_preset_check"
    CHECK ("member_preset" IN ('viewer', 'operator', 'editor')),
  DROP CONSTRAINT IF EXISTS "organization_invitations_access_scope_kind_check",
  ADD CONSTRAINT "organization_invitations_access_scope_kind_check"
    CHECK ("access_scope_kind" IN ('organization', 'groups')),
  DROP CONSTRAINT IF EXISTS "organization_invitations_capability_overrides_check",
  ADD CONSTRAINT "organization_invitations_capability_overrides_check"
    CHECK (jsonb_typeof("capability_overrides") = 'object');

CREATE OR REPLACE FUNCTION "public"."member_access_group_scope_matches"(
  "p_organization_id" uuid,
  "p_group_id" uuid
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."access_scope_kind" = 'organization'
        OR "p_group_id" IS NULL
        OR "p_group_id" = ANY("organization_memberships"."access_scope_group_ids")
      )
  );
$$;

ALTER FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" uuid, "p_group_id" uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" uuid, "p_group_id" uuid) TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" uuid, "p_group_id" uuid) TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" uuid, "p_group_id" uuid) TO "service_role";
