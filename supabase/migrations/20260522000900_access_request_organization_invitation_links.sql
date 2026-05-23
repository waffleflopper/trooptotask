CREATE TABLE IF NOT EXISTS "public"."access_request_organization_invitation_links" (
	"id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
	"access_request_id" "uuid" NOT NULL,
	"organization_invitation_id" "uuid" NOT NULL,
	"organization_id" "uuid" NOT NULL,
	"invited_by" "uuid" NOT NULL,
	"invited_at" timestamp with time zone NOT NULL,
	"intended_membership_role" "text" NOT NULL,
	"intended_permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
	"intended_member_preset" "text",
	"intended_capability_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
	"intended_access_scope_kind" "text" NOT NULL,
	"intended_access_scope_group_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
	CONSTRAINT "access_request_organization_invitation_links_pkey" PRIMARY KEY ("id"),
	CONSTRAINT "access_request_organization_invitation_links_invitation_key" UNIQUE ("organization_invitation_id"),
	CONSTRAINT "access_request_organization_invitation_links_role_check"
		CHECK ("intended_membership_role" = ANY (ARRAY['admin'::text, 'member'::text])),
	CONSTRAINT "access_request_organization_invitation_links_scope_kind_check"
		CHECK ("intended_access_scope_kind" = ANY (ARRAY['organization'::text, 'groups'::text])),
	CONSTRAINT "access_request_organization_invitation_links_access_request_fkey"
		FOREIGN KEY ("access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE CASCADE,
	CONSTRAINT "access_request_organization_invitation_links_invitation_fkey"
		FOREIGN KEY ("organization_invitation_id") REFERENCES "public"."organization_invitations"("id") ON DELETE CASCADE,
	CONSTRAINT "access_request_organization_invitation_links_organization_fkey"
		FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
	CONSTRAINT "access_request_organization_invitation_links_invited_by_fkey"
		FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "access_request_organization_invitation_links_request_idx"
	ON "public"."access_request_organization_invitation_links" USING "btree" ("access_request_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "access_request_organization_invitation_links_org_idx"
	ON "public"."access_request_organization_invitation_links" USING "btree" ("organization_id", "created_at" DESC);

ALTER TABLE "public"."access_request_organization_invitation_links" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage access request organization invitation links"
	ON "public"."access_request_organization_invitation_links";

CREATE POLICY "Service role can manage access request organization invitation links"
	ON "public"."access_request_organization_invitation_links"
	FOR ALL
	TO "service_role"
	USING (true)
	WITH CHECK (true);

DROP POLICY IF EXISTS "Platform admins can view access request organization invitation links"
	ON "public"."access_request_organization_invitation_links";

CREATE POLICY "Platform admins can view access request organization invitation links"
	ON "public"."access_request_organization_invitation_links"
	FOR SELECT
	TO "authenticated"
	USING ("public"."is_platform_admin"());

REVOKE ALL ON TABLE "public"."access_request_organization_invitation_links" FROM "anon";
REVOKE ALL ON TABLE "public"."access_request_organization_invitation_links" FROM "authenticated";
GRANT SELECT ON TABLE "public"."access_request_organization_invitation_links" TO "authenticated";
GRANT ALL ON TABLE "public"."access_request_organization_invitation_links" TO "service_role";
