-- Training Views: saved column configurations for the training matrix
-- Issue #371 (sub-issue of PRD #366)

CREATE TABLE IF NOT EXISTS "public"."training_views" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "column_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_views_organization_id_fkey"
        FOREIGN KEY ("organization_id")
        REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "training_views_created_by_fkey"
        FOREIGN KEY ("created_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL
);

ALTER TABLE "public"."training_views" OWNER TO "postgres";

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION "public"."training_views_set_updated_at"()
    RETURNS TRIGGER
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER "set_training_views_updated_at"
    BEFORE UPDATE ON "public"."training_views"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."training_views_set_updated_at"();

-- RLS
ALTER TABLE "public"."training_views" ENABLE ROW LEVEL SECURITY;

-- All org members with training view permission can read views
CREATE POLICY "Training viewers can read views"
    ON "public"."training_views"
    FOR SELECT
    USING ("public"."can_view_training"("organization_id"));

-- Only training editors (admin/owner or can_edit_training) can create views
CREATE POLICY "Training editors can create views"
    ON "public"."training_views"
    FOR INSERT
    WITH CHECK ("public"."can_edit_training"("organization_id"));

-- Only training editors can update views
CREATE POLICY "Training editors can update views"
    ON "public"."training_views"
    FOR UPDATE
    USING ("public"."can_edit_training"("organization_id"));

-- Only training editors can delete views
CREATE POLICY "Training editors can delete views"
    ON "public"."training_views"
    FOR DELETE
    USING ("public"."can_edit_training"("organization_id"));

-- Index for fast org-scoped queries
CREATE INDEX "training_views_organization_id_idx"
    ON "public"."training_views" ("organization_id");

-- Grant access
GRANT ALL ON TABLE "public"."training_views" TO "anon";
GRANT ALL ON TABLE "public"."training_views" TO "authenticated";
GRANT ALL ON TABLE "public"."training_views" TO "service_role";
