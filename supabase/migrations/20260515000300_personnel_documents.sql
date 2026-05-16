ALTER TABLE "public"."organizations"
    ADD COLUMN IF NOT EXISTS "personnel_document_storage_cap_bytes" bigint NOT NULL DEFAULT 104857600;

CREATE TABLE IF NOT EXISTS "public"."personnel_documents" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL,
    "personnel_id" uuid NOT NULL,
    "title" text NOT NULL,
    "file_path" text NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "content_type" text NOT NULL,
    "uploaded_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "personnel_documents_file_size_check" CHECK (("file_size_bytes" > 0))
);

ALTER TABLE ONLY "public"."personnel_documents"
    ADD CONSTRAINT "personnel_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."personnel_documents"
    ADD CONSTRAINT "personnel_documents_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."personnel_documents"
    ADD CONSTRAINT "personnel_documents_personnel_id_fkey"
    FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_personnel_documents_personnel_created"
    ON "public"."personnel_documents" USING "btree" ("personnel_id", "created_at" DESC);

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
      AND "id" <> NEW."id";

    IF current_bytes + NEW."file_size_bytes" > cap_bytes THEN
        RAISE EXCEPTION 'personnel document storage cap exceeded';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "update_personnel_documents_updated_at"
    BEFORE UPDATE ON "public"."personnel_documents"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "enforce_personnel_document_storage_cap"
    BEFORE INSERT OR UPDATE OF "file_size_bytes", "personnel_id", "organization_id"
    ON "public"."personnel_documents"
    FOR EACH ROW EXECUTE FUNCTION "public"."enforce_personnel_document_storage_cap"();

ALTER TABLE "public"."personnel_documents" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view personnel documents"
    ON "public"."personnel_documents"
    FOR SELECT
    USING ("public"."member_access_has_capability"("organization_id", 'personnel', 'view'));

CREATE POLICY "Operators can insert personnel documents"
    ON "public"."personnel_documents"
    FOR INSERT
    WITH CHECK ("public"."member_access_has_capability"("organization_id", 'personnel', 'operate'));

CREATE POLICY "Operators can update personnel documents"
    ON "public"."personnel_documents"
    FOR UPDATE
    USING ("public"."member_access_has_capability"("organization_id", 'personnel', 'operate'))
    WITH CHECK ("public"."member_access_has_capability"("organization_id", 'personnel', 'operate'));

CREATE POLICY "Operators can delete personnel documents"
    ON "public"."personnel_documents"
    FOR DELETE
    USING ("public"."member_access_has_capability"("organization_id", 'personnel', 'operate'));

GRANT ALL ON TABLE "public"."personnel_documents" TO "anon";
GRANT ALL ON TABLE "public"."personnel_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_documents" TO "service_role";

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
    'personnel-documents',
    'personnel-documents',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
ON CONFLICT ("id") DO UPDATE
SET
    "public" = false,
    "file_size_limit" = EXCLUDED."file_size_limit",
    "allowed_mime_types" = EXCLUDED."allowed_mime_types";

CREATE POLICY "Members can view personnel document files"
    ON "storage"."objects"
    FOR SELECT
    TO authenticated
    USING (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'view')
    );

CREATE POLICY "Operators can insert personnel document files"
    ON "storage"."objects"
    FOR INSERT
    TO authenticated
    WITH CHECK (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'operate')
    );

CREATE POLICY "Operators can update personnel document files"
    ON "storage"."objects"
    FOR UPDATE
    TO authenticated
    USING (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'operate')
    )
    WITH CHECK (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'operate')
    );

CREATE POLICY "Operators can delete personnel document files"
    ON "storage"."objects"
    FOR DELETE
    TO authenticated
    USING (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'operate')
    );
