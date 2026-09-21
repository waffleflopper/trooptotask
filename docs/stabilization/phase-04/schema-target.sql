


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."announcement_type" AS ENUM (
    'info',
    'warning',
    'maintenance'
);


ALTER TYPE "public"."announcement_type" OWNER TO "postgres";


CREATE TYPE "public"."ict_validation_method" AS ENUM (
    'Lecture',
    'Demonstration',
    'Practical Exercise',
    'Simulation',
    'Case Study',
    'Discussion',
    'Problem-Based Learning',
    'Role-Playing',
    'Other'
);


ALTER TYPE "public"."ict_validation_method" OWNER TO "postgres";


CREATE TYPE "public"."invitation_status" AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'declined',
    'expired',
    'blocked'
);


ALTER TYPE "public"."invitation_status" OWNER TO "postgres";


CREATE TYPE "public"."organization_role" AS ENUM (
    'owner',
    'admin',
    'member'
);


ALTER TYPE "public"."organization_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_organization_invitation"("p_invitation_id" "uuid") RETURNS TABLE("accept_status" "text", "accepted_organization_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."accept_organization_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."active_personnel_ict_completion_trend"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_ict_task_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS TABLE("month" "text", "completions" integer)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    to_char("pic"."completed_at", 'YYYY-MM') AS "month",
    COUNT(*)::integer AS "completions"
  FROM "public"."personnel_ict_completions" AS "pic"
  INNER JOIN "public"."personnel" AS "p"
    ON "p"."id" = "pic"."personnel_id"
    AND "p"."organization_id" = "pic"."organization_id"
    AND "p"."archived_at" IS NULL
  INNER JOIN "public"."ict_tasks" AS "t"
    ON "t"."id" = "pic"."ict_task_id"
    AND "t"."organization_id" = "pic"."organization_id"
    AND "t"."archived_at" IS NULL
  WHERE "pic"."organization_id" = "p_organization_id"
    AND ("p_personnel_ids" IS NULL OR "pic"."personnel_id" = ANY("p_personnel_ids"))
    AND ("p_ict_task_ids" IS NULL OR "pic"."ict_task_id" = ANY("p_ict_task_ids"))
    AND (
      COALESCE(array_length("t"."mos", 1), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest("t"."mos") AS "task_mos"("value")
        WHERE upper(btrim("task_mos"."value")) = upper(btrim(COALESCE("p"."mos", '')))
      )
    )
  GROUP BY 1
  ORDER BY 1;
$$;


ALTER FUNCTION "public"."active_personnel_ict_completion_trend"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_ict_task_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") RETURNS boolean
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
        OR (
          "organization_memberships"."access_scope_kind" = 'organization'
          AND "public"."member_access_required_capability_rank"(
            "public"."member_access_lane_capability"(
              "organization_memberships"."member_preset",
              "organization_memberships"."capability_overrides",
              'calendar'
            )
          ) >= "public"."member_access_required_capability_rank"('operate')
        )
      )
  );
$$;


ALTER FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_advanced_duty_revision"("p_org_id" "uuid", "p_draft_id" "uuid", "p_slot_updates" "jsonb", "p_change_set_data" "jsonb", "p_slot_change_rows" "jsonb", "p_applied_draft_data" "jsonb", "p_now" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  "v_change_set_row" "public"."advanced_duty_revision_change_sets";
  "v_draft_row" "public"."advanced_duty_revision_drafts";
  "v_slot_change_rows" "jsonb" := '[]'::"jsonb";
  "v_requested_slot_count" integer := 0;
  "v_existing_slot_count" integer := 0;
  "v_requested_event_count" integer := 0;
  "v_existing_event_count" integer := 0;
  "v_event_id" "uuid";
BEGIN
  IF "jsonb_typeof"(COALESCE("p_slot_updates", '[]'::"jsonb")) <> 'array' THEN
    RAISE EXCEPTION 'Advanced Duty revision slot updates must be an array.' USING ERRCODE = '22023';
  END IF;

  IF "jsonb_typeof"(COALESCE("p_slot_change_rows", '[]'::"jsonb")) <> 'array' THEN
    RAISE EXCEPTION 'Advanced Duty revision slot change rows must be an array.' USING ERRCODE = '22023';
  END IF;

  WITH "requested_slots" AS (
    SELECT DISTINCT ("value" ->> 'id')::"uuid" AS "id"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  )
  SELECT COUNT(*) INTO "v_requested_slot_count" FROM "requested_slots";

  WITH "requested_slots" AS (
    SELECT DISTINCT ("value" ->> 'id')::"uuid" AS "id"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  )
  SELECT COUNT(*) INTO "v_existing_slot_count"
  FROM "public"."duty_event_slots"
  JOIN "requested_slots" ON "requested_slots"."id" = "duty_event_slots"."id"
  WHERE "duty_event_slots"."organization_id" = "p_org_id";

  IF "v_existing_slot_count" <> "v_requested_slot_count" THEN
    RAISE EXCEPTION 'The applied duty slot no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  WITH "requested_events" AS (
    SELECT DISTINCT ("value" ->> 'duty_event_id')::"uuid" AS "id"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  )
  SELECT COUNT(*) INTO "v_requested_event_count" FROM "requested_events";

  WITH "requested_events" AS (
    SELECT DISTINCT ("value" ->> 'duty_event_id')::"uuid" AS "id"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  )
  SELECT COUNT(*) INTO "v_existing_event_count"
  FROM "public"."duty_events"
  JOIN "requested_events" ON "requested_events"."id" = "duty_events"."id"
  WHERE "duty_events"."organization_id" = "p_org_id";

  IF "v_existing_event_count" <> "v_requested_event_count" THEN
    RAISE EXCEPTION 'The applied duty event no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE "public"."duty_event_slots"
  SET
    "assignee_id" = "slot_updates"."assignee_id",
    "assignment_source" = "slot_updates"."assignment_source",
    "warning_state" = "slot_updates"."warning_state",
    "selection_reason" = "slot_updates"."selection_reason",
    "unfilled_reason" = "slot_updates"."unfilled_reason"
  FROM "jsonb_to_recordset"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "slot_updates"(
    "id" "uuid",
    "duty_event_id" "uuid",
    "assignee_id" "uuid",
    "assignment_source" "text",
    "warning_state" "text",
    "selection_reason" "text",
    "unfilled_reason" "text"
  )
  WHERE "duty_event_slots"."organization_id" = "p_org_id"
    AND "duty_event_slots"."id" = "slot_updates"."id"
    AND "duty_event_slots"."duty_event_id" = "slot_updates"."duty_event_id";

  FOR "v_event_id" IN
    SELECT DISTINCT ("value" ->> 'duty_event_id')::"uuid"
    FROM "jsonb_array_elements"(COALESCE("p_slot_updates", '[]'::"jsonb")) AS "value"
  LOOP
    UPDATE "public"."duty_events"
    SET
      "fill_summary" = (
        SELECT "jsonb_build_object"(
          'totalSlots', COUNT(*),
          'filledSlots', COUNT(*) FILTER (WHERE "duty_event_slots"."assignee_id" IS NOT NULL),
          'unfilledSlots', COUNT(*) FILTER (WHERE "duty_event_slots"."assignee_id" IS NULL)
        )
        FROM "public"."duty_event_slots"
        WHERE "duty_event_slots"."organization_id" = "p_org_id"
          AND "duty_event_slots"."duty_event_id" = "v_event_id"
      ),
      "updated_at" = "p_now"
    WHERE "duty_events"."organization_id" = "p_org_id"
      AND "duty_events"."id" = "v_event_id";
  END LOOP;

  INSERT INTO "public"."advanced_duty_revision_change_sets"
  SELECT * FROM "jsonb_populate_record"(NULL::"public"."advanced_duty_revision_change_sets", "p_change_set_data")
  RETURNING * INTO "v_change_set_row";

  WITH "inserted_slot_changes" AS (
    INSERT INTO "public"."advanced_duty_revision_slot_changes"
    SELECT * FROM "jsonb_populate_recordset"(
      NULL::"public"."advanced_duty_revision_slot_changes",
      COALESCE("p_slot_change_rows", '[]'::"jsonb")
    )
    RETURNING *
  )
  SELECT COALESCE("jsonb_agg"("to_jsonb"("inserted_slot_changes")), '[]'::"jsonb")
  INTO "v_slot_change_rows"
  FROM "inserted_slot_changes";

  UPDATE "public"."advanced_duty_revision_drafts"
  SET
    "source_snapshot_id" = ("p_applied_draft_data" ->> 'source_snapshot_id')::"uuid",
    "source_snapshot_fingerprint" = "p_applied_draft_data" ->> 'source_snapshot_fingerprint',
    "source_run_created_at" = ("p_applied_draft_data" ->> 'source_run_created_at')::timestamp with time zone,
    "source_run_updated_at" = ("p_applied_draft_data" ->> 'source_run_updated_at')::timestamp with time zone,
    "status" = "p_applied_draft_data" ->> 'status',
    "slot_changes" = COALESCE("p_applied_draft_data" -> 'slot_changes', '[]'::"jsonb"),
    "reason" = "p_applied_draft_data" ->> 'reason',
    "latest_validation" = NULLIF("p_applied_draft_data" -> 'latest_validation', 'null'::"jsonb"),
    "latest_error" = "p_applied_draft_data" ->> 'latest_error',
    "conflict_summary" = NULLIF("p_applied_draft_data" -> 'conflict_summary', 'null'::"jsonb"),
    "draft_version" = ("p_applied_draft_data" ->> 'draft_version')::integer,
    "updated_by_user_id" = ("p_applied_draft_data" ->> 'updated_by_user_id')::"uuid",
    "applied_by_user_id" = ("p_applied_draft_data" ->> 'applied_by_user_id')::"uuid",
    "expires_at" = ("p_applied_draft_data" ->> 'expires_at')::timestamp with time zone,
    "applied_at" = "p_now",
    "updated_at" = "p_now"
  WHERE "advanced_duty_revision_drafts"."organization_id" = "p_org_id"
    AND "advanced_duty_revision_drafts"."id" = "p_draft_id"
    AND "advanced_duty_revision_drafts"."status" = 'draft'::"text"
  RETURNING * INTO "v_draft_row";

  IF "v_draft_row"."id" IS NULL THEN
    RAISE EXCEPTION 'Advanced Duty revision draft not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN "jsonb_build_object"(
    'changeSetRow', "to_jsonb"("v_change_set_row"),
    'slotChangeRows', "v_slot_change_rows",
    'draftRow', "to_jsonb"("v_draft_row")
  );
END;
$$;


ALTER FUNCTION "public"."apply_advanced_duty_revision"("p_org_id" "uuid", "p_draft_id" "uuid", "p_slot_updates" "jsonb", "p_change_set_data" "jsonb", "p_slot_change_rows" "jsonb", "p_applied_draft_data" "jsonb", "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_sign_in_roster"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb", "p_required_capability" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
	SELECT
		"public"."sign_in_roster_scope_matches_personnel"(
			"p_organization_id",
			"p_personnel_ids",
			"p_scope_group_ids",
			"p_personnel_snapshot"
		)
		AND "public"."can_access_sign_in_roster_scope"(
			"p_organization_id",
			"p_scope_group_ids",
			"p_required_capability"
		);
$$;


ALTER FUNCTION "public"."can_access_sign_in_roster"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb", "p_required_capability" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_sign_in_roster_scope"("p_organization_id" "uuid", "p_scope_group_ids" "uuid"[], "p_required_capability" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
	SELECT
		"public"."member_access_has_capability"("p_organization_id", 'training', "p_required_capability")
		AND NOT EXISTS (
			SELECT 1
			FROM unnest(COALESCE("p_scope_group_ids", ARRAY[]::uuid[])) AS "roster_scope"("group_id")
			WHERE "roster_scope"."group_id" IS NULL
		)
		AND (
			(
				COALESCE(array_length("p_scope_group_ids", 1), 0) = 0
				AND EXISTS (
					SELECT 1
					FROM "public"."organization_memberships"
					WHERE "organization_memberships"."organization_id" = "p_organization_id"
						AND "organization_memberships"."user_id" = "auth"."uid"()
						AND (
							"organization_memberships"."role" IN ('owner', 'admin')
							OR "organization_memberships"."access_scope_kind" = 'organization'
						)
				)
			)
			OR (
				COALESCE(array_length("p_scope_group_ids", 1), 0) > 0
				AND NOT EXISTS (
					SELECT 1
					FROM unnest(COALESCE("p_scope_group_ids", ARRAY[]::uuid[])) AS "roster_scope"("group_id")
					WHERE NOT "public"."member_access_group_scope_matches"("p_organization_id", "roster_scope"."group_id")
				)
			)
		);
$$;


ALTER FUNCTION "public"."can_access_sign_in_roster_scope"("p_organization_id" "uuid", "p_scope_group_ids" "uuid"[], "p_required_capability" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_edit_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'operate');
$$;


ALTER FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'operate');
$$;


ALTER FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE ("personnel"."id")::text = "p_assignee_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
  AND EXISTS (
   SELECT 1
   FROM public.assignment_types AS assignment_type
   WHERE assignment_type.id = p_assignment_type_id
    AND assignment_type.organization_id = p_organization_id
    AND (
     (assignment_type.assign_to = 'personnel' AND EXISTS (
      SELECT 1 FROM public.personnel AS person
      WHERE person.id::text = p_assignee_id
       AND person.organization_id = p_organization_id
       AND public.member_access_group_scope_matches(p_organization_id, person.group_id)
     ))
     OR (assignment_type.assign_to = 'group' AND EXISTS (
      SELECT 1 FROM public.groups AS assigned_group
      WHERE assigned_group.id::text = p_assignee_id
       AND assigned_group.organization_id = p_organization_id
       AND public.member_access_group_scope_matches(p_organization_id, assigned_group.id)
     ))
    )
  );
$$;


ALTER FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_onboarding"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'operate');
$$;


ALTER FUNCTION "public"."can_edit_onboarding"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'operate');
$$;


ALTER FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'operate')
     AND "public"."member_access_group_scope_matches"("p_organization_id", "p_group_id");
$$;


ALTER FUNCTION "public"."can_edit_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_edit_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'operate');
$$;


ALTER FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'operate')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_rated_person_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_edit_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'operate');
$$;


ALTER FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_export_organization_data"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "public"."can_manage_org_members"("p_organization_id")
        OR "organization_memberships"."capability_overrides" ->> 'canManageMembers' = 'true'
      )
  );
$$;


ALTER FUNCTION "public"."can_export_organization_data"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_calendar_configuration"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'configure');
$$;


ALTER FUNCTION "public"."can_manage_calendar_configuration"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_groups"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'configure');
$$;


ALTER FUNCTION "public"."can_manage_groups"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND "organization_memberships"."role" IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" IN ('owner', 'admin')
	);
$$;


ALTER FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_training_configuration"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'configure');
$$;


ALTER FUNCTION "public"."can_manage_training_configuration"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_update_organization_settings"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND "organization_memberships"."role" IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."can_update_organization_settings"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_view_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view');
$$;


ALTER FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view');
$$;


ALTER FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE ("personnel"."id")::text = "p_assignee_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view')
  AND EXISTS (
   SELECT 1
   FROM public.assignment_types AS assignment_type
   WHERE assignment_type.id = p_assignment_type_id
    AND assignment_type.organization_id = p_organization_id
    AND (
     (assignment_type.assign_to = 'personnel' AND EXISTS (
      SELECT 1 FROM public.personnel AS person
      WHERE person.id::text = p_assignee_id
       AND person.organization_id = p_organization_id
       AND public.member_access_group_scope_matches(p_organization_id, person.group_id)
     ))
     OR (assignment_type.assign_to = 'group' AND EXISTS (
      SELECT 1 FROM public.groups AS assigned_group
      WHERE assigned_group.id::text = p_assignee_id
       AND assigned_group.organization_id = p_organization_id
       AND public.member_access_group_scope_matches(p_organization_id, assigned_group.id)
     ))
    )
  );
$$;


ALTER FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_groups"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
	SELECT
		"public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'training', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view');
$$;


ALTER FUNCTION "public"."can_view_groups"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_onboarding"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'view');
$$;


ALTER FUNCTION "public"."can_view_onboarding"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view');
$$;


ALTER FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view')
     AND "public"."member_access_group_scope_matches"("p_organization_id", "p_group_id");
$$;


ALTER FUNCTION "public"."can_view_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_personnel_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_view_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view');
$$;


ALTER FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view')
     AND EXISTS (
       SELECT 1
       FROM "public"."personnel"
       WHERE "personnel"."id" = "p_rated_person_id"
         AND "personnel"."organization_id" = "p_organization_id"
         AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
     );
$$;


ALTER FUNCTION "public"."can_view_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_training"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'view');
$$;


ALTER FUNCTION "public"."can_view_training"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_account_setup_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_requests" integer, "p_checked_at" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("limited" boolean, "retry_after_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	current_count integer;
	current_reset_at timestamp with time zone;
	next_reset_at timestamp with time zone;
BEGIN
	IF "p_bucket_key" IS NULL OR length("p_bucket_key") = 0 THEN
		RAISE EXCEPTION 'bucket_key is required';
	END IF;

	IF "p_window_seconds" <= 0 OR "p_max_requests" <= 0 THEN
		RAISE EXCEPTION 'window_seconds and max_requests must be positive';
	END IF;

	next_reset_at := "p_checked_at" + make_interval(secs => "p_window_seconds");

	INSERT INTO "public"."account_setup_rate_limits" ("bucket_key", "request_count", "reset_at", "updated_at")
	VALUES ("p_bucket_key", 1, next_reset_at, "p_checked_at")
	ON CONFLICT ("bucket_key") DO UPDATE
	SET
		"request_count" = CASE
			WHEN "account_setup_rate_limits"."reset_at" < "p_checked_at" THEN 1
			ELSE "account_setup_rate_limits"."request_count" + 1
		END,
		"reset_at" = CASE
			WHEN "account_setup_rate_limits"."reset_at" < "p_checked_at" THEN next_reset_at
			ELSE "account_setup_rate_limits"."reset_at"
		END,
		"updated_at" = "p_checked_at"
	RETURNING "account_setup_rate_limits"."request_count", "account_setup_rate_limits"."reset_at"
	INTO current_count, current_reset_at;

	RETURN QUERY SELECT
		current_count > "p_max_requests",
		GREATEST(0, CEIL(EXTRACT(EPOCH FROM (current_reset_at - "p_checked_at")) * 1000)::integer);
END;
$$;


