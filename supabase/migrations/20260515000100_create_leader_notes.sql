CREATE TABLE IF NOT EXISTS "public"."leader_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "author" "text" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."leader_notes" OWNER TO "postgres";

ALTER TABLE ONLY "public"."leader_notes"
    ADD CONSTRAINT "leader_notes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."leader_notes"
    ADD CONSTRAINT "leader_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."leader_notes"
    ADD CONSTRAINT "leader_notes_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_leader_notes_org" ON "public"."leader_notes" USING "btree" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_leader_notes_personnel_created" ON "public"."leader_notes" USING "btree" ("personnel_id", "created_at" DESC);

ALTER TABLE "public"."leader_notes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view leader notes if can view personnel" ON "public"."leader_notes" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));
CREATE POLICY "Users can insert leader notes if can edit personnel" ON "public"."leader_notes" FOR INSERT WITH CHECK ("public"."can_edit_personnel"("organization_id"));
CREATE POLICY "Users can update leader notes if can edit personnel" ON "public"."leader_notes" FOR UPDATE USING ("public"."can_edit_personnel"("organization_id")) WITH CHECK ("public"."can_edit_personnel"("organization_id"));
CREATE POLICY "Users can delete leader notes if can edit personnel" ON "public"."leader_notes" FOR DELETE USING ("public"."can_edit_personnel"("organization_id"));

INSERT INTO "public"."leader_notes" ("organization_id", "personnel_id", "author", "text", "created_at")
SELECT
    "organization_id",
    "personnel_id",
    'Migrated leader note',
    "leader_notes",
    COALESCE("updated_at", "created_at", "now"())
FROM "public"."personnel_extended_info"
WHERE "leader_notes" IS NOT NULL AND length(trim("leader_notes")) > 0;

DO $$
DECLARE
    "source_count" integer;
    "migrated_count" integer;
BEGIN
    SELECT count(*)
    INTO "source_count"
    FROM "public"."personnel_extended_info"
    WHERE "leader_notes" IS NOT NULL AND length(trim("leader_notes")) > 0;

    SELECT count(*)
    INTO "migrated_count"
    FROM "public"."leader_notes"
    WHERE "author" = 'Migrated leader note';

    IF "migrated_count" < "source_count" THEN
        RAISE EXCEPTION 'leader note migration incomplete: expected at least %, migrated %', "source_count", "migrated_count";
    END IF;
END $$;

ALTER TABLE "public"."personnel_extended_info"
    DROP COLUMN IF EXISTS "leader_notes";

GRANT ALL ON TABLE "public"."leader_notes" TO "anon";
GRANT ALL ON TABLE "public"."leader_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."leader_notes" TO "service_role";
