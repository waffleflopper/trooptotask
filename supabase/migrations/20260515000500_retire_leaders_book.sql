DO $$
BEGIN
    IF to_regclass('public.personnel_follow_ups') IS NOT NULL
       AND to_regclass('public.development_goals') IS NOT NULL THEN
        INSERT INTO "public"."personnel_follow_ups" (
            "organization_id",
            "personnel_id",
            "title",
            "notes",
            "due_date",
            "status",
            "created_by",
            "created_at",
            "updated_at",
            "completed_at"
        )
        SELECT
            "organization_id",
            "personnel_id",
            "title",
            concat_ws(
                E'\n\n',
                NULLIF("description", ''),
                'Legacy goal category: ' || "category",
                'Legacy goal priority: ' || "priority",
                NULLIF("progress_notes", '')
            ),
            "target_date",
            CASE WHEN "status" = 'completed' THEN 'completed' ELSE 'open' END,
            'Migrated development goal',
            COALESCE("created_at", now()),
            COALESCE("updated_at", "created_at", now()),
            CASE WHEN "status" = 'completed' THEN COALESCE("updated_at", now()) ELSE NULL END
        FROM "public"."development_goals";
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.counseling_types') IS NOT NULL
       AND to_regclass('public.counseling_records') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'counseling_records'
             AND column_name = 'counseling_type_id'
       ) THEN
        UPDATE "public"."counseling_records" AS "records"
        SET
            "title" = COALESCE(NULLIF("records"."title", ''), NULLIF("records"."subject", ''), "types"."name"),
            "summary" = concat_ws(
                E'\n\n',
                NULLIF("records"."summary", ''),
                'Legacy counseling type: ' || "types"."name"
            )
        FROM "public"."counseling_types" AS "types"
        WHERE "records"."counseling_type_id" = "types"."id"
          AND "records"."organization_id" = "types"."organization_id";
    END IF;
END $$;

ALTER TABLE IF EXISTS "public"."counseling_records"
    DROP CONSTRAINT IF EXISTS "counseling_records_counseling_type_id_fkey";

ALTER TABLE IF EXISTS "public"."counseling_records"
    DROP COLUMN IF EXISTS "counseling_type_id";

DROP TABLE IF EXISTS "public"."development_goals" CASCADE;
DROP TABLE IF EXISTS "public"."counseling_types" CASCADE;

CREATE OR REPLACE FUNCTION "public"."can_view_sensitive_file_object"("bucket_name" text, "object_name" text)
RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  org_id uuid;
  object_scope text;
BEGIN
  IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
    RETURN FALSE;
  END IF;

  org_id := public.storage_object_org_id(object_name);
  object_scope := public.storage_object_scope(object_name);

  CASE object_scope
    WHEN 'sign-in-rosters' THEN
      RETURN public.can_view_personnel(org_id);
    WHEN 'counseling-records' THEN
      RETURN public.can_view_personnel(org_id);
    WHEN 'counseling-templates' THEN
      RETURN public.can_view_personnel(org_id);
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_sensitive_file_object"("bucket_name" text, "object_name" text)
RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  org_id uuid;
  object_scope text;
BEGIN
  IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
    RETURN FALSE;
  END IF;

  org_id := public.storage_object_org_id(object_name);
  object_scope := public.storage_object_scope(object_name);

  CASE object_scope
    WHEN 'sign-in-rosters' THEN
      RETURN public.can_edit_training(org_id);
    WHEN 'counseling-records' THEN
      RETURN public.can_edit_personnel(org_id);
    WHEN 'counseling-templates' THEN
      RETURN public.can_edit_personnel(org_id);
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

ALTER TABLE IF EXISTS "public"."organization_memberships"
    DROP COLUMN IF EXISTS "can_view_leaders_book",
    DROP COLUMN IF EXISTS "can_edit_leaders_book";

ALTER TABLE IF EXISTS "public"."organization_invitations"
    DROP COLUMN IF EXISTS "can_view_leaders_book",
    DROP COLUMN IF EXISTS "can_edit_leaders_book";

DROP FUNCTION IF EXISTS "public"."can_view_leaders_book"(uuid);
DROP FUNCTION IF EXISTS "public"."can_edit_leaders_book"(uuid);
