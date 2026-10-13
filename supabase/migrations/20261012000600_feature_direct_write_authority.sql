-- Direct feature-record writes follow the app operations' authority. Existing
-- rows are unchanged; the guards apply to later writes.

-- Personnel: operate members create, import and edit People. Archive, restore
-- and permanent deletion need configure, and permanent deletion needs an
-- archived Person. Creating an already archived Person counts as archiving.
CREATE FUNCTION "public"."can_configure_personnel_record"("p_organization_id" uuid, "p_group_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'configure')
		AND CASE
			WHEN "p_group_id" IS NOT NULL
				THEN "public"."member_access_group_scope_matches"("p_organization_id", "p_group_id")
			ELSE EXISTS (
				SELECT 1 FROM "public"."organization_memberships" AS "m"
				WHERE "m"."organization_id" = "p_organization_id" AND "m"."user_id" = "auth"."uid"()
					AND ("m"."role" IN ('owner', 'admin') OR "m"."access_scope_kind" = 'organization')
			)
		END;
$$;
ALTER FUNCTION "public"."can_configure_personnel_record"(uuid, uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."can_configure_personnel_record"(uuid, uuid) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."can_configure_personnel_record"(uuid, uuid) TO "authenticated", "service_role";

ALTER POLICY "Users can insert personnel if allowed by scoped personnel acces" ON "public"."personnel"
	WITH CHECK (
		"public"."can_edit_personnel_record"("organization_id", "group_id")
		AND ("archived_at" IS NULL OR "public"."can_configure_personnel_record"("organization_id", "group_id"))
	);
ALTER POLICY "Users can delete personnel if allowed by scoped personnel acces" ON "public"."personnel"
	USING ("public"."can_configure_personnel_record"("organization_id", "group_id") AND "archived_at" IS NOT NULL);

-- SECURITY INVOKER keeps current_user as the API role. Service-role jobs and
-- definer commands run as other roles and keep their own checks.
CREATE FUNCTION organization_private.require_personnel_lifecycle_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
	IF current_user IN ('authenticated', 'anon')
		AND NEW.archived_at IS DISTINCT FROM OLD.archived_at
		AND NOT (
			public.can_configure_personnel_record(OLD.organization_id, OLD.group_id)
			AND public.can_configure_personnel_record(NEW.organization_id, NEW.group_id)
		)
	THEN
		RAISE EXCEPTION 'Archiving or restoring Personnel requires configure access' USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_personnel_lifecycle_authority()
	FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER require_personnel_lifecycle_authority
	BEFORE UPDATE OF archived_at ON public.personnel
	FOR EACH ROW EXECUTE FUNCTION organization_private.require_personnel_lifecycle_authority();

-- Approval-gated hard deletes keep the authority of the direct app path.
CREATE FUNCTION "public"."can_configure_personnel_training_record"("p_organization_id" uuid, "p_personnel_id" uuid)
RETURNS boolean
	LANGUAGE "sql" STABLE SECURITY DEFINER
	SET "search_path" TO ''
	AS $$
	SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'configure')
		AND "public"."training_personnel_scope_matches"("p_organization_id", "p_personnel_id");
$$;
ALTER FUNCTION "public"."can_configure_personnel_training_record"(uuid, uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."can_configure_personnel_training_record"(uuid, uuid) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."can_configure_personnel_training_record"(uuid, uuid) TO "authenticated", "service_role";

ALTER POLICY "Users can delete personnel trainings if allowed by scoped train" ON "public"."personnel_trainings"
	USING ("public"."can_configure_personnel_training_record"("organization_id", "personnel_id"));
ALTER POLICY "Users can delete rating scheme entries if allowed by scoped rating scheme access"
	ON "public"."rating_scheme_entries"
	USING (
		"public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id")
		AND "public"."is_org_privileged"("organization_id")
	);

-- Personnel artifacts are archived before they are permanently deleted.
ALTER POLICY "Operators can delete counseling records through scoped personnel access" ON "public"."counseling_records"
	USING (
		"archived_at" IS NOT NULL
		AND "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
		AND EXISTS (
			SELECT 1 FROM "public"."personnel"
			WHERE "personnel"."id" = "counseling_records"."personnel_id"
				AND "personnel"."organization_id" = "counseling_records"."organization_id"
				AND "public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id")
		)
	);