ALTER FUNCTION "public"."check_account_setup_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_requests" integer, "p_checked_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_durable_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_requests" integer, "p_checked_at" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("limited" boolean, "retry_after_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	current_count integer;
	current_reset_at timestamp with time zone;
	next_reset_at timestamp with time zone;
BEGIN
	IF "p_bucket_key" IS NULL OR length("p_bucket_key") = 0 THEN
		RAISE EXCEPTION 'bucket_key is required';
	END IF;

	IF "p_window_seconds" <= 0 OR "p_max_requests" <= 0 THEN
		RAISE EXCEPTION 'window_seconds and max_requests must be positive';
	END IF;

	IF random() < 0.01 THEN
		DELETE FROM "public"."durable_rate_limits"
		WHERE "reset_at" < ("p_checked_at" - interval '1 day');
	END IF;

	next_reset_at := "p_checked_at" + make_interval(secs => "p_window_seconds");

	INSERT INTO "public"."durable_rate_limits" ("bucket_key", "request_count", "reset_at", "updated_at")
	VALUES ("p_bucket_key", 1, next_reset_at, "p_checked_at")
	ON CONFLICT ("bucket_key") DO UPDATE
	SET
		"request_count" = CASE
			WHEN "durable_rate_limits"."reset_at" < "p_checked_at" THEN 1
			ELSE "durable_rate_limits"."request_count" + 1
		END,
		"reset_at" = CASE
			WHEN "durable_rate_limits"."reset_at" < "p_checked_at" THEN next_reset_at
			ELSE "durable_rate_limits"."reset_at"
		END,
		"updated_at" = "p_checked_at"
	RETURNING "durable_rate_limits"."request_count", "durable_rate_limits"."reset_at"
	INTO current_count, current_reset_at;

	RETURN QUERY SELECT
		current_count > "p_max_requests",
		GREATEST(0, CEIL(EXTRACT(EPOCH FROM (current_reset_at - "p_checked_at")) * 1000)::integer);
END;
$$;


ALTER FUNCTION "public"."check_durable_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_requests" integer, "p_checked_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_account_setup_link_for_session"("p_setup_link_id" "uuid", "p_access_request_id" "uuid", "p_claimed_at" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("claim_status" "text", "setup_link_id" "uuid", "access_request_id" "uuid", "expires_at" timestamp with time zone, "created_at" timestamp with time zone, "claimed_at" timestamp with time zone, "failed_at" timestamp with time zone, "failure_reason" "text", "used_at" timestamp with time zone, "revoked_at" timestamp with time zone, "revocation_reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	link_row public.account_setup_links%ROWTYPE;
	request_row public.access_requests%ROWTYPE;
BEGIN
	SELECT *
	INTO link_row
	FROM public.account_setup_links
	WHERE account_setup_links.id = p_setup_link_id
		AND account_setup_links.access_request_id = p_access_request_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT
			'missing'::text, NULL::uuid, NULL::uuid, NULL::timestamp with time zone, NULL::timestamp with time zone,
			NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::text, NULL::timestamp with time zone,
			NULL::timestamp with time zone, NULL::text;
		RETURN;
	END IF;

	SELECT *
	INTO request_row
	FROM public.access_requests
	WHERE access_requests.id = p_access_request_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT
			'missing'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.used_at IS NOT NULL THEN
		RETURN QUERY SELECT
			'used'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.failed_at IS NOT NULL THEN
		RETURN QUERY SELECT
			'failed'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.claimed_at IS NOT NULL THEN
		RETURN QUERY SELECT
			'claimed'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.revoked_at IS NOT NULL THEN
		RETURN QUERY SELECT
			CASE WHEN link_row.revocation_reason = 'replaced' THEN 'replaced'::text ELSE 'revoked'::text END,
			link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF link_row.expires_at <= p_claimed_at THEN
		RETURN QUERY SELECT
			'expired'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF request_row.status <> 'approved' THEN
		RETURN QUERY SELECT
			'access-request-not-approved'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	IF request_row.setup_completed_at IS NOT NULL THEN
		RETURN QUERY SELECT
			'access-request-completed'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	UPDATE public.account_setup_links
	SET claimed_at = p_claimed_at
	WHERE account_setup_links.id = link_row.id
	RETURNING * INTO link_row;

	RETURN QUERY SELECT
		'claim-started'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
		link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
		link_row.revoked_at, link_row.revocation_reason;
END;
$$;


ALTER FUNCTION "public"."claim_account_setup_link_for_session"("p_setup_link_id" "uuid", "p_access_request_id" "uuid", "p_claimed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM audit_logs
  WHERE timestamp < now() - interval '1 year';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_audit_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_password_change_attempt"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE marker text;
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    PERFORM set_config('app.password_changed_actor', NEW.id::text, true);
  END IF;
  marker := NEW.raw_user_meta_data ->> 'ttt_password_attempt';
  IF marker IS NOT NULL THEN
    IF current_setting('app.password_changed_actor', true) IS DISTINCT FROM NEW.id::text THEN
      RAISE EXCEPTION 'Password change witness missing' USING ERRCODE = '42501';
    END IF;
    UPDATE public.password_change_attempts SET state = 'pending'
      WHERE actor = NEW.id AND id::text = marker AND state = 'started'
        AND expires_at > clock_timestamp()
        AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = session_id AND s.user_id = NEW.id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Password attempt fenced' USING ERRCODE = '42501'; END IF;
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'ttt_password_attempt';
    PERFORM set_config('app.password_changed_actor', '', true);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."confirm_password_change_attempt"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_memberships_by_organization"("p_org_ids" "uuid"[]) RETURNS TABLE("organization_id" "uuid", "membership_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
	SELECT "organization_memberships"."organization_id", COUNT(*)::bigint AS "membership_count"
	FROM "public"."organization_memberships"
	WHERE "organization_memberships"."organization_id" = ANY("p_org_ids")
	GROUP BY "organization_memberships"."organization_id";
$$;


ALTER FUNCTION "public"."count_memberships_by_organization"("p_org_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::integer
  FROM public.personnel
  WHERE organization_id = p_org_id
    AND archived_at IS NULL;
$$;


ALTER FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_personnel_by_organization"("p_org_ids" "uuid"[]) RETURNS TABLE("organization_id" "uuid", "personnel_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    SELECT "personnel"."organization_id", COUNT(*)::bigint AS "personnel_count"
    FROM "public"."personnel"
    WHERE "personnel"."organization_id" = ANY("p_org_ids")
      AND "personnel"."archived_at" IS NULL
    GROUP BY "personnel"."organization_id";
$$;


ALTER FUNCTION "public"."count_personnel_by_organization"("p_org_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_platform_users"() RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT json_build_object(
    'total', (SELECT count(*) FROM auth.users),
    'last_30_days', (
      SELECT count(*) FROM auth.users
      WHERE created_at >= now() - interval '30 days'
    ),
    'previous_30_days', (
      SELECT count(*) FROM auth.users
      WHERE created_at >= now() - interval '60 days'
      AND created_at < now() - interval '30 days'
    )
  );
$$;


ALTER FUNCTION "public"."count_platform_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_org_with_owner"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
	v_org_id uuid;
	v_org_name text;
	v_user_id uuid := auth.uid();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'Authentication required to create an organization';
	END IF;

	v_org_name := btrim(p_name);
	IF v_org_name IS NULL OR v_org_name = '' THEN
		RAISE EXCEPTION 'Organization name is required';
	END IF;

	IF char_length(v_org_name) > 100 THEN
		RAISE EXCEPTION 'Organization name must be 100 characters or fewer';
	END IF;

	INSERT INTO public.organizations (name, created_by)
	VALUES (v_org_name, v_user_id)
	RETURNING id INTO v_org_id;

	INSERT INTO public.organization_memberships (
		organization_id,
		user_id,
		role,
		member_preset,
		capability_overrides,
		access_scope_kind,
		access_scope_group_ids
	)
	VALUES (
		v_org_id,
		v_user_id,
		'owner',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	);

	RETURN v_org_id;
END;
$$;


ALTER FUNCTION "public"."create_org_with_owner"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."daily_signups_last_30_days"() RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT json_agg(row_to_json(d))
  FROM (
    SELECT
      date_trunc('day', created_at)::date AS date,
      count(*) AS count
    FROM auth.users
    WHERE created_at >= now() - interval '30 days'
    GROUP BY date_trunc('day', created_at)::date
    ORDER BY date
  ) d;
$$;


ALTER FUNCTION "public"."daily_signups_last_30_days"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decline_organization_invitation"("p_invitation_id" "uuid") RETURNS TABLE("decline_status" "text", "declined_organization_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	"current_user_id" uuid := "auth"."uid"();
	"current_email" text := lower(btrim(("auth"."jwt"() ->> 'email'::text)));
	"invitation_record" "public"."organization_invitations"%ROWTYPE;
BEGIN
	IF "current_user_id" IS NULL OR "current_email" IS NULL OR "current_email" = '' THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
		RETURN;
	END IF;

	SELECT *
	INTO "invitation_record"
	FROM "public"."organization_invitations"
	WHERE "id" = "p_invitation_id"
	FOR UPDATE;

	IF NOT FOUND OR "invitation_record"."normalized_email" <> "current_email" THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'accepted'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_accepted'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'declined'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_declined'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'revoked'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'revoked'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'blocked'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'blocked'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF
		"invitation_record"."status" = 'expired'::"public"."invitation_status"
		OR "invitation_record"."expires_at" <= now()
	THEN
		UPDATE "public"."organization_invitations"
		SET
			"status" = 'expired'::"public"."invitation_status",
			"expired_at" = COALESCE("expired_at", now())
		WHERE "id" = "invitation_record"."id";

		RETURN QUERY SELECT 'expired'::text, "invitation_record"."organization_id";
		RETURN;
	END IF;

	IF "invitation_record"."status" <> 'pending'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
		RETURN;
	END IF;

	UPDATE "public"."organization_invitations"
	SET
		"status" = 'declined'::"public"."invitation_status",
		"declined_at" = now(),
		"declined_by" = "current_user_id"
	WHERE "id" = "invitation_record"."id";

	RETURN QUERY SELECT 'declined'::text, "invitation_record"."organization_id";
END;
$$;


ALTER FUNCTION "public"."decline_organization_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_unused_organization_rank_catalog_entry"("p_organization_id" "uuid", "p_entry_id" "uuid", "p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  "catalog_entry" "public"."organization_rank_catalog"%ROWTYPE;
  "allow_normalized_match" boolean;
  "reference_count" integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended("p_organization_id"::text, 1248));

  SELECT *
    INTO "catalog_entry"
    FROM "public"."organization_rank_catalog"
    WHERE "organization_id" = "p_organization_id"
      AND "id" = "p_entry_id"
      AND "code" = "p_code"
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rank catalog entry could not be removed'
      USING ERRCODE = 'P0002';
  END IF;

  IF "catalog_entry"."source" = 'built-in' THEN
    RAISE EXCEPTION 'Built-in ranks cannot be removed. Retire them instead.'
      USING ERRCODE = '23514';
  END IF;

  LOCK TABLE
    "public"."personnel",
    "public"."training_types",
    "public"."duty_roster_templates",
    "public"."duty_template_slots",
    "public"."duty_templates",
    "public"."sign_in_rosters",
    "public"."duty_roster_template_runs"
    IN SHARE MODE;

  SELECT NOT EXISTS (
    SELECT 1
    FROM "public"."organization_rank_catalog" AS "other_entry"
    WHERE "other_entry"."organization_id" = "p_organization_id"
      AND "other_entry"."id" <> "p_entry_id"
      AND upper(btrim(regexp_replace("other_entry"."code", '[[:space:]]+', ' ', 'g')))
        = upper(btrim(regexp_replace("p_code", '[[:space:]]+', ' ', 'g')))
  )
  INTO "allow_normalized_match";

  SELECT
    (
      SELECT count(*)::integer
      FROM "public"."personnel"
      WHERE "organization_id" = "p_organization_id"
        AND "public"."organization_rank_catalog_reference_matches"("rank", "p_code", "allow_normalized_match")
    )
    + (
      SELECT count(*)::integer
      FROM "public"."training_types"
      WHERE "organization_id" = "p_organization_id"
        AND (
          EXISTS (
            SELECT 1
            FROM unnest("applies_to_ranks") AS "rank_filter"("rank_code")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "rank_filter"."rank_code",
              "p_code",
              "allow_normalized_match"
            )
          )
          OR EXISTS (
            SELECT 1
            FROM unnest("excluded_ranks") AS "rank_filter"("rank_code")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "rank_filter"."rank_code",
              "p_code",
              "allow_normalized_match"
            )
          )
        )
    )
    + (
      SELECT count(*)::integer
      FROM "public"."duty_roster_templates"
      WHERE "organization_id" = "p_organization_id"
        AND "status" <> 'archived'
        AND "archived_at" IS NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof("pool_criteria" -> 'rankValues') = 'array'
                THEN "pool_criteria" -> 'rankValues'
              ELSE '[]'::jsonb
            END
          ) AS "rank_filter"("rank_code")
          WHERE "public"."organization_rank_catalog_reference_matches"(
            "rank_filter"."rank_code",
            "p_code",
            "allow_normalized_match"
          )
        )
    )
    + (
      SELECT count(*)::integer
      FROM "public"."duty_template_slots"
      INNER JOIN "public"."duty_templates"
        ON "duty_templates"."organization_id" = "duty_template_slots"."organization_id"
        AND "duty_templates"."id" = "duty_template_slots"."template_id"
        AND "duty_templates"."status" = 'active'
      WHERE "duty_template_slots"."organization_id" = "p_organization_id"
        AND EXISTS (
          SELECT 1
          FROM unnest("allowed_ranks") AS "rank_filter"("rank_code")
          WHERE "public"."organization_rank_catalog_reference_matches"(
            "rank_filter"."rank_code",
            "p_code",
            "allow_normalized_match"
          )
        )
    )
    + (
      SELECT count(*)::integer
      FROM "public"."sign_in_rosters"
      WHERE "organization_id" = "p_organization_id"
        AND (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof("filter_config" -> 'ranks') = 'array'
                  THEN "filter_config" -> 'ranks'
                ELSE '[]'::jsonb
              END
            ) AS "rank_filter"("rank_code")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "rank_filter"."rank_code",
              "p_code",
              "allow_normalized_match"
            )
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof("personnel_snapshot") = 'array'
                  THEN "personnel_snapshot"
                ELSE '[]'::jsonb
              END
            ) AS "snapshot_person"("person")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "snapshot_person"."person" ->> 'rank',
              "p_code",
              "allow_normalized_match"
            )
          )
        )
    )
    + (
      SELECT count(*)::integer
      FROM "public"."duty_roster_template_runs"
      WHERE "organization_id" = "p_organization_id"
        AND "status" = 'accepted'
        AND EXISTS (
          SELECT 1
          FROM (
            SELECT jsonb_array_elements(
              CASE
                WHEN jsonb_typeof("snapshot_payload" -> 'selectionPersonnel') = 'array'
                  THEN "snapshot_payload" -> 'selectionPersonnel'
                ELSE '[]'::jsonb
              END
            ) AS "person"
            UNION ALL
            SELECT jsonb_array_elements(
              CASE
                WHEN jsonb_typeof("snapshot_payload" -> 'resolvedPool') = 'array'
                  THEN "snapshot_payload" -> 'resolvedPool'
                ELSE '[]'::jsonb
              END
            ) AS "person"
            UNION ALL
            SELECT jsonb_array_elements(
              CASE
                WHEN jsonb_typeof("snapshot_payload" -> 'assignedPersonnel') = 'array'
                  THEN "snapshot_payload" -> 'assignedPersonnel'
                ELSE '[]'::jsonb
              END
            ) AS "person"
            UNION ALL
            SELECT jsonb_array_elements(
              CASE
                WHEN jsonb_typeof("snapshot_payload" -> 'unassignedPersonnel') = 'array'
                  THEN "snapshot_payload" -> 'unassignedPersonnel'
                ELSE '[]'::jsonb
              END
            ) AS "person"
          ) AS "snapshot_personnel"
          WHERE "public"."organization_rank_catalog_reference_matches"(
            "snapshot_personnel"."person" ->> 'rank',
            "p_code",
            "allow_normalized_match"
          )
        )
    )
  INTO "reference_count";

  IF "reference_count" > 0 THEN
    RAISE EXCEPTION 'Rank is referenced by Organization data. Retire it instead.'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM "public"."organization_rank_catalog"
  WHERE "organization_id" = "p_organization_id"
    AND "id" = "p_entry_id";
END;
$$;


ALTER FUNCTION "public"."delete_unused_organization_rank_catalog_entry"("p_organization_id" "uuid", "p_entry_id" "uuid", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_personnel_document_storage_cap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    current_bytes bigint;
    cap_bytes bigint;
BEGIN
    PERFORM 1
    FROM "public"."personnel"
    WHERE "id" = NEW."personnel_id"
      AND "organization_id" = NEW."organization_id"
    FOR UPDATE;

    SELECT COALESCE("personnel_document_storage_cap_bytes", 104857600)
    INTO cap_bytes
    FROM "public"."organizations"
    WHERE "id" = NEW."organization_id";

    SELECT COALESCE(SUM("file_size_bytes"), 0)
    INTO current_bytes
    FROM "public"."personnel_documents"
    WHERE "organization_id" = NEW."organization_id"
      AND "personnel_id" = NEW."personnel_id"
      AND "archived_at" IS NULL
      AND "id" <> NEW."id";

    IF current_bytes + NEW."file_size_bytes" > cap_bytes THEN
        RAISE EXCEPTION 'personnel document storage cap exceeded';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_personnel_document_storage_cap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_session_started_at"() RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT session.created_at
  FROM auth.sessions AS session
  WHERE session.id = (NULLIF(auth.jwt() ->> 'session_id', ''))::uuid
    AND session.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_current_session_started_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_session_started_at"() IS 'Original start of the bearer session owned by auth.uid(); null for an absent/revoked session. No account-wide sign-in fallback.';



CREATE OR REPLACE FUNCTION "public"."is_full_editor_for_org"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND "organization_memberships"."role" NOT IN ('owner', 'admin')
      AND "organization_memberships"."scoped_group_id" IS NULL
      AND "organization_memberships"."can_view_calendar" = true
      AND "organization_memberships"."can_edit_calendar" = true
      AND "organization_memberships"."can_view_personnel" = true
      AND "organization_memberships"."can_edit_personnel" = true
      AND "organization_memberships"."can_view_training" = true
      AND "organization_memberships"."can_edit_training" = true
      AND "organization_memberships"."can_view_onboarding" = true
      AND "organization_memberships"."can_edit_onboarding" = true
      AND "organization_memberships"."can_view_leaders_book" = true
      AND "organization_memberships"."can_edit_leaders_book" = true
  );
$$;


ALTER FUNCTION "public"."is_full_editor_for_org"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_org_member"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = (select auth.uid()) AND role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_privileged"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_org_privileged"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = (select auth.uid()) AND is_active = true
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND is_active = true AND role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_suspended"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
	SELECT CASE
		WHEN current_setting('role', true) = 'service_role'
			OR public.is_platform_admin()
			OR (SELECT auth.uid()) = check_user_id
		THEN EXISTS (
			SELECT 1 FROM public.user_suspensions WHERE user_id = check_user_id
		)
		ELSE false
	END;
$$;


ALTER FUNCTION "public"."is_user_suspended"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_valid_sensitive_file_path"("bucket_name" "text", "object_name" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT
    bucket_name = 'counseling-files'
    AND public.storage_object_org_id(object_name) IS NOT NULL
    AND public.storage_object_scope(object_name) = ANY (ARRAY['sign-in-rosters', 'counseling-records'])
    AND COALESCE(storage.extension(object_name), '') = 'pdf'
$$;


