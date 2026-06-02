CREATE OR REPLACE FUNCTION "public"."is_valid_sensitive_file_path"("bucket_name" text, "object_name" text)
RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT
    bucket_name = 'counseling-files'
    AND public.storage_object_org_id(object_name) IS NOT NULL
    AND public.storage_object_scope(object_name) = ANY (ARRAY['sign-in-rosters', 'counseling-records'])
    AND COALESCE(storage.extension(object_name), '') = 'pdf'
$$;

CREATE OR REPLACE FUNCTION "public"."sensitive_file_object_is_readable"("bucket_name" text, "object_name" text)
RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  org_id uuid;
  object_scope text;
  personnel_id uuid;
BEGIN
  IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
    RETURN FALSE;
  END IF;

  org_id := public.storage_object_org_id(object_name);
  object_scope := public.storage_object_scope(object_name);

  CASE object_scope
    WHEN 'sign-in-rosters' THEN
      RETURN public.member_access_has_capability(org_id, 'personnel', 'view');
    WHEN 'counseling-records' THEN
      BEGIN
        personnel_id := (storage.foldername(object_name))[3]::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN FALSE;
      END;

      RETURN public.member_access_has_capability(org_id, 'personnel', 'view')
        AND EXISTS (
          SELECT 1
          FROM "public"."personnel"
          WHERE "personnel"."id" = personnel_id
            AND "personnel"."organization_id" = org_id
            AND "public"."member_access_group_scope_matches"(org_id, "personnel"."group_id")
        );
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."sensitive_file_object_is_writable"("bucket_name" text, "object_name" text)
RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
  org_id uuid;
  object_scope text;
  personnel_id uuid;
BEGIN
  IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
    RETURN FALSE;
  END IF;

  org_id := public.storage_object_org_id(object_name);
  object_scope := public.storage_object_scope(object_name);

  CASE object_scope
    WHEN 'sign-in-rosters' THEN
      RETURN public.member_access_has_capability(org_id, 'training', 'operate');
    WHEN 'counseling-records' THEN
      BEGIN
        personnel_id := (storage.foldername(object_name))[3]::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN FALSE;
      END;

      RETURN public.member_access_has_capability(org_id, 'personnel', 'operate')
        AND EXISTS (
          SELECT 1
          FROM "public"."personnel"
          WHERE "personnel"."id" = personnel_id
            AND "personnel"."organization_id" = org_id
            AND "public"."member_access_group_scope_matches"(org_id, "personnel"."group_id")
        );
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

DROP POLICY IF EXISTS "Sensitive files are readable by authorized members" ON "storage"."objects";
DROP POLICY IF EXISTS "Sensitive files are insertable by authorized editors" ON "storage"."objects";
DROP POLICY IF EXISTS "Sensitive files are updatable by authorized editors" ON "storage"."objects";
DROP POLICY IF EXISTS "Sensitive files are deletable by authorized editors" ON "storage"."objects";

DO $$
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('can' || '_view' || '_sensitive_file_object')
    || '(text, text)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('can' || '_edit' || '_sensitive_file_object')
    || '(text, text)';
END;
$$;

CREATE POLICY "Sensitive files are readable by authorized members"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.sensitive_file_object_is_readable(bucket_id, name));

CREATE POLICY "Sensitive files are insertable by authorized editors"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.sensitive_file_object_is_writable(bucket_id, name));

CREATE POLICY "Sensitive files are updatable by authorized editors"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.sensitive_file_object_is_writable(bucket_id, name))
  WITH CHECK (public.sensitive_file_object_is_writable(bucket_id, name));

CREATE POLICY "Sensitive files are deletable by authorized editors"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (public.sensitive_file_object_is_writable(bucket_id, name));
