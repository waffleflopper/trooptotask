CREATE TABLE IF NOT EXISTS "public"."personnel_follow_ups" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL,
    "personnel_id" uuid NOT NULL,
    "title" text NOT NULL,
    "notes" text,
    "due_date" date,
    "status" text DEFAULT 'open' NOT NULL,
    "created_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "personnel_follow_ups_status_check" CHECK (("status" = ANY (ARRAY['open'::text, 'completed'::text, 'archived'::text]))),
    CONSTRAINT "personnel_follow_ups_title_check" CHECK ((length(btrim("title")) > 0))
);

ALTER TABLE ONLY "public"."personnel_follow_ups"
    ADD CONSTRAINT "personnel_follow_ups_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."personnel_follow_ups"
    ADD CONSTRAINT "personnel_follow_ups_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."personnel_follow_ups"
    ADD CONSTRAINT "personnel_follow_ups_personnel_id_fkey"
    FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_personnel_follow_ups_personnel_status_created"
    ON "public"."personnel_follow_ups" USING "btree" ("personnel_id", "status", "created_at" DESC);

CREATE OR REPLACE TRIGGER "update_personnel_follow_ups_updated_at"
    BEFORE UPDATE ON "public"."personnel_follow_ups"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."personnel_follow_ups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view personnel follow ups"
    ON "public"."personnel_follow_ups"
    FOR SELECT
    USING ("public"."member_access_has_capability"("organization_id", 'personnel', 'view'));

CREATE POLICY "Operators can insert personnel follow ups"
    ON "public"."personnel_follow_ups"
    FOR INSERT
    WITH CHECK ("public"."member_access_has_capability"("organization_id", 'personnel', 'operate'));

CREATE POLICY "Operators can update personnel follow ups"
    ON "public"."personnel_follow_ups"
    FOR UPDATE
    USING ("public"."member_access_has_capability"("organization_id", 'personnel', 'operate'))
    WITH CHECK ("public"."member_access_has_capability"("organization_id", 'personnel', 'operate'));

CREATE POLICY "Operators can delete personnel follow ups"
    ON "public"."personnel_follow_ups"
    FOR DELETE
    USING ("public"."member_access_has_capability"("organization_id", 'personnel', 'operate'));

GRANT ALL ON TABLE "public"."personnel_follow_ups" TO "anon";
GRANT ALL ON TABLE "public"."personnel_follow_ups" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_follow_ups" TO "service_role";