ALTER POLICY "Operators can delete leader notes through scoped personnel access" ON "public"."leader_notes"
	USING (
		"archived_at" IS NOT NULL
		AND "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
		AND EXISTS (
			SELECT 1 FROM "public"."personnel"
			WHERE "personnel"."id" = "leader_notes"."personnel_id"
				AND "personnel"."organization_id" = "leader_notes"."organization_id"
				AND "public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id")
		)
	);
ALTER POLICY "Operators can delete personnel documents through scoped personnel access" ON "public"."personnel_documents"
	USING (
		"archived_at" IS NOT NULL
		AND "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
		AND EXISTS (
			SELECT 1 FROM "public"."personnel"
			WHERE "personnel"."id" = "personnel_documents"."personnel_id"
				AND "personnel"."organization_id" = "personnel_documents"."organization_id"
				AND "public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id")
		)
	);
ALTER POLICY "Operators can delete personnel follow ups through scoped personnel access" ON "public"."personnel_follow_ups"
	USING (
		"status" = 'archived'
		AND "public"."member_access_has_capability"("organization_id", 'personnel', 'operate')
		AND EXISTS (
			SELECT 1 FROM "public"."personnel"
			WHERE "personnel"."id" = "personnel_follow_ups"."personnel_id"
				AND "personnel"."organization_id" = "personnel_follow_ups"."organization_id"
				AND (
					(
						"personnel"."group_id" IS NOT NULL
						AND "public"."member_access_group_scope_matches"("personnel_follow_ups"."organization_id", "personnel"."group_id")
					)
					OR (
						"personnel"."group_id" IS NULL
						AND EXISTS (
							SELECT 1 FROM "public"."organization_memberships"
							WHERE "organization_memberships"."organization_id" = "personnel_follow_ups"."organization_id"
								AND "organization_memberships"."user_id" = "auth"."uid"()
								AND (
									"organization_memberships"."role" IN ('owner', 'admin')
									OR "organization_memberships"."access_scope_kind" = 'organization'
								)
						)
					)
				)
		)
	);

-- Retention removes stored files by these paths with the service role, so a
-- direct API write keeps a path under its own Organization and Person, as the
-- upload path does.
CREATE FUNCTION organization_private.require_artifact_file_under_person() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
	prefix text;
	segments text[];
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;
	IF TG_OP = 'UPDATE'
		AND NEW.file_path IS NOT DISTINCT FROM OLD.file_path
		AND NEW.personnel_id IS NOT DISTINCT FROM OLD.personnel_id
		AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
	THEN
		RETURN NEW;
	END IF;
	IF NEW.file_path IS NULL THEN
		RETURN NEW;
	END IF;
	prefix := CASE TG_TABLE_NAME
		WHEN 'counseling_records' THEN NEW.organization_id::text || '/counseling-records/' || NEW.personnel_id::text || '/'
		ELSE NEW.organization_id::text || '/personnel/' || NEW.personnel_id::text || '/documents/'
	END;
	segments := string_to_array(NEW.file_path, '/');
	IF left(NEW.file_path, length(prefix)) <> prefix
		OR length(NEW.file_path) = length(prefix)
		OR '..' = ANY (segments)
		OR '.' = ANY (segments)
	THEN
		RAISE EXCEPTION 'Artifact file path is outside its Person' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_artifact_file_under_person()
	FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER require_artifact_file_under_person
	BEFORE INSERT OR UPDATE OF file_path, personnel_id, organization_id ON public.counseling_records
	FOR EACH ROW EXECUTE FUNCTION organization_private.require_artifact_file_under_person();
