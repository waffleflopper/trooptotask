DROP POLICY IF EXISTS "Users can view counseling records if can view personnel" ON "public"."counseling_records";
DROP POLICY IF EXISTS "Users can insert counseling records if can edit personnel" ON "public"."counseling_records";
DROP POLICY IF EXISTS "Users can update counseling records if can edit personnel" ON "public"."counseling_records";
DROP POLICY IF EXISTS "Users can delete counseling records if can edit personnel" ON "public"."counseling_records";

CREATE POLICY "Members can view counseling records through scoped personnel access"
    ON "public"."counseling_records"
    FOR SELECT
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'view')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "counseling_records"."personnel_id"
              AND "personnel"."organization_id" = "counseling_records"."organization_id"
              AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can insert counseling records through scoped personnel access"
    ON "public"."counseling_records"
    FOR INSERT
    WITH CHECK (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "counseling_records"."personnel_id"
              AND "personnel"."organization_id" = "counseling_records"."organization_id"
              AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can update counseling records through scoped personnel access"
    ON "public"."counseling_records"
    FOR UPDATE
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "counseling_records"."personnel_id"
              AND "personnel"."organization_id" = "counseling_records"."organization_id"
              AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id")
        )
    )
    WITH CHECK (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "counseling_records"."personnel_id"
              AND "personnel"."organization_id" = "counseling_records"."organization_id"
              AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can delete counseling records through scoped personnel access"
    ON "public"."counseling_records"
    FOR DELETE
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "counseling_records"."personnel_id"
              AND "personnel"."organization_id" = "counseling_records"."organization_id"
              AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id")
        )
    );

CREATE OR REPLACE FUNCTION "public"."can_view_sensitive_file_object"("bucket_name" text, "object_name" text)
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
      RETURN public.can_view_personnel(org_id);
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

CREATE OR REPLACE FUNCTION "public"."can_edit_sensitive_file_object"("bucket_name" text, "object_name" text)
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
      RETURN public.can_edit_training(org_id);
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

CREATE OR REPLACE FUNCTION "public"."enforce_personnel_document_storage_cap"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_bytes bigint;
    cap_bytes bigint;
BEGIN
    PERFORM 1
    FROM "public"."personnel"
    WHERE "id" = NEW."personnel_id"
      AND "organization_id" = NEW."organization_id"
    FOR UPDATE;

    SELECT COALESCE("personnel_document_storage_cap_bytes", 104857600)
    INTO cap_bytes
    FROM "public"."organizations"
    WHERE "id" = NEW."organization_id";

    SELECT COALESCE(SUM("file_size_bytes"), 0)
    INTO current_bytes
    FROM "public"."personnel_documents"
    WHERE "organization_id" = NEW."organization_id"
      AND "personnel_id" = NEW."personnel_id"
      AND "archived_at" IS NULL
      AND "id" <> NEW."id";

    IF current_bytes + NEW."file_size_bytes" > cap_bytes THEN
        RAISE EXCEPTION 'personnel document storage cap exceeded';
    END IF;

    RETURN NEW;
END;
$$;
