ALTER TABLE "public"."access_requests"
	ADD COLUMN IF NOT EXISTS "setup_completed_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "public"."account_setup_links" (
	"id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
	"access_request_id" "uuid" NOT NULL,
	"token_hash" "text" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."account_setup_links" OWNER TO "postgres";

ALTER TABLE ONLY "public"."account_setup_links"
	ADD CONSTRAINT "account_setup_links_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."account_setup_links"
	ADD CONSTRAINT "account_setup_links_access_request_id_fkey"
	FOREIGN KEY ("access_request_id")
	REFERENCES "public"."access_requests"("id")
	ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "account_setup_links_token_hash_key"
	ON "public"."account_setup_links" USING "btree" ("token_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "account_setup_links_one_active_per_request_idx"
	ON "public"."account_setup_links" USING "btree" ("access_request_id")
	WHERE (("used_at" IS NULL) AND ("revoked_at" IS NULL));

CREATE INDEX IF NOT EXISTS "account_setup_links_access_request_created_idx"
	ON "public"."account_setup_links" USING "btree" ("access_request_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "account_setup_links_cleanup_idx"
	ON "public"."account_setup_links" USING "btree" ("expires_at", "used_at", "revoked_at");

ALTER TABLE "public"."account_setup_links" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage account setup links"
	ON "public"."account_setup_links"
	USING ("public"."is_platform_admin"());

GRANT ALL ON TABLE "public"."account_setup_links" TO "anon";
GRANT ALL ON TABLE "public"."account_setup_links" TO "authenticated";
GRANT ALL ON TABLE "public"."account_setup_links" TO "service_role";
