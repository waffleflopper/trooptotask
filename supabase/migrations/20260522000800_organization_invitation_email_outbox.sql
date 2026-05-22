CREATE TABLE IF NOT EXISTS "public"."organization_invitation_email_outbox" (
	"id" uuid DEFAULT "gen_random_uuid"() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"purpose" text NOT NULL DEFAULT 'organization_invitation'::text,
	"status" text NOT NULL DEFAULT 'pending'::text,
	"attempt_count" integer NOT NULL DEFAULT 0,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
	"sent_at" timestamp with time zone
);

ALTER TABLE "public"."organization_invitation_email_outbox" OWNER TO "postgres";

ALTER TABLE ONLY "public"."organization_invitation_email_outbox"
	ADD CONSTRAINT "organization_invitation_email_outbox_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."organization_invitation_email_outbox"
	ADD CONSTRAINT "organization_invitation_email_outbox_organization_id_fkey"
	FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."organization_invitation_email_outbox"
	ADD CONSTRAINT "organization_invitation_email_outbox_invitation_id_fkey"
	FOREIGN KEY ("invitation_id") REFERENCES "public"."organization_invitations"("id") ON DELETE CASCADE;

ALTER TABLE "public"."organization_invitation_email_outbox"
	DROP CONSTRAINT IF EXISTS "organization_invitation_email_outbox_purpose_check";

ALTER TABLE "public"."organization_invitation_email_outbox"
	ADD CONSTRAINT "organization_invitation_email_outbox_purpose_check"
	CHECK ("purpose" = 'organization_invitation'::text);

ALTER TABLE "public"."organization_invitation_email_outbox"
	DROP CONSTRAINT IF EXISTS "organization_invitation_email_outbox_status_check";

ALTER TABLE "public"."organization_invitation_email_outbox"
	ADD CONSTRAINT "organization_invitation_email_outbox_status_check"
	CHECK ("status" = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));

CREATE INDEX IF NOT EXISTS "organization_invitation_email_outbox_invitation_created_idx"
	ON "public"."organization_invitation_email_outbox" USING "btree" ("invitation_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "organization_invitation_email_outbox_org_created_idx"
	ON "public"."organization_invitation_email_outbox" USING "btree" ("organization_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "organization_invitation_email_outbox_status_idx"
	ON "public"."organization_invitation_email_outbox" USING "btree" ("status", "updated_at" DESC);

ALTER TABLE "public"."organization_invitation_email_outbox" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages organization invitation email outbox"
	ON "public"."organization_invitation_email_outbox";

CREATE POLICY "Service role manages organization invitation email outbox"
	ON "public"."organization_invitation_email_outbox"
	USING (("auth"."role"() = 'service_role'::text))
	WITH CHECK (("auth"."role"() = 'service_role'::text));

DROP POLICY IF EXISTS "Members can view organization invitation email outbox"
	ON "public"."organization_invitation_email_outbox";

CREATE POLICY "Members can view organization invitation email outbox"
	ON "public"."organization_invitation_email_outbox"
	FOR SELECT
	USING ("public"."can_manage_org_members"("organization_id"));

REVOKE ALL ON TABLE "public"."organization_invitation_email_outbox" FROM "anon";
REVOKE ALL ON TABLE "public"."organization_invitation_email_outbox" FROM "authenticated";
GRANT SELECT ON TABLE "public"."organization_invitation_email_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invitation_email_outbox" TO "service_role";
