CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "user_id" uuid NOT NULL,
    "first_name" text,
    "last_name" text,
    "rank" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "user_profiles_first_name_check" CHECK (("first_name" IS NULL OR length(btrim("first_name")) > 0)),
    CONSTRAINT "user_profiles_last_name_check" CHECK (("last_name" IS NULL OR length(btrim("last_name")) > 0)),
    CONSTRAINT "user_profiles_rank_check" CHECK (("rank" IS NULL OR "rank" = ANY (ARRAY[
        'PV1'::text, 'PV2'::text, 'PFC'::text, 'SPC'::text, 'CPL'::text,
        'SGT'::text, 'SSG'::text, 'SFC'::text, 'MSG'::text, '1SG'::text, 'SGM'::text, 'CSM'::text,
        'WO1'::text, 'CW2'::text, 'CW3'::text, 'CW4'::text, 'CW5'::text,
        '2LT'::text, '1LT'::text, 'CPT'::text, 'MAJ'::text, 'LTC'::text, 'COL'::text, 'BG'::text, 'MG'::text, 'LTG'::text, 'GEN'::text,
        'CIV'::text
    ])))
);

ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at"
    BEFORE UPDATE ON "public"."user_profiles"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
    ON "public"."user_profiles"
    FOR SELECT
    USING (auth.uid() = "user_id");

CREATE POLICY "Users can insert their own profile"
    ON "public"."user_profiles"
    FOR INSERT
    WITH CHECK (auth.uid() = "user_id");

CREATE POLICY "Users can update their own profile"
    ON "public"."user_profiles"
    FOR UPDATE
    USING (auth.uid() = "user_id")
    WITH CHECK (auth.uid() = "user_id");

GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";
