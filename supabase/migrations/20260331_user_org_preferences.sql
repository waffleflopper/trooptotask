-- Per-user, per-organization UI preferences (calendar/training display state, filters, etc.)

CREATE TABLE IF NOT EXISTS "public"."user_org_preferences" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "preferences" "jsonb" DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_org_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_org_preferences_org_user_key" UNIQUE ("organization_id", "user_id"),
    CONSTRAINT "user_org_preferences_organization_id_fkey"
        FOREIGN KEY ("organization_id")
        REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "user_org_preferences_user_id_fkey"
        FOREIGN KEY ("user_id")
        REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."user_org_preferences" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."user_org_preferences_set_updated_at"()
    RETURNS TRIGGER
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER "set_user_org_preferences_updated_at"
    BEFORE UPDATE ON "public"."user_org_preferences"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."user_org_preferences_set_updated_at"();

ALTER TABLE "public"."user_org_preferences" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own org preferences"
    ON "public"."user_org_preferences"
    FOR SELECT
    USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));

CREATE POLICY "Users can insert their own org preferences"
    ON "public"."user_org_preferences"
    FOR INSERT
    WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));

CREATE POLICY "Users can update their own org preferences"
    ON "public"."user_org_preferences"
    FOR UPDATE
    USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));

CREATE POLICY "Users can delete their own org preferences"
    ON "public"."user_org_preferences"
    FOR DELETE
    USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));

CREATE INDEX "user_org_preferences_user_org_idx"
    ON "public"."user_org_preferences" ("user_id", "organization_id");

GRANT ALL ON TABLE "public"."user_org_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_org_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_org_preferences" TO "service_role";
