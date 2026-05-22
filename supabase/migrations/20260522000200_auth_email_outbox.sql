CREATE TABLE IF NOT EXISTS "public"."auth_email_outbox" (
	"id" uuid DEFAULT "gen_random_uuid"() NOT NULL,
	"access_request_id" uuid NOT NULL,
	"setup_link_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending'::text,
	"attempt_count" integer NOT NULL DEFAULT 0,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
	"sent_at" timestamp with time zone
);

ALTER TABLE "public"."auth_email_outbox" OWNER TO "postgres";

ALTER TABLE ONLY "public"."auth_email_outbox"
	ADD CONSTRAINT "auth_email_outbox_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."auth_email_outbox"
	ADD CONSTRAINT "auth_email_outbox_access_request_id_fkey"
	FOREIGN KEY ("access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."auth_email_outbox"
	ADD CONSTRAINT "auth_email_outbox_setup_link_id_fkey"
	FOREIGN KEY ("setup_link_id") REFERENCES "public"."account_setup_links"("id") ON DELETE CASCADE;

ALTER TABLE "public"."auth_email_outbox"
	DROP CONSTRAINT IF EXISTS "auth_email_outbox_purpose_check";

ALTER TABLE "public"."auth_email_outbox"
	ADD CONSTRAINT "auth_email_outbox_purpose_check"
	CHECK ("purpose" = 'account_setup'::text);

ALTER TABLE "public"."auth_email_outbox"
	DROP CONSTRAINT IF EXISTS "auth_email_outbox_status_check";

ALTER TABLE "public"."auth_email_outbox"
	ADD CONSTRAINT "auth_email_outbox_status_check"
	CHECK ("status" = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));

CREATE INDEX IF NOT EXISTS "auth_email_outbox_access_request_created_idx"
	ON "public"."auth_email_outbox" USING "btree" ("access_request_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "auth_email_outbox_setup_link_idx"
	ON "public"."auth_email_outbox" USING "btree" ("setup_link_id");

CREATE INDEX IF NOT EXISTS "auth_email_outbox_status_idx"
	ON "public"."auth_email_outbox" USING "btree" ("status", "updated_at" DESC);

ALTER TABLE "public"."auth_email_outbox" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages auth email outbox"
	ON "public"."auth_email_outbox"
	USING (("auth"."role"() = 'service_role'::text))
	WITH CHECK (("auth"."role"() = 'service_role'::text));

GRANT ALL ON TABLE "public"."auth_email_outbox" TO "anon";
GRANT ALL ON TABLE "public"."auth_email_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_email_outbox" TO "service_role";