ALTER FUNCTION "public"."is_valid_sensitive_file_path"("bucket_name" "text", "object_name" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."personnel_ict_completions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "ict_task_id" "uuid" NOT NULL,
    "completed_at" "date" NOT NULL,
    "validation_method" "public"."ict_validation_method" NOT NULL,
    "validated_by" "text",
    "notes" "text",
    "logged_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."personnel_ict_completions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."latest_active_personnel_ict_completions"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_ict_task_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS SETOF "public"."personnel_ict_completions"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT DISTINCT ON ("pic"."personnel_id", "pic"."ict_task_id") "pic".*
  FROM "public"."personnel_ict_completions" AS "pic"
  INNER JOIN "public"."personnel" AS "p"
    ON "p"."id" = "pic"."personnel_id"
    AND "p"."organization_id" = "pic"."organization_id"
    AND "p"."archived_at" IS NULL
  INNER JOIN "public"."ict_tasks" AS "t"
    ON "t"."id" = "pic"."ict_task_id"
    AND "t"."organization_id" = "pic"."organization_id"
    AND "t"."archived_at" IS NULL
  WHERE "pic"."organization_id" = "p_organization_id"
    AND ("p_personnel_ids" IS NULL OR "pic"."personnel_id" = ANY("p_personnel_ids"))
    AND ("p_ict_task_ids" IS NULL OR "pic"."ict_task_id" = ANY("p_ict_task_ids"))
  ORDER BY
    "pic"."personnel_id",
    "pic"."ict_task_id",
    "pic"."completed_at" DESC,
    "pic"."created_at" DESC;
$$;


ALTER FUNCTION "public"."latest_active_personnel_ict_completions"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_ict_task_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_audit_log_actions"("p_org_id" "uuid", "p_excluded_actions" "text"[] DEFAULT ARRAY[]::"text"[]) RETURNS TABLE("action" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    SELECT DISTINCT "audit_logs"."action"
    FROM "public"."audit_logs"
    WHERE "audit_logs"."org_id" = "p_org_id"
      AND NOT ("audit_logs"."action" = ANY("p_excluded_actions"))
    ORDER BY "audit_logs"."action";
$$;


ALTER FUNCTION "public"."list_audit_log_actions"("p_org_id" "uuid", "p_excluded_actions" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_platform_owner_membership_metrics"("p_org_ids" "uuid"[]) RETURNS TABLE("organization_id" "uuid", "owner_count" bigint, "owner_user_id" "uuid", "owner_email" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
	WITH "owner_rows" AS (
		SELECT
			"organization_memberships"."organization_id",
			"organization_memberships"."user_id",
			"organization_memberships"."email",
			COUNT(*) OVER (PARTITION BY "organization_memberships"."organization_id")::bigint AS "owner_count",
			ROW_NUMBER() OVER (
				PARTITION BY "organization_memberships"."organization_id"
				ORDER BY "organization_memberships"."user_id"
			) AS "owner_rank"
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = ANY("p_org_ids")
			AND "organization_memberships"."role" = 'owner'::"public"."organization_role"
	)
	SELECT
		"owner_rows"."organization_id",
		"owner_rows"."owner_count",
		CASE WHEN "owner_rows"."owner_count" = 1 THEN "owner_rows"."user_id" ELSE NULL END AS "owner_user_id",
		CASE WHEN "owner_rows"."owner_count" = 1 THEN "owner_rows"."email" ELSE NULL END AS "owner_email"
	FROM "owner_rows"
	WHERE "owner_rows"."owner_rank" = 1;
$$;


ALTER FUNCTION "public"."list_platform_owner_membership_metrics"("p_org_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "rank" "text", "last_name" "text", "first_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    "personnel"."id",
    "personnel"."rank",
    "personnel"."last_name",
    "personnel"."first_name"
  FROM "public"."personnel"
  WHERE "personnel"."organization_id" = "p_organization_id"
    AND "personnel"."archived_at" IS NULL
    AND "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view')
    AND "public"."member_access_group_scope_matches"("p_organization_id", "personnel"."group_id")
  ORDER BY "personnel"."last_name" ASC, "personnel"."first_name" ASC;
$$;


ALTER FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_invitation_email_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "invitation_id" "uuid" NOT NULL,
    "recipient" "text" NOT NULL,
    "purpose" "text" DEFAULT 'organization_invitation'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    CONSTRAINT "organization_invitation_email_outbox_purpose_check" CHECK (("purpose" = 'organization_invitation'::"text")),
    CONSTRAINT "organization_invitation_email_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."organization_invitation_email_outbox" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"("p_outbox_id" "uuid", "p_status" "text", "p_marked_at" timestamp with time zone DEFAULT "now"(), "p_last_error" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."organization_invitation_email_outbox"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
	-- Keep invitation delivery retries capped even if a caller bypasses the app-level guard.
	UPDATE public.organization_invitation_email_outbox
	SET
		status = p_status,
		attempt_count = attempt_count + 1,
		last_error = CASE WHEN p_status = 'sent' THEN NULL ELSE p_last_error END,
		updated_at = p_marked_at,
		sent_at = CASE WHEN p_status = 'sent' THEN p_marked_at ELSE NULL END
	WHERE id = p_outbox_id
		AND p_status = ANY (ARRAY['sent'::text, 'failed'::text])
		AND attempt_count < 3
	RETURNING *;
$$;


ALTER FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"("p_outbox_id" "uuid", "p_status" "text", "p_marked_at" timestamp with time zone, "p_last_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."member_access_capability_level"("p_can_view" boolean, "p_can_edit" boolean) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN "p_can_edit" THEN 'configure'
    WHEN "p_can_view" THEN 'view'
    ELSE 'none'
  END;
$$;


ALTER FUNCTION "public"."member_access_capability_level"("p_can_view" boolean, "p_can_edit" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."member_access_capability_override"("p_base_level" "text", "p_can_view" boolean, "p_can_edit" boolean) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN "public"."member_access_capability_level"("p_can_view", "p_can_edit") = "p_base_level" THEN NULL
    ELSE "public"."member_access_capability_level"("p_can_view", "p_can_edit")
  END;
$$;


ALTER FUNCTION "public"."member_access_capability_override"("p_base_level" "text", "p_can_view" boolean, "p_can_edit" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" "uuid", "p_group_id" "uuid") RETURNS boolean
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
        OR "organization_memberships"."access_scope_kind" = 'organization'
        OR "p_group_id" IS NULL
        OR (
          "organization_memberships"."access_scope_kind" = 'groups'
          AND array_length("organization_memberships"."access_scope_group_ids", 1) > 0
          AND "p_group_id" = ANY("organization_memberships"."access_scope_group_ids")
        )
      )
  );
$$;


ALTER FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" "uuid", "p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."member_access_has_capability"("p_organization_id" "uuid", "p_lane" "text", "p_required_capability" "text") RETURNS boolean
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
  );
$$;


ALTER FUNCTION "public"."member_access_has_capability"("p_organization_id" "uuid", "p_lane" "text", "p_required_capability" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."member_access_lane_capability"("p_member_preset" "text", "p_capability_overrides" "jsonb", "p_lane" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN "p_capability_overrides" ->> "p_lane" IN ('none', 'view', 'operate', 'configure')
      THEN "p_capability_overrides" ->> "p_lane"
    WHEN "p_member_preset" = 'editor' THEN 'configure'
    WHEN "p_member_preset" = 'operator' THEN 'operate'
    WHEN "p_member_preset" = 'viewer' THEN 'view'
    ELSE 'none'
  END;
$$;


ALTER FUNCTION "public"."member_access_lane_capability"("p_member_preset" "text", "p_capability_overrides" "jsonb", "p_lane" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."member_access_required_capability_rank"("p_capability" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE "p_capability"
    WHEN 'none' THEN 0
    WHEN 'view' THEN 1
    WHEN 'operate' THEN 2
    WHEN 'configure' THEN 3
    ELSE 0
  END;
$$;


ALTER FUNCTION "public"."member_access_required_capability_rank"("p_capability" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."organization_rank_catalog_reference_matches"("p_value" "text", "p_code" "text", "p_allow_normalized" boolean) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT "p_value" IS NOT NULL
    AND (
      btrim(regexp_replace("p_value", '[[:space:]]+', ' ', 'g'))
        = btrim(regexp_replace("p_code", '[[:space:]]+', ' ', 'g'))
      OR (
        "p_allow_normalized"
        AND upper(btrim(regexp_replace("p_value", '[[:space:]]+', ' ', 'g')))
          = upper(btrim(regexp_replace("p_code", '[[:space:]]+', ' ', 'g')))
      )
    );
$$;


ALTER FUNCTION "public"."organization_rank_catalog_reference_matches"("p_value" "text", "p_code" "text", "p_allow_normalized" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."password_change_attempt"("p_actor" "uuid", "p_session" "uuid", "p_action" "text", "p_flow" "text" DEFAULT NULL::"text", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  attempt public.password_change_attempts%ROWTYPE;
  acquired boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id = p_session AND user_id = p_actor)
    THEN RAISE EXCEPTION 'Inactive password session' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('read', 'begin', 'reconcile', 'complete', 'restart')
    THEN RAISE EXCEPTION 'Invalid password action'; END IF;
  -- Serialize admission even before a row exists. A single actor cannot have
  -- simultaneous password mutations from different sessions or app instances.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text, 195));
  SELECT * INTO attempt FROM public.password_change_attempts WHERE actor = p_actor FOR UPDATE;
  IF p_action = 'begin' AND attempt.actor IS NULL THEN
    IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '24 hours'
      THEN RAISE EXCEPTION 'Invalid password expiry'; END IF;
    INSERT INTO public.password_change_attempts(actor, session_id, flow, expires_at, state)
      VALUES (p_actor, p_session, p_flow, p_expires_at, 'started') RETURNING * INTO attempt;
    acquired := true;
  END IF;
  IF attempt.actor IS NULL THEN RETURN jsonb_build_object('state', NULL); END IF;
  -- A fresh authenticated session may retire a completed or expired attempt.
  -- Completed attempts have no outstanding effects; replacing their ID still
  -- fences old provider markers. Unfinished, unexpired attempts stay bound.
  IF p_action = 'restart' AND (
    (attempt.session_id = p_session AND attempt.state = 'failed') OR
    (attempt.session_id = p_session AND attempt.state = 'complete' AND p_flow IS NULL) OR
    (attempt.session_id <> p_session AND (attempt.state = 'complete' OR attempt.expires_at <= clock_timestamp()))
  ) THEN
    DELETE FROM public.password_change_attempts WHERE actor = p_actor;
    RETURN jsonb_build_object('state', NULL);
  END IF;
  IF attempt.session_id <> p_session OR attempt.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  IF attempt.flow IS DISTINCT FROM p_flow AND NOT (attempt.state = 'complete' AND p_flow IS NULL) THEN
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  IF p_action IN ('reconcile', 'complete') AND p_id IS DISTINCT FROM attempt.id
    THEN RAISE EXCEPTION 'Password attempt changed' USING ERRCODE = '40001'; END IF;
  IF p_action = 'reconcile' AND attempt.state = 'started' THEN
    -- The row lock races the provider commit. Either its transaction confirmed
    -- first, or this fence makes its later marker fail and rolls it back.
    UPDATE public.password_change_attempts SET state = 'failed' WHERE actor = p_actor RETURNING * INTO attempt;
  ELSIF p_action = 'complete' AND attempt.state = 'pending' THEN
    UPDATE public.password_change_attempts SET state = 'complete' WHERE actor = p_actor RETURNING * INTO attempt;
  END IF;
  RETURN jsonb_build_object('state', attempt.state, 'id', attempt.id, 'flow', attempt.flow,
    'expiresAt', extract(epoch FROM attempt.expires_at), 'acquired', acquired);
END;
$$;


ALTER FUNCTION "public"."password_change_attempt"("p_actor" "uuid", "p_session" "uuid", "p_action" "text", "p_flow" "text", "p_expires_at" timestamp with time zone, "p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_organization_rank_catalog_org_move"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" THEN
    RAISE EXCEPTION 'organization_rank_catalog.organization_id cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_organization_rank_catalog_org_move"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_request_and_block_linked_invitations"("p_access_request_id" "uuid", "p_reviewer_id" "uuid") RETURNS TABLE("reject_status" "text", "organization_invitation_id" "uuid", "organization_id" "uuid", "invitation_email" "text", "blocked_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	"request_email" "text";
BEGIN
	UPDATE "public"."access_requests"
	SET
		"status" = 'rejected',
		"reviewed_by" = "p_reviewer_id",
		"reviewed_at" = now()
	WHERE "access_requests"."id" = "p_access_request_id"
		AND "access_requests"."status" = 'pending'
	RETURNING "access_requests"."email"
	INTO "request_email";

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'not_found'::"text", NULL::"uuid", NULL::"uuid", NULL::"text", NULL::timestamp with time zone;
		RETURN;
	END IF;

	RETURN QUERY
	WITH "linked_pending" AS (
		SELECT
			"organization_invitations"."id",
			"organization_invitations"."organization_id",
			"organization_invitations"."email"
		FROM "public"."access_request_organization_invitation_links"
		JOIN "public"."organization_invitations"
			ON "organization_invitations"."id" = "access_request_organization_invitation_links"."organization_invitation_id"
		WHERE "access_request_organization_invitation_links"."access_request_id" = "p_access_request_id"
			AND "organization_invitations"."status" = 'pending'::"public"."invitation_status"
			AND "organization_invitations"."normalized_email" = lower(btrim("request_email"))
		FOR UPDATE OF "organization_invitations"
	),
	"blocked" AS (
		UPDATE "public"."organization_invitations"
		SET
			"status" = 'blocked'::"public"."invitation_status",
			"blocked_at" = now(),
			"blocked_by" = "p_reviewer_id"
		FROM "linked_pending"
		WHERE "organization_invitations"."id" = "linked_pending"."id"
		RETURNING
			"organization_invitations"."id",
			"organization_invitations"."organization_id",
			"organization_invitations"."email",
			"organization_invitations"."blocked_at"
	),
	"audit_insert" AS (
		INSERT INTO "public"."audit_logs" (
			"user_id",
			"org_id",
			"action",
			"resource_type",
			"resource_id",
			"details",
			"severity"
		)
		SELECT
			"p_reviewer_id",
			"blocked"."organization_id",
			'organization_invitation.blocked_by_access_request_rejection',
			'organization_invitation',
			"blocked"."id",
			jsonb_build_object(
				'accessRequestId', "p_access_request_id",
				'invitationId', "blocked"."id",
				'reason', 'linked_platform_access_rejected'
			),
			'warning'
		FROM "blocked"
		RETURNING "audit_logs"."id"
	)
	SELECT
		'rejected'::"text",
		"blocked"."id",
		"blocked"."organization_id",
		"blocked"."email",
		"blocked"."blocked_at"
	FROM "blocked";

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'rejected'::"text", NULL::"uuid", NULL::"uuid", NULL::"text", NULL::timestamp with time zone;
	END IF;
END;
$$;


ALTER FUNCTION "public"."reject_access_request_and_block_linked_invitations"("p_access_request_id" "uuid", "p_reviewer_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."advanced_duty_run_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "template_name" "text" NOT NULL,
    "pattern" "text" DEFAULT 'single'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "event_count" integer DEFAULT 0 NOT NULL,
    "event_dates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "candidate_personnel_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "snapshot_fingerprint" "text" NOT NULL,
    "snapshot_version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "input_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "snapshot_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "preview_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "export_model" "jsonb",
    "created_by_user_id" "uuid",
    "applied_run_id" "uuid",
    "apply_error" "text",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "draft_lineage_key" "text" NOT NULL,
    CONSTRAINT "advanced_duty_run_snapshots_date_order_check" CHECK (("start_date" <= "end_date")),
    CONSTRAINT "advanced_duty_run_snapshots_event_count_check" CHECK (("event_count" >= 0)),
    CONSTRAINT "advanced_duty_run_snapshots_export_model_object_check" CHECK ((("export_model" IS NULL) OR ("jsonb_typeof"("export_model") = 'object'::"text"))),
    CONSTRAINT "advanced_duty_run_snapshots_pattern_check" CHECK (("pattern" = ANY (ARRAY['single'::"text", 'daily'::"text", 'weekday-only'::"text", 'weekend-only'::"text", 'selected-weekdays'::"text", 'holiday-closure-only'::"text", 'custom-dates'::"text"]))),
    CONSTRAINT "advanced_duty_run_snapshots_payload_arrays_check" CHECK ((("jsonb_typeof"("event_dates") = 'array'::"text") AND ("jsonb_typeof"("candidate_personnel_ids") = 'array'::"text"))),
    CONSTRAINT "advanced_duty_run_snapshots_payload_objects_check" CHECK ((("jsonb_typeof"("input_payload") = 'object'::"text") AND ("jsonb_typeof"("snapshot_payload") = 'object'::"text") AND ("jsonb_typeof"("preview_payload") = 'object'::"text"))),
    CONSTRAINT "advanced_duty_run_snapshots_snapshot_version_check" CHECK (("snapshot_version" >= 1)),
    CONSTRAINT "advanced_duty_run_snapshots_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'applying'::"text", 'applied'::"text", 'apply-failed'::"text", 'partial-failure'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."advanced_duty_run_snapshots" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") RETURNS "public"."advanced_duty_run_snapshots"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  "v_inserted" "public"."advanced_duty_run_snapshots";
BEGIN
  PERFORM "pg_advisory_xact_lock"("hashtextextended"("p_org_id"::"text" || ':' || "p_draft_lineage_key", 0));

  DELETE FROM "public"."advanced_duty_run_snapshots"
   WHERE "organization_id" = "p_org_id"
     AND "status" = 'draft'::"text"
     AND "draft_lineage_key" = "p_draft_lineage_key";

  INSERT INTO "public"."advanced_duty_run_snapshots" (
    "organization_id",
    "template_id",
    "template_name",
    "pattern",
    "start_date",
    "end_date",
    "event_count",
    "event_dates",
    "candidate_personnel_ids",
    "draft_lineage_key",
    "snapshot_fingerprint",
    "snapshot_version",
    "status",
    "input_payload",
    "snapshot_payload",
    "preview_payload",
    "export_model",
    "created_by_user_id"
  )
  VALUES (
    "p_org_id",
    ("p_snapshot_data" ->> 'template_id')::"uuid",
    "p_snapshot_data" ->> 'template_name',
    COALESCE("p_snapshot_data" ->> 'pattern', 'single'),
    ("p_snapshot_data" ->> 'start_date')::"date",
    ("p_snapshot_data" ->> 'end_date')::"date",
    COALESCE(("p_snapshot_data" ->> 'event_count')::integer, 0),
    COALESCE("p_snapshot_data" -> 'event_dates', '[]'::"jsonb"),
    COALESCE("p_snapshot_data" -> 'candidate_personnel_ids', '[]'::"jsonb"),
    "p_draft_lineage_key",
    "p_snapshot_data" ->> 'snapshot_fingerprint',
    COALESCE(("p_snapshot_data" ->> 'snapshot_version')::integer, 1),
    'draft',
    COALESCE("p_snapshot_data" -> 'input_payload', '{}'::"jsonb"),
    COALESCE("p_snapshot_data" -> 'snapshot_payload', '{}'::"jsonb"),
    COALESCE("p_snapshot_data" -> 'preview_payload', '{}'::"jsonb"),
    CASE
      WHEN jsonb_typeof("p_snapshot_data" -> 'export_model') = 'null' THEN NULL
      ELSE "p_snapshot_data" -> 'export_model'
    END,
    NULLIF("p_snapshot_data" ->> 'created_by_user_id', '')::"uuid"
  )
  RETURNING * INTO "v_inserted";

  RETURN "v_inserted";
END;
$$;


ALTER FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_organization_invitation"("p_invitation_id" "uuid", "p_organization_id" "uuid") RETURNS TABLE("revoke_status" "text", "revoked_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	"current_user_id" uuid := "auth"."uid"();
	"invitation_record" "public"."organization_invitations"%ROWTYPE;
BEGIN
	IF "current_user_id" IS NULL THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::text;
		RETURN;
	END IF;

	SELECT *
	INTO "invitation_record"
	FROM "public"."organization_invitations"
	WHERE
		"id" = "p_invitation_id"
		AND "organization_id" = "p_organization_id"
	FOR UPDATE;

	IF NOT FOUND OR NOT "public"."can_manage_org_members"("invitation_record"."organization_id") THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::text;
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'accepted'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_accepted'::text, "invitation_record"."email";
		RETURN;
	END IF;

	IF "invitation_record"."status" = 'declined'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'already_declined'::text, "invitation_record"."email";
		RETURN;
	END IF;

	IF
		"invitation_record"."status" = 'expired'::"public"."invitation_status"
		OR "invitation_record"."expires_at" <= now()
	THEN
		UPDATE "public"."organization_invitations"
		SET
			"status" = 'expired'::"public"."invitation_status",
			"expired_at" = COALESCE("expired_at", now())
		WHERE "id" = "invitation_record"."id";

		RETURN QUERY SELECT 'expired'::text, "invitation_record"."email";
		RETURN;
	END IF;

	IF "invitation_record"."status" <> 'pending'::"public"."invitation_status" THEN
		RETURN QUERY SELECT 'not_found'::text, "invitation_record"."email";
		RETURN;
	END IF;

	UPDATE "public"."organization_invitations"
	SET
		"status" = 'revoked'::"public"."invitation_status",
		"revoked_at" = now(),
		"revoked_by" = "current_user_id"
	WHERE "id" = "invitation_record"."id";

	RETURN QUERY SELECT 'revoked'::text, "invitation_record"."email";
END;
$$;


ALTER FUNCTION "public"."revoke_organization_invitation"("p_invitation_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_users_by_email"("search_query" "text", "max_results" integer DEFAULT 5) RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(json_agg(row_to_json(u)), '[]'::json)
  FROM (
    SELECT id, email, created_at, last_sign_in_at
    FROM auth.users
    WHERE email ILIKE '%' || search_query || '%'
    ORDER BY created_at DESC
    LIMIT max_results
  ) u;
$$;


ALTER FUNCTION "public"."search_users_by_email"("search_query" "text", "max_results" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sensitive_file_object_is_readable"("bucket_name" "text", "object_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
	org_id uuid;
	object_scope text;
	personnel_id uuid;
	roster_id uuid;
BEGIN
	IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
		RETURN FALSE;
	END IF;

	org_id := public.storage_object_org_id(object_name);
	object_scope := public.storage_object_scope(object_name);

	CASE object_scope
		WHEN 'sign-in-rosters' THEN
			BEGIN
				roster_id := (storage.foldername(object_name))[3]::uuid;
			EXCEPTION
				WHEN others THEN
					RETURN FALSE;
			END;

			RETURN EXISTS (
				SELECT 1
				FROM "public"."sign_in_rosters"
				WHERE "sign_in_rosters"."id" = roster_id
					AND "sign_in_rosters"."organization_id" = org_id
					AND "public"."can_access_sign_in_roster_scope"(
						"sign_in_rosters"."organization_id",
						"sign_in_rosters"."scope_group_ids",
						'view'
					)
			);
		WHEN 'counseling-records' THEN
			BEGIN
				personnel_id := (storage.foldername(object_name))[3]::uuid;
			EXCEPTION
				WHEN others THEN
					RETURN FALSE;
			END;

			RETURN public.member_access_has_capability(org_id, 'personnel', 'view')
				AND EXISTS (
					SELECT 1
					FROM "public"."personnel"
					WHERE "personnel"."id" = personnel_id
						AND "personnel"."organization_id" = org_id
						AND "public"."member_access_group_scope_matches"(org_id, "personnel"."group_id")
				);
		ELSE
			RETURN FALSE;
	END CASE;
END;
$$;


ALTER FUNCTION "public"."sensitive_file_object_is_readable"("bucket_name" "text", "object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sensitive_file_object_is_writable"("bucket_name" "text", "object_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE
	org_id uuid;
	object_scope text;
	personnel_id uuid;
	roster_id uuid;
BEGIN
	IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
		RETURN FALSE;
	END IF;

	org_id := public.storage_object_org_id(object_name);
	object_scope := public.storage_object_scope(object_name);

	CASE object_scope
		WHEN 'sign-in-rosters' THEN
			BEGIN
				roster_id := (storage.foldername(object_name))[3]::uuid;
			EXCEPTION
				WHEN others THEN
					RETURN FALSE;
			END;

			RETURN EXISTS (
				SELECT 1
				FROM "public"."sign_in_rosters"
				WHERE "sign_in_rosters"."id" = roster_id
					AND "sign_in_rosters"."organization_id" = org_id
					AND "public"."can_access_sign_in_roster_scope"(
						"sign_in_rosters"."organization_id",
						"sign_in_rosters"."scope_group_ids",
						'operate'
					)
			);
		WHEN 'counseling-records' THEN
			BEGIN
				personnel_id := (storage.foldername(object_name))[3]::uuid;
			EXCEPTION
				WHEN others THEN
					RETURN FALSE;
			END;

			RETURN public.member_access_has_capability(org_id, 'personnel', 'operate')
				AND EXISTS (
					SELECT 1
					FROM "public"."personnel"
					WHERE "personnel"."id" = personnel_id
						AND "personnel"."organization_id" = org_id
						AND "public"."member_access_group_scope_matches"(org_id, "personnel"."group_id")
				);
		ELSE
			RETURN FALSE;
	END CASE;
END;
$$;


ALTER FUNCTION "public"."sensitive_file_object_is_writable"("bucket_name" "text", "object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sign_in_roster_scope_matches_personnel"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
	WITH "input_personnel_ids" AS (
		SELECT DISTINCT "input_personnel"."personnel_id"
		FROM unnest(COALESCE("p_personnel_ids", ARRAY[]::uuid[])) AS "input_personnel"("personnel_id")
	),
	"input_scope_group_ids" AS (
		SELECT DISTINCT "input_scope"."group_id"
		FROM unnest(COALESCE("p_scope_group_ids", ARRAY[]::uuid[])) AS "input_scope"("group_id")
	),
	"snapshot_items" AS (
		SELECT "snapshot"."item"
		FROM jsonb_array_elements(
			CASE
				WHEN jsonb_typeof("p_personnel_snapshot") = 'array' THEN "p_personnel_snapshot"
				ELSE '[]'::jsonb
			END
		) AS "snapshot"("item")
	),
	"snapshot_personnel_ids" AS (
		SELECT DISTINCT ("snapshot_items"."item" ->> 'id')::uuid AS "personnel_id"
		FROM "snapshot_items"
		WHERE "snapshot_items"."item" ? 'id'
			AND "snapshot_items"."item" ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
	),
	"selected_personnel" AS (
		SELECT "personnel"."id", "personnel"."group_id"
		FROM "input_personnel_ids"
		JOIN "public"."personnel"
			ON "personnel"."id" = "input_personnel_ids"."personnel_id"
			AND "personnel"."organization_id" = "p_organization_id"
	),
	"derived_scope_group_ids" AS (
		SELECT DISTINCT "selected_personnel"."group_id"
		FROM "selected_personnel"
		WHERE "selected_personnel"."group_id" IS NOT NULL
	),
	"has_unassigned_personnel" AS (
		SELECT EXISTS (
			SELECT 1
			FROM "selected_personnel"
			WHERE "selected_personnel"."group_id" IS NULL
		) AS "value"
	)
	SELECT
		jsonb_typeof("p_personnel_snapshot") = 'array'
		AND NOT EXISTS (
			SELECT 1
			FROM unnest(COALESCE("p_personnel_ids", ARRAY[]::uuid[])) AS "input_personnel"("personnel_id")
			WHERE "input_personnel"."personnel_id" IS NULL
		)
		AND NOT EXISTS (
			SELECT 1
			FROM unnest(COALESCE("p_scope_group_ids", ARRAY[]::uuid[])) AS "input_scope"("group_id")
			WHERE "input_scope"."group_id" IS NULL
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "snapshot_items"
			WHERE NOT ("snapshot_items"."item" ? 'id')
				OR NOT ("snapshot_items"."item" ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "input_personnel_ids"
			WHERE "input_personnel_ids"."personnel_id" IS NULL
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "input_scope_group_ids"
			WHERE "input_scope_group_ids"."group_id" IS NULL
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "input_personnel_ids"
			WHERE NOT EXISTS (
				SELECT 1
				FROM "snapshot_personnel_ids"
				WHERE "snapshot_personnel_ids"."personnel_id" = "input_personnel_ids"."personnel_id"
			)
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "snapshot_personnel_ids"
			WHERE NOT EXISTS (
				SELECT 1
				FROM "input_personnel_ids"
				WHERE "input_personnel_ids"."personnel_id" = "snapshot_personnel_ids"."personnel_id"
			)
		)
		AND NOT EXISTS (
			SELECT 1
			FROM "input_personnel_ids"
			WHERE NOT EXISTS (
				SELECT 1
				FROM "selected_personnel"
				WHERE "selected_personnel"."id" = "input_personnel_ids"."personnel_id"
			)
		)
		AND (
			(
				(SELECT "value" FROM "has_unassigned_personnel")
				AND COALESCE(array_length("p_scope_group_ids", 1), 0) = 0
			)
			OR (
				NOT (SELECT "value" FROM "has_unassigned_personnel")
				AND NOT EXISTS (
					SELECT 1
					FROM "input_scope_group_ids"
					WHERE NOT EXISTS (
						SELECT 1
						FROM "derived_scope_group_ids"
						WHERE "derived_scope_group_ids"."group_id" = "input_scope_group_ids"."group_id"
					)
				)
				AND NOT EXISTS (
					SELECT 1
					FROM "derived_scope_group_ids"
					WHERE NOT EXISTS (
						SELECT 1
						FROM "input_scope_group_ids"
						WHERE "input_scope_group_ids"."group_id" = "derived_scope_group_ids"."group_id"
					)
				)
			)
		);
$_$;


ALTER FUNCTION "public"."sign_in_roster_scope_matches_personnel"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_object_org_id"("object_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  folder_parts text[];
BEGIN
  folder_parts := storage.foldername(object_name);

  IF array_length(folder_parts, 1) IS NULL OR array_length(folder_parts, 1) < 1 THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN folder_parts[1]::uuid;
  EXCEPTION
    WHEN others THEN
      RETURN NULL;
  END;
END;
$$;


ALTER FUNCTION "public"."storage_object_org_id"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_object_scope"("object_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT (storage.foldername(object_name))[2]
$$;


ALTER FUNCTION "public"."storage_object_scope"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_email_identity_from_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
	IF NEW."email" IS NULL OR btrim(NEW."email") = '' THEN
		DELETE FROM "public"."user_email_identities"
		WHERE "user_email_identities"."user_id" = NEW."id";
		RETURN NEW;
	END IF;

	INSERT INTO "public"."user_email_identities" ("user_id", "normalized_email")
	VALUES (NEW."id", lower(btrim(NEW."email")))
	ON CONFLICT ("user_id") DO UPDATE
	SET "normalized_email" = EXCLUDED."normalized_email";

	RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_user_email_identity_from_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_dashboard_config_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_dashboard_config_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."training_views_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."training_views_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
	v_current_owner_id uuid := auth.uid();
BEGIN
	IF NOT public.is_org_owner(p_organization_id) THEN
		RAISE EXCEPTION 'Only the owner can transfer ownership';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM public.organization_memberships
		WHERE organization_id = p_organization_id
			AND user_id = p_new_owner_id
	) THEN
		RAISE EXCEPTION 'New owner must be an existing member';
	END IF;

	UPDATE public.organization_memberships
	SET role = 'admin',
		member_preset = 'editor',
		capability_overrides = '{}'::jsonb,
		access_scope_kind = 'organization',
		access_scope_group_ids = ARRAY[]::uuid[]
	WHERE organization_id = p_organization_id
		AND user_id = v_current_owner_id;

	UPDATE public.organization_memberships
	SET role = 'owner',
		member_preset = 'editor',
		capability_overrides = '{}'::jsonb,
		access_scope_kind = 'organization',
		access_scope_group_ids = ARRAY[]::uuid[]
	WHERE organization_id = p_organization_id
		AND user_id = p_new_owner_id;
END;
$$;


ALTER FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_advanced_duty_event_aggregate"("p_org_id" "uuid", "p_duty_event_id" "uuid", "p_event_data" "jsonb", "p_slot_rows" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_event_row public.duty_events%ROWTYPE;
  v_result jsonb;
BEGIN
  UPDATE public.duty_events
  SET
    template_id = event_data.template_id,
    template_name = event_data.template_name,
    event_date = event_data.event_date,
    coverage_mode = event_data.coverage_mode,
    coverage_start = event_data.coverage_start,
    coverage_end = event_data.coverage_end,
    is_blocking = event_data.is_blocking,
    cooldown_hours = event_data.cooldown_hours,
    rules_snapshot = event_data.rules_snapshot,
    fill_summary = event_data.fill_summary,
    collision_summary = event_data.collision_summary,
    original_proposal = event_data.original_proposal,
    updated_at = event_data.updated_at
  FROM jsonb_to_record(p_event_data) AS event_data(
    template_id uuid,
    template_name text,
    event_date date,
    coverage_mode text,
    coverage_start text,
    coverage_end text,
    is_blocking boolean,
    cooldown_hours integer,
    rules_snapshot jsonb,
    fill_summary jsonb,
    collision_summary jsonb,
    original_proposal jsonb,
    updated_at timestamptz
  )
  WHERE duty_events.id = p_duty_event_id
    AND duty_events.organization_id = p_org_id
  RETURNING duty_events.* INTO v_event_row;

  IF v_event_row.id IS NULL THEN
    RAISE EXCEPTION 'Duty event not found: %', p_duty_event_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.duty_event_slots
  WHERE organization_id = p_org_id
    AND duty_event_id = p_duty_event_id;

  WITH inserted_slots AS (
    INSERT INTO public.duty_event_slots (
      organization_id,
      duty_event_id,
      template_slot_id,
      role_label,
      slot_index,
      assignee_id,
      assignment_source,
      warning_state,
      fairness_confidence,
      selection_reason,
      unfilled_reason,
      sort_order,
      created_at
    )
    SELECT
      p_org_id,
      p_duty_event_id,
      slot_rows.template_slot_id,
      slot_rows.role_label,
      slot_rows.slot_index,
      slot_rows.assignee_id,
      slot_rows.assignment_source,
      slot_rows.warning_state,
      slot_rows.fairness_confidence,
      slot_rows.selection_reason,
      slot_rows.unfilled_reason,
      slot_rows.sort_order,
      slot_rows.created_at
    FROM jsonb_to_recordset(COALESCE(p_slot_rows, '[]'::jsonb)) AS slot_rows(
      template_slot_id uuid,
      role_label text,
      slot_index integer,
      assignee_id uuid,
      assignment_source text,
      warning_state text,
      fairness_confidence text,
      selection_reason text,
      unfilled_reason text,
      sort_order integer,
      created_at timestamptz
    )
    RETURNING *
  )
  SELECT jsonb_build_object(
    'eventRow',
    to_jsonb(v_event_row),
    'slotRows',
    COALESCE((SELECT jsonb_agg(to_jsonb(inserted_slots)) FROM inserted_slots), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."update_advanced_duty_event_aggregate"("p_org_id" "uuid", "p_duty_event_id" "uuid", "p_event_data" "jsonb", "p_slot_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_advanced_duty_template_aggregate"("p_org_id" "uuid", "p_template_id" "uuid", "p_template_data" "jsonb", "p_slot_rows" "jsonb" DEFAULT '[]'::"jsonb", "p_rotation_baseline_rows" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_template_row public.duty_templates%ROWTYPE;
  v_result jsonb;
BEGIN
  UPDATE public.duty_templates
  SET
    status = template_data.status,
    name = template_data.name,
    description = template_data.description,
    scope_type = template_data.scope_type,
    scope_group_ids = template_data.scope_group_ids,
    exempt_personnel_ids = template_data.exempt_personnel_ids,
    exempt_status_type_ids = template_data.exempt_status_type_ids,
    coverage_mode = template_data.coverage_mode,
    start_time = template_data.start_time,
    end_time = template_data.end_time,
    spans_midnight = template_data.spans_midnight,
    is_blocking = template_data.is_blocking,
    cooldown_hours = template_data.cooldown_hours,
    soft_preferences = template_data.soft_preferences,
    updated_at = template_data.updated_at
  FROM jsonb_to_record(p_template_data) AS template_data(
    status text,
    name text,
    description text,
    scope_type text,
    scope_group_ids uuid[],
    exempt_personnel_ids uuid[],
    exempt_status_type_ids uuid[],
    coverage_mode text,
    start_time text,
    end_time text,
    spans_midnight boolean,
    is_blocking boolean,
    cooldown_hours integer,
    soft_preferences jsonb,
    updated_at timestamptz
  )
  WHERE duty_templates.id = p_template_id
    AND duty_templates.organization_id = p_org_id
  RETURNING duty_templates.* INTO v_template_row;

  IF v_template_row.id IS NULL THEN
    RAISE EXCEPTION 'Duty template not found: %', p_template_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.duty_template_slots
  WHERE organization_id = p_org_id
    AND template_id = p_template_id;

  DELETE FROM public.duty_template_rotation_baselines
  WHERE organization_id = p_org_id
    AND template_id = p_template_id;

  WITH inserted_slots AS (
    INSERT INTO public.duty_template_slots (
      organization_id,
      template_id,
      role_label,
      quantity,
      allowed_ranks,
      allowed_group_ids,
      preferred_group_ids,
      allowed_mos_values,
      allowed_role_values,
      rotation_pool_key,
      blocking_mode,
      sort_order
    )
    SELECT
      p_org_id,
      p_template_id,
      slot_rows.role_label,
      slot_rows.quantity,
      slot_rows.allowed_ranks,
      slot_rows.allowed_group_ids,
      slot_rows.preferred_group_ids,
      slot_rows.allowed_mos_values,
      slot_rows.allowed_role_values,
      slot_rows.rotation_pool_key,
      slot_rows.blocking_mode,
      slot_rows.sort_order
    FROM jsonb_to_recordset(COALESCE(p_slot_rows, '[]'::jsonb)) AS slot_rows(
      role_label text,
      quantity integer,
      allowed_ranks text[],
      allowed_group_ids uuid[],
      preferred_group_ids uuid[],
      allowed_mos_values text[],
      allowed_role_values text[],
      rotation_pool_key text,
      blocking_mode text,
      sort_order integer
    )
    RETURNING *
  ),
  inserted_baselines AS (
    INSERT INTO public.duty_template_rotation_baselines (
      organization_id,
      template_id,
      rotation_pool_key,
      person_id,
      last_served_date,
      created_at
    )
    SELECT
      p_org_id,
      p_template_id,
      baseline_rows.rotation_pool_key,
      baseline_rows.person_id,
      baseline_rows.last_served_date,
      baseline_rows.created_at
    FROM jsonb_to_recordset(COALESCE(p_rotation_baseline_rows, '[]'::jsonb)) AS baseline_rows(
      rotation_pool_key text,
      person_id uuid,
      last_served_date date,
      created_at timestamptz
    )
    RETURNING *
  )
  SELECT jsonb_build_object(
    'templateRow',
    to_jsonb(v_template_row),
    'slotRows',
    COALESCE((SELECT jsonb_agg(to_jsonb(inserted_slots)) FROM inserted_slots), '[]'::jsonb),
    'rotationBaselineRows',
    COALESCE((SELECT jsonb_agg(to_jsonb(inserted_baselines)) FROM inserted_baselines), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."update_advanced_duty_template_aggregate"("p_org_id" "uuid", "p_template_id" "uuid", "p_template_data" "jsonb", "p_slot_rows" "jsonb", "p_rotation_baseline_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_org_preferences_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."user_org_preferences_set_updated_at"() OWNER TO "postgres";


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
    CONSTRAINT "access_request_organization_invitation_links_role_check" CHECK (("intended_membership_role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "access_request_organization_invitation_links_scope_kind_check" CHECK (("intended_access_scope_kind" = ANY (ARRAY['organization'::"text", 'groups'::"text"])))
);


ALTER TABLE "public"."access_request_organization_invitation_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."access_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "setup_completed_at" timestamp with time zone,
    "setup_user_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "heard_about" "text",
    "heard_about_details" "text",
    CONSTRAINT "access_requests_email_normalized_check" CHECK (("email" = "lower"("regexp_replace"("email", '^[[:space:]]+|[[:space:]]+$'::"text", ''::"text", 'g'::"text")))),
    CONSTRAINT "access_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."access_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_setup_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "access_request_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "failure_reason" "text",
    "revocation_reason" "text",
    CONSTRAINT "account_setup_links_completion_requires_claim_check" CHECK ((("used_at" IS NULL) OR ("claimed_at" IS NOT NULL))),
    CONSTRAINT "account_setup_links_failure_reason_check" CHECK ((("failure_reason" IS NULL) OR (("failed_at" IS NOT NULL) AND ("failure_reason" = ANY (ARRAY['access-request-missing'::"text", 'access-request-completed'::"text", 'access-request-not-approved'::"text", 'account-create-failed'::"text", 'completion-tracking-failed'::"text"]))))),
    CONSTRAINT "account_setup_links_failure_requires_claim_check" CHECK ((("failed_at" IS NULL) OR ("claimed_at" IS NOT NULL))),
    CONSTRAINT "account_setup_links_revocation_reason_check" CHECK ((("revocation_reason" IS NULL) OR ("revocation_reason" = ANY (ARRAY['manual'::"text", 'replaced'::"text", 'cleanup'::"text"])))),
    CONSTRAINT "account_setup_links_revocation_reason_requires_revocation_check" CHECK ((("revocation_reason" IS NULL) OR ("revoked_at" IS NOT NULL)))
);


ALTER TABLE "public"."account_setup_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_setup_rate_limits" (
    "bucket_key" "text" NOT NULL,
    "request_count" integer NOT NULL,
    "reset_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_setup_rate_limits_request_count_check" CHECK (("request_count" >= 0))
);


ALTER TABLE "public"."account_setup_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."advanced_duty_revision_change_sets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "applied_run_id" "uuid" NOT NULL,
    "source_draft_id" "uuid",
    "source_snapshot_id" "uuid",
    "source_snapshot_fingerprint" "text",
    "reason" "text" NOT NULL,
    "actor_user_id" "uuid",
    "reviewable_conflicts_confirmed" boolean DEFAULT false NOT NULL,
    "conflict_summary" "jsonb",
    "warning_summary" "jsonb",
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "advanced_duty_revision_change_sets_conflict_summary_object_chec" CHECK ((("conflict_summary" IS NULL) OR ("jsonb_typeof"("conflict_summary") = 'object'::"text"))),
    CONSTRAINT "advanced_duty_revision_change_sets_reason_check" CHECK (("length"("btrim"("reason")) > 0)),
    CONSTRAINT "advanced_duty_revision_change_sets_warning_summary_object_check" CHECK ((("warning_summary" IS NULL) OR ("jsonb_typeof"("warning_summary") = 'object'::"text")))
);


ALTER TABLE "public"."advanced_duty_revision_change_sets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."advanced_duty_revision_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "applied_run_id" "uuid" NOT NULL,
    "source_snapshot_id" "uuid",
    "source_snapshot_fingerprint" "text",
    "source_run_created_at" timestamp with time zone,
    "source_run_updated_at" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "slot_changes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reason" "text",
    "latest_validation" "jsonb",
    "latest_error" "text",
    "conflict_summary" "jsonb",
    "draft_version" integer DEFAULT 1 NOT NULL,
    "created_by_user_id" "uuid",
    "updated_by_user_id" "uuid",
    "applied_by_user_id" "uuid",
    "discarded_by_user_id" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "discard_cleanup_after" timestamp with time zone,
    "applied_at" timestamp with time zone,
    "discarded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "advanced_duty_revision_drafts_conflict_summary_object_check" CHECK ((("conflict_summary" IS NULL) OR ("jsonb_typeof"("conflict_summary") = 'object'::"text"))),
    CONSTRAINT "advanced_duty_revision_drafts_slot_changes_array_check" CHECK (("jsonb_typeof"("slot_changes") = 'array'::"text")),
    CONSTRAINT "advanced_duty_revision_drafts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'applied'::"text", 'discarded'::"text"]))),
    CONSTRAINT "advanced_duty_revision_drafts_validation_metadata_object_check" CHECK ((("latest_validation" IS NULL) OR ("jsonb_typeof"("latest_validation") = 'object'::"text"))),
    CONSTRAINT "advanced_duty_revision_drafts_version_check" CHECK (("draft_version" >= 1))
);


ALTER TABLE "public"."advanced_duty_revision_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."advanced_duty_revision_slot_changes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "change_set_id" "uuid" NOT NULL,
    "duty_event_id" "uuid",
    "event_date" "date" NOT NULL,
    "slot_key" "text" NOT NULL,
    "template_slot_id" "uuid",
    "role_label" "text" NOT NULL,
    "slot_index" integer NOT NULL,
    "previous_personnel_id" "uuid",
    "new_personnel_id" "uuid",
    "previous_personnel_snapshot" "jsonb",
    "new_personnel_snapshot" "jsonb",
    "previous_assignment_source" "text",
    "new_assignment_source" "text",
    "previous_warning_state" "text",
    "new_warning_state" "text",
    "change_intent" "text" NOT NULL,
    "warning_metadata" "jsonb",
    "conflict_metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "advanced_duty_revision_slot_changes_assignment_source_check" CHECK ((("previous_assignment_source" IS NULL) OR ("previous_assignment_source" = ANY (ARRAY['generated'::"text", 'manual'::"text", 'locked'::"text"])))),
    CONSTRAINT "advanced_duty_revision_slot_changes_change_intent_check" CHECK (("change_intent" = ANY (ARRAY['assign'::"text", 'clear'::"text", 'lock-assigned'::"text", 'lock-open'::"text"]))),
    CONSTRAINT "advanced_duty_revision_slot_changes_metadata_objects_check" CHECK (((("warning_metadata" IS NULL) OR ("jsonb_typeof"("warning_metadata") = 'object'::"text")) AND (("conflict_metadata" IS NULL) OR ("jsonb_typeof"("conflict_metadata") = 'object'::"text")))),
    CONSTRAINT "advanced_duty_revision_slot_changes_new_assignment_source_check" CHECK ((("new_assignment_source" IS NULL) OR ("new_assignment_source" = ANY (ARRAY['generated'::"text", 'manual'::"text", 'locked'::"text"])))),
    CONSTRAINT "advanced_duty_revision_slot_changes_new_warning_state_check" CHECK ((("new_warning_state" IS NULL) OR ("new_warning_state" = ANY (ARRAY['none'::"text", 'warning'::"text", 'conflict'::"text"])))),
    CONSTRAINT "advanced_duty_revision_slot_changes_personnel_snapshots_object_" CHECK (((("previous_personnel_snapshot" IS NULL) OR ("jsonb_typeof"("previous_personnel_snapshot") = 'object'::"text")) AND (("new_personnel_snapshot" IS NULL) OR ("jsonb_typeof"("new_personnel_snapshot") = 'object'::"text")))),
    CONSTRAINT "advanced_duty_revision_slot_changes_slot_index_check" CHECK (("slot_index" >= 0)),
    CONSTRAINT "advanced_duty_revision_slot_changes_warning_state_check" CHECK ((("previous_warning_state" IS NULL) OR ("previous_warning_state" = ANY (ARRAY['none'::"text", 'warning'::"text", 'conflict'::"text"]))))
);


ALTER TABLE "public"."advanced_duty_revision_slot_changes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_dismissals" (
    "announcement_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dismissed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."announcement_dismissals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text" NOT NULL,
    "assign_to" "text" NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exempt_personnel_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "show_in_date_header" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "assignment_types_assign_to_check" CHECK (("assign_to" = ANY (ARRAY['personnel'::"text", 'group'::"text"])))
);


ALTER TABLE "public"."assignment_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid",
    "ip_address" "inet",
    "user_agent" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    CONSTRAINT "audit_logs_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_email_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "access_request_id" "uuid" NOT NULL,
    "setup_link_id" "uuid" NOT NULL,
    "recipient" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    CONSTRAINT "auth_email_outbox_purpose_check" CHECK (("purpose" = 'account_setup'::"text")),
    CONSTRAINT "auth_email_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."auth_email_outbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_entries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "status_type_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    CONSTRAINT "availability_entries_note_length" CHECK (("char_length"("note") <= 200)),
    CONSTRAINT "valid_date_range" CHECK (("end_date" >= "start_date"))
);


ALTER TABLE "public"."availability_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_email" "text" NOT NULL,
    "organization_id" "uuid",
    "organization_name" "text",
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "page_url" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "github_issue_number" integer,
    "github_issue_url" "text",
    "page_section" "text",
    CONSTRAINT "beta_feedback_category_check" CHECK (("category" = ANY (ARRAY['bug'::"text", 'feature'::"text", 'general'::"text"]))),
    CONSTRAINT "beta_feedback_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'reviewed'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."beta_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."counseling_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "date_conducted" "date" NOT NULL,
    "subject" "text" NOT NULL,
    "key_points" "text",
    "plan_of_action" "text",
    "follow_up_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "counselor_signed" boolean DEFAULT false NOT NULL,
    "counselor_signed_at" timestamp with time zone,
    "soldier_signed" boolean DEFAULT false NOT NULL,
    "soldier_signed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "file_path" "text",
    "title" "text" NOT NULL,
    "summary" "text",
    "uploaded_by" "text" NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "counseling_records_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text", 'acknowledged'::"text"])))
);


ALTER TABLE "public"."counseling_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_assignments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "assignment_type_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "assignee_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duty_roster_template_run_id" "uuid",
    "duty_roster_template_run_row_date" "date"
);


ALTER TABLE "public"."daily_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "config" "jsonb" DEFAULT '{"version": 1, "widgets": []}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dashboard_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "file_path" "text",
    "file_size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "data_exports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."data_exports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deletion_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "requested_by_email" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "resource_description" "text" NOT NULL,
    "resource_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "denial_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deletion_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."durable_rate_limits" (
    "bucket_key" "text" NOT NULL,
    "request_count" integer NOT NULL,
    "reset_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "durable_rate_limits_request_count_check" CHECK (("request_count" >= 0))
);


ALTER TABLE "public"."durable_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_event_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "template_name" "text" NOT NULL,
    "pattern" "text" DEFAULT 'single'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "event_count" integer DEFAULT 0 NOT NULL,
    "is_legacy" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "duty_event_runs_date_order_check" CHECK (("start_date" <= "end_date")),
    CONSTRAINT "duty_event_runs_event_count_check" CHECK (("event_count" >= 0)),
    CONSTRAINT "duty_event_runs_pattern_check" CHECK (("pattern" = ANY (ARRAY['single'::"text", 'daily'::"text", 'weekday-only'::"text", 'weekend-only'::"text", 'selected-weekdays'::"text", 'holiday-closure-only'::"text", 'custom-dates'::"text"])))
);


ALTER TABLE "public"."duty_event_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_event_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "duty_event_id" "uuid" NOT NULL,
    "template_slot_id" "uuid",
    "role_label" "text" NOT NULL,
    "slot_index" integer DEFAULT 0 NOT NULL,
    "assignee_id" "uuid",
    "assignment_source" "text" DEFAULT 'generated'::"text" NOT NULL,
    "warning_state" "text" DEFAULT 'none'::"text" NOT NULL,
    "unfilled_reason" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fairness_confidence" "text" DEFAULT 'low'::"text" NOT NULL,
    "selection_reason" "text",
    CONSTRAINT "duty_event_slots_assignment_source_check" CHECK (("assignment_source" = ANY (ARRAY['generated'::"text", 'manual'::"text", 'locked'::"text"]))),
    CONSTRAINT "duty_event_slots_fairness_confidence_check" CHECK (("fairness_confidence" = ANY (ARRAY['high'::"text", 'low'::"text"]))),
    CONSTRAINT "duty_event_slots_slot_index_check" CHECK (("slot_index" >= 0)),
    CONSTRAINT "duty_event_slots_sort_order_check" CHECK (("sort_order" >= 0)),
    CONSTRAINT "duty_event_slots_warning_state_check" CHECK (("warning_state" = ANY (ARRAY['none'::"text", 'warning'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."duty_event_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "template_name" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "coverage_mode" "text" DEFAULT 'timed'::"text" NOT NULL,
    "coverage_start" "text" NOT NULL,
    "coverage_end" "text" NOT NULL,
    "is_blocking" boolean DEFAULT false NOT NULL,
    "cooldown_hours" integer DEFAULT 0 NOT NULL,
    "rules_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "fill_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "collision_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "original_proposal" "jsonb",
    "run_id" "uuid",
    CONSTRAINT "duty_events_cooldown_hours_check" CHECK (("cooldown_hours" >= 0)),
    CONSTRAINT "duty_events_coverage_mode_check" CHECK (("coverage_mode" = ANY (ARRAY['all-day'::"text", 'timed'::"text"])))
);


ALTER TABLE "public"."duty_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_roster_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "assignment_type_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "roster" "jsonb" NOT NULL,
    "config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_user_id" "uuid"
);


ALTER TABLE "public"."duty_roster_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_roster_template_run_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "run_row_date" "date" NOT NULL,
    "original_assignee_id" "uuid" NOT NULL,
    "replacement_assignee_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "corrected_by_user_id" "uuid",
    "corrected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "duty_roster_template_run_corrections_reason_check" CHECK (("length"("btrim"("reason")) > 0))
);


ALTER TABLE "public"."duty_roster_template_run_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_roster_template_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "template_name" "text" NOT NULL,
    "status" "text" DEFAULT 'accepted'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "snapshot_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "accepted_by_user_id" "uuid",
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    "applied_by_user_id" "uuid",
    "invalidated_at" timestamp with time zone,
    "invalidated_by_user_id" "uuid",
    CONSTRAINT "duty_roster_template_runs_snapshot_payload_object_check" CHECK (("jsonb_typeof"("snapshot_payload") = 'object'::"text")),
    CONSTRAINT "duty_roster_template_runs_status_check" CHECK (("status" = ANY (ARRAY['accepted'::"text", 'invalidated'::"text"])))
);


ALTER TABLE "public"."duty_roster_template_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_roster_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "short_code" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pool_criteria" "jsonb" DEFAULT '{"groupIds": [], "mosValues": [], "rankValues": [], "dutyRoleValues": []}'::"jsonb" NOT NULL,
    "exempt_personnel_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "manual_baseline_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "assignment_type_id" "uuid" NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "duty_roster_templates_exempt_personnel_ids_array_check" CHECK (("jsonb_typeof"("exempt_personnel_ids") = 'array'::"text")),
    CONSTRAINT "duty_roster_templates_manual_baseline_counts_object_check" CHECK (("jsonb_typeof"("manual_baseline_counts") = 'object'::"text")),
    CONSTRAINT "duty_roster_templates_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 120))),
    CONSTRAINT "duty_roster_templates_pool_criteria_object_check" CHECK (("jsonb_typeof"("pool_criteria") = 'object'::"text")),
    CONSTRAINT "duty_roster_templates_short_code_check" CHECK ((("short_code" IS NULL) OR (("length"("btrim"("short_code")) >= 1) AND ("length"("btrim"("short_code")) <= 12)))),
    CONSTRAINT "duty_roster_templates_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "duty_roster_templates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."duty_roster_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_template_rotation_baselines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "rotation_pool_key" "text" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "last_served_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."duty_template_rotation_baselines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_template_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "role_label" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "allowed_ranks" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allowed_group_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "allowed_mos_values" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allowed_role_values" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "preferred_group_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "rotation_pool_key" "text" NOT NULL,
    "blocking_mode" "text" DEFAULT 'inherit'::"text" NOT NULL,
    CONSTRAINT "duty_template_slots_blocking_mode_check" CHECK (("blocking_mode" = ANY (ARRAY['inherit'::"text", 'blocking'::"text", 'non-blocking'::"text"]))),
    CONSTRAINT "duty_template_slots_quantity_check" CHECK (("quantity" >= 1)),
    CONSTRAINT "duty_template_slots_sort_order_check" CHECK (("sort_order" >= 0))
);


ALTER TABLE "public"."duty_template_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "mode" "text" DEFAULT 'advanced'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "scope_type" "text" DEFAULT 'organization'::"text" NOT NULL,
    "scope_group_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "coverage_mode" "text" DEFAULT 'all-day'::"text" NOT NULL,
    "start_time" "text",
    "end_time" "text",
    "is_blocking" boolean DEFAULT false NOT NULL,
    "cooldown_hours" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exempt_personnel_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "exempt_status_type_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "soft_preferences" "jsonb" DEFAULT '[{"type": "longest-break", "enabled": true}, {"type": "holiday-closure", "enabled": true}, {"type": "weekend", "enabled": true}, {"type": "preferred-group", "enabled": true}]'::"jsonb" NOT NULL,
    "spans_midnight" boolean DEFAULT false NOT NULL,
    CONSTRAINT "duty_templates_cooldown_hours_check" CHECK (("cooldown_hours" >= 0)),
    CONSTRAINT "duty_templates_coverage_mode_check" CHECK (("coverage_mode" = ANY (ARRAY['all-day'::"text", 'timed'::"text"]))),
    CONSTRAINT "duty_templates_mode_check" CHECK (("mode" = ANY (ARRAY['simple'::"text", 'advanced'::"text"]))),
    CONSTRAINT "duty_templates_scope_type_check" CHECK (("scope_type" = ANY (ARRAY['organization'::"text", 'groups'::"text"]))),
    CONSTRAINT "duty_templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."duty_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."getting_started_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."getting_started_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ict_tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "mos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "expiration_months" integer,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "category" "text",
    CONSTRAINT "ict_tasks_expiration_months_positive" CHECK ((("expiration_months" IS NULL) OR ("expiration_months" > 0))),
    CONSTRAINT "ict_tasks_sort_order_non_negative" CHECK (("sort_order" >= 0)),
    CONSTRAINT "ict_tasks_task_code_not_blank" CHECK (("length"("btrim"("task_code")) > 0)),
    CONSTRAINT "ict_tasks_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."ict_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leader_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "author" "text" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "leader_notes_text_not_blank" CHECK (("length"("btrim"("text")) > 0))
);


ALTER TABLE "public"."leader_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "link" "text",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_step_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "onboarding_id" "uuid" NOT NULL,
    "step_name" "text" NOT NULL,
    "step_type" "text" NOT NULL,
    "training_type_id" "uuid",
    "stages" "jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "current_stage" "text",
    "notes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_step_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "organization_id" "uuid" NOT NULL,
    CONSTRAINT "onboarding_step_progress_step_type_check" CHECK (("step_type" = ANY (ARRAY['training'::"text", 'paperwork'::"text", 'checkbox'::"text"])))
);


ALTER TABLE "public"."onboarding_step_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_template_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "step_type" "text" NOT NULL,
    "training_type_id" "uuid",
    "stages" "jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    CONSTRAINT "onboarding_template_steps_step_type_check" CHECK (("step_type" = ANY (ARRAY['training'::"text", 'paperwork'::"text", 'checkbox'::"text"])))
);


ALTER TABLE "public"."onboarding_template_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."onboarding_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_invitations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "public"."invitation_status" DEFAULT 'pending'::"public"."invitation_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "member_preset" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "capability_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "access_scope_kind" "text" DEFAULT 'organization'::"text" NOT NULL,
    "access_scope_group_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    "normalized_email" "text" GENERATED ALWAYS AS ("lower"("btrim"("email"))) STORED,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "declined_at" timestamp with time zone,
    "declined_by" "uuid",
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "expired_at" timestamp with time zone,
    "blocked_at" timestamp with time zone,
    "blocked_by" "uuid",
    "role" "public"."organization_role" DEFAULT 'member'::"public"."organization_role" NOT NULL,
    CONSTRAINT "organization_invitations_access_scope_kind_check" CHECK (("access_scope_kind" = ANY (ARRAY['organization'::"text", 'groups'::"text"]))),
    CONSTRAINT "organization_invitations_actor_timestamp_check" CHECK (((("accepted_by" IS NULL) OR ("accepted_at" IS NOT NULL)) AND (("declined_by" IS NULL) OR ("declined_at" IS NOT NULL)) AND (("revoked_by" IS NULL) OR ("revoked_at" IS NOT NULL)) AND (("blocked_by" IS NULL) OR ("blocked_at" IS NOT NULL)))),
    CONSTRAINT "organization_invitations_capability_overrides_check" CHECK (("jsonb_typeof"("capability_overrides") = 'object'::"text")),
    CONSTRAINT "organization_invitations_lifecycle_state_check" CHECK ((((("status")::"text" = 'pending'::"text") AND ("accepted_at" IS NULL) AND ("declined_at" IS NULL) AND ("revoked_at" IS NULL) AND ("expired_at" IS NULL) AND ("blocked_at" IS NULL)) OR ((("status")::"text" = 'accepted'::"text") AND ("accepted_at" IS NOT NULL) AND ("declined_at" IS NULL) AND ("revoked_at" IS NULL) AND ("expired_at" IS NULL) AND ("blocked_at" IS NULL)) OR ((("status")::"text" = 'declined'::"text") AND ("accepted_at" IS NULL) AND ("declined_at" IS NOT NULL) AND ("revoked_at" IS NULL) AND ("expired_at" IS NULL) AND ("blocked_at" IS NULL)) OR ((("status")::"text" = 'revoked'::"text") AND ("accepted_at" IS NULL) AND ("declined_at" IS NULL) AND ("revoked_at" IS NOT NULL) AND ("expired_at" IS NULL) AND ("blocked_at" IS NULL)) OR ((("status")::"text" = 'expired'::"text") AND ("accepted_at" IS NULL) AND ("declined_at" IS NULL) AND ("revoked_at" IS NULL) AND ("expired_at" IS NOT NULL) AND ("blocked_at" IS NULL)) OR ((("status")::"text" = 'blocked'::"text") AND ("accepted_at" IS NULL) AND ("declined_at" IS NULL) AND ("revoked_at" IS NULL) AND ("expired_at" IS NULL) AND ("blocked_at" IS NOT NULL)))),
    CONSTRAINT "organization_invitations_member_preset_check" CHECK (("member_preset" = ANY (ARRAY['viewer'::"text", 'operator'::"text", 'editor'::"text"]))),
    CONSTRAINT "organization_invitations_pending_expiry_check" CHECK (((("status")::"text" <> 'pending'::"text") OR ("expires_at" IS NOT NULL)))
);


ALTER TABLE "public"."organization_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_memberships" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."organization_role" DEFAULT 'member'::"public"."organization_role" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "member_preset" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "capability_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "access_scope_kind" "text" DEFAULT 'organization'::"text" NOT NULL,
    "access_scope_group_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    CONSTRAINT "organization_memberships_access_scope_kind_check" CHECK (("access_scope_kind" = ANY (ARRAY['organization'::"text", 'groups'::"text"]))),
    CONSTRAINT "organization_memberships_capability_overrides_check" CHECK (("jsonb_typeof"("capability_overrides") = 'object'::"text")),
    CONSTRAINT "organization_memberships_member_preset_check" CHECK (("member_preset" = ANY (ARRAY['viewer'::"text", 'operator'::"text", 'editor'::"text"])))
);


ALTER TABLE "public"."organization_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_rank_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "service" "text" NOT NULL,
    "category" "text" NOT NULL,
    "pay_grade" "text" NOT NULL,
    "state" "text" DEFAULT 'active'::"text" NOT NULL,
    "source" "text" DEFAULT 'custom'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_rank_catalog_category_check" CHECK (("category" = ANY (ARRAY['officer'::"text", 'warrant'::"text", 'enlisted'::"text", 'civilian'::"text", 'custom'::"text"]))),
    CONSTRAINT "organization_rank_catalog_code_check" CHECK (((("length"("btrim"("code")) >= 1) AND ("length"("btrim"("code")) <= 80)) AND ("code" = "btrim"("code")))),
    CONSTRAINT "organization_rank_catalog_label_check" CHECK ((("length"("btrim"("label")) >= 1) AND ("length"("btrim"("label")) <= 120))),
    CONSTRAINT "organization_rank_catalog_pay_grade_check" CHECK (("pay_grade" = ANY (ARRAY['O-1'::"text", 'O-2'::"text", 'O-3'::"text", 'O-4'::"text", 'O-5'::"text", 'O-6'::"text", 'O-7'::"text", 'O-8'::"text", 'O-9'::"text", 'O-10'::"text", 'W-1'::"text", 'W-2'::"text", 'W-3'::"text", 'W-4'::"text", 'W-5'::"text", 'E-1'::"text", 'E-2'::"text", 'E-3'::"text", 'E-4'::"text", 'E-5'::"text", 'E-6'::"text", 'E-7'::"text", 'E-8'::"text", 'E-9'::"text", 'ungraded'::"text"]))),
    CONSTRAINT "organization_rank_catalog_service_check" CHECK (("service" = ANY (ARRAY['army'::"text", 'navy'::"text", 'air-force'::"text", 'marine-corps'::"text", 'coast-guard'::"text", 'space-force'::"text", 'civilian'::"text", 'custom'::"text"]))),
    CONSTRAINT "organization_rank_catalog_source_check" CHECK (("source" = ANY (ARRAY['built-in'::"text", 'discovered'::"text", 'custom'::"text"]))),
    CONSTRAINT "organization_rank_catalog_state_check" CHECK (("state" = ANY (ARRAY['active'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."organization_rank_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archive_retention_months" integer DEFAULT 36,
    "suspended_at" timestamp with time zone,
    "critical_tasks_default_expiration_months" integer,
    "critical_tasks_expiring_soon_warning_days" integer,
    "loss_warning_window_days" integer DEFAULT 180 NOT NULL,
    "personnel_document_storage_cap_bytes" bigint DEFAULT 104857600 NOT NULL,
    "url_slug" "text",
    CONSTRAINT "organizations_critical_tasks_default_expiration_months_check" CHECK ((("critical_tasks_default_expiration_months" IS NULL) OR (("critical_tasks_default_expiration_months" >= 1) AND ("critical_tasks_default_expiration_months" <= 120)))),
    CONSTRAINT "organizations_critical_tasks_expiring_soon_warning_days_check" CHECK ((("critical_tasks_expiring_soon_warning_days" IS NULL) OR (("critical_tasks_expiring_soon_warning_days" >= 1) AND ("critical_tasks_expiring_soon_warning_days" <= 365)))),
    CONSTRAINT "organizations_loss_warning_window_days_check" CHECK ((("loss_warning_window_days" >= 1) AND ("loss_warning_window_days" <= 365))),
    CONSTRAINT "organizations_url_slug_format_check" CHECK ((("url_slug" IS NULL) OR ((("char_length"("url_slug") >= 3) AND ("char_length"("url_slug") <= 48)) AND ("url_slug" = "lower"("url_slug")) AND ("url_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."password_change_attempts" (
    "actor" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "flow" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "state" "text" NOT NULL,
    CONSTRAINT "password_change_attempts_flow_check" CHECK (("flow" = ANY (ARRAY['recovery'::"text", 'invite'::"text"]))),
    CONSTRAINT "password_change_attempts_state_check" CHECK (("state" = ANY (ARRAY['started'::"text", 'pending'::"text", 'complete'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."password_change_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "rank" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "clinic_role" "text" DEFAULT ''::"text" NOT NULL,
    "group_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mos" "text" DEFAULT ''::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    "ets" "date",
    "deros" "date",
    "slug" "text" NOT NULL,
    CONSTRAINT "personnel_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."personnel" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "content_type" "text" NOT NULL,
    "uploaded_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "personnel_documents_file_size_check" CHECK (("file_size_bytes" > 0))
);


ALTER TABLE "public"."personnel_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_extended_info" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "emergency_contact_name" "text",
    "emergency_contact_relationship" "text",
    "emergency_contact_phone" "text",
    "spouse_name" "text",
    "spouse_phone" "text",
    "vehicle_make_model" "text",
    "vehicle_plate" "text",
    "vehicle_color" "text",
    "personal_email" "text",
    "personal_phone" "text",
    "address_street" "text",
    "address_city" "text",
    "address_state" "text",
    "address_zip" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "award_tracking_acknowledged_at" timestamp with time zone,
    "blood_type" "text",
    "basd" "date",
    "date_of_rank" "date",
    "marital_status" "text",
    "number_of_dependents" integer,
    "children" "jsonb",
    "civilian_education" "text",
    "military_education" "jsonb",
    CONSTRAINT "personnel_extended_info_number_of_dependents_nonnegative" CHECK ((("number_of_dependents" IS NULL) OR ("number_of_dependents" >= 0)))
);


ALTER TABLE "public"."personnel_extended_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_follow_ups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "due_date" "date",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    CONSTRAINT "personnel_follow_ups_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'completed'::"text", 'archived'::"text"]))),
    CONSTRAINT "personnel_follow_ups_title_check" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."personnel_follow_ups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_onboardings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "started_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "completed_at" "date",
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid",
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "personnel_onboardings_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."personnel_onboardings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_trainings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "training_type_id" "uuid" NOT NULL,
    "completion_date" "date",
    "expiration_date" "date",
    "notes" "text",
    "certificate_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."personnel_trainings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."personnel_trainings"."completion_date" IS 'Date training was completed. NULL is allowed for never-expires training when marked complete without a specific date.';



CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'support'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_admins_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'support'::"text", 'billing'::"text"])))
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "public"."announcement_type" DEFAULT 'info'::"public"."announcement_type" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "expires_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rating_scheme_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "rated_person_id" "uuid" NOT NULL,
    "eval_type" "text" NOT NULL,
    "rater_person_id" "uuid",
    "rater_name" "text",
    "senior_rater_person_id" "uuid",
    "senior_rater_name" "text",
    "intermediate_rater_person_id" "uuid",
    "intermediate_rater_name" "text",
    "reviewer_person_id" "uuid",
    "reviewer_name" "text",
    "rating_period_start" "date" NOT NULL,
    "rating_period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "report_type" "text",
    "workflow_status" "text",
    CONSTRAINT "rating_scheme_entries_eval_type_check" CHECK (("eval_type" = ANY (ARRAY['OER'::"text", 'NCOER'::"text", 'WOER'::"text"]))),
    CONSTRAINT "rating_scheme_entries_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'change-of-rater'::"text"]))),
    CONSTRAINT "rating_scheme_entries_workflow_status_check" CHECK ((("workflow_status" IS NULL) OR ("workflow_status" = ANY (ARRAY['drafting'::"text", 'with-rater'::"text", 'rater-signed'::"text", 'with-senior-rater'::"text", 'sr-signed'::"text", 'with-intermediate-rater'::"text", 'ir-signed'::"text", 'with-reviewer'::"text", 'reviewer-signed'::"text", 'with-rated-soldier'::"text", 'sm-signed'::"text", 'submitted-to-s1'::"text", 'completed'::"text"]))))
);


ALTER TABLE "public"."rating_scheme_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sign_in_rosters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "roster_date" "date",
    "blank_date" boolean DEFAULT false NOT NULL,
    "separate_by_group" boolean DEFAULT false NOT NULL,
    "sort_by" "text" DEFAULT 'alphabetical'::"text" NOT NULL,
    "personnel_snapshot" "jsonb" NOT NULL,
    "filter_config" "jsonb",
    "signed_file_path" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "personnel_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    "scope_group_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    CONSTRAINT "sign_in_rosters_sort_by_check" CHECK (("sort_by" = ANY (ARRAY['alphabetical'::"text", 'rank'::"text"])))
);


ALTER TABLE "public"."sign_in_rosters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."special_days" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "special_days_type_check" CHECK (("type" = ANY (ARRAY['federal-holiday'::"text", 'org-closure'::"text"])))
);


ALTER TABLE "public"."special_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."status_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "text_color" "text" DEFAULT '#ffffff'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "da6_availability_treatment" "text",
    "da6_treatment_reviewed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "status_types_da6_availability_treatment_check" CHECK ((("da6_availability_treatment" IS NULL) OR ("da6_availability_treatment" = ANY (ARRAY['authorized-absence'::"text", 'other-duty'::"text", 'misconduct-unavailable'::"text"]))))
);


ALTER TABLE "public"."status_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "expiration_months" integer,
    "warning_days_yellow" integer DEFAULT 60 NOT NULL,
    "warning_days_orange" integer DEFAULT 30 NOT NULL,
    "applies_to_roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expiration_date_only" boolean DEFAULT false NOT NULL,
    "can_be_exempted" boolean DEFAULT false NOT NULL,
    "exempt_personnel_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "applies_to_mos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "applies_to_ranks" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "excluded_roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "excluded_mos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "excluded_ranks" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_optional" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."training_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_views" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "column_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."training_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_email_identities" (
    "user_id" "uuid" NOT NULL,
    "normalized_email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_email_identities_normalized_email_check" CHECK ((("normalized_email" = "lower"("btrim"("normalized_email"))) AND ("normalized_email" <> ''::"text")))
);


ALTER TABLE "public"."user_email_identities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_org_preferences" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_org_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_pinned_groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "group_name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_pinned_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "user_id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "rank" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_profiles_first_name_check" CHECK ((("first_name" IS NULL) OR ("length"("btrim"("first_name")) > 0))),
    CONSTRAINT "user_profiles_last_name_check" CHECK ((("last_name" IS NULL) OR ("length"("btrim"("last_name")) > 0))),
    CONSTRAINT "user_profiles_rank_check" CHECK ((("rank" IS NULL) OR ("rank" = ANY (ARRAY['PV1'::"text", 'PV2'::"text", 'PFC'::"text", 'SPC'::"text", 'CPL'::"text", 'SGT'::"text", 'SSG'::"text", 'SFC'::"text", 'MSG'::"text", '1SG'::"text", 'SGM'::"text", 'CSM'::"text", 'WO1'::"text", 'CW2'::"text", 'CW3'::"text", 'CW4'::"text", 'CW5'::"text", '2LT'::"text", '1LT'::"text", 'CPT'::"text", 'MAJ'::"text", 'LTC'::"text", 'COL'::"text", 'BG'::"text", 'MG'::"text", 'LTG'::"text", 'GEN'::"text", 'CIV'::"text"]))))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_suspensions" (
    "user_id" "uuid" NOT NULL,
    "suspended_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "suspended_by" "uuid" NOT NULL,
    "reason" "text"
);


