DROP POLICY IF EXISTS "Users can view leader notes if can view personnel" ON "public"."leader_notes";
DROP POLICY IF EXISTS "Users can insert leader notes if can edit personnel" ON "public"."leader_notes";
DROP POLICY IF EXISTS "Users can update leader notes if can edit personnel" ON "public"."leader_notes";
DROP POLICY IF EXISTS "Users can delete leader notes if can edit personnel" ON "public"."leader_notes";

CREATE POLICY "Members can view leader notes through scoped personnel access"
    ON "public"."leader_notes"
    FOR SELECT
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'view')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "leader_notes"."personnel_id"
              AND "personnel"."organization_id" = "leader_notes"."organization_id"
              AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can insert leader notes through scoped personnel access"
    ON "public"."leader_notes"
    FOR INSERT
    WITH CHECK (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "leader_notes"."personnel_id"
              AND "personnel"."organization_id" = "leader_notes"."organization_id"
              AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can update leader notes through scoped personnel access"
    ON "public"."leader_notes"
    FOR UPDATE
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "leader_notes"."personnel_id"
              AND "personnel"."organization_id" = "leader_notes"."organization_id"
              AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id")
        )
    )
    WITH CHECK (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "leader_notes"."personnel_id"
              AND "personnel"."organization_id" = "leader_notes"."organization_id"
              AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can delete leader notes through scoped personnel access"
    ON "public"."leader_notes"
    FOR DELETE
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "leader_notes"."personnel_id"
              AND "personnel"."organization_id" = "leader_notes"."organization_id"
              AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id")
        )
    );

DROP POLICY IF EXISTS "Members can view personnel documents" ON "public"."personnel_documents";
DROP POLICY IF EXISTS "Operators can insert personnel documents" ON "public"."personnel_documents";
DROP POLICY IF EXISTS "Operators can update personnel documents" ON "public"."personnel_documents";
DROP POLICY IF EXISTS "Operators can delete personnel documents" ON "public"."personnel_documents";

CREATE POLICY "Members can view personnel documents through scoped personnel access"
    ON "public"."personnel_documents"
    FOR SELECT
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'view')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "personnel_documents"."personnel_id"
              AND "personnel"."organization_id" = "personnel_documents"."organization_id"
              AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can insert personnel documents through scoped personnel access"
    ON "public"."personnel_documents"
    FOR INSERT
    WITH CHECK (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "personnel_documents"."personnel_id"
              AND "personnel"."organization_id" = "personnel_documents"."organization_id"
              AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can update personnel documents through scoped personnel access"
    ON "public"."personnel_documents"
    FOR UPDATE
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "personnel_documents"."personnel_id"
              AND "personnel"."organization_id" = "personnel_documents"."organization_id"
              AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id")
        )
    )
    WITH CHECK (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "personnel_documents"."personnel_id"
              AND "personnel"."organization_id" = "personnel_documents"."organization_id"
              AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can delete personnel documents through scoped personnel access"
    ON "public"."personnel_documents"
    FOR DELETE
    USING (
        "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = "personnel_documents"."personnel_id"
              AND "personnel"."organization_id" = "personnel_documents"."organization_id"
              AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id")
        )
    );

DROP POLICY IF EXISTS "Members can view personnel document files" ON "storage"."objects";
DROP POLICY IF EXISTS "Operators can insert personnel document files" ON "storage"."objects";
DROP POLICY IF EXISTS "Operators can update personnel document files" ON "storage"."objects";
DROP POLICY IF EXISTS "Operators can delete personnel document files" ON "storage"."objects";

CREATE POLICY "Members can view personnel document files through scoped personnel access"
    ON "storage"."objects"
    FOR SELECT
    TO authenticated
    USING (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[2] = 'personnel')
        AND ((storage.foldername("name"))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[4] = 'documents')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'view')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = ((storage.foldername("name"))[3])::uuid
              AND "personnel"."organization_id" = ((storage.foldername("name"))[1])::uuid
              AND "public"."member_access_group_scope_matches"(((storage.foldername("name"))[1])::uuid, "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can insert personnel document files through scoped personnel access"
    ON "storage"."objects"
    FOR INSERT
    TO authenticated
    WITH CHECK (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[2] = 'personnel')
        AND ((storage.foldername("name"))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[4] = 'documents')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = ((storage.foldername("name"))[3])::uuid
              AND "personnel"."organization_id" = ((storage.foldername("name"))[1])::uuid
              AND "public"."member_access_group_scope_matches"(((storage.foldername("name"))[1])::uuid, "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can update personnel document files through scoped personnel access"
    ON "storage"."objects"
    FOR UPDATE
    TO authenticated
    USING (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[2] = 'personnel')
        AND ((storage.foldername("name"))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[4] = 'documents')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = ((storage.foldername("name"))[3])::uuid
              AND "personnel"."organization_id" = ((storage.foldername("name"))[1])::uuid
              AND "public"."member_access_group_scope_matches"(((storage.foldername("name"))[1])::uuid, "personnel"."group_id")
        )
    )
    WITH CHECK (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[2] = 'personnel')
        AND ((storage.foldername("name"))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[4] = 'documents')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = ((storage.foldername("name"))[3])::uuid
              AND "personnel"."organization_id" = ((storage.foldername("name"))[1])::uuid
              AND "public"."member_access_group_scope_matches"(((storage.foldername("name"))[1])::uuid, "personnel"."group_id")
        )
    );

CREATE POLICY "Operators can delete personnel document files through scoped personnel access"
    ON "storage"."objects"
    FOR DELETE
    TO authenticated
    USING (
        ("bucket_id" = 'personnel-documents')
        AND ((storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[2] = 'personnel')
        AND ((storage.foldername("name"))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND ((storage.foldername("name"))[4] = 'documents')
        AND "public"."member_access_has_capability"(((storage.foldername("name"))[1])::uuid, 'personnel', 'operate')
        AND EXISTS (
            SELECT 1
            FROM "public"."personnel"
            WHERE "personnel"."id" = ((storage.foldername("name"))[3])::uuid
              AND "personnel"."organization_id" = ((storage.foldername("name"))[1])::uuid
              AND "public"."member_access_group_scope_matches"(((storage.foldername("name"))[1])::uuid, "personnel"."group_id")
        )
    );
