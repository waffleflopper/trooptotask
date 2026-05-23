DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'organization_invitations'
			AND column_name = 'role'
	) THEN
		ALTER TABLE "public"."organization_invitations"
			ADD COLUMN "role" "public"."organization_role" DEFAULT 'member'::"public"."organization_role" NOT NULL;

		UPDATE "public"."organization_invitations"
		SET "role" = 'admin'::"public"."organization_role"
		WHERE "can_view_calendar" IS TRUE
			AND "can_edit_calendar" IS TRUE
			AND "can_view_personnel" IS TRUE
			AND "can_edit_personnel" IS TRUE
			AND "can_view_training" IS TRUE
			AND "can_edit_training" IS TRUE
			AND "can_view_critical_tasks" IS TRUE
			AND "can_edit_critical_tasks" IS TRUE
			AND "can_view_onboarding" IS TRUE
			AND "can_edit_onboarding" IS TRUE
			AND COALESCE("can_view_rating_scheme", "can_view_personnel") IS TRUE
			AND COALESCE("can_edit_rating_scheme", "can_edit_personnel") IS TRUE
			AND "can_manage_members" IS TRUE;
	END IF;
END $$;
