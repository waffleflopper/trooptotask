ALTER TABLE IF EXISTS "public"."counseling_records"
    DROP CONSTRAINT IF EXISTS "counseling_records_counseling_type_id_fkey";

ALTER TABLE IF EXISTS "public"."counseling_records"
    DROP COLUMN IF EXISTS "counseling_type_id";

DROP TABLE IF EXISTS "public"."development_goals" CASCADE;
DROP TABLE IF EXISTS "public"."counseling_types" CASCADE;

UPDATE "public"."organization_memberships"
SET "can_edit_rating_scheme" = "can_edit_personnel"
WHERE "can_edit_personnel" = true
  AND "can_edit_rating_scheme" = false;

UPDATE "public"."organization_invitations"
SET "can_edit_rating_scheme" = "can_edit_personnel"
WHERE "can_edit_personnel" = true
  AND "can_edit_rating_scheme" = false;

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
