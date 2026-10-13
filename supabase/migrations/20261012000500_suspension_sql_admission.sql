-- Account suspension lives in user_suspensions and Organization suspension in
-- organizations.suspended_at. Every membership authority helper requires both
-- to be clear, so direct table and Storage access matches the app's admission.
CREATE FUNCTION "public"."organization_access_admitted"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT NOT EXISTS (
		SELECT 1 FROM "public"."user_suspensions"
		WHERE "user_suspensions"."user_id" = "auth"."uid"()
	) AND EXISTS (
		SELECT 1 FROM "public"."organizations"
		WHERE "organizations"."id" = "p_organization_id"
			AND "organizations"."suspended_at" IS NULL
	);
$$;

ALTER FUNCTION "public"."organization_access_admitted"(uuid) OWNER TO "postgres";
-- Helpers call it as owner. Direct callers could probe other Organizations' status.
REVOKE ALL ON FUNCTION "public"."organization_access_admitted"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION "public"."member_access_has_capability"(
	"p_organization_id" uuid,
	"p_lane" text,
	"p_required_capability" text
) RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND (
				"organization_memberships"."role" IN ('owner', 'admin')
				OR "public"."member_access_required_capability_rank"(
					"public"."member_access_lane_capability"(
						"organization_memberships"."member_preset",
						"organization_memberships"."capability_overrides",
						"p_lane"
					)
				) >= "public"."member_access_required_capability_rank"("p_required_capability")
			)
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;

CREATE OR REPLACE FUNCTION "public"."can_manage_org_members"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" IN ('owner', 'admin')
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;

CREATE OR REPLACE FUNCTION "public"."can_update_organization_settings"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" IN ('owner', 'admin')
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;

CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;

CREATE OR REPLACE FUNCTION "public"."is_org_owner"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" = 'owner'
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;

CREATE OR REPLACE FUNCTION "public"."is_org_privileged"("p_organization_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" IN ('owner', 'admin')
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;

-- Authenticated accounts can call the Onboarding reference helpers directly, so
-- each answers only for an admitted member and is not an existence oracle.
-- onboarding_parent_scope_matches inherits this through the Personnel helper.
CREATE OR REPLACE FUNCTION "public"."onboarding_personnel_scope_matches"(
	"p_organization_id" uuid,
	"p_personnel_id" uuid
) RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT "public"."is_org_member"("p_organization_id") AND EXISTS (
		SELECT 1 FROM "public"."personnel" "p"
		WHERE "p"."id" = "p_personnel_id" AND "p"."organization_id" = "p_organization_id"
			AND (
				("p"."group_id" IS NOT NULL AND "public"."member_access_group_scope_matches"("p_organization_id", "p"."group_id"))
				OR ("p"."group_id" IS NULL AND EXISTS (
					SELECT 1 FROM "public"."organization_memberships" "m"
					WHERE "m"."organization_id" = "p_organization_id" AND "m"."user_id" = "auth"."uid"()
						AND ("m"."role" IN ('owner', 'admin') OR "m"."access_scope_kind" = 'organization')
				))
			)
	);
$$;

CREATE OR REPLACE FUNCTION "public"."onboarding_template_reference_matches"(
	"p_organization_id" uuid,
	"p_template_id" uuid
) RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT "public"."is_org_member"("p_organization_id") AND ("p_template_id" IS NULL OR EXISTS (
		SELECT 1 FROM "public"."onboarding_templates" "t"
		WHERE "t"."id" = "p_template_id" AND "t"."organization_id" = "p_organization_id"
	));
$$;

CREATE OR REPLACE FUNCTION "public"."onboarding_step_references_match"(
	"p_organization_id" uuid,
	"p_template_step_id" uuid,
	"p_training_type_id" uuid
) RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT "public"."is_org_member"("p_organization_id") AND ("p_template_step_id" IS NULL OR EXISTS (
		SELECT 1 FROM "public"."onboarding_template_steps" "s"
		WHERE "s"."id" = "p_template_step_id" AND "s"."organization_id" = "p_organization_id"
	)) AND ("p_training_type_id" IS NULL OR EXISTS (
		SELECT 1 FROM "public"."training_types" "t"
		WHERE "t"."id" = "p_training_type_id" AND "t"."organization_id" = "p_organization_id"
	));
$$;

-- The suspended shell and the dashboard list read only the Organization row and
-- the caller's own membership, so those two reads stay outside admission.
DROP POLICY "Users can view organizations they are members of" ON "public"."organizations";
CREATE POLICY "Users can view organizations they are members of"
	ON "public"."organizations"
	FOR SELECT
	USING (EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "organizations"."id"
			AND "organization_memberships"."user_id" = (SELECT "auth"."uid"())
	));