ALTER TABLE "public"."user_suspensions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."access_request_organization_invitation_links"
    ADD CONSTRAINT "access_request_organization_invitation_links_invitation_key" UNIQUE ("organization_invitation_id");



ALTER TABLE ONLY "public"."access_request_organization_invitation_links"
    ADD CONSTRAINT "access_request_organization_invitation_links_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."access_requests"
    ADD CONSTRAINT "access_requests_first_name_check" CHECK ((("first_name" IS NULL) OR ("length"("btrim"("first_name")) > 0))) NOT VALID;



ALTER TABLE "public"."access_requests"
    ADD CONSTRAINT "access_requests_heard_about_check" CHECK ((("heard_about" IS NULL) OR ("heard_about" = ANY (ARRAY['word_of_mouth'::"text", 'unit_peer'::"text", 'search_engine'::"text", 'social_media'::"text", 'reddit'::"text", 'army_community'::"text", 'other'::"text"])))) NOT VALID;



ALTER TABLE "public"."access_requests"
    ADD CONSTRAINT "access_requests_last_name_check" CHECK ((("last_name" IS NULL) OR ("length"("btrim"("last_name")) > 0))) NOT VALID;



ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."account_setup_links"
    ADD CONSTRAINT "account_setup_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."account_setup_rate_limits"
    ADD CONSTRAINT "account_setup_rate_limits_pkey" PRIMARY KEY ("bucket_key");



ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
    ADD CONSTRAINT "advanced_duty_revision_change_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
    ADD CONSTRAINT "advanced_duty_revision_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
    ADD CONSTRAINT "advanced_duty_revision_slot_changes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
    ADD CONSTRAINT "advanced_duty_run_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement_dismissals"
    ADD CONSTRAINT "announcement_dismissals_pkey" PRIMARY KEY ("announcement_id", "user_id");