CREATE TRIGGER require_artifact_file_under_person
	BEFORE INSERT OR UPDATE OF file_path, personnel_id, organization_id ON public.personnel_documents
	FOR EACH ROW EXECUTE FUNCTION organization_private.require_artifact_file_under_person();

-- The server removes a stored document or counseling file only after its record
-- is archived and deleted. API callers keep sign-in roster file removal and
-- owner Organization cleanup.
DROP POLICY "Operators can delete personnel document files through scoped personnel access" ON storage.objects;
ALTER POLICY "Sensitive files are deletable by authorized editors" ON storage.objects
	USING (
		public.storage_object_scope(name) = 'sign-in-rosters'
		AND public.sensitive_file_object_is_writable(bucket_id, name)
	);

-- Onboarding: operate starts packets, records progress and changes lifecycle
-- status. Template choice, step shape and removal of active work belong to the
-- configure-only reconcile command. Packets and steps are created only by the
-- start and reconcile commands and removed only by retention.

-- Policies and commands ask whether a Person, packet, template or Training
-- type is in scope. API callers cannot ask, so the answers reveal no IDs.
CREATE SCHEMA onboarding_private;
REVOKE ALL ON SCHEMA onboarding_private FROM PUBLIC, anon, service_role;
GRANT USAGE ON SCHEMA onboarding_private TO authenticated;
ALTER FUNCTION public.onboarding_personnel_scope_matches(uuid, uuid) SET SCHEMA onboarding_private;
ALTER FUNCTION public.onboarding_parent_scope_matches(uuid, uuid) SET SCHEMA onboarding_private;
ALTER FUNCTION public.onboarding_template_reference_matches(uuid, uuid) SET SCHEMA onboarding_private;
ALTER FUNCTION public.onboarding_step_references_match(uuid, uuid, uuid) SET SCHEMA onboarding_private;