DROP POLICY "Members can view memberships of their organizations" ON "public"."organization_memberships";
CREATE POLICY "Members can view memberships of their organizations"
	ON "public"."organization_memberships"
	FOR SELECT
	USING ("user_id" = (SELECT "auth"."uid"()) OR "public"."is_org_member"("organization_id"));

DROP POLICY "Org members can read exports" ON "public"."data_exports";
CREATE POLICY "Org members can read exports"
	ON "public"."data_exports"
	FOR SELECT
	USING ("public"."is_org_member"("org_id"));

DROP POLICY "deletion_requests_select_admin" ON "public"."deletion_requests";
CREATE POLICY "deletion_requests_select_admin"
	ON "public"."deletion_requests"
	FOR SELECT
	USING ("public"."can_manage_org_members"("organization_id"));

DROP POLICY "deletion_requests_update_admin" ON "public"."deletion_requests";
CREATE POLICY "deletion_requests_update_admin"
	ON "public"."deletion_requests"
	FOR UPDATE
	USING ("public"."can_manage_org_members"("organization_id"));

DROP POLICY "deletion_requests_insert_own" ON "public"."deletion_requests";
CREATE POLICY "deletion_requests_insert_own"
	ON "public"."deletion_requests"
	FOR INSERT
	WITH CHECK ("requested_by" = (SELECT "auth"."uid"()) AND "public"."is_org_member"("organization_id"));

DROP POLICY "deletion_requests_delete_own" ON "public"."deletion_requests";
CREATE POLICY "deletion_requests_delete_own"
	ON "public"."deletion_requests"
	FOR DELETE
	USING (
		"requested_by" = (SELECT "auth"."uid"())
		AND "status" = 'pending'
		AND "public"."is_org_member"("organization_id")
	);

CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_request_id uuid, p_defaults jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
	v_user_id uuid := auth.uid();
	v_email text;
	v_confirmed boolean;
	v_name text;
	v_key text;
	v_org_id uuid;
	v_inserted uuid;
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required to create an organization';
	END IF;

	IF EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = v_user_id) THEN
		RAISE EXCEPTION 'Suspended accounts cannot create organizations' USING ERRCODE = '42501';
	END IF;

	SELECT lower(btrim(u.email)), COALESCE(u.email_confirmed_at, u.confirmed_at) IS NOT NULL
	INTO v_email, v_confirmed
	FROM auth.users AS u
	WHERE u.id = v_user_id;

	IF v_confirmed IS NOT TRUE THEN
		RAISE EXCEPTION 'Confirm your email before creating an organization' USING ERRCODE = '42501';
	END IF;

	IF p_request_id IS NULL THEN
		RAISE EXCEPTION 'Organization creation request id is required' USING ERRCODE = '22023';
	END IF;

	v_name := btrim(p_name);
	IF v_name IS NULL OR v_name = '' THEN
		RAISE EXCEPTION 'Organization name is required';
	END IF;

	IF char_length(v_name) > 100 THEN
		RAISE EXCEPTION 'Organization name must be 100 characters or fewer';
	END IF;

	IF jsonb_typeof(p_defaults) IS DISTINCT FROM 'object' THEN
		RAISE EXCEPTION 'Organization defaults must be an object' USING ERRCODE = '22023';
	END IF;
	FOREACH v_key IN ARRAY ARRAY['groups', 'status_types', 'assignment_types', 'special_days', 'rank_catalog'] LOOP
		IF jsonb_typeof(p_defaults -> v_key) IS DISTINCT FROM 'array' THEN
			RAISE EXCEPTION 'Organization defaults require a % array', v_key USING ERRCODE = '22023';
		END IF;
	END LOOP;

	v_org_id := gen_random_uuid();
	INSERT INTO public.organization_creation_requests (user_id, request_id, organization_id)
	VALUES (v_user_id, p_request_id, v_org_id)
	ON CONFLICT (user_id, request_id) DO NOTHING
	RETURNING organization_id INTO v_inserted;

	IF v_inserted IS NULL THEN
		SELECT r.organization_id
		INTO v_org_id
		FROM public.organization_creation_requests AS r
		WHERE r.user_id = v_user_id AND r.request_id = p_request_id;
		RETURN v_org_id;
	END IF;

	INSERT INTO public.organizations (id, name, created_by)
	VALUES (v_org_id, v_name, v_user_id);

	INSERT INTO public.organization_memberships (
		organization_id,
		user_id,
		role,
		member_preset,
		capability_overrides,
		access_scope_kind,
		access_scope_group_ids,
		email
	)
	VALUES (
		v_org_id,
		v_user_id,
		'owner',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		v_email
	);

	INSERT INTO public.groups (organization_id, name, sort_order)
	SELECT v_org_id, d.name, d.sort_order
	FROM jsonb_to_recordset(p_defaults -> 'groups') AS d (name text, sort_order integer);

	INSERT INTO public.status_types (organization_id, name, color, text_color, sort_order)
	SELECT v_org_id, d.name, d.color, d.text_color, d.sort_order
	FROM jsonb_to_recordset(p_defaults -> 'status_types')
		AS d (name text, color text, text_color text, sort_order integer);

	INSERT INTO public.assignment_types (organization_id, name, short_name, assign_to, color, sort_order)
	SELECT v_org_id, d.name, d.short_name, d.assign_to, d.color, d.sort_order
	FROM jsonb_to_recordset(p_defaults -> 'assignment_types')
		AS d (name text, short_name text, assign_to text, color text, sort_order integer);

	INSERT INTO public.special_days (organization_id, date, name, type)
	SELECT v_org_id, d.date, d.name, d.type
	FROM jsonb_to_recordset(p_defaults -> 'special_days') AS d (date date, name text, type text);

	INSERT INTO public.organization_rank_catalog (
		organization_id, code, label, service, category, pay_grade, state, source, sort_order
	)
	SELECT v_org_id, d.code, d.label, d.service, d.category, d.pay_grade, d.state, d.source, d.sort_order
	FROM jsonb_to_recordset(p_defaults -> 'rank_catalog')
		AS d (code text, label text, service text, category text, pay_grade text, state text, source text, sort_order integer);

	RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."accept_organization_invitation"("p_invitation_id" "uuid")
RETURNS TABLE("accept_status" "text", "accepted_organization_id" "uuid")
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
	"current_user_id" "uuid" := "auth"."uid"();
	"current_email" "text" := lower(btrim(COALESCE(("auth"."jwt"() ->> 'email'::"text"), '')));
	"invitation" "record";
	"inserted_count" integer := 0;