ALTER TABLE ONLY "public"."assignment_types"
    ADD CONSTRAINT "assignment_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_email_outbox"
    ADD CONSTRAINT "auth_email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."availability_entries"
    ADD CONSTRAINT "availability_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "clinic_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_clinic_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."counseling_records"
    ADD CONSTRAINT "counseling_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_clinic_id_assignment_type_id_date_key" UNIQUE ("organization_id", "assignment_type_id", "date");



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_configs"
    ADD CONSTRAINT "dashboard_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_configs"
    ADD CONSTRAINT "dashboard_configs_user_id_org_id_key" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."data_exports"
    ADD CONSTRAINT "data_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deletion_requests"
    ADD CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."durable_rate_limits"
    ADD CONSTRAINT "durable_rate_limits_pkey" PRIMARY KEY ("bucket_key");



ALTER TABLE ONLY "public"."duty_event_runs"
    ADD CONSTRAINT "duty_event_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_event_slots"
    ADD CONSTRAINT "duty_event_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_events"
    ADD CONSTRAINT "duty_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_roster_history"
    ADD CONSTRAINT "duty_roster_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
    ADD CONSTRAINT "duty_roster_template_run_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_roster_template_runs"
    ADD CONSTRAINT "duty_roster_template_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_roster_templates"
    ADD CONSTRAINT "duty_roster_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_template_rotation_baselines"
    ADD CONSTRAINT "duty_template_rotation_baselines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_template_slots"
    ADD CONSTRAINT "duty_template_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_templates"
    ADD CONSTRAINT "duty_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."getting_started_progress"
    ADD CONSTRAINT "getting_started_progress_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."getting_started_progress"
    ADD CONSTRAINT "getting_started_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_clinic_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ict_tasks"
    ADD CONSTRAINT "ict_tasks_organization_id_task_code_key" UNIQUE ("organization_id", "task_code");



ALTER TABLE ONLY "public"."ict_tasks"
    ADD CONSTRAINT "ict_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leader_notes"
    ADD CONSTRAINT "leader_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_template_steps"
    ADD CONSTRAINT "onboarding_template_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_templates"
    ADD CONSTRAINT "onboarding_templates_org_name_unique" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."onboarding_templates"
    ADD CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitation_email_outbox"
    ADD CONSTRAINT "organization_invitation_email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_rank_catalog"
    ADD CONSTRAINT "organization_rank_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_change_attempts"
    ADD CONSTRAINT "password_change_attempts_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."password_change_attempts"
    ADD CONSTRAINT "password_change_attempts_pkey" PRIMARY KEY ("actor");



ALTER TABLE ONLY "public"."personnel_documents"
    ADD CONSTRAINT "personnel_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_extended_info"
    ADD CONSTRAINT "personnel_extended_info_personnel_id_key" UNIQUE ("personnel_id");



ALTER TABLE ONLY "public"."personnel_extended_info"
    ADD CONSTRAINT "personnel_extended_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_follow_ups"
    ADD CONSTRAINT "personnel_follow_ups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_ict_completions"
    ADD CONSTRAINT "personnel_ict_completions_org_person_task_date_key" UNIQUE ("organization_id", "personnel_id", "ict_task_id", "completed_at");



ALTER TABLE ONLY "public"."personnel_ict_completions"
    ADD CONSTRAINT "personnel_ict_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_onboardings"
    ADD CONSTRAINT "personnel_onboardings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel"
    ADD CONSTRAINT "personnel_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_clinic_id_personnel_id_training_type_id_key" UNIQUE ("organization_id", "personnel_id", "training_type_id");



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."platform_announcements"
    ADD CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sign_in_rosters"
    ADD CONSTRAINT "sign_in_rosters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."special_days"
    ADD CONSTRAINT "special_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_types"
    ADD CONSTRAINT "status_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_types"
    ADD CONSTRAINT "training_types_clinic_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."training_types"
    ADD CONSTRAINT "training_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_views"
    ADD CONSTRAINT "training_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_email_identities"
    ADD CONSTRAINT "user_email_identities_normalized_email_key" UNIQUE ("normalized_email");



ALTER TABLE ONLY "public"."user_email_identities"
    ADD CONSTRAINT "user_email_identities_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_org_preferences"
    ADD CONSTRAINT "user_org_preferences_org_user_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."user_org_preferences"
    ADD CONSTRAINT "user_org_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_pinned_groups"
    ADD CONSTRAINT "user_pinned_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_pinned_groups"
    ADD CONSTRAINT "user_pinned_groups_user_id_clinic_id_group_name_key" UNIQUE ("user_id", "organization_id", "group_name");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_suspensions"
    ADD CONSTRAINT "user_suspensions_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "access_request_organization_invitation_links_org_idx" ON "public"."access_request_organization_invitation_links" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "access_request_organization_invitation_links_request_idx" ON "public"."access_request_organization_invitation_links" USING "btree" ("access_request_id", "created_at" DESC);



CREATE INDEX "access_requests_heard_about_idx" ON "public"."access_requests" USING "btree" ("heard_about") WHERE ("heard_about" IS NOT NULL);



CREATE UNIQUE INDEX "access_requests_pending_email_idx" ON "public"."access_requests" USING "btree" ("lower"("email")) WHERE ("status" = 'pending'::"text");



CREATE INDEX "access_requests_setup_user_id_idx" ON "public"."access_requests" USING "btree" ("setup_user_id") WHERE ("setup_user_id" IS NOT NULL);



CREATE INDEX "account_setup_links_access_request_created_idx" ON "public"."account_setup_links" USING "btree" ("access_request_id", "created_at" DESC);



CREATE INDEX "account_setup_links_claimed_idx" ON "public"."account_setup_links" USING "btree" ("claimed_at") WHERE ("claimed_at" IS NOT NULL);



CREATE INDEX "account_setup_links_cleanup_idx" ON "public"."account_setup_links" USING "btree" ("expires_at", "used_at", "revoked_at");



CREATE INDEX "account_setup_links_failed_idx" ON "public"."account_setup_links" USING "btree" ("failed_at") WHERE ("failed_at" IS NOT NULL);



CREATE UNIQUE INDEX "account_setup_links_one_active_per_request_idx" ON "public"."account_setup_links" USING "btree" ("access_request_id") WHERE (("claimed_at" IS NULL) AND ("failed_at" IS NULL) AND ("used_at" IS NULL) AND ("revoked_at" IS NULL));



CREATE UNIQUE INDEX "account_setup_links_token_hash_key" ON "public"."account_setup_links" USING "btree" ("token_hash");



CREATE INDEX "account_setup_rate_limits_reset_at_idx" ON "public"."account_setup_rate_limits" USING "btree" ("reset_at");



CREATE INDEX "advanced_duty_revision_change_sets_run_applied_idx" ON "public"."advanced_duty_revision_change_sets" USING "btree" ("organization_id", "applied_run_id", "applied_at" DESC);



CREATE INDEX "advanced_duty_revision_change_sets_source_draft_idx" ON "public"."advanced_duty_revision_change_sets" USING "btree" ("source_draft_id");



CREATE INDEX "advanced_duty_revision_drafts_discard_cleanup_idx" ON "public"."advanced_duty_revision_drafts" USING "btree" ("discard_cleanup_after") WHERE ("status" = 'discarded'::"text");



CREATE INDEX "advanced_duty_revision_drafts_expiration_idx" ON "public"."advanced_duty_revision_drafts" USING "btree" ("expires_at") WHERE ("status" = 'draft'::"text");



CREATE UNIQUE INDEX "advanced_duty_revision_drafts_one_active_run_idx" ON "public"."advanced_duty_revision_drafts" USING "btree" ("organization_id", "applied_run_id") WHERE ("status" = 'draft'::"text");



CREATE INDEX "advanced_duty_revision_drafts_run_status_idx" ON "public"."advanced_duty_revision_drafts" USING "btree" ("organization_id", "applied_run_id", "status");



CREATE INDEX "advanced_duty_revision_slot_changes_change_set_idx" ON "public"."advanced_duty_revision_slot_changes" USING "btree" ("change_set_id", "event_date", "slot_index");



CREATE INDEX "advanced_duty_revision_slot_changes_run_display_idx" ON "public"."advanced_duty_revision_slot_changes" USING "btree" ("organization_id", "event_date", "slot_key");



CREATE INDEX "advanced_duty_run_snapshots_applying_recovery_idx" ON "public"."advanced_duty_run_snapshots" USING "btree" ("organization_id", "updated_at") WHERE ("status" = 'applying'::"text");



CREATE INDEX "advanced_duty_run_snapshots_cleanup_idx" ON "public"."advanced_duty_run_snapshots" USING "btree" ("expires_at") WHERE ("status" = 'draft'::"text");



CREATE UNIQUE INDEX "advanced_duty_run_snapshots_current_draft_lineage_key" ON "public"."advanced_duty_run_snapshots" USING "btree" ("organization_id", "draft_lineage_key") WHERE ("status" = 'draft'::"text");



CREATE INDEX "advanced_duty_run_snapshots_org_status_expires_idx" ON "public"."advanced_duty_run_snapshots" USING "btree" ("organization_id", "status", "expires_at");



CREATE INDEX "advanced_duty_run_snapshots_template_idx" ON "public"."advanced_duty_run_snapshots" USING "btree" ("template_id", "created_at" DESC);



CREATE UNIQUE INDEX "assignment_types_one_header_per_org" ON "public"."assignment_types" USING "btree" ("organization_id") WHERE ("show_in_date_header" = true);



CREATE INDEX "auth_email_outbox_access_request_created_idx" ON "public"."auth_email_outbox" USING "btree" ("access_request_id", "created_at" DESC);



CREATE INDEX "auth_email_outbox_setup_link_idx" ON "public"."auth_email_outbox" USING "btree" ("setup_link_id");



CREATE INDEX "auth_email_outbox_status_idx" ON "public"."auth_email_outbox" USING "btree" ("status", "updated_at" DESC);



