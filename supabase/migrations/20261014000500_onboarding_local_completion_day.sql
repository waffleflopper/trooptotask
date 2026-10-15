-- A packet's completion day is the member's local day, as its start day already
-- is. The client sends that day, and the database accepts only a day that is
-- current somewhere: UTC-12 to UTC+14 is exactly one UTC day either side, so
-- backdating stays impossible. A missing day is stamped with the UTC day. Every
-- other rule is unchanged from 20261012000600_feature_direct_write_authority.

-- Client updates follow the app's operations. A configure member may only clear
-- a packet's template; switching runs through reconciliation. A packet completes or cancels
-- from in progress and reopens from cancelled. The database dates a cancellation
-- and accepts a completion day current somewhere. A checkbox step toggles, a Paperwork step saves one of its
-- stages and is complete exactly at the last, and Training completion stays
-- with Start and reconciliation. Notes change only by appending one note
-- authored by the caller, as the append command does. The command's server
-- timestamp is not re-verified.
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