BEGIN
	IF "current_user_id" IS NULL OR "current_email" = '' THEN
		RETURN QUERY SELECT 'not_found'::"text", NULL::"uuid";
		RETURN;
	END IF;

	SELECT
		"organization_invitations"."id",
		"organization_invitations"."organization_id",
		"organization_invitations"."email",
		"organization_invitations"."normalized_email",
		"organization_invitations"."invited_by",
		"organization_invitations"."status",
		"organization_invitations"."expires_at",
		"organization_invitations"."role",
		"organization_invitations"."member_preset",
		"organization_invitations"."capability_overrides",
		"organization_invitations"."access_scope_kind",
		"organization_invitations"."access_scope_group_ids"
	INTO "invitation"
	FROM "public"."organization_invitations"
	WHERE "organization_invitations"."id" = "p_invitation_id"
	FOR UPDATE;

	IF NOT FOUND OR "invitation"."normalized_email" <> "current_email" THEN
		RETURN QUERY SELECT 'not_found'::"text", NULL::"uuid";
		RETURN;
	END IF;

	IF "invitation"."status" = 'accepted'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_accepted'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	IF "invitation"."status" = 'blocked'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'blocked'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	IF "invitation"."status" = 'expired'::"public"."invitation_status" OR "invitation"."expires_at" <= now() THEN
		UPDATE "public"."organization_invitations"
		SET
			"status" = 'expired'::"public"."invitation_status",
			"expired_at" = COALESCE("organization_invitations"."expired_at", now())
		WHERE "organization_invitations"."id" = "invitation"."id"
			AND "organization_invitations"."status" = 'pending'::"public"."invitation_status";

		RETURN QUERY SELECT 'expired'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	IF "invitation"."status" <> 'pending'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'not_found'::"text", NULL::"uuid";
		RETURN;
	END IF;

	-- The invitation stays pending, so it can be accepted after unsuspension.
	IF NOT "public"."organization_access_admitted"("invitation"."organization_id") THEN
		RETURN QUERY SELECT 'unavailable'::"text", NULL::"uuid";
		RETURN;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "public"."access_request_organization_invitation_links"
		WHERE "access_request_organization_invitation_links"."organization_invitation_id" = "invitation"."id"
	) AND NOT EXISTS (
		SELECT 1
		FROM "public"."access_requests"
		WHERE lower(btrim("access_requests"."email")) = "current_email"
			AND "access_requests"."status" = 'approved'
			AND "access_requests"."setup_completed_at" IS NOT NULL
			AND (
				"access_requests"."setup_user_id" = "current_user_id"
				OR "access_requests"."setup_user_id" IS NULL
			)
	) THEN
		RETURN QUERY SELECT 'setup_required'::"text", NULL::"uuid";
		RETURN;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "invitation"."organization_id"
			AND "organization_memberships"."user_id" = "current_user_id"
	) THEN
		RETURN QUERY SELECT 'already_member'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	INSERT INTO "public"."organization_memberships" (
		"organization_id",
		"user_id",
		"email",
		"role",
		"invited_by",
		"member_preset",
		"capability_overrides",
		"access_scope_kind",
		"access_scope_group_ids"
	)
	VALUES (
		"invitation"."organization_id",
		"current_user_id",
		"current_email",
		COALESCE("invitation"."role", 'member'::"public"."organization_role"),
		"invitation"."invited_by",
		CASE
			WHEN "invitation"."role" = 'admin'::"public"."organization_role" THEN 'editor'
			ELSE COALESCE("invitation"."member_preset", 'editor')
		END,
		CASE
			WHEN "invitation"."role" = 'admin'::"public"."organization_role" THEN '{}'::jsonb
			ELSE COALESCE("invitation"."capability_overrides", '{}'::jsonb)
		END,
		CASE
			WHEN "invitation"."role" = 'admin'::"public"."organization_role" THEN 'organization'
			ELSE COALESCE("invitation"."access_scope_kind", 'organization')
		END,
		CASE
			WHEN "invitation"."role" = 'admin'::"public"."organization_role" THEN ARRAY[]::"uuid"[]
			ELSE COALESCE("invitation"."access_scope_group_ids", ARRAY[]::"uuid"[])
		END
	)
	ON CONFLICT ("organization_id", "user_id") DO NOTHING;

	GET DIAGNOSTICS "inserted_count" = ROW_COUNT;
	IF "inserted_count" = 0 THEN
		RETURN QUERY SELECT 'already_member'::"text", "invitation"."organization_id";
		RETURN;
	END IF;

	INSERT INTO "public"."user_email_identities" ("user_id", "normalized_email")
	VALUES ("current_user_id", "current_email")
	ON CONFLICT ("user_id") DO UPDATE
	SET "normalized_email" = EXCLUDED."normalized_email";

	UPDATE "public"."organization_invitations"
	SET
		"status" = 'accepted'::"public"."invitation_status",
		"accepted_at" = now(),
		"accepted_by" = "current_user_id"
	WHERE "organization_invitations"."id" = "invitation"."id";

	RETURN QUERY SELECT 'accepted'::"text", "invitation"."organization_id";
END;
$$;
