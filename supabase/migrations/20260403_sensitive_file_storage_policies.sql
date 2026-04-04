CREATE OR REPLACE FUNCTION "public"."storage_object_org_id"("object_name" text) RETURNS uuid
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  folder_parts text[];
BEGIN
  folder_parts := storage.foldername(object_name);

  IF array_length(folder_parts, 1) IS NULL OR array_length(folder_parts, 1) < 1 THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN folder_parts[1]::uuid;
  EXCEPTION
    WHEN others THEN
      RETURN NULL;
  END;
END;
$$;


ALTER FUNCTION "public"."storage_object_org_id"(text) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_object_scope"("object_name" text) RETURNS text
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT (storage.foldername(object_name))[2]
$$;


ALTER FUNCTION "public"."storage_object_scope"(text) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_valid_sensitive_file_path"("bucket_name" text, "object_name" text) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT
    bucket_name = 'counseling-files'
    AND public.storage_object_org_id(object_name) IS NOT NULL
    AND public.storage_object_scope(object_name) = ANY (ARRAY['sign-in-rosters', 'counseling-records', 'counseling-templates'])
    AND COALESCE(storage.extension(object_name), '') = 'pdf'
$$;


ALTER FUNCTION "public"."is_valid_sensitive_file_path"(text, text) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_sensitive_file_object"("bucket_name" text, "object_name" text) RETURNS boolean
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
      RETURN public.can_view_leaders_book(org_id);
    WHEN 'counseling-templates' THEN
      RETURN public.can_view_leaders_book(org_id);
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;


ALTER FUNCTION "public"."can_view_sensitive_file_object"(text, text) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_sensitive_file_object"("bucket_name" text, "object_name" text) RETURNS boolean
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
      RETURN public.can_edit_personnel(org_id);
    WHEN 'counseling-records' THEN
      RETURN public.can_edit_leaders_book(org_id);
    WHEN 'counseling-templates' THEN
      RETURN public.can_edit_leaders_book(org_id);
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;


ALTER FUNCTION "public"."can_edit_sensitive_file_object"(text, text) OWNER TO "postgres";


DROP POLICY IF EXISTS "Sensitive files are readable by authorized members" ON "storage"."objects";
DROP POLICY IF EXISTS "Sensitive files are insertable by authorized editors" ON "storage"."objects";
DROP POLICY IF EXISTS "Sensitive files are updatable by authorized editors" ON "storage"."objects";
DROP POLICY IF EXISTS "Sensitive files are deletable by authorized editors" ON "storage"."objects";


CREATE POLICY "Sensitive files are readable by authorized members" ON "storage"."objects"
    FOR SELECT TO "authenticated"
    USING ("public"."can_view_sensitive_file_object"("bucket_id", "name"));


CREATE POLICY "Sensitive files are insertable by authorized editors" ON "storage"."objects"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."can_edit_sensitive_file_object"("bucket_id", "name"));


CREATE POLICY "Sensitive files are updatable by authorized editors" ON "storage"."objects"
    FOR UPDATE TO "authenticated"
    USING ("public"."can_edit_sensitive_file_object"("bucket_id", "name"))
    WITH CHECK ("public"."can_edit_sensitive_file_object"("bucket_id", "name"));


CREATE POLICY "Sensitive files are deletable by authorized editors" ON "storage"."objects"
    FOR DELETE TO "authenticated"
    USING ("public"."can_edit_sensitive_file_object"("bucket_id", "name"));
