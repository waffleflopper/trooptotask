-- A feature an Organization turns off is off for every member, owners and
-- admins included. Lane checks read the switch from the Organization row they
-- already read for suspension. Stored member capabilities are untouched, so
-- turning the feature back on restores exactly the access members had.
BEGIN;

CREATE FUNCTION organization_private.lane_feature(p_lane text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT CASE p_lane WHEN 'ratingScheme' THEN 'evaluations' ELSE p_lane END; $$;
ALTER FUNCTION organization_private.lane_feature(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION organization_private.lane_feature(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.organization_access_admitted(p_organization_id uuid, p_feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_suspensions WHERE user_suspensions.user_id = auth.uid()
  ) AND EXISTS (
    SELECT 1 FROM public.organizations AS o
    WHERE o.id = p_organization_id AND o.suspended_at IS NULL
      AND (p_feature IS NULL OR NOT (p_feature = ANY (o.disabled_features)))
  );
$$;
ALTER FUNCTION public.organization_access_admitted(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.organization_access_admitted(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.organization_access_admitted(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT public.organization_access_admitted(p_organization_id, NULL); $$;
ALTER FUNCTION public.organization_access_admitted(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.organization_access_admitted(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.member_access_has_capability(
  p_organization_id uuid, p_lane text, p_required_capability text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships AS m
    WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
      AND (
        m.role IN ('owner', 'admin')
        OR public.member_access_required_capability_rank(
          public.member_access_lane_capability(m.member_preset, m.capability_overrides, p_lane)
        ) >= public.member_access_required_capability_rank(p_required_capability)
      )
  ) AND public.organization_access_admitted(p_organization_id, organization_private.lane_feature(p_lane));
$$;
ALTER FUNCTION public.member_access_has_capability(uuid, text, text) OWNER TO postgres;

CREATE FUNCTION organization_private.feature_is_off(p_organization_id uuid, p_feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations AS o
    WHERE o.id = p_organization_id AND p_feature = ANY (o.disabled_features)
  );
$$;
ALTER FUNCTION organization_private.feature_is_off(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION organization_private.feature_is_off(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION organization_private.feature_is_off(uuid, text) TO service_role;
GRANT USAGE ON SCHEMA organization_private TO service_role;

CREATE FUNCTION public.organization_feature_enabled(p_organization_id uuid, p_feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships AS m
    WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
  ) AND public.organization_access_admitted(p_organization_id, p_feature);
$$;
ALTER FUNCTION public.organization_feature_enabled(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.organization_feature_enabled(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_feature_enabled(uuid, text) TO authenticated;

-- New Data Sheet columns need an explicit SELECT grant.
REVOKE SELECT ON public.personnel_extended_info FROM anon, authenticated;
GRANT SELECT (
  id, organization_id, personnel_id, emergency_contact_name, emergency_contact_relationship,
  emergency_contact_phone, spouse_name, spouse_phone, vehicle_make_model, vehicle_plate,
  vehicle_color, personal_email, personal_phone, address_street, address_city, address_state,
  address_zip, created_at, updated_at, blood_type, basd, date_of_rank,
  marital_status, number_of_dependents, children, civilian_education, military_education,
  marital_status_date, updated_by
) ON public.personnel_extended_info TO authenticated;

-- The Personnel-view branch serves the Dashboard's Onboarding section, which exists only while Onboarding is on.
ALTER POLICY "Onboarding or Personnel readers can view scoped workflows" ON public.personnel_onboardings
USING (
  (
    public.can_view_onboarding(organization_id)
    OR (public.can_view_personnel(organization_id) AND public.organization_feature_enabled(organization_id, 'onboarding'))
  )
  AND onboarding_private.onboarding_personnel_scope_matches(organization_id, personnel_id)
);

ALTER POLICY "Onboarding or Personnel readers can view scoped progress" ON public.onboarding_step_progress
USING (
  (
    public.can_view_onboarding(organization_id)
    OR (public.can_view_personnel(organization_id) AND public.organization_feature_enabled(organization_id, 'onboarding'))
  )
  AND onboarding_private.onboarding_parent_scope_matches(organization_id, onboarding_id)
);

CREATE OR REPLACE FUNCTION public.active_onboarding_calendar_personnel_ids(p_organization_id uuid)
RETURNS TABLE(personnel_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT po.personnel_id
  FROM public.personnel_onboardings po
  WHERE po.organization_id = p_organization_id AND po.status = 'in_progress'
    AND (SELECT public.can_view_calendar(p_organization_id))
    AND (SELECT public.organization_feature_enabled(p_organization_id, 'onboarding'))
    AND onboarding_private.onboarding_personnel_scope_matches(p_organization_id, po.personnel_id)
  ORDER BY po.personnel_id;
$$;

CREATE OR REPLACE FUNCTION public.list_personnel_award_tracking_acknowledged(p_organization_id uuid)
RETURNS TABLE(personnel_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT info.personnel_id
  FROM public.personnel_extended_info info
  JOIN public.personnel p
    ON p.id = info.personnel_id AND p.organization_id = info.organization_id
  WHERE info.organization_id = p_organization_id
    AND info.award_tracking_acknowledged_at IS NOT NULL
    AND (SELECT public.organization_feature_enabled(p_organization_id, 'lossesAndAwards'))
    AND public.can_view_personnel_record(p_organization_id, p.group_id)
  ORDER BY info.personnel_id;
$$;

-- The acknowledgement is the one stored Losses and awards fact, kept in a
-- Personnel row. Every other Data Sheet field stays writable.
CREATE FUNCTION organization_private.require_award_tracking_enabled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (CASE TG_OP
        WHEN 'INSERT' THEN NEW.award_tracking_acknowledged_at IS NOT NULL
        ELSE NEW.award_tracking_acknowledged_at IS DISTINCT FROM OLD.award_tracking_acknowledged_at
      END)
    AND organization_private.feature_is_off(NEW.organization_id, 'lossesAndAwards')
  THEN
    RAISE EXCEPTION 'Losses and awards is turned off for this organization' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_award_tracking_enabled() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER require_award_tracking_enabled
BEFORE INSERT OR UPDATE OF award_tracking_acknowledged_at ON public.personnel_extended_info
FOR EACH ROW EXECUTE FUNCTION organization_private.require_award_tracking_enabled();

-- Approval runs with the service role, so it reads the switch itself. A denied
-- approval leaves the request pending for when the feature is turned back on.
CREATE OR REPLACE FUNCTION public.approve_record_deletion_request(
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
	IF organization_private.feature_is_off(p_organization_id, CASE p_resource_type
		WHEN 'training_type' THEN 'training'
		WHEN 'personnel_training' THEN 'training'
		WHEN 'rating_scheme_entry' THEN 'evaluations'
	END) THEN
		RAISE EXCEPTION 'This feature is turned off for the organization' USING ERRCODE = '42501';
	END IF;

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

-- While Training is off, Onboarding reads no Training completions, so a
-- Training step starts open and is completed by hand like a checkbox.
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
      NOT organization_private.feature_is_off(p_organization_id, 'training') AND s.step_type = 'training' AND s.training_type_id IS NOT NULL AND EXISTS (
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

CREATE FUNCTION onboarding_private.admitted_member_training_is_off(p_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_org_member(p_organization_id)
    AND organization_private.feature_is_off(p_organization_id, 'training');
$$;
ALTER FUNCTION onboarding_private.admitted_member_training_is_off(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION onboarding_private.admitted_member_training_is_off(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION onboarding_private.admitted_member_training_is_off(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION organization_private.require_onboarding_operation_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
	appended jsonb;
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;
	IF TG_TABLE_NAME = 'personnel_onboardings' THEN
		IF NEW.template_id IS DISTINCT FROM OLD.template_id
			AND (NEW.template_id IS NOT NULL
				OR NOT public.member_access_has_capability(NEW.organization_id, 'onboarding', 'configure'))
		THEN
			RAISE EXCEPTION 'Only a configure member clears an onboarding template directly; switching runs through reconciliation' USING ERRCODE = '42501';
		END IF;
		IF NEW.status IS DISTINCT FROM OLD.status THEN
			IF (OLD.status, NEW.status) NOT IN (('in_progress', 'completed'), ('in_progress', 'cancelled'), ('cancelled', 'in_progress')) THEN
				RAISE EXCEPTION 'An onboarding cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '42501';
			END IF;
			IF NEW.status = 'completed' THEN
				IF NEW.completed_at IS NULL THEN
					NEW.completed_at := (now() AT TIME ZONE 'UTC')::date;
				ELSIF NEW.completed_at NOT BETWEEN (now() AT TIME ZONE 'UTC')::date - 1 AND (now() AT TIME ZONE 'UTC')::date + 1 THEN
					RAISE EXCEPTION 'Onboarding completion date must be the current day' USING ERRCODE = '22023';
				END IF;
			ELSE
				NEW.completed_at := NULL;
			END IF;
			NEW.cancelled_at := CASE WHEN NEW.status = 'cancelled' THEN now() END;
		ELSIF (NEW.completed_at, NEW.cancelled_at) IS DISTINCT FROM (OLD.completed_at, OLD.cancelled_at) THEN
			RAISE EXCEPTION 'Onboarding completion and cancellation dates change only with the status' USING ERRCODE = '42501';
		END IF;
		RETURN NEW;
	END IF;

	IF (NEW.completed, NEW.current_stage) IS DISTINCT FROM (OLD.completed, OLD.current_stage)
		AND (CASE NEW.step_type
			WHEN 'checkbox' THEN NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage
			WHEN 'training' THEN NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage
				AND onboarding_private.admitted_member_training_is_off(NEW.organization_id)
			WHEN 'paperwork' THEN jsonb_typeof(NEW.stages) = 'array'
				AND NEW.stages @> jsonb_build_array(NEW.current_stage)
				AND NEW.completed = (NEW.current_stage = NEW.stages ->> -1)
			ELSE false
		END) IS NOT TRUE
	THEN
		RAISE EXCEPTION 'Onboarding progress does not match the % step', NEW.step_type USING ERRCODE = '42501';
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
REVOKE ALL ON FUNCTION organization_private.require_onboarding_operation_rules()
	FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.active_onboarding_calendar_personnel_ids(uuid) OWNER TO postgres;
ALTER FUNCTION public.list_personnel_award_tracking_acknowledged(uuid) OWNER TO postgres;
ALTER FUNCTION organization_private.require_award_tracking_enabled() OWNER TO postgres;
ALTER FUNCTION public.approve_record_deletion_request(uuid, uuid, text, uuid, uuid, timestamptz) OWNER TO postgres;
ALTER FUNCTION public.start_onboarding_packet(uuid, uuid, uuid, date, jsonb) OWNER TO postgres;
ALTER FUNCTION organization_private.require_onboarding_operation_rules() OWNER TO postgres;

COMMIT;