CREATE INDEX "daily_assignments_duty_roster_template_run_idx" ON "public"."daily_assignments" USING "btree" ("organization_id", "duty_roster_template_run_id") WHERE ("duty_roster_template_run_id" IS NOT NULL);



CREATE INDEX "durable_rate_limits_reset_at_idx" ON "public"."durable_rate_limits" USING "btree" ("reset_at");



CREATE INDEX "duty_event_runs_legacy_idx" ON "public"."duty_event_runs" USING "btree" ("organization_id", "is_legacy");



CREATE INDEX "duty_event_runs_org_idx" ON "public"."duty_event_runs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "duty_event_runs_template_idx" ON "public"."duty_event_runs" USING "btree" ("template_id");



CREATE INDEX "duty_event_slots_assignee_idx" ON "public"."duty_event_slots" USING "btree" ("assignee_id");



CREATE INDEX "duty_event_slots_event_idx" ON "public"."duty_event_slots" USING "btree" ("duty_event_id", "sort_order");



CREATE INDEX "duty_event_slots_org_idx" ON "public"."duty_event_slots" USING "btree" ("organization_id");



CREATE INDEX "duty_events_org_idx" ON "public"."duty_events" USING "btree" ("organization_id");



CREATE INDEX "duty_events_org_start_idx" ON "public"."duty_events" USING "btree" ("organization_id", "coverage_start" DESC);



CREATE INDEX "duty_events_run_idx" ON "public"."duty_events" USING "btree" ("run_id", "event_date");



CREATE INDEX "duty_events_template_idx" ON "public"."duty_events" USING "btree" ("template_id");



CREATE INDEX "duty_roster_template_run_corrections_org_run_idx" ON "public"."duty_roster_template_run_corrections" USING "btree" ("organization_id", "run_id", "run_row_date", "corrected_at");



CREATE INDEX "duty_roster_template_runs_org_template_accepted_idx" ON "public"."duty_roster_template_runs" USING "btree" ("organization_id", "template_id", "accepted_at" DESC);



CREATE UNIQUE INDEX "duty_roster_templates_org_slug_key" ON "public"."duty_roster_templates" USING "btree" ("organization_id", "slug");



CREATE INDEX "duty_roster_templates_org_status_name_idx" ON "public"."duty_roster_templates" USING "btree" ("organization_id", "status", "name");



CREATE INDEX "duty_template_rotation_baselines_org_idx" ON "public"."duty_template_rotation_baselines" USING "btree" ("organization_id");



CREATE INDEX "duty_template_rotation_baselines_template_pool_idx" ON "public"."duty_template_rotation_baselines" USING "btree" ("template_id", "rotation_pool_key", "last_served_date" DESC);



CREATE UNIQUE INDEX "duty_template_rotation_baselines_template_pool_person_uidx" ON "public"."duty_template_rotation_baselines" USING "btree" ("template_id", "rotation_pool_key", "person_id");



CREATE INDEX "duty_template_slots_org_idx" ON "public"."duty_template_slots" USING "btree" ("organization_id");



CREATE INDEX "duty_template_slots_template_idx" ON "public"."duty_template_slots" USING "btree" ("template_id", "sort_order");



CREATE INDEX "duty_templates_org_idx" ON "public"."duty_templates" USING "btree" ("organization_id");



CREATE INDEX "duty_templates_org_mode_idx" ON "public"."duty_templates" USING "btree" ("organization_id", "mode");



CREATE INDEX "idx_assignment_types_org" ON "public"."assignment_types" USING "btree" ("organization_id");



CREATE INDEX "idx_assignment_types_org_archived_sort" ON "public"."assignment_types" USING "btree" ("organization_id", "archived_at", "sort_order");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_org_id_action" ON "public"."audit_logs" USING "btree" ("org_id", "action");



CREATE INDEX "idx_audit_logs_org_id_timestamp" ON "public"."audit_logs" USING "btree" ("org_id", "timestamp" DESC);



CREATE INDEX "idx_audit_logs_severity" ON "public"."audit_logs" USING "btree" ("severity") WHERE ("severity" <> 'info'::"text");



CREATE INDEX "idx_audit_logs_timestamp_desc" ON "public"."audit_logs" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_availability_entries_org_end_start" ON "public"."availability_entries" USING "btree" ("organization_id", "end_date", "start_date");



CREATE INDEX "idx_availability_entries_org_start_end" ON "public"."availability_entries" USING "btree" ("organization_id", "start_date", "end_date");



CREATE INDEX "idx_availability_org" ON "public"."availability_entries" USING "btree" ("organization_id");



CREATE INDEX "idx_availability_personnel" ON "public"."availability_entries" USING "btree" ("personnel_id");



CREATE INDEX "idx_beta_feedback_created_at" ON "public"."beta_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_beta_feedback_status" ON "public"."beta_feedback" USING "btree" ("status");



CREATE INDEX "idx_beta_feedback_user_id" ON "public"."beta_feedback" USING "btree" ("user_id");



CREATE INDEX "idx_counseling_records_date" ON "public"."counseling_records" USING "btree" ("date_conducted");



CREATE INDEX "idx_counseling_records_org" ON "public"."counseling_records" USING "btree" ("organization_id");



CREATE INDEX "idx_counseling_records_personnel" ON "public"."counseling_records" USING "btree" ("personnel_id");



CREATE INDEX "idx_counseling_records_personnel_archived_created" ON "public"."counseling_records" USING "btree" ("personnel_id", "archived_at", "created_at" DESC);



CREATE INDEX "idx_counseling_records_personnel_created" ON "public"."counseling_records" USING "btree" ("personnel_id", "created_at" DESC);



CREATE INDEX "idx_daily_assignments_date" ON "public"."daily_assignments" USING "btree" ("date");



CREATE INDEX "idx_daily_assignments_org" ON "public"."daily_assignments" USING "btree" ("organization_id");



CREATE INDEX "idx_daily_assignments_org_date" ON "public"."daily_assignments" USING "btree" ("organization_id", "date");



CREATE INDEX "idx_data_exports_org_created" ON "public"."data_exports" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_deletion_requests_org_status" ON "public"."deletion_requests" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_deletion_requests_requested_by" ON "public"."deletion_requests" USING "btree" ("requested_by");



CREATE INDEX "idx_duty_roster_templates_org_archived_name" ON "public"."duty_roster_templates" USING "btree" ("organization_id", "archived_at", "name");



CREATE INDEX "idx_groups_org" ON "public"."groups" USING "btree" ("organization_id");



CREATE INDEX "idx_ict_tasks_archived_at" ON "public"."ict_tasks" USING "btree" ("archived_at");



CREATE INDEX "idx_ict_tasks_mos" ON "public"."ict_tasks" USING "gin" ("mos");



CREATE INDEX "idx_ict_tasks_org" ON "public"."ict_tasks" USING "btree" ("organization_id");



CREATE INDEX "idx_ict_tasks_org_category" ON "public"."ict_tasks" USING "btree" ("organization_id", "category");



CREATE INDEX "idx_ict_tasks_org_sort_code" ON "public"."ict_tasks" USING "btree" ("organization_id", "sort_order", "task_code");



CREATE INDEX "idx_leader_notes_org" ON "public"."leader_notes" USING "btree" ("organization_id");



CREATE INDEX "idx_leader_notes_personnel_archived_created" ON "public"."leader_notes" USING "btree" ("personnel_id", "archived_at", "created_at" DESC);



CREATE INDEX "idx_leader_notes_personnel_created" ON "public"."leader_notes" USING "btree" ("personnel_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_org" ON "public"."notifications" USING "btree" ("user_id", "organization_id");



CREATE INDEX "idx_notifications_user_read" ON "public"."notifications" USING "btree" ("user_id", "read");



CREATE INDEX "idx_organization_memberships_org" ON "public"."organization_memberships" USING "btree" ("organization_id");



CREATE INDEX "idx_organization_memberships_user" ON "public"."organization_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_organizations_suspended" ON "public"."organizations" USING "btree" ("suspended_at") WHERE ("suspended_at" IS NOT NULL);



CREATE INDEX "idx_personnel_archived" ON "public"."personnel" USING "btree" ("organization_id", "archived_at");



CREATE INDEX "idx_personnel_documents_org" ON "public"."personnel_documents" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_documents_personnel_archived_created" ON "public"."personnel_documents" USING "btree" ("personnel_id", "archived_at", "created_at" DESC);



CREATE INDEX "idx_personnel_documents_personnel_created" ON "public"."personnel_documents" USING "btree" ("personnel_id", "created_at" DESC);



CREATE INDEX "idx_personnel_extended_info_org" ON "public"."personnel_extended_info" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_extended_info_personnel" ON "public"."personnel_extended_info" USING "btree" ("personnel_id");



CREATE INDEX "idx_personnel_follow_ups_org" ON "public"."personnel_follow_ups" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_follow_ups_personnel_status_archived" ON "public"."personnel_follow_ups" USING "btree" ("personnel_id", "status", "archived_at" DESC);



CREATE INDEX "idx_personnel_follow_ups_personnel_status_created" ON "public"."personnel_follow_ups" USING "btree" ("personnel_id", "status", "created_at" DESC);



CREATE INDEX "idx_personnel_group" ON "public"."personnel" USING "btree" ("group_id");



CREATE INDEX "idx_personnel_ict_completions_completed_at" ON "public"."personnel_ict_completions" USING "btree" ("completed_at");



CREATE INDEX "idx_personnel_ict_completions_org" ON "public"."personnel_ict_completions" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_ict_completions_org_completed_at" ON "public"."personnel_ict_completions" USING "btree" ("organization_id", "completed_at");



CREATE INDEX "idx_personnel_ict_completions_org_person_task_recency" ON "public"."personnel_ict_completions" USING "btree" ("organization_id", "personnel_id", "ict_task_id", "completed_at" DESC, "created_at" DESC);



CREATE INDEX "idx_personnel_ict_completions_personnel" ON "public"."personnel_ict_completions" USING "btree" ("personnel_id");



CREATE INDEX "idx_personnel_ict_completions_task" ON "public"."personnel_ict_completions" USING "btree" ("ict_task_id");



CREATE INDEX "idx_personnel_org" ON "public"."personnel" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_trainings_expiration" ON "public"."personnel_trainings" USING "btree" ("expiration_date");



CREATE INDEX "idx_personnel_trainings_org" ON "public"."personnel_trainings" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_trainings_personnel" ON "public"."personnel_trainings" USING "btree" ("personnel_id");



CREATE INDEX "idx_personnel_trainings_type" ON "public"."personnel_trainings" USING "btree" ("training_type_id");



CREATE INDEX "idx_platform_admins_user_id" ON "public"."platform_admins" USING "btree" ("user_id");



CREATE INDEX "idx_platform_announcements_active" ON "public"."platform_announcements" USING "btree" ("is_active", "expires_at") WHERE ("is_active" = true);



CREATE INDEX "idx_sign_in_rosters_org" ON "public"."sign_in_rosters" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_special_days_org" ON "public"."special_days" USING "btree" ("organization_id");



CREATE INDEX "idx_special_days_org_date" ON "public"."special_days" USING "btree" ("organization_id", "date");



CREATE INDEX "idx_status_types_org" ON "public"."status_types" USING "btree" ("organization_id");



CREATE INDEX "idx_training_types_org" ON "public"."training_types" USING "btree" ("organization_id");



CREATE INDEX "idx_user_pinned_groups_user_org" ON "public"."user_pinned_groups" USING "btree" ("user_id", "organization_id");



CREATE INDEX "onboarding_step_progress_onboarding_idx" ON "public"."onboarding_step_progress" USING "btree" ("onboarding_id");



CREATE INDEX "onboarding_template_steps_org_idx" ON "public"."onboarding_template_steps" USING "btree" ("organization_id");



CREATE INDEX "onboarding_templates_org_idx" ON "public"."onboarding_templates" USING "btree" ("organization_id");



CREATE INDEX "organization_invitation_email_outbox_invitation_created_idx" ON "public"."organization_invitation_email_outbox" USING "btree" ("invitation_id", "created_at" DESC);



CREATE INDEX "organization_invitation_email_outbox_org_created_idx" ON "public"."organization_invitation_email_outbox" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "organization_invitation_email_outbox_status_idx" ON "public"."organization_invitation_email_outbox" USING "btree" ("status", "updated_at" DESC);



CREATE INDEX "organization_invitations_normalized_email_idx" ON "public"."organization_invitations" USING "btree" ("normalized_email");



CREATE UNIQUE INDEX "organization_invitations_one_pending_per_org_email_idx" ON "public"."organization_invitations" USING "btree" ("organization_id", "normalized_email") WHERE ("status" = 'pending'::"public"."invitation_status");



CREATE INDEX "organization_invitations_pending_expiry_idx" ON "public"."organization_invitations" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"public"."invitation_status");



CREATE UNIQUE INDEX "organization_memberships_one_per_org_user_idx" ON "public"."organization_memberships" USING "btree" ("organization_id", "user_id");



CREATE UNIQUE INDEX "organization_rank_catalog_org_code_key" ON "public"."organization_rank_catalog" USING "btree" ("organization_id", "code");



CREATE INDEX "organization_rank_catalog_org_state_sort_idx" ON "public"."organization_rank_catalog" USING "btree" ("organization_id", "state", "sort_order", "label");



CREATE UNIQUE INDEX "organization_rank_catalog_org_trimmed_code_key" ON "public"."organization_rank_catalog" USING "btree" ("organization_id", "btrim"("code"));



CREATE UNIQUE INDEX "organizations_url_slug_key" ON "public"."organizations" USING "btree" ("url_slug") WHERE ("url_slug" IS NOT NULL);



CREATE UNIQUE INDEX "personnel_onboardings_active_idx" ON "public"."personnel_onboardings" USING "btree" ("organization_id", "personnel_id") WHERE ("status" = 'in_progress'::"text");



CREATE INDEX "personnel_onboardings_org_idx" ON "public"."personnel_onboardings" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "personnel_org_slug_key" ON "public"."personnel" USING "btree" ("organization_id", "slug");



CREATE INDEX "rating_scheme_entries_org_idx" ON "public"."rating_scheme_entries" USING "btree" ("organization_id");



CREATE INDEX "rating_scheme_entries_rated_idx" ON "public"."rating_scheme_entries" USING "btree" ("rated_person_id");



CREATE INDEX "sign_in_rosters_personnel_ids_gin_idx" ON "public"."sign_in_rosters" USING "gin" ("personnel_ids");



CREATE INDEX "sign_in_rosters_scope_group_ids_gin_idx" ON "public"."sign_in_rosters" USING "gin" ("scope_group_ids");



CREATE INDEX "training_views_organization_id_idx" ON "public"."training_views" USING "btree" ("organization_id");



CREATE INDEX "user_org_preferences_user_org_idx" ON "public"."user_org_preferences" USING "btree" ("user_id", "organization_id");



CREATE OR REPLACE TRIGGER "advanced_duty_revision_drafts_updated_at" BEFORE UPDATE ON "public"."advanced_duty_revision_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "advanced_duty_run_snapshots_updated_at" BEFORE UPDATE ON "public"."advanced_duty_run_snapshots" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "dashboard_configs_updated_at" BEFORE UPDATE ON "public"."dashboard_configs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_dashboard_config_updated_at"();



CREATE OR REPLACE TRIGGER "duty_roster_template_runs_updated_at" BEFORE UPDATE ON "public"."duty_roster_template_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "duty_roster_templates_updated_at" BEFORE UPDATE ON "public"."duty_roster_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "enforce_personnel_document_storage_cap" BEFORE INSERT OR UPDATE OF "file_size_bytes", "personnel_id", "organization_id" ON "public"."personnel_documents" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_personnel_document_storage_cap"();



CREATE OR REPLACE TRIGGER "organization_rank_catalog_updated_at" BEFORE UPDATE ON "public"."organization_rank_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "prevent_organization_rank_catalog_org_move" BEFORE UPDATE OF "organization_id" ON "public"."organization_rank_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_organization_rank_catalog_org_move"();



CREATE OR REPLACE TRIGGER "set_beta_feedback_updated_at" BEFORE UPDATE ON "public"."beta_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_training_views_updated_at" BEFORE UPDATE ON "public"."training_views" FOR EACH ROW EXECUTE FUNCTION "public"."training_views_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_org_preferences_updated_at" BEFORE UPDATE ON "public"."user_org_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."user_org_preferences_set_updated_at"();



