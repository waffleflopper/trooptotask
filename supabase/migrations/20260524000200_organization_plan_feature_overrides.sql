CREATE TABLE IF NOT EXISTS "public"."organization_plan_feature_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "feature_key" "text" NOT NULL,
    "override_state" "text" NOT NULL,
    "expires_at" timestamp with time zone,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    CONSTRAINT "organization_plan_feature_overrides_state_check" CHECK (("override_state" = ANY (ARRAY['granted'::"text", 'denied'::"text"]))),
    CONSTRAINT "organization_plan_feature_overrides_reason_length" CHECK ((("reason" IS NULL) OR ("char_length"("reason") <= 500)))
);

ALTER TABLE "public"."organization_plan_feature_overrides" OWNER TO "postgres";

ALTER TABLE ONLY "public"."organization_plan_feature_overrides"
    ADD CONSTRAINT "organization_plan_feature_overrides_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."organization_plan_feature_overrides"
    ADD CONSTRAINT "organization_plan_feature_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."organization_plan_feature_overrides"
    ADD CONSTRAINT "organization_plan_feature_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."organization_plan_feature_overrides"
    ADD CONSTRAINT "organization_plan_feature_overrides_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_org_plan_feature_overrides_org_feature_active"
    ON "public"."organization_plan_feature_overrides" USING "btree" ("organization_id", "feature_key", "created_at" DESC)
    WHERE ("revoked_at" IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_plan_feature_overrides_active"
    ON "public"."organization_plan_feature_overrides" USING "btree" ("organization_id", "feature_key")
    WHERE ("revoked_at" IS NULL);

CREATE INDEX IF NOT EXISTS "idx_org_plan_feature_overrides_expiry"
    ON "public"."organization_plan_feature_overrides" USING "btree" ("expires_at")
    WHERE (("expires_at" IS NOT NULL) AND ("revoked_at" IS NULL));

ALTER TABLE "public"."organization_plan_feature_overrides" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read plan feature overrides" ON "public"."organization_plan_feature_overrides"
    FOR SELECT USING ("public"."is_org_member"("organization_id") OR "public"."is_platform_admin"());

CREATE POLICY "Service role can manage plan feature overrides" ON "public"."organization_plan_feature_overrides"
    USING (("auth"."role"() = 'service_role'::"text"))
    WITH CHECK (("auth"."role"() = 'service_role'::"text"));

GRANT SELECT ON TABLE "public"."organization_plan_feature_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_plan_feature_overrides" TO "service_role";
