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

-- Onboarding: operate starts packets, records progress and changes lifecycle
-- status. Template choice, step shape and removal of active work belong to the
-- configure-only reconcile command. Packets are removed only by retention.
-- Reference checks answer only for Onboarding operators of the Organization.
CREATE OR REPLACE FUNCTION public.onboarding_template_reference_matches(
	p_organization_id uuid, p_template_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT public.can_edit_onboarding(p_organization_id) AND (p_template_id IS NULL OR EXISTS (
		SELECT 1 FROM public.onboarding_templates t
		WHERE t.id = p_template_id AND t.organization_id = p_organization_id
	));
$$;

CREATE OR REPLACE FUNCTION public.onboarding_step_references_match(
	p_organization_id uuid, p_template_step_id uuid, p_training_type_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT public.can_edit_onboarding(p_organization_id) AND (p_template_step_id IS NULL OR EXISTS (
		SELECT 1 FROM public.onboarding_template_steps s
		WHERE s.id = p_template_step_id AND s.organization_id = p_organization_id
	)) AND (p_training_type_id IS NULL OR EXISTS (
		SELECT 1 FROM public.training_types t
		WHERE t.id = p_training_type_id AND t.organization_id = p_organization_id
	));
$$;

DROP POLICY "Onboarding operators can manage scoped workflows" ON public.personnel_onboardings;
DROP POLICY "Onboarding operators can manage scoped progress" ON public.onboarding_step_progress;

CREATE POLICY "Onboarding operators can start scoped workflows"
ON public.personnel_onboardings FOR INSERT TO authenticated
WITH CHECK (
	public.can_edit_onboarding(organization_id)
	AND public.onboarding_personnel_scope_matches(organization_id, personnel_id)
	AND public.onboarding_template_reference_matches(organization_id, template_id)
);

CREATE POLICY "Onboarding operators can update scoped workflows"
ON public.personnel_onboardings FOR UPDATE TO authenticated
USING (
	public.can_edit_onboarding(organization_id)
	AND public.onboarding_personnel_scope_matches(organization_id, personnel_id)
)
WITH CHECK (
	public.can_edit_onboarding(organization_id)
	AND public.onboarding_personnel_scope_matches(organization_id, personnel_id)
	AND public.onboarding_template_reference_matches(organization_id, template_id)
);

CREATE POLICY "Onboarding operators can add scoped progress"
ON public.onboarding_step_progress FOR INSERT TO authenticated
WITH CHECK (
	notes = '[]'::jsonb
	AND public.can_edit_onboarding(organization_id)
	AND public.onboarding_parent_scope_matches(organization_id, onboarding_id)
	AND public.onboarding_step_references_match(organization_id, template_step_id, training_type_id)
);

CREATE POLICY "Onboarding operators can update scoped progress"
ON public.onboarding_step_progress FOR UPDATE TO authenticated
USING (
	public.can_edit_onboarding(organization_id)
	AND public.onboarding_parent_scope_matches(organization_id, onboarding_id)
)
WITH CHECK (
	public.can_edit_onboarding(organization_id)
	AND public.onboarding_parent_scope_matches(organization_id, onboarding_id)
	AND public.onboarding_step_references_match(organization_id, template_step_id, training_type_id)
);

CREATE POLICY "Onboarding operators can remove inactive scoped progress"
ON public.onboarding_step_progress FOR DELETE TO authenticated
USING (
	NOT active
	AND public.can_edit_onboarding(organization_id)
	AND public.onboarding_parent_scope_matches(organization_id, onboarding_id)
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

-- Deletion requests start pending. Requesters cancel through
-- cancel_own_deletion_request, which keeps the request history.
ALTER POLICY "deletion_requests_insert_own" ON "public"."deletion_requests"
	WITH CHECK (
		"requested_by" = (SELECT "auth"."uid"())
		AND "status" = 'pending'
		AND "reviewed_by" IS NULL
		AND "reviewed_at" IS NULL
		AND "denial_reason" IS NULL
		AND "public"."is_org_member"("organization_id")
	);
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