CREATE OR REPLACE TRIGGER "update_counseling_records_updated_at" BEFORE UPDATE ON "public"."counseling_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_ict_tasks_updated_at" BEFORE UPDATE ON "public"."ict_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_personnel_documents_updated_at" BEFORE UPDATE ON "public"."personnel_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_personnel_extended_info_updated_at" BEFORE UPDATE ON "public"."personnel_extended_info" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_personnel_follow_ups_updated_at" BEFORE UPDATE ON "public"."personnel_follow_ups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_personnel_ict_completions_updated_at" BEFORE UPDATE ON "public"."personnel_ict_completions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_rating_scheme_entries_updated_at" BEFORE UPDATE ON "public"."rating_scheme_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_email_identities_updated_at" BEFORE UPDATE ON "public"."user_email_identities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."access_request_organization_invitation_links"
    ADD CONSTRAINT "access_request_organization_invitation_links_access_request_fke" FOREIGN KEY ("access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."access_request_organization_invitation_links"
    ADD CONSTRAINT "access_request_organization_invitation_links_invitation_fkey" FOREIGN KEY ("organization_invitation_id") REFERENCES "public"."organization_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."access_request_organization_invitation_links"
    ADD CONSTRAINT "access_request_organization_invitation_links_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."access_request_organization_invitation_links"
    ADD CONSTRAINT "access_request_organization_invitation_links_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."account_setup_links"
    ADD CONSTRAINT "account_setup_links_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
    ADD CONSTRAINT "advanced_duty_revision_change_sets_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
    ADD CONSTRAINT "advanced_duty_revision_change_sets_applied_run_id_fkey" FOREIGN KEY ("applied_run_id") REFERENCES "public"."duty_event_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
    ADD CONSTRAINT "advanced_duty_revision_change_sets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
    ADD CONSTRAINT "advanced_duty_revision_change_sets_source_draft_id_fkey" FOREIGN KEY ("source_draft_id") REFERENCES "public"."advanced_duty_revision_drafts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_change_sets"
    ADD CONSTRAINT "advanced_duty_revision_change_sets_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."advanced_duty_run_snapshots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
    ADD CONSTRAINT "advanced_duty_revision_drafts_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
    ADD CONSTRAINT "advanced_duty_revision_drafts_applied_run_id_fkey" FOREIGN KEY ("applied_run_id") REFERENCES "public"."duty_event_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
    ADD CONSTRAINT "advanced_duty_revision_drafts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
    ADD CONSTRAINT "advanced_duty_revision_drafts_discarded_by_user_id_fkey" FOREIGN KEY ("discarded_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
    ADD CONSTRAINT "advanced_duty_revision_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
    ADD CONSTRAINT "advanced_duty_revision_drafts_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."advanced_duty_run_snapshots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_drafts"
    ADD CONSTRAINT "advanced_duty_revision_drafts_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
    ADD CONSTRAINT "advanced_duty_revision_slot_changes_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "public"."advanced_duty_revision_change_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
    ADD CONSTRAINT "advanced_duty_revision_slot_changes_duty_event_id_fkey" FOREIGN KEY ("duty_event_id") REFERENCES "public"."duty_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
    ADD CONSTRAINT "advanced_duty_revision_slot_changes_new_personnel_id_fkey" FOREIGN KEY ("new_personnel_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
    ADD CONSTRAINT "advanced_duty_revision_slot_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
    ADD CONSTRAINT "advanced_duty_revision_slot_changes_previous_personnel_id_fkey" FOREIGN KEY ("previous_personnel_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_revision_slot_changes"
    ADD CONSTRAINT "advanced_duty_revision_slot_changes_template_slot_id_fkey" FOREIGN KEY ("template_slot_id") REFERENCES "public"."duty_template_slots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
    ADD CONSTRAINT "advanced_duty_run_snapshots_applied_run_id_fkey" FOREIGN KEY ("applied_run_id") REFERENCES "public"."duty_event_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
    ADD CONSTRAINT "advanced_duty_run_snapshots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
    ADD CONSTRAINT "advanced_duty_run_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."advanced_duty_run_snapshots"
    ADD CONSTRAINT "advanced_duty_run_snapshots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."duty_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_dismissals"
    ADD CONSTRAINT "announcement_dismissals_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."platform_announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcement_dismissals"
    ADD CONSTRAINT "announcement_dismissals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_types"
    ADD CONSTRAINT "assignment_types_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."auth_email_outbox"
    ADD CONSTRAINT "auth_email_outbox_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auth_email_outbox"
    ADD CONSTRAINT "auth_email_outbox_setup_link_id_fkey" FOREIGN KEY ("setup_link_id") REFERENCES "public"."account_setup_links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_entries"
    ADD CONSTRAINT "availability_entries_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_entries"
    ADD CONSTRAINT "availability_entries_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_entries"
    ADD CONSTRAINT "availability_entries_status_type_id_fkey" FOREIGN KEY ("status_type_id") REFERENCES "public"."status_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "clinic_invitations_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "clinic_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "clinics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."counseling_records"
    ADD CONSTRAINT "counseling_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."counseling_records"
    ADD CONSTRAINT "counseling_records_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_assignment_type_id_fkey" FOREIGN KEY ("assignment_type_id") REFERENCES "public"."assignment_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_duty_roster_template_run_id_fkey" FOREIGN KEY ("duty_roster_template_run_id") REFERENCES "public"."duty_roster_template_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dashboard_configs"
    ADD CONSTRAINT "dashboard_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_configs"
    ADD CONSTRAINT "dashboard_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_exports"
    ADD CONSTRAINT "data_exports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_exports"
    ADD CONSTRAINT "data_exports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deletion_requests"
    ADD CONSTRAINT "deletion_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deletion_requests"
    ADD CONSTRAINT "deletion_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deletion_requests"
    ADD CONSTRAINT "deletion_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."duty_event_runs"
    ADD CONSTRAINT "duty_event_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_event_runs"
    ADD CONSTRAINT "duty_event_runs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."duty_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."duty_event_slots"
    ADD CONSTRAINT "duty_event_slots_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."duty_event_slots"
    ADD CONSTRAINT "duty_event_slots_duty_event_id_fkey" FOREIGN KEY ("duty_event_id") REFERENCES "public"."duty_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_event_slots"
    ADD CONSTRAINT "duty_event_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_event_slots"
    ADD CONSTRAINT "duty_event_slots_template_slot_id_fkey" FOREIGN KEY ("template_slot_id") REFERENCES "public"."duty_template_slots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."duty_events"
    ADD CONSTRAINT "duty_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_events"
    ADD CONSTRAINT "duty_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."duty_event_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_events"
    ADD CONSTRAINT "duty_events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."duty_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."duty_roster_history"
    ADD CONSTRAINT "duty_roster_history_assignment_type_id_fkey" FOREIGN KEY ("assignment_type_id") REFERENCES "public"."assignment_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_history"
    ADD CONSTRAINT "duty_roster_history_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."duty_roster_history"
    ADD CONSTRAINT "duty_roster_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
    ADD CONSTRAINT "duty_roster_template_run_corrections_corrected_by_user_id_fkey" FOREIGN KEY ("corrected_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
    ADD CONSTRAINT "duty_roster_template_run_corrections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
    ADD CONSTRAINT "duty_roster_template_run_corrections_original_assignee_id_fkey" FOREIGN KEY ("original_assignee_id") REFERENCES "public"."personnel"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
    ADD CONSTRAINT "duty_roster_template_run_corrections_replacement_assignee_id_fk" FOREIGN KEY ("replacement_assignee_id") REFERENCES "public"."personnel"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."duty_roster_template_run_corrections"
    ADD CONSTRAINT "duty_roster_template_run_corrections_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."duty_roster_template_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_template_runs"
    ADD CONSTRAINT "duty_roster_template_runs_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."duty_roster_template_runs"
    ADD CONSTRAINT "duty_roster_template_runs_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."duty_roster_template_runs"
    ADD CONSTRAINT "duty_roster_template_runs_invalidated_by_user_id_fkey" FOREIGN KEY ("invalidated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."duty_roster_template_runs"
    ADD CONSTRAINT "duty_roster_template_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_template_runs"
    ADD CONSTRAINT "duty_roster_template_runs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."duty_roster_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_templates"
    ADD CONSTRAINT "duty_roster_templates_assignment_type_id_fkey" FOREIGN KEY ("assignment_type_id") REFERENCES "public"."assignment_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_templates"
    ADD CONSTRAINT "duty_roster_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."duty_roster_templates"
    ADD CONSTRAINT "duty_roster_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_template_rotation_baselines"
    ADD CONSTRAINT "duty_template_rotation_baselines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_template_rotation_baselines"
    ADD CONSTRAINT "duty_template_rotation_baselines_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_template_rotation_baselines"
    ADD CONSTRAINT "duty_template_rotation_baselines_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."duty_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_template_slots"
    ADD CONSTRAINT "duty_template_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_template_slots"
    ADD CONSTRAINT "duty_template_slots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."duty_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_templates"
    ADD CONSTRAINT "duty_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."getting_started_progress"
    ADD CONSTRAINT "getting_started_progress_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."getting_started_progress"
    ADD CONSTRAINT "getting_started_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ict_tasks"
    ADD CONSTRAINT "ict_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leader_notes"
    ADD CONSTRAINT "leader_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leader_notes"
    ADD CONSTRAINT "leader_notes_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "public"."personnel_onboardings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_template_step_id_fkey" FOREIGN KEY ("template_step_id") REFERENCES "public"."onboarding_template_steps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_training_type_id_fkey" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."onboarding_template_steps"
    ADD CONSTRAINT "onboarding_template_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_template_steps"
    ADD CONSTRAINT "onboarding_template_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."onboarding_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_template_steps"
    ADD CONSTRAINT "onboarding_template_steps_training_type_id_fkey" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."onboarding_templates"
    ADD CONSTRAINT "onboarding_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitation_email_outbox"
    ADD CONSTRAINT "organization_invitation_email_outbox_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."organization_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitation_email_outbox"
    ADD CONSTRAINT "organization_invitation_email_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_blocked_by_fkey" FOREIGN KEY ("blocked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_declined_by_fkey" FOREIGN KEY ("declined_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_rank_catalog"
    ADD CONSTRAINT "organization_rank_catalog_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."password_change_attempts"
    ADD CONSTRAINT "password_change_attempts_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel"
    ADD CONSTRAINT "personnel_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_documents"
    ADD CONSTRAINT "personnel_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_documents"
    ADD CONSTRAINT "personnel_documents_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_extended_info"
    ADD CONSTRAINT "personnel_extended_info_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_extended_info"
    ADD CONSTRAINT "personnel_extended_info_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_follow_ups"
    ADD CONSTRAINT "personnel_follow_ups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_follow_ups"
    ADD CONSTRAINT "personnel_follow_ups_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel"
    ADD CONSTRAINT "personnel_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personnel_ict_completions"
    ADD CONSTRAINT "personnel_ict_completions_ict_task_id_fkey" FOREIGN KEY ("ict_task_id") REFERENCES "public"."ict_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_ict_completions"
    ADD CONSTRAINT "personnel_ict_completions_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personnel_ict_completions"
    ADD CONSTRAINT "personnel_ict_completions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_ict_completions"
    ADD CONSTRAINT "personnel_ict_completions_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_onboardings"
    ADD CONSTRAINT "personnel_onboardings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_onboardings"
    ADD CONSTRAINT "personnel_onboardings_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_onboardings"
    ADD CONSTRAINT "personnel_onboardings_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."onboarding_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_training_type_id_fkey" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_announcements"
    ADD CONSTRAINT "platform_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."platform_announcements"
    ADD CONSTRAINT "platform_announcements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_intermediate_rater_person_id_fkey" FOREIGN KEY ("intermediate_rater_person_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_rated_person_id_fkey" FOREIGN KEY ("rated_person_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_rater_person_id_fkey" FOREIGN KEY ("rater_person_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_reviewer_person_id_fkey" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_senior_rater_person_id_fkey" FOREIGN KEY ("senior_rater_person_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sign_in_rosters"
    ADD CONSTRAINT "sign_in_rosters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sign_in_rosters"
    ADD CONSTRAINT "sign_in_rosters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."special_days"
    ADD CONSTRAINT "special_days_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."status_types"
    ADD CONSTRAINT "status_types_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_types"
    ADD CONSTRAINT "training_types_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_views"
    ADD CONSTRAINT "training_views_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_views"
    ADD CONSTRAINT "training_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_email_identities"
    ADD CONSTRAINT "user_email_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_org_preferences"
    ADD CONSTRAINT "user_org_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_org_preferences"
    ADD CONSTRAINT "user_org_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_pinned_groups"
    ADD CONSTRAINT "user_pinned_groups_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_pinned_groups"
    ADD CONSTRAINT "user_pinned_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_suspensions"
    ADD CONSTRAINT "user_suspensions_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_suspensions"
    ADD CONSTRAINT "user_suspensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create invitations" ON "public"."organization_invitations" FOR INSERT WITH CHECK ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Admins can delete memberships" ON "public"."organization_memberships" FOR DELETE USING ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Admins can read platform_admins" ON "public"."platform_admins" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Admins can update memberships" ON "public"."organization_memberships" FOR UPDATE USING ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Admins full access" ON "public"."beta_feedback" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Advanced duty actors can manage revision drafts" ON "public"."advanced_duty_revision_drafts" USING ("public"."advanced_duty_revision_actor_can_manage"("organization_id")) WITH CHECK ("public"."advanced_duty_revision_actor_can_manage"("organization_id"));



CREATE POLICY "Advanced duty actors can write advanced duty revision history" ON "public"."advanced_duty_revision_change_sets" USING ("public"."advanced_duty_revision_actor_can_manage"("organization_id")) WITH CHECK ("public"."advanced_duty_revision_actor_can_manage"("organization_id"));



CREATE POLICY "Advanced duty actors can write advanced duty revision slot hist" ON "public"."advanced_duty_revision_slot_changes" USING ("public"."advanced_duty_revision_actor_can_manage"("organization_id")) WITH CHECK ("public"."advanced_duty_revision_actor_can_manage"("organization_id"));



CREATE POLICY "Authenticated users can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "Authenticated users can read announcements" ON "public"."platform_announcements" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authorized members can create exports" ON "public"."data_exports" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_org_members"("org_id") AND ("requested_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Calendar viewers can read advanced duty revision history" ON "public"."advanced_duty_revision_change_sets" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Calendar viewers can read advanced duty revision slot history" ON "public"."advanced_duty_revision_slot_changes" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Creators and owners can insert memberships" ON "public"."organization_memberships" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."is_org_owner"("organization_id") OR (("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_memberships"."organization_id") AND ("organizations"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))))));



CREATE POLICY "Governors can revoke pending invitations" ON "public"."organization_invitations" FOR UPDATE USING (("public"."can_manage_org_members"("organization_id") AND ("status" = 'pending'::"public"."invitation_status"))) WITH CHECK (("public"."can_manage_org_members"("organization_id") AND ("status" = ANY (ARRAY['revoked'::"public"."invitation_status", 'expired'::"public"."invitation_status"])) AND ("accepted_at" IS NULL) AND ("declined_at" IS NULL) AND (("revoked_by" IS NULL) OR ("revoked_by" = "auth"."uid"()))));



CREATE POLICY "Governors can view invitations for their organizations" ON "public"."organization_invitations" FOR SELECT USING ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Invited users can insert themselves as members" ON "public"."organization_memberships" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."organization_invitations"
  WHERE (("organization_invitations"."organization_id" = "organization_memberships"."organization_id") AND ("lower"("organization_invitations"."email") = "lower"((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text"))) AND ("organization_invitations"."status" = 'pending'::"public"."invitation_status"))))));



CREATE POLICY "Members can view counseling records through scoped personnel ac" ON "public"."counseling_records" FOR SELECT USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'view'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "counseling_records"."personnel_id") AND ("personnel"."organization_id" = "counseling_records"."organization_id") AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Members can view leader notes through scoped personnel access" ON "public"."leader_notes" FOR SELECT USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'view'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "leader_notes"."personnel_id") AND ("personnel"."organization_id" = "leader_notes"."organization_id") AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Members can view memberships of their organizations" ON "public"."organization_memberships" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view organization invitation email outbox" ON "public"."organization_invitation_email_outbox" FOR SELECT USING ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Members can view personnel documents through scoped personnel a" ON "public"."personnel_documents" FOR SELECT USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'view'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_documents"."personnel_id") AND ("personnel"."organization_id" = "personnel_documents"."organization_id") AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Members can view personnel follow ups through scoped personnel " ON "public"."personnel_follow_ups" FOR SELECT USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'view'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_follow_ups"."personnel_id") AND ("personnel"."organization_id" = "personnel_follow_ups"."organization_id") AND ((("personnel"."group_id" IS NOT NULL) AND "public"."member_access_group_scope_matches"("personnel_follow_ups"."organization_id", "personnel"."group_id")) OR (("personnel"."group_id" IS NULL) AND (EXISTS ( SELECT 1
           FROM "public"."organization_memberships"
          WHERE (("organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND (("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])) OR ("organization_memberships"."access_scope_kind" = 'organization'::"text"))))))))))));



CREATE POLICY "Operators can delete counseling records through scoped personne" ON "public"."counseling_records" FOR DELETE USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "counseling_records"."personnel_id") AND ("personnel"."organization_id" = "counseling_records"."organization_id") AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can delete leader notes through scoped personnel acce" ON "public"."leader_notes" FOR DELETE USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "leader_notes"."personnel_id") AND ("personnel"."organization_id" = "leader_notes"."organization_id") AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can delete personnel documents through scoped personn" ON "public"."personnel_documents" FOR DELETE USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_documents"."personnel_id") AND ("personnel"."organization_id" = "personnel_documents"."organization_id") AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can delete personnel follow ups through scoped person" ON "public"."personnel_follow_ups" FOR DELETE USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_follow_ups"."personnel_id") AND ("personnel"."organization_id" = "personnel_follow_ups"."organization_id") AND ((("personnel"."group_id" IS NOT NULL) AND "public"."member_access_group_scope_matches"("personnel_follow_ups"."organization_id", "personnel"."group_id")) OR (("personnel"."group_id" IS NULL) AND (EXISTS ( SELECT 1
           FROM "public"."organization_memberships"
          WHERE (("organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND (("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])) OR ("organization_memberships"."access_scope_kind" = 'organization'::"text"))))))))))));



CREATE POLICY "Operators can insert counseling records through scoped personne" ON "public"."counseling_records" FOR INSERT WITH CHECK (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "counseling_records"."personnel_id") AND ("personnel"."organization_id" = "counseling_records"."organization_id") AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can insert leader notes through scoped personnel acce" ON "public"."leader_notes" FOR INSERT WITH CHECK (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "leader_notes"."personnel_id") AND ("personnel"."organization_id" = "leader_notes"."organization_id") AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can insert personnel documents through scoped personn" ON "public"."personnel_documents" FOR INSERT WITH CHECK (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_documents"."personnel_id") AND ("personnel"."organization_id" = "personnel_documents"."organization_id") AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can insert personnel follow ups through scoped person" ON "public"."personnel_follow_ups" FOR INSERT WITH CHECK (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_follow_ups"."personnel_id") AND ("personnel"."organization_id" = "personnel_follow_ups"."organization_id") AND ((("personnel"."group_id" IS NOT NULL) AND "public"."member_access_group_scope_matches"("personnel_follow_ups"."organization_id", "personnel"."group_id")) OR (("personnel"."group_id" IS NULL) AND (EXISTS ( SELECT 1
           FROM "public"."organization_memberships"
          WHERE (("organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND (("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])) OR ("organization_memberships"."access_scope_kind" = 'organization'::"text"))))))))))));



CREATE POLICY "Operators can update counseling records through scoped personne" ON "public"."counseling_records" FOR UPDATE USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "counseling_records"."personnel_id") AND ("personnel"."organization_id" = "counseling_records"."organization_id") AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id")))))) WITH CHECK (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "counseling_records"."personnel_id") AND ("personnel"."organization_id" = "counseling_records"."organization_id") AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can update leader notes through scoped personnel acce" ON "public"."leader_notes" FOR UPDATE USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "leader_notes"."personnel_id") AND ("personnel"."organization_id" = "leader_notes"."organization_id") AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id")))))) WITH CHECK (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "leader_notes"."personnel_id") AND ("personnel"."organization_id" = "leader_notes"."organization_id") AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can update personnel documents through scoped personn" ON "public"."personnel_documents" FOR UPDATE USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_documents"."personnel_id") AND ("personnel"."organization_id" = "personnel_documents"."organization_id") AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id")))))) WITH CHECK (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_documents"."personnel_id") AND ("personnel"."organization_id" = "personnel_documents"."organization_id") AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id"))))));



CREATE POLICY "Operators can update personnel follow ups through scoped person" ON "public"."personnel_follow_ups" FOR UPDATE USING (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_follow_ups"."personnel_id") AND ("personnel"."organization_id" = "personnel_follow_ups"."organization_id") AND ((("personnel"."group_id" IS NOT NULL) AND "public"."member_access_group_scope_matches"("personnel_follow_ups"."organization_id", "personnel"."group_id")) OR (("personnel"."group_id" IS NULL) AND (EXISTS ( SELECT 1
           FROM "public"."organization_memberships"
          WHERE (("organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND (("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])) OR ("organization_memberships"."access_scope_kind" = 'organization'::"text")))))))))))) WITH CHECK (("public"."member_access_has_capability"("organization_id", 'personnel'::"text", 'operate'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."personnel"
  WHERE (("personnel"."id" = "personnel_follow_ups"."personnel_id") AND ("personnel"."organization_id" = "personnel_follow_ups"."organization_id") AND ((("personnel"."group_id" IS NOT NULL) AND "public"."member_access_group_scope_matches"("personnel_follow_ups"."organization_id", "personnel"."group_id")) OR (("personnel"."group_id" IS NULL) AND (EXISTS ( SELECT 1
           FROM "public"."organization_memberships"
          WHERE (("organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND (("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])) OR ("organization_memberships"."access_scope_kind" = 'organization'::"text"))))))))))));



CREATE POLICY "Org admins can manage advanced duty run snapshots" ON "public"."advanced_duty_run_snapshots" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "advanced_duty_run_snapshots"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "advanced_duty_run_snapshots"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



CREATE POLICY "Org admins can manage duty event runs" ON "public"."duty_event_runs" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_event_runs"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_event_runs"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



CREATE POLICY "Org admins can manage duty event slots" ON "public"."duty_event_slots" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_event_slots"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_event_slots"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



CREATE POLICY "Org admins can manage duty events" ON "public"."duty_events" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_events"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_events"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



CREATE POLICY "Org admins can manage duty template rotation baselines" ON "public"."duty_template_rotation_baselines" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_template_rotation_baselines"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_template_rotation_baselines"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



CREATE POLICY "Org admins can manage duty template slots" ON "public"."duty_template_slots" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_template_slots"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_template_slots"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



CREATE POLICY "Org admins can manage duty templates" ON "public"."duty_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_templates"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_templates"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



CREATE POLICY "Org editors can manage onboarding template steps" ON "public"."onboarding_template_steps" USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Org editors can manage onboardings" ON "public"."personnel_onboardings" USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Org editors can manage step progress" ON "public"."onboarding_step_progress" USING ((EXISTS ( SELECT 1
   FROM "public"."personnel_onboardings" "po"
  WHERE (("po"."id" = "onboarding_step_progress"."onboarding_id") AND "public"."can_edit_personnel"("po"."organization_id")))));



CREATE POLICY "Org managers can update export lifecycle" ON "public"."data_exports" FOR UPDATE USING ("public"."can_manage_org_members"("org_id")) WITH CHECK ("public"."can_manage_org_members"("org_id"));



CREATE POLICY "Org members can read exports" ON "public"."data_exports" FOR SELECT USING (("org_id" IN ( SELECT "organization_memberships"."organization_id"
   FROM "public"."organization_memberships"
  WHERE ("organization_memberships"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Org members can view onboarding template steps" ON "public"."onboarding_template_steps" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Org members can view onboardings" ON "public"."personnel_onboardings" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Org members can view step progress" ON "public"."onboarding_step_progress" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."personnel_onboardings" "po"
  WHERE (("po"."id" = "onboarding_step_progress"."onboarding_id") AND "public"."can_view_personnel"("po"."organization_id")))));



CREATE POLICY "Org owners can read own audit logs" ON "public"."audit_logs" FOR SELECT USING (("public"."is_org_owner"("org_id") OR "public"."is_platform_admin"()));



CREATE POLICY "Organization governors can insert organization rank catalog" ON "public"."organization_rank_catalog" FOR INSERT WITH CHECK ("public"."can_update_organization_settings"("organization_id"));



CREATE POLICY "Organization governors can update organization rank catalog" ON "public"."organization_rank_catalog" FOR UPDATE USING ("public"."can_update_organization_settings"("organization_id")) WITH CHECK ("public"."can_update_organization_settings"("organization_id"));



CREATE POLICY "Organization owners can delete their organizations" ON "public"."organizations" FOR DELETE USING ("public"."is_org_owner"("id"));



CREATE POLICY "Owners and admins can insert ICT task library records" ON "public"."ict_tasks" FOR INSERT WITH CHECK ("public"."can_manage_ict_task_library"("organization_id"));



CREATE POLICY "Owners and admins can update ICT task library records" ON "public"."ict_tasks" FOR UPDATE USING ("public"."can_manage_ict_task_library"("organization_id")) WITH CHECK ("public"."can_manage_ict_task_library"("organization_id"));



CREATE POLICY "Platform admins can delete announcements" ON "public"."platform_announcements" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."platform_admins"
  WHERE (("platform_admins"."user_id" = "auth"."uid"()) AND ("platform_admins"."is_active" = true)))));



CREATE POLICY "Platform admins can insert announcements" ON "public"."platform_announcements" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."platform_admins"
  WHERE (("platform_admins"."user_id" = "auth"."uid"()) AND ("platform_admins"."is_active" = true)))));



CREATE POLICY "Platform admins can manage access requests" ON "public"."access_requests" USING ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can manage account setup links" ON "public"."account_setup_links" USING ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can manage suspensions" ON "public"."user_suspensions" USING ((EXISTS ( SELECT 1
   FROM "public"."platform_admins"
  WHERE (("platform_admins"."user_id" = "auth"."uid"()) AND ("platform_admins"."is_active" = true)))));



CREATE POLICY "Platform admins can update announcements" ON "public"."platform_announcements" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."platform_admins"
  WHERE (("platform_admins"."user_id" = "auth"."uid"()) AND ("platform_admins"."is_active" = true)))));



CREATE POLICY "Platform admins can view access request organization invitation" ON "public"."access_request_organization_invitation_links" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Privileged members can update their organizations" ON "public"."organizations" FOR UPDATE USING ("public"."is_org_privileged"("id"));



CREATE POLICY "Service role can manage access request organization invitation " ON "public"."access_request_organization_invitation_links" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage user email identities" ON "public"."user_email_identities" TO "service_role" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role manages auth email outbox" ON "public"."auth_email_outbox" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role manages organization invitation email outbox" ON "public"."organization_invitation_email_outbox" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Super admins can manage platform_admins" ON "public"."platform_admins" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Training editors can create views" ON "public"."training_views" FOR INSERT WITH CHECK ("public"."can_edit_training"("organization_id"));



CREATE POLICY "Training editors can delete views" ON "public"."training_views" FOR DELETE USING ("public"."can_edit_training"("organization_id"));



CREATE POLICY "Training editors can update views" ON "public"."training_views" FOR UPDATE USING ("public"."can_edit_training"("organization_id"));



CREATE POLICY "Training viewers can read views" ON "public"."training_views" FOR SELECT USING ("public"."can_view_training"("organization_id"));



CREATE POLICY "Users can accept duty roster template runs if they can edit cal" ON "public"."duty_roster_template_runs" FOR INSERT WITH CHECK ("public"."can_edit_calendar"("organization_id"));



CREATE POLICY "Users can check own admin status" ON "public"."platform_admins" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can decline invitations addressed to them" ON "public"."organization_invitations" FOR UPDATE USING ((("normalized_email" = "lower"("btrim"(("auth"."jwt"() ->> 'email'::"text")))) AND ("status" = 'pending'::"public"."invitation_status"))) WITH CHECK ((("normalized_email" = "lower"("btrim"(("auth"."jwt"() ->> 'email'::"text")))) AND ("status" = ANY (ARRAY['declined'::"public"."invitation_status", 'expired'::"public"."invitation_status"])) AND ("accepted_at" IS NULL) AND ("revoked_at" IS NULL) AND (("declined_by" IS NULL) OR ("declined_by" = "auth"."uid"()))));



CREATE POLICY "Users can delete availability if allowed by scoped calendar acc" ON "public"."availability_entries" FOR DELETE USING ("public"."can_edit_availability_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can delete daily assignments if allowed by scoped calenda" ON "public"."daily_assignments" FOR DELETE USING ("public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"));



CREATE POLICY "Users can delete extended info if can edit personnel" ON "public"."personnel_extended_info" FOR DELETE USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can delete personnel ICT completions if allowed by scoped" ON "public"."personnel_ict_completions" FOR DELETE USING ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can delete personnel if allowed by scoped personnel acces" ON "public"."personnel" FOR DELETE USING ("public"."can_edit_personnel_record"("organization_id", "group_id"));



CREATE POLICY "Users can delete personnel trainings if allowed by scoped train" ON "public"."personnel_trainings" FOR DELETE USING ("public"."can_edit_personnel_training_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can delete rating scheme entries if allowed by scoped rat" ON "public"."rating_scheme_entries" FOR DELETE USING ("public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id"));



CREATE POLICY "Users can delete their own org preferences" ON "public"."user_org_preferences" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can delete their own pinned groups" ON "public"."user_pinned_groups" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can insert availability if allowed by scoped calendar acc" ON "public"."availability_entries" FOR INSERT WITH CHECK ("public"."can_edit_availability_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can insert daily assignments if allowed by scoped calenda" ON "public"."daily_assignments" FOR INSERT WITH CHECK ("public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"));



CREATE POLICY "Users can insert extended info if can edit personnel" ON "public"."personnel_extended_info" FOR INSERT WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can insert own feedback" ON "public"."beta_feedback" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert personnel ICT completions if allowed by scoped" ON "public"."personnel_ict_completions" FOR INSERT WITH CHECK ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can insert personnel if allowed by scoped personnel acces" ON "public"."personnel" FOR INSERT WITH CHECK ("public"."can_edit_personnel_record"("organization_id", "group_id"));



CREATE POLICY "Users can insert personnel trainings if allowed by scoped train" ON "public"."personnel_trainings" FOR INSERT WITH CHECK ("public"."can_edit_personnel_training_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can insert rating scheme entries if allowed by scoped rat" ON "public"."rating_scheme_entries" FOR INSERT WITH CHECK ("public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id"));



CREATE POLICY "Users can insert their own dashboard config" ON "public"."dashboard_configs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own org preferences" ON "public"."user_org_preferences" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can insert their own pinned groups" ON "public"."user_pinned_groups" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can insert their own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can invalidate duty roster template runs if they can edit" ON "public"."duty_roster_template_runs" FOR UPDATE USING ("public"."can_edit_calendar"("organization_id")) WITH CHECK ("public"."can_edit_calendar"("organization_id"));



CREATE POLICY "Users can manage assignment types if they are full editors" ON "public"."assignment_types" USING ("public"."can_manage_calendar_configuration"("organization_id")) WITH CHECK ("public"."can_manage_calendar_configuration"("organization_id"));



CREATE POLICY "Users can manage duty roster templates if they can edit calenda" ON "public"."duty_roster_templates" USING ("public"."can_edit_calendar"("organization_id")) WITH CHECK ("public"."can_edit_calendar"("organization_id"));



CREATE POLICY "Users can manage groups if they can edit personnel" ON "public"."groups" USING ("public"."can_manage_groups"("organization_id")) WITH CHECK ("public"."can_manage_groups"("organization_id"));



CREATE POLICY "Users can manage own dismissals" ON "public"."announcement_dismissals" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage special days if they can edit calendar data" ON "public"."special_days" USING ("public"."can_edit_calendar"("organization_id")) WITH CHECK ("public"."can_edit_calendar"("organization_id"));



CREATE POLICY "Users can manage status types if they are full editors" ON "public"."status_types" USING ("public"."can_manage_calendar_configuration"("organization_id")) WITH CHECK ("public"."can_manage_calendar_configuration"("organization_id"));



CREATE POLICY "Users can manage their own getting started progress" ON "public"."getting_started_progress" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage training types if they are full editors" ON "public"."training_types" USING ("public"."can_manage_training_configuration"("organization_id")) WITH CHECK ("public"."can_manage_training_configuration"("organization_id"));



CREATE POLICY "Users can read their own dashboard config" ON "public"."dashboard_configs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can record duty roster corrections if they can edit calen" ON "public"."duty_roster_template_run_corrections" FOR INSERT WITH CHECK ("public"."can_edit_calendar"("organization_id"));



CREATE POLICY "Users can update availability if allowed by scoped calendar acc" ON "public"."availability_entries" FOR UPDATE USING ("public"."can_edit_availability_record"("organization_id", "personnel_id")) WITH CHECK ("public"."can_edit_availability_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can update daily assignments if allowed by scoped calenda" ON "public"."daily_assignments" FOR UPDATE USING ("public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id")) WITH CHECK ("public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"));