CREATE OR REPLACE FUNCTION onboarding_private.onboarding_parent_scope_matches(
  p_organization_id uuid, p_onboarding_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel_onboardings po
    WHERE po.id = p_onboarding_id AND po.organization_id = p_organization_id
      AND onboarding_private.onboarding_personnel_scope_matches(p_organization_id, po.personnel_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.active_onboarding_calendar_personnel_ids(p_organization_id uuid)
RETURNS TABLE(personnel_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT po.personnel_id
  FROM public.personnel_onboardings po
  WHERE po.organization_id = p_organization_id AND po.status = 'in_progress'
    AND public.can_view_calendar(p_organization_id)
    AND onboarding_private.onboarding_personnel_scope_matches(p_organization_id, po.personnel_id)
  ORDER BY po.personnel_id;
$$;

CREATE OR REPLACE FUNCTION public.append_onboarding_step_note(
  p_organization_id uuid, p_step_id uuid, p_text text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  saved public.onboarding_step_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_edit_onboarding(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding changes are not allowed' USING ERRCODE = '42501';
  END IF;

  -- Reconciliation locks parent then progress. This function does not explicitly
  -- lock a parent; existing foreign keys can still acquire key-share locks.
  SELECT progress.* INTO saved
  FROM public.onboarding_step_progress AS progress
  WHERE progress.organization_id = p_organization_id AND progress.id = p_step_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found' USING ERRCODE = 'P0002';
  END IF;

  -- This separate statement sees capability/Person scope committed during the
  -- row-lock wait, rather than relying only on the earlier SELECT's RLS snapshot.
  IF public.can_edit_onboarding(p_organization_id) IS NOT TRUE
    OR onboarding_private.onboarding_parent_scope_matches(p_organization_id, saved.onboarding_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding changes are not allowed' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(saved.notes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Saved onboarding notes must be an array' USING ERRCODE = '22023';
  END IF;

  UPDATE public.onboarding_step_progress AS progress
  SET notes = progress.notes || jsonb_build_array(jsonb_build_object(
    'text', p_text,
    'timestamp', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'userId', auth.uid()
  ))
  WHERE progress.organization_id = p_organization_id AND progress.id = p_step_id
  RETURNING progress.* INTO saved;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding changes are not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('id', saved.id, 'notes', saved.notes);
END;
$$;

-- Start and reconcile write packets and steps as their owner after checking
-- the caller's admitted capability and Person scope, as RLS did before.
-- Start saves the template's current steps. It keeps p_steps in its signature
-- for app versions that still send prepared steps, and ignores it.
CREATE OR REPLACE FUNCTION public.start_onboarding_packet(
  p_organization_id uuid, p_personnel_id uuid, p_template_id uuid,
  p_started_at date, p_steps jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  packet public.personnel_onboardings%ROWTYPE;
  result_steps jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_edit_onboarding(p_organization_id) IS NOT TRUE
    OR onboarding_private.onboarding_personnel_scope_matches(p_organization_id, p_personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding start is not allowed' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_started_at IS NULL THEN
    RAISE EXCEPTION 'Onboarding start date is required' USING ERRCODE = '22023';
  END IF;

  -- The existing partial unique index also governs simultaneous first starts.
  -- Do not catch its named 23505 or an unexpected provider failure.
  INSERT INTO public.personnel_onboardings (
    organization_id, personnel_id, template_id, started_at, status, completed_at, cancelled_at
  ) VALUES (
    p_organization_id, p_personnel_id, p_template_id, p_started_at, 'in_progress', NULL, NULL
  ) RETURNING * INTO packet;

  -- The parent foreign keys can wait. Re-evaluate the current actor and Person
  -- scope in a fresh statement after that wait, before writing any steps.
  IF public.can_edit_onboarding(p_organization_id) IS NOT TRUE
    OR onboarding_private.onboarding_personnel_scope_matches(p_organization_id, p_personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding start is not allowed' USING ERRCODE = '42501';
  END IF;

  -- A Training step starts complete when the Person has a saved record of its
  -- type, as the app's Training read decides.
  WITH saved AS (
    INSERT INTO public.onboarding_step_progress (
      organization_id, onboarding_id, template_step_id, step_name, step_type,
      training_type_id, stages, sort_order, completed, current_stage, notes, active
    ) SELECT p_organization_id, packet.id, s.id, s.name, s.step_type,
      s.training_type_id, s.stages, s.sort_order,
      s.step_type = 'training' AND s.training_type_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.personnel_trainings AS record
        WHERE record.organization_id = p_organization_id
          AND record.personnel_id = p_personnel_id
          AND record.training_type_id = s.training_type_id
      ),
      CASE WHEN s.step_type = 'paperwork' AND jsonb_typeof(s.stages) = 'array'
        THEN s.stages->>0 ELSE NULL END, '[]'::jsonb, true
    FROM public.onboarding_template_steps AS s
    WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id
    ORDER BY s.sort_order, s.id
    RETURNING *
  ) SELECT coalesce(jsonb_agg(to_jsonb(saved) ORDER BY saved.sort_order, saved.id), '[]'::jsonb)
    INTO result_steps FROM saved;

  -- Child foreign keys can also wait after earlier inserts. Any access loss
  -- here raises through the same transaction and rolls back parent and steps.
  IF public.can_edit_onboarding(p_organization_id) IS NOT TRUE
    OR onboarding_private.onboarding_personnel_scope_matches(p_organization_id, p_personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding start is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('onboarding', to_jsonb(packet), 'steps', result_steps);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_onboarding_packet(
  p_organization_id uuid, p_onboarding_id uuid, p_new_template_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  packet public.personnel_onboardings%ROWTYPE;
  definition public.onboarding_template_steps%ROWTYPE;
  saved public.onboarding_step_progress%ROWTYPE;
  selected_template_id uuid;
  matched_ids uuid[] := ARRAY[]::uuid[];
  has_stages boolean;
  reset_stage boolean;
  result_steps jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'onboarding', 'configure') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  -- Every reconciliation of this packet takes this lock before reading its
  -- template or progress. An awaited resync derives the winner's current template.
  SELECT po.* INTO packet
  FROM public.personnel_onboardings AS po
  WHERE po.organization_id = p_organization_id AND po.id = p_onboarding_id
    AND onboarding_private.onboarding_personnel_scope_matches(p_organization_id, po.personnel_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding not found' USING ERRCODE = 'P0002';
  END IF;

  -- Capability and scope can change while the parent lock is awaited.
  IF public.member_access_has_capability(p_organization_id, 'onboarding', 'configure') IS NOT TRUE
    OR onboarding_private.onboarding_personnel_scope_matches(p_organization_id, packet.personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF packet.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Only in-progress onboardings can be reconciled' USING ERRCODE = 'P0001';
  END IF;

  selected_template_id := coalesce(p_new_template_id, packet.template_id);
  IF selected_template_id IS NULL THEN
    RAISE EXCEPTION 'Cannot resync: template has been deleted' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = selected_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
  END IF;

  -- Wait for already-running progress edits before reading their saved values.
  -- Metadata updates below never resend note arrays or checkbox completion.
  PERFORM 1 FROM public.onboarding_step_progress AS progress
  WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
  ORDER BY progress.id FOR UPDATE;
  IF public.member_access_has_capability(p_organization_id, 'onboarding', 'configure') IS NOT TRUE
    OR onboarding_private.onboarding_personnel_scope_matches(p_organization_id, packet.personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  FOR definition IN
    SELECT s.* FROM public.onboarding_template_steps AS s
    WHERE s.organization_id = p_organization_id AND s.template_id = selected_template_id
    ORDER BY s.sort_order, s.id
  LOOP
    SELECT progress.* INTO saved
    FROM public.onboarding_step_progress AS progress
    WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
      AND progress.template_step_id = definition.id AND NOT (progress.id = ANY(matched_ids))
    ORDER BY progress.id LIMIT 1;

    -- Only the transaction that observes an unassigned parent can adopt legacy
    -- work. A deleted definition's null reference is history during normal resync.
    IF NOT FOUND AND packet.template_id IS NULL THEN
      SELECT progress.* INTO saved
      FROM public.onboarding_step_progress AS progress
      WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
        AND progress.template_step_id IS NULL AND progress.active
        AND progress.step_name = definition.name AND progress.step_type = definition.step_type
        AND NOT (progress.id = ANY(matched_ids))
      ORDER BY progress.id LIMIT 1;
    END IF;

    has_stages := definition.step_type = 'paperwork' AND CASE
      WHEN jsonb_typeof(definition.stages) = 'array' THEN jsonb_array_length(definition.stages) > 0
      ELSE false END;
    IF saved.id IS NOT NULL THEN
      reset_stage := has_stages AND saved.current_stage IS NOT NULL
        AND NOT (definition.stages @> jsonb_build_array(saved.current_stage));
      UPDATE public.onboarding_step_progress AS progress SET
        template_step_id = definition.id, active = true,
        step_name = definition.name, step_type = definition.step_type,
        training_type_id = definition.training_type_id, stages = definition.stages,
        sort_order = definition.sort_order,
        current_stage = CASE WHEN reset_stage THEN definition.stages->>0 ELSE progress.current_stage END,
        completed = CASE WHEN reset_stage THEN false ELSE progress.completed END
      WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
        AND progress.id = saved.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
      END IF;
      matched_ids := array_append(matched_ids, saved.id);
    ELSE
      INSERT INTO public.onboarding_step_progress (
        organization_id, onboarding_id, template_step_id, step_name, step_type,
        training_type_id, stages, sort_order, completed, current_stage, notes, active
      ) VALUES (
        p_organization_id, p_onboarding_id, definition.id, definition.name, definition.step_type,
        definition.training_type_id, definition.stages, definition.sort_order, false,
        CASE WHEN has_stages THEN definition.stages->>0 ELSE NULL END, '[]'::jsonb, true
      ) RETURNING * INTO saved;
      matched_ids := array_append(matched_ids, saved.id);
    END IF;
  END LOOP;

  UPDATE public.onboarding_step_progress AS progress SET active = false
  WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
    AND progress.active AND NOT (progress.id = ANY(matched_ids));
  UPDATE public.personnel_onboardings AS po SET template_id = selected_template_id
  WHERE po.organization_id = p_organization_id AND po.id = p_onboarding_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(progress) ORDER BY progress.sort_order, progress.id), '[]'::jsonb)
  INTO result_steps FROM public.onboarding_step_progress AS progress
  WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id;
  RETURN jsonb_build_object(
    'onboarding_id', p_onboarding_id, 'template_id', selected_template_id,
    'old_template_id', packet.template_id, 'steps', result_steps
  );
END;
$$;

DROP POLICY "Onboarding operators can manage scoped workflows" ON public.personnel_onboardings;
DROP POLICY "Onboarding operators can manage scoped progress" ON public.onboarding_step_progress;
REVOKE INSERT ON TABLE public.personnel_onboardings, public.onboarding_step_progress FROM anon, authenticated;

CREATE POLICY "Onboarding operators can update scoped workflows"
ON public.personnel_onboardings FOR UPDATE TO authenticated
USING (
	public.can_edit_onboarding(organization_id)
	AND onboarding_private.onboarding_personnel_scope_matches(organization_id, personnel_id)
)
WITH CHECK (
	public.can_edit_onboarding(organization_id)
	AND onboarding_private.onboarding_personnel_scope_matches(organization_id, personnel_id)
	AND onboarding_private.onboarding_template_reference_matches(organization_id, template_id)
);

CREATE POLICY "Onboarding operators can update scoped progress"
ON public.onboarding_step_progress FOR UPDATE TO authenticated
USING (
	public.can_edit_onboarding(organization_id)
	AND onboarding_private.onboarding_parent_scope_matches(organization_id, onboarding_id)
)
WITH CHECK (
	public.can_edit_onboarding(organization_id)
	AND onboarding_private.onboarding_parent_scope_matches(organization_id, onboarding_id)
	AND onboarding_private.onboarding_step_references_match(organization_id, template_step_id, training_type_id)
);

CREATE POLICY "Onboarding operators can remove inactive scoped progress"
ON public.onboarding_step_progress FOR DELETE TO authenticated
USING (
	NOT active
	AND public.can_edit_onboarding(organization_id)
	AND onboarding_private.onboarding_parent_scope_matches(organization_id, onboarding_id)
);

-- Notes change only by appending one note authored by the caller, as the
-- append command does. The command's server timestamp is not re-verified.
CREATE FUNCTION organization_private.require_onboarding_configuration_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
	appended jsonb;
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;
	IF TG_TABLE_NAME = 'personnel_onboardings' THEN
		IF NEW.template_id IS DISTINCT FROM OLD.template_id
			AND NOT public.member_access_has_capability(NEW.organization_id, 'onboarding', 'configure')
		THEN
			RAISE EXCEPTION 'Changing an onboarding template requires configure access' USING ERRCODE = '42501';
		END IF;
		RETURN NEW;
	END IF;

	IF (NEW.template_step_id, NEW.active, NEW.step_name, NEW.step_type, NEW.training_type_id, NEW.stages, NEW.sort_order)
		IS DISTINCT FROM (OLD.template_step_id, OLD.active, OLD.step_name, OLD.step_type, OLD.training_type_id, OLD.stages, OLD.sort_order)
		AND NOT public.member_access_has_capability(NEW.organization_id, 'onboarding', 'configure')
	THEN
		RAISE EXCEPTION 'Changing an onboarding step requires configure access' USING ERRCODE = '42501';
	END IF;
	IF NEW.notes IS DISTINCT FROM OLD.notes THEN
		appended := NEW.notes -> -1;
		IF jsonb_typeof(NEW.notes) IS DISTINCT FROM 'array'
			OR jsonb_array_length(NEW.notes) <> jsonb_array_length(OLD.notes) + 1
			OR (NEW.notes - (jsonb_array_length(NEW.notes) - 1)) IS DISTINCT FROM OLD.notes
			OR jsonb_typeof(appended) IS DISTINCT FROM 'object'
			OR coalesce(jsonb_typeof(appended -> 'text'), 'missing') NOT IN ('string', 'null')
			OR (appended ->> 'userId') IS DISTINCT FROM auth.uid()::text
		THEN
			RAISE EXCEPTION 'Onboarding notes accept only an appended note by the caller' USING ERRCODE = '42501';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_onboarding_configuration_authority()
	FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER require_onboarding_configuration_authority
	BEFORE UPDATE OF template_id ON public.personnel_onboardings
	FOR EACH ROW EXECUTE FUNCTION organization_private.require_onboarding_configuration_authority();
CREATE TRIGGER require_onboarding_configuration_authority
	BEFORE UPDATE ON public.onboarding_step_progress
	FOR EACH ROW EXECUTE FUNCTION organization_private.require_onboarding_configuration_authority();

-- The server creates deletion requests after the owning feature loads the
-- target with the requester's access and describes it. Requesters cancel
-- through cancel_own_deletion_request, which keeps the request history.
DROP POLICY "deletion_requests_insert_own" ON "public"."deletion_requests";
REVOKE INSERT ON TABLE "public"."deletion_requests" FROM "anon", "authenticated";
DROP POLICY "deletion_requests_delete_own" ON "public"."deletion_requests";

-- The pre-lane full-editor helper has no remaining callers.
DROP FUNCTION "public"."is_full_editor_for_org"(uuid);

-- Approved Training and Rating deletions remove the named target and approve
-- the request in one transaction. A missing, foreign or already-removed
-- target, or a request that is no longer pending, leaves both unchanged.
CREATE FUNCTION public.approve_record_deletion_request(
	p_organization_id uuid,
	p_request_id uuid,
	p_resource_type text,
	p_resource_id uuid,
	p_reviewer_id uuid,
	p_reviewed_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
	IF p_resource_type = 'training_type' THEN
		DELETE FROM public.training_types
		WHERE organization_id = p_organization_id AND id = p_resource_id;
	ELSIF p_resource_type = 'personnel_training' THEN
		DELETE FROM public.personnel_trainings
		WHERE organization_id = p_organization_id AND id = p_resource_id;
	ELSIF p_resource_type = 'rating_scheme_entry' THEN
		DELETE FROM public.rating_scheme_entries
		WHERE organization_id = p_organization_id AND id = p_resource_id;
	ELSE
		RAISE EXCEPTION 'Unsupported deletion resource type' USING ERRCODE = '22023';
	END IF;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Deletion target not found' USING ERRCODE = 'P0002';
	END IF;

	UPDATE public.deletion_requests
	SET status = 'approved',
		reviewed_by = p_reviewer_id,
		reviewed_at = p_reviewed_at,
		denial_reason = NULL
	WHERE organization_id = p_organization_id
		AND id = p_request_id
		AND resource_type = p_resource_type
		AND resource_id = p_resource_id
		AND status = 'pending';

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
	END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_record_deletion_request(uuid, uuid, text, uuid, uuid, timestamptz)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_record_deletion_request(uuid, uuid, text, uuid, uuid, timestamptz)
	TO service_role;

NOTIFY pgrst, 'reload schema';