CREATE POLICY "Users can update extended info if can edit personnel" ON "public"."personnel_extended_info" FOR UPDATE USING ("public"."can_edit_personnel"("organization_id")) WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can update personnel ICT completions if allowed by scoped" ON "public"."personnel_ict_completions" FOR UPDATE USING ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id")) WITH CHECK ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can update personnel if allowed by scoped personnel acces" ON "public"."personnel" FOR UPDATE USING ("public"."can_edit_personnel_record"("organization_id", "group_id")) WITH CHECK ("public"."can_edit_personnel_record"("organization_id", "group_id"));



CREATE POLICY "Users can update personnel trainings if allowed by scoped train" ON "public"."personnel_trainings" FOR UPDATE USING ("public"."can_edit_personnel_training_record"("organization_id", "personnel_id")) WITH CHECK ("public"."can_edit_personnel_training_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can update rating scheme entries if allowed by scoped rat" ON "public"."rating_scheme_entries" FOR UPDATE USING ("public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id")) WITH CHECK ("public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id"));



CREATE POLICY "Users can update their own dashboard config" ON "public"."dashboard_configs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own org preferences" ON "public"."user_org_preferences" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can update their own pinned groups" ON "public"."user_pinned_groups" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can update their own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view ICT tasks if they can view critical tasks data" ON "public"."ict_tasks" FOR SELECT USING ("public"."can_view_critical_tasks"("organization_id"));



CREATE POLICY "Users can view accepted duty roster template runs if they can v" ON "public"."duty_roster_template_runs" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view assignment types if they can view calendar data" ON "public"."assignment_types" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view availability if allowed by scoped calendar acces" ON "public"."availability_entries" FOR SELECT USING ("public"."can_view_availability_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can view daily assignments if allowed by scoped calendar " ON "public"."daily_assignments" FOR SELECT USING ("public"."can_view_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id"));



CREATE POLICY "Users can view duty event runs if they can view calendar data" ON "public"."duty_event_runs" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view duty event slots if they can view calendar data" ON "public"."duty_event_slots" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view duty events if they can view calendar data" ON "public"."duty_events" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view duty roster corrections if they can view calenda" ON "public"."duty_roster_template_run_corrections" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view duty roster templates if they can view calendar " ON "public"."duty_roster_templates" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view duty template rotation baselines if they can vie" ON "public"."duty_template_rotation_baselines" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view duty template slots if they can view calendar da" ON "public"."duty_template_slots" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view duty templates if they can view calendar data" ON "public"."duty_templates" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view extended info if can view personnel" ON "public"."personnel_extended_info" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Users can view groups if they can access related workspaces" ON "public"."groups" FOR SELECT USING ("public"."can_view_groups"("organization_id"));



CREATE POLICY "Users can view invitations addressed to them" ON "public"."organization_invitations" FOR SELECT USING (("normalized_email" = "lower"("btrim"((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text")))));



CREATE POLICY "Users can view organization rank catalog for rank-aware workspa" ON "public"."organization_rank_catalog" FOR SELECT USING (("public"."can_view_personnel"("organization_id") OR "public"."can_view_calendar"("organization_id") OR "public"."can_view_training"("organization_id") OR "public"."can_view_critical_tasks"("organization_id") OR "public"."can_export_organization_data"("organization_id") OR "public"."can_update_organization_settings"("organization_id")));



CREATE POLICY "Users can view organizations they are invited to" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_invitations"
  WHERE (("organization_invitations"."organization_id" = "organizations"."id") AND ("organization_invitations"."normalized_email" = "lower"("btrim"((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text")))) AND ("organization_invitations"."status" = 'pending'::"public"."invitation_status")))));



CREATE POLICY "Users can view organizations they are members of" ON "public"."organizations" FOR SELECT USING ("public"."is_org_member"("id"));



CREATE POLICY "Users can view own feedback" ON "public"."beta_feedback" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view personnel ICT completions if allowed by scoped c" ON "public"."personnel_ict_completions" FOR SELECT USING ("public"."can_view_personnel_ict_completion_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can view personnel if allowed by scoped personnel access" ON "public"."personnel" FOR SELECT USING ("public"."can_view_personnel_record"("organization_id", "group_id"));



CREATE POLICY "Users can view personnel trainings if allowed by scoped trainin" ON "public"."personnel_trainings" FOR SELECT USING ("public"."can_view_personnel_training_record"("organization_id", "personnel_id"));



CREATE POLICY "Users can view rating scheme entries if allowed by scoped ratin" ON "public"."rating_scheme_entries" FOR SELECT USING ("public"."can_view_rating_scheme_record"("organization_id", "rated_person_id"));



CREATE POLICY "Users can view special days if they can view calendar data" ON "public"."special_days" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view status types if they can view calendar data" ON "public"."status_types" FOR SELECT USING ("public"."can_view_calendar"("organization_id"));



CREATE POLICY "Users can view their own org preferences" ON "public"."user_org_preferences" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can view their own pinned groups" ON "public"."user_pinned_groups" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can view their own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view training types if they can view training data" ON "public"."training_types" FOR SELECT USING ("public"."can_view_training"("organization_id"));



ALTER TABLE "public"."access_request_organization_invitation_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."access_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."account_setup_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."account_setup_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."advanced_duty_revision_change_sets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."advanced_duty_revision_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."advanced_duty_revision_slot_changes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."advanced_duty_run_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcement_dismissals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_email_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."availability_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."counseling_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_exports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deletion_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deletion_requests_delete_own" ON "public"."deletion_requests" FOR DELETE USING ((("requested_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text")));



CREATE POLICY "deletion_requests_insert_own" ON "public"."deletion_requests" FOR INSERT WITH CHECK (("requested_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "deletion_requests_select_admin" ON "public"."deletion_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "deletion_requests"."organization_id") AND ("organization_memberships"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



CREATE POLICY "deletion_requests_select_own" ON "public"."deletion_requests" FOR SELECT USING (("requested_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "deletion_requests_update_admin" ON "public"."deletion_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "deletion_requests"."organization_id") AND ("organization_memberships"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("organization_memberships"."role" = ANY (ARRAY['owner'::"public"."organization_role", 'admin'::"public"."organization_role"]))))));



ALTER TABLE "public"."durable_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_event_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_event_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_roster_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_roster_template_run_corrections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_roster_template_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_roster_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_template_rotation_baselines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_template_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."getting_started_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ict_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leader_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."onboarding_step_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_template_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org editors can manage onboarding templates" ON "public"."onboarding_templates" USING ("public"."can_edit_personnel"("organization_id")) WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "org members can view onboarding templates" ON "public"."onboarding_templates" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "org_editors_can_delete_roster_history" ON "public"."duty_roster_history" FOR DELETE USING ("public"."can_edit_calendar"("organization_id"));



CREATE POLICY "org_editors_can_insert_roster_history" ON "public"."duty_roster_history" FOR INSERT WITH CHECK ("public"."can_edit_calendar"("organization_id"));



CREATE POLICY "org_members_can_select_roster_history" ON "public"."duty_roster_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_roster_history"."organization_id") AND ("organization_memberships"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."organization_invitation_email_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_rank_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."password_change_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_extended_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_follow_ups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_ict_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_onboardings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_trainings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rating_scheme_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sign_in_rosters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sign_in_rosters_delete" ON "public"."sign_in_rosters" FOR DELETE USING ("public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'operate'::"text"));



CREATE POLICY "sign_in_rosters_insert" ON "public"."sign_in_rosters" FOR INSERT WITH CHECK ("public"."can_access_sign_in_roster"("organization_id", "personnel_ids", "scope_group_ids", "personnel_snapshot", 'operate'::"text"));



CREATE POLICY "sign_in_rosters_select" ON "public"."sign_in_rosters" FOR SELECT USING ("public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'view'::"text"));



CREATE POLICY "sign_in_rosters_update" ON "public"."sign_in_rosters" FOR UPDATE USING ("public"."can_access_sign_in_roster_scope"("organization_id", "scope_group_ids", 'operate'::"text")) WITH CHECK ("public"."can_access_sign_in_roster"("organization_id", "personnel_ids", "scope_group_ids", "personnel_snapshot", 'operate'::"text"));



ALTER TABLE "public"."special_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."status_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_email_identities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_org_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_pinned_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_suspensions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_organization_invitation"("p_invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_organization_invitation"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_organization_invitation"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_organization_invitation"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."active_personnel_ict_completion_trend"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_ict_task_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."active_personnel_ict_completion_trend"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_ict_task_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."active_personnel_ict_completion_trend"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_ict_task_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advanced_duty_revision_actor_can_manage"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_advanced_duty_revision"("p_org_id" "uuid", "p_draft_id" "uuid", "p_slot_updates" "jsonb", "p_change_set_data" "jsonb", "p_slot_change_rows" "jsonb", "p_applied_draft_data" "jsonb", "p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_advanced_duty_revision"("p_org_id" "uuid", "p_draft_id" "uuid", "p_slot_updates" "jsonb", "p_change_set_data" "jsonb", "p_slot_change_rows" "jsonb", "p_applied_draft_data" "jsonb", "p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_advanced_duty_revision"("p_org_id" "uuid", "p_draft_id" "uuid", "p_slot_updates" "jsonb", "p_change_set_data" "jsonb", "p_slot_change_rows" "jsonb", "p_applied_draft_data" "jsonb", "p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_sign_in_roster"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb", "p_required_capability" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_sign_in_roster"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb", "p_required_capability" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_sign_in_roster"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb", "p_required_capability" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_sign_in_roster"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb", "p_required_capability" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_sign_in_roster_scope"("p_organization_id" "uuid", "p_scope_group_ids" "uuid"[], "p_required_capability" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_sign_in_roster_scope"("p_organization_id" "uuid", "p_scope_group_ids" "uuid"[], "p_required_capability" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_sign_in_roster_scope"("p_organization_id" "uuid", "p_scope_group_ids" "uuid"[], "p_required_capability" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_sign_in_roster_scope"("p_organization_id" "uuid", "p_scope_group_ids" "uuid"[], "p_required_capability" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_critical_tasks"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_onboarding"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_onboarding"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_onboarding"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_export_organization_data"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_export_organization_data"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_export_organization_data"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_calendar_configuration"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_calendar_configuration"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_calendar_configuration"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_groups"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_groups"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_groups"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_ict_task_library"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_training_configuration"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_training_configuration"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_training_configuration"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_update_organization_settings"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_update_organization_settings"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_update_organization_settings"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_availability_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_critical_tasks"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignee_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_daily_assignment_record"("p_organization_id" "uuid", "p_assignment_type_id" "uuid", "p_assignee_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_groups"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_groups"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_groups"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_onboarding"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_onboarding"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_onboarding"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_personnel_training_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_rating_scheme_record"("p_organization_id" "uuid", "p_rated_person_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_training"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_training"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_training"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_account_setup_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_requests" integer, "p_checked_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_account_setup_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_requests" integer, "p_checked_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_durable_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_requests" integer, "p_checked_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_durable_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_max_requests" integer, "p_checked_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_account_setup_link_for_session"("p_setup_link_id" "uuid", "p_access_request_id" "uuid", "p_claimed_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_account_setup_link_for_session"("p_setup_link_id" "uuid", "p_access_request_id" "uuid", "p_claimed_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_password_change_attempt"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."count_memberships_by_organization"("p_org_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_memberships_by_organization"("p_org_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_personnel_by_organization"("p_org_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_personnel_by_organization"("p_org_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_platform_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_platform_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_org_with_owner"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_org_with_owner"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_org_with_owner"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."daily_signups_last_30_days"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."daily_signups_last_30_days"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."decline_organization_invitation"("p_invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decline_organization_invitation"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decline_organization_invitation"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decline_organization_invitation"("p_invitation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_unused_organization_rank_catalog_entry"("p_organization_id" "uuid", "p_entry_id" "uuid", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_unused_organization_rank_catalog_entry"("p_organization_id" "uuid", "p_entry_id" "uuid", "p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_personnel_document_storage_cap"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_personnel_document_storage_cap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_personnel_document_storage_cap"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_session_started_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_session_started_at"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_full_editor_for_org"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_full_editor_for_org"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_full_editor_for_org"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_privileged"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_privileged"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_privileged"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_user_suspended"("check_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_suspended"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_suspended"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_valid_sensitive_file_path"("bucket_name" "text", "object_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_valid_sensitive_file_path"("bucket_name" "text", "object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_valid_sensitive_file_path"("bucket_name" "text", "object_name" "text") TO "service_role";



GRANT ALL ON TABLE "public"."personnel_ict_completions" TO "anon";
GRANT ALL ON TABLE "public"."personnel_ict_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_ict_completions" TO "service_role";



GRANT ALL ON FUNCTION "public"."latest_active_personnel_ict_completions"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_ict_task_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."latest_active_personnel_ict_completions"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_ict_task_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."latest_active_personnel_ict_completions"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_ict_task_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_audit_log_actions"("p_org_id" "uuid", "p_excluded_actions" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_audit_log_actions"("p_org_id" "uuid", "p_excluded_actions" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_platform_owner_membership_metrics"("p_org_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_platform_owner_membership_metrics"("p_org_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."organization_invitation_email_outbox" TO "service_role";
GRANT SELECT ON TABLE "public"."organization_invitation_email_outbox" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"("p_outbox_id" "uuid", "p_status" "text", "p_marked_at" timestamp with time zone, "p_last_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"("p_outbox_id" "uuid", "p_status" "text", "p_marked_at" timestamp with time zone, "p_last_error" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."member_access_capability_level"("p_can_view" boolean, "p_can_edit" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_capability_level"("p_can_view" boolean, "p_can_edit" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_capability_level"("p_can_view" boolean, "p_can_edit" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."member_access_capability_override"("p_base_level" "text", "p_can_view" boolean, "p_can_edit" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_capability_override"("p_base_level" "text", "p_can_view" boolean, "p_can_edit" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_capability_override"("p_base_level" "text", "p_can_view" boolean, "p_can_edit" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" "uuid", "p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" "uuid", "p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_group_scope_matches"("p_organization_id" "uuid", "p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."member_access_has_capability"("p_organization_id" "uuid", "p_lane" "text", "p_required_capability" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_has_capability"("p_organization_id" "uuid", "p_lane" "text", "p_required_capability" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_has_capability"("p_organization_id" "uuid", "p_lane" "text", "p_required_capability" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."member_access_lane_capability"("p_member_preset" "text", "p_capability_overrides" "jsonb", "p_lane" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_lane_capability"("p_member_preset" "text", "p_capability_overrides" "jsonb", "p_lane" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_lane_capability"("p_member_preset" "text", "p_capability_overrides" "jsonb", "p_lane" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."member_access_required_capability_rank"("p_capability" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."member_access_required_capability_rank"("p_capability" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_access_required_capability_rank"("p_capability" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."organization_rank_catalog_reference_matches"("p_value" "text", "p_code" "text", "p_allow_normalized" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."organization_rank_catalog_reference_matches"("p_value" "text", "p_code" "text", "p_allow_normalized" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."organization_rank_catalog_reference_matches"("p_value" "text", "p_code" "text", "p_allow_normalized" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."organization_rank_catalog_reference_matches"("p_value" "text", "p_code" "text", "p_allow_normalized" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."password_change_attempt"("p_actor" "uuid", "p_session" "uuid", "p_action" "text", "p_flow" "text", "p_expires_at" timestamp with time zone, "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."password_change_attempt"("p_actor" "uuid", "p_session" "uuid", "p_action" "text", "p_flow" "text", "p_expires_at" timestamp with time zone, "p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_organization_rank_catalog_org_move"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_organization_rank_catalog_org_move"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_organization_rank_catalog_org_move"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_access_request_and_block_linked_invitations"("p_access_request_id" "uuid", "p_reviewer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_access_request_and_block_linked_invitations"("p_access_request_id" "uuid", "p_reviewer_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."advanced_duty_run_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_duty_run_snapshots" TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_organization_invitation"("p_invitation_id" "uuid", "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_organization_invitation"("p_invitation_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_organization_invitation"("p_invitation_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_organization_invitation"("p_invitation_id" "uuid", "p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_users_by_email"("search_query" "text", "max_results" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_users_by_email"("search_query" "text", "max_results" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sensitive_file_object_is_readable"("bucket_name" "text", "object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sensitive_file_object_is_readable"("bucket_name" "text", "object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sensitive_file_object_is_readable"("bucket_name" "text", "object_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sensitive_file_object_is_writable"("bucket_name" "text", "object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sensitive_file_object_is_writable"("bucket_name" "text", "object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sensitive_file_object_is_writable"("bucket_name" "text", "object_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sign_in_roster_scope_matches_personnel"("p_organization_id" "uuid", "p_personnel_ids" "uuid"[], "p_scope_group_ids" "uuid"[], "p_personnel_snapshot" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_object_org_id"("object_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."storage_object_org_id"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_object_org_id"("object_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_object_scope"("object_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."storage_object_scope"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_object_scope"("object_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_email_identity_from_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_email_identity_from_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_email_identity_from_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_dashboard_config_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_dashboard_config_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_dashboard_config_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."training_views_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."training_views_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."training_views_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_advanced_duty_event_aggregate"("p_org_id" "uuid", "p_duty_event_id" "uuid", "p_event_data" "jsonb", "p_slot_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_advanced_duty_event_aggregate"("p_org_id" "uuid", "p_duty_event_id" "uuid", "p_event_data" "jsonb", "p_slot_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_advanced_duty_event_aggregate"("p_org_id" "uuid", "p_duty_event_id" "uuid", "p_event_data" "jsonb", "p_slot_rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_advanced_duty_template_aggregate"("p_org_id" "uuid", "p_template_id" "uuid", "p_template_data" "jsonb", "p_slot_rows" "jsonb", "p_rotation_baseline_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_advanced_duty_template_aggregate"("p_org_id" "uuid", "p_template_id" "uuid", "p_template_data" "jsonb", "p_slot_rows" "jsonb", "p_rotation_baseline_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_advanced_duty_template_aggregate"("p_org_id" "uuid", "p_template_id" "uuid", "p_template_data" "jsonb", "p_slot_rows" "jsonb", "p_rotation_baseline_rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_org_preferences_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_org_preferences_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_org_preferences_set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."access_request_organization_invitation_links" TO "service_role";
GRANT SELECT ON TABLE "public"."access_request_organization_invitation_links" TO "authenticated";



GRANT ALL ON TABLE "public"."access_requests" TO "anon";
GRANT ALL ON TABLE "public"."access_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."access_requests" TO "service_role";



GRANT ALL ON TABLE "public"."account_setup_links" TO "anon";
GRANT ALL ON TABLE "public"."account_setup_links" TO "authenticated";
GRANT ALL ON TABLE "public"."account_setup_links" TO "service_role";



GRANT ALL ON TABLE "public"."account_setup_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."account_setup_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."account_setup_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."advanced_duty_revision_change_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_duty_revision_change_sets" TO "service_role";



GRANT ALL ON TABLE "public"."advanced_duty_revision_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_duty_revision_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."advanced_duty_revision_slot_changes" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_duty_revision_slot_changes" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_dismissals" TO "anon";
GRANT ALL ON TABLE "public"."announcement_dismissals" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_dismissals" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_types" TO "anon";
GRANT ALL ON TABLE "public"."assignment_types" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_types" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."auth_email_outbox" TO "anon";
GRANT ALL ON TABLE "public"."auth_email_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_email_outbox" TO "service_role";



GRANT ALL ON TABLE "public"."availability_entries" TO "anon";
GRANT ALL ON TABLE "public"."availability_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_entries" TO "service_role";



GRANT ALL ON TABLE "public"."beta_feedback" TO "anon";
GRANT ALL ON TABLE "public"."beta_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."counseling_records" TO "anon";
GRANT ALL ON TABLE "public"."counseling_records" TO "authenticated";
GRANT ALL ON TABLE "public"."counseling_records" TO "service_role";



GRANT ALL ON TABLE "public"."daily_assignments" TO "anon";
GRANT ALL ON TABLE "public"."daily_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_configs" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_configs" TO "service_role";



GRANT ALL ON TABLE "public"."data_exports" TO "anon";
GRANT ALL ON TABLE "public"."data_exports" TO "authenticated";
GRANT ALL ON TABLE "public"."data_exports" TO "service_role";



GRANT ALL ON TABLE "public"."deletion_requests" TO "anon";
GRANT ALL ON TABLE "public"."deletion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."deletion_requests" TO "service_role";



GRANT ALL ON TABLE "public"."durable_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."durable_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."durable_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."duty_event_runs" TO "anon";
GRANT ALL ON TABLE "public"."duty_event_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_event_runs" TO "service_role";



GRANT ALL ON TABLE "public"."duty_event_slots" TO "anon";
GRANT ALL ON TABLE "public"."duty_event_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_event_slots" TO "service_role";



GRANT ALL ON TABLE "public"."duty_events" TO "anon";
GRANT ALL ON TABLE "public"."duty_events" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_events" TO "service_role";



GRANT ALL ON TABLE "public"."duty_roster_history" TO "anon";
GRANT ALL ON TABLE "public"."duty_roster_history" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_roster_history" TO "service_role";



GRANT ALL ON TABLE "public"."duty_roster_template_run_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_roster_template_run_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."duty_roster_template_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_roster_template_runs" TO "service_role";



GRANT ALL ON TABLE "public"."duty_roster_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_roster_templates" TO "service_role";



GRANT ALL ON TABLE "public"."duty_template_rotation_baselines" TO "anon";
GRANT ALL ON TABLE "public"."duty_template_rotation_baselines" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_template_rotation_baselines" TO "service_role";



GRANT ALL ON TABLE "public"."duty_template_slots" TO "anon";
GRANT ALL ON TABLE "public"."duty_template_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_template_slots" TO "service_role";



GRANT ALL ON TABLE "public"."duty_templates" TO "anon";
GRANT ALL ON TABLE "public"."duty_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_templates" TO "service_role";



GRANT ALL ON TABLE "public"."getting_started_progress" TO "anon";
GRANT ALL ON TABLE "public"."getting_started_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."getting_started_progress" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."ict_tasks" TO "anon";
GRANT ALL ON TABLE "public"."ict_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."ict_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."leader_notes" TO "anon";
GRANT ALL ON TABLE "public"."leader_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."leader_notes" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_step_progress" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_step_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_step_progress" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_template_steps" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_template_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_template_steps" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_templates" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_templates" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invitations" TO "anon";
GRANT ALL ON TABLE "public"."organization_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."organization_memberships" TO "anon";
GRANT ALL ON TABLE "public"."organization_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."organization_rank_catalog" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."organization_rank_catalog" TO "authenticated";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."personnel" TO "anon";
GRANT ALL ON TABLE "public"."personnel" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_documents" TO "anon";
GRANT ALL ON TABLE "public"."personnel_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_documents" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_extended_info" TO "anon";
GRANT ALL ON TABLE "public"."personnel_extended_info" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_extended_info" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_follow_ups" TO "anon";
GRANT ALL ON TABLE "public"."personnel_follow_ups" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_follow_ups" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_onboardings" TO "anon";
GRANT ALL ON TABLE "public"."personnel_onboardings" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_onboardings" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_trainings" TO "anon";
GRANT ALL ON TABLE "public"."personnel_trainings" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_trainings" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."platform_announcements" TO "anon";
GRANT ALL ON TABLE "public"."platform_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."rating_scheme_entries" TO "anon";
GRANT ALL ON TABLE "public"."rating_scheme_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."rating_scheme_entries" TO "service_role";



GRANT ALL ON TABLE "public"."sign_in_rosters" TO "anon";
GRANT ALL ON TABLE "public"."sign_in_rosters" TO "authenticated";
GRANT ALL ON TABLE "public"."sign_in_rosters" TO "service_role";



GRANT ALL ON TABLE "public"."special_days" TO "anon";
GRANT ALL ON TABLE "public"."special_days" TO "authenticated";
GRANT ALL ON TABLE "public"."special_days" TO "service_role";



GRANT ALL ON TABLE "public"."status_types" TO "anon";
GRANT ALL ON TABLE "public"."status_types" TO "authenticated";
GRANT ALL ON TABLE "public"."status_types" TO "service_role";



GRANT ALL ON TABLE "public"."training_types" TO "anon";
GRANT ALL ON TABLE "public"."training_types" TO "authenticated";
GRANT ALL ON TABLE "public"."training_types" TO "service_role";



GRANT ALL ON TABLE "public"."training_views" TO "anon";
GRANT ALL ON TABLE "public"."training_views" TO "authenticated";
GRANT ALL ON TABLE "public"."training_views" TO "service_role";



GRANT ALL ON TABLE "public"."user_email_identities" TO "service_role";



GRANT ALL ON TABLE "public"."user_org_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_org_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_org_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_pinned_groups" TO "anon";
GRANT ALL ON TABLE "public"."user_pinned_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."user_pinned_groups" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_suspensions" TO "anon";
GRANT ALL ON TABLE "public"."user_suspensions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_suspensions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
