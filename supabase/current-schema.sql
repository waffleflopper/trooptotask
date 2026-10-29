--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: calendar_private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA calendar_private;


ALTER SCHEMA calendar_private OWNER TO postgres;

--
-- Name: member_access_private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA member_access_private;


ALTER SCHEMA member_access_private OWNER TO postgres;

--
-- Name: onboarding_private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA onboarding_private;


ALTER SCHEMA onboarding_private OWNER TO postgres;

--
-- Name: organization_private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA organization_private;


ALTER SCHEMA organization_private OWNER TO postgres;

--
-- Name: personnel_private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA personnel_private;


ALTER SCHEMA personnel_private OWNER TO postgres;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: announcement_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.announcement_type AS ENUM (
    'info',
    'warning',
    'maintenance'
);


ALTER TYPE public.announcement_type OWNER TO postgres;

--
-- Name: ict_validation_method; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ict_validation_method AS ENUM (
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


ALTER TYPE public.ict_validation_method OWNER TO postgres;

--
-- Name: invitation_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.invitation_status AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'declined',
    'expired',
    'blocked'
);


ALTER TYPE public.invitation_status OWNER TO postgres;

--
-- Name: organization_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.organization_role AS ENUM (
    'owner',
    'admin',
    'member'
);


ALTER TYPE public.organization_role OWNER TO postgres;

--
-- Name: calendar_person_in_scope(uuid, uuid); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.calendar_person_in_scope(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel AS p
    WHERE p.organization_id = p_organization_id AND p.id = p_personnel_id
      AND public.calendar_personnel_group_scope_matches(p_organization_id, p.group_id)
  );
$$;


ALTER FUNCTION calendar_private.calendar_person_in_scope(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: can_manage_calendar_events(uuid); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.can_manage_calendar_events(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND public.organization_access_admitted(p_organization_id, 'eventsAndTaskings')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships AS m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;


ALTER FUNCTION calendar_private.can_manage_calendar_events(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_manage_calendar_tasking(uuid, uuid); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.can_manage_calendar_tasking(p_organization_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND public.organization_access_admitted(p_organization_id, 'eventsAndTaskings')
    AND public.calendar_personnel_group_scope_matches(p_organization_id, p_group_id);
$$;


ALTER FUNCTION calendar_private.can_manage_calendar_tasking(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: can_replace_daily_assignment_rows(uuid, date[], jsonb); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.can_replace_daily_assignment_rows(p_organization_id uuid, p_replace_days date[], p_slots jsonb) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND NOT EXISTS (
      SELECT 1
      FROM public.daily_assignments AS existing
      WHERE existing.organization_id = p_organization_id
        AND existing.date = ANY(p_replace_days || ARRAY(
          SELECT slot.date FROM jsonb_to_recordset(p_slots) AS slot(date date, assignment_type_id uuid, assignee_id text)
        ))
        AND (
          existing.date = ANY(p_replace_days)
          OR EXISTS (
            SELECT 1
            FROM jsonb_to_recordset(p_slots) AS slot(date date, assignment_type_id uuid, assignee_id text)
            WHERE slot.date = existing.date
              AND slot.assignment_type_id = existing.assignment_type_id
          )
        )
        AND public.can_edit_daily_assignment_record(
          existing.organization_id, existing.assignment_type_id, existing.assignee_id
        ) IS NOT TRUE
    );
$$;


ALTER FUNCTION calendar_private.can_replace_daily_assignment_rows(p_organization_id uuid, p_replace_days date[], p_slots jsonb) OWNER TO postgres;

--
-- Name: can_view_calendar_events(uuid); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.can_view_calendar_events(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view')
    AND public.organization_access_admitted(p_organization_id, 'eventsAndTaskings');
$$;


ALTER FUNCTION calendar_private.can_view_calendar_events(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_view_calendar_tasking(uuid, uuid); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.can_view_calendar_tasking(p_organization_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT calendar_private.can_view_calendar_events(p_organization_id)
    AND public.calendar_personnel_group_scope_matches(p_organization_id, p_group_id);
$$;


ALTER FUNCTION calendar_private.can_view_calendar_tasking(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: check_availability_tasking(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.check_availability_tasking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Also when unchanged: success on a no-op write would confirm a hidden Tasking's provenance.
  IF NEW.set_for_tasking_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.calendar_taskings t
      WHERE t.organization_id = NEW.organization_id AND t.id = NEW.set_for_tasking_id
        AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)) THEN
      RAISE EXCEPTION 'Tasking is unavailable for this Organization' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION calendar_private.check_availability_tasking() OWNER TO postgres;

--
-- Name: end_roster_swap(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.end_roster_swap() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
    OR OLD.date IS DISTINCT FROM NEW.date OR OLD.assignment_type_id IS DISTINCT FROM NEW.assignment_type_id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    DELETE FROM public.roster_swaps s
    WHERE s.organization_id = OLD.organization_id AND s.assignment_type_id = OLD.assignment_type_id
      AND OLD.date IN (s.first_date, s.second_date);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.end_roster_swap() OWNER TO postgres;

--
-- Name: flag_picks_of_changed_person(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.flag_picks_of_changed_person() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.calendar_tasking_participants AS p SET review_since = pg_catalog.now()
  FROM public.calendar_taskings AS t
  WHERE p.organization_id = NEW.organization_id AND p.personnel_id = NEW.id AND p.review_since IS NULL
    AND t.organization_id = p.organization_id AND t.id = p.tasking_id
    AND t.status NOT IN ('completed', 'cancelled')
    AND (NEW.archived_at IS NOT NULL
      OR (t.responsible_group_id IS NOT NULL AND NOT organization_private.group_within(NEW.organization_id, NEW.group_id, t.responsible_group_id)));
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.flag_picks_of_changed_person() OWNER TO postgres;

--
-- Name: flag_picks_of_changed_tasking(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.flag_picks_of_changed_tasking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.status NOT IN ('completed', 'cancelled') THEN
    UPDATE public.calendar_tasking_participants AS p SET review_since = pg_catalog.now()
    FROM public.personnel AS person
    WHERE p.organization_id = NEW.organization_id AND p.tasking_id = NEW.id AND p.review_since IS NULL
      AND person.organization_id = p.organization_id AND person.id = p.personnel_id
      AND (person.archived_at IS NOT NULL
        OR (NEW.responsible_group_id IS NOT NULL AND NOT organization_private.group_within(NEW.organization_id, person.group_id, NEW.responsible_group_id)));
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.flag_picks_of_changed_tasking() OWNER TO postgres;

--
-- Name: guard_roster_forms(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.guard_roster_forms() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() < 2
    AND pg_catalog.current_setting('trooptotask.roster_close', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'DA 6 forms change only when a form closes' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION calendar_private.guard_roster_forms() OWNER TO postgres;

--
-- Name: guard_roster_rules(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.guard_roster_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF pg_catalog.current_setting('trooptotask.roster_close', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Roster rules change only when the DA 6 form closes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION calendar_private.guard_roster_rules() OWNER TO postgres;

--
-- Name: lock_calendar_tasking_for_list_write(uuid, uuid, boolean); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.lock_calendar_tasking_for_list_write(p_organization_id uuid, p_tasking_id uuid, p_adding boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_status text;
  v_group uuid;
BEGIN
  IF p_adding THEN
    SELECT t.status, t.responsible_group_id INTO v_status, v_group
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
    FOR NO KEY UPDATE;
  ELSE
    SELECT t.status, t.responsible_group_id INTO v_status, v_group
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
    FOR SHARE;
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('open', 'in_progress', 'blocked')
    AND calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) THEN
    RAISE EXCEPTION 'A completed or cancelled tasking cannot change' USING ERRCODE = '55000';
  END IF;
END;
$$;


ALTER FUNCTION calendar_private.lock_calendar_tasking_for_list_write(p_organization_id uuid, p_tasking_id uuid, p_adding boolean) OWNER TO postgres;

--
-- Name: open_roster_form(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.open_roster_form() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_open boolean := EXISTS (
    SELECT 1 FROM public.roster_forms WHERE assignment_type_id = NEW.id AND ends_on IS NULL
  );
BEGIN
  IF NEW.assign_to = 'personnel' AND NOT v_open THEN
    INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, rules)
    VALUES (
      NEW.organization_id, NEW.id,
      COALESCE((SELECT pg_catalog.max(f.ends_on) + 1 FROM public.roster_forms f WHERE f.assignment_type_id = NEW.id),
        (pg_catalog.now() AT TIME ZONE 'UTC')::date),
      pg_catalog.jsonb_build_object('pool', NEW.roster_pool_rules, 'weekendMode', NEW.roster_weekend_mode)
    );
  ELSIF NEW.assign_to = 'group' AND v_open THEN
    RAISE EXCEPTION 'Close the DA 6 form before the type becomes a Group assignment' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.open_roster_form() OWNER TO postgres;

--
-- Name: organization_wide_viewer_organizations(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.organization_wide_viewer_organizations() RETURNS TABLE(organization_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT m.organization_id
  FROM public.organization_memberships m
  WHERE m.user_id = auth.uid()
    AND public.member_access_has_capability(m.organization_id, 'calendar', 'view')
    AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization');
$$;


ALTER FUNCTION calendar_private.organization_wide_viewer_organizations() OWNER TO postgres;

--
-- Name: record_calendar_event_activity(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.record_calendar_event_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendar_event_activity (organization_id, event_id, actor_id, occurred_at, kind)
    VALUES (NEW.organization_id, NEW.id, NEW.created_by, NEW.created_at, 'created');
    RETURN NULL;
  END IF;

  IF (NEW.starts_on, NEW.ends_on) IS DISTINCT FROM (OLD.starts_on, OLD.ends_on) THEN
    INSERT INTO public.calendar_event_activity (organization_id, event_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'dates_changed', pg_catalog.jsonb_build_object(
      'from', pg_catalog.jsonb_build_object('startsOn', OLD.starts_on, 'endsOn', OLD.ends_on),
      'to', pg_catalog.jsonb_build_object('startsOn', NEW.starts_on, 'endsOn', NEW.ends_on)
    ));
  END IF;
  IF (NEW.host_name, NEW.coordinator_user_id) IS DISTINCT FROM (OLD.host_name, OLD.coordinator_user_id) THEN
    INSERT INTO public.calendar_event_activity (organization_id, event_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'coordination_changed', pg_catalog.jsonb_build_object(
      'from', pg_catalog.jsonb_build_object('hostName', OLD.host_name, 'coordinatorUserId', OLD.coordinator_user_id),
      'to', pg_catalog.jsonb_build_object('hostName', NEW.host_name, 'coordinatorUserId', NEW.coordinator_user_id)
    ));
  END IF;
  IF OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL THEN
    INSERT INTO public.calendar_event_activity (organization_id, event_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.cancelled_by, NEW.cancelled_at, 'cancelled',
      pg_catalog.jsonb_build_object('reason', NEW.cancellation_reason));
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.record_calendar_event_activity() OWNER TO postgres;

--
-- Name: record_calendar_tasking_activity(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.record_calendar_tasking_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_kind text;
  v_payload jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind)
    VALUES (NEW.organization_id, NEW.id, NEW.created_by, NEW.created_at, 'created');
    RETURN NULL;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'outcome_changed',
      pg_catalog.jsonb_build_object('from', OLD.title, 'to', NEW.title));
  END IF;
  IF NEW.responsible_group_id IS DISTINCT FROM OLD.responsible_group_id THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'responsibility_changed',
      pg_catalog.jsonb_build_object('from', OLD.responsible_group_id, 'to', NEW.responsible_group_id));
  END IF;
  IF (NEW.suspense_on, NEW.execution_starts_on, NEW.execution_ends_on, NEW.report_time)
    IS DISTINCT FROM (OLD.suspense_on, OLD.execution_starts_on, OLD.execution_ends_on, OLD.report_time)
  THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'dates_changed', pg_catalog.jsonb_build_object(
      'from', pg_catalog.jsonb_build_object('suspenseOn', OLD.suspense_on, 'executionStartsOn', OLD.execution_starts_on,
        'executionEndsOn', OLD.execution_ends_on, 'reportTime', pg_catalog.to_char(OLD.report_time, 'HH24:MI')),
      'to', pg_catalog.jsonb_build_object('suspenseOn', NEW.suspense_on, 'executionStartsOn', NEW.execution_starts_on,
        'executionEndsOn', NEW.execution_ends_on, 'reportTime', pg_catalog.to_char(NEW.report_time, 'HH24:MI'))
    ));
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    IF OLD.event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.calendar_events AS e
      WHERE e.organization_id = OLD.organization_id AND e.id = OLD.event_id
    ) THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'unlinked',
        pg_catalog.jsonb_build_object('eventId', OLD.event_id));
    END IF;
    IF NEW.event_id IS NOT NULL THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'linked',
        pg_catalog.jsonb_build_object('eventId', NEW.event_id));
    END IF;
  END IF;
  IF (NEW.staffing_required, NEW.qualifications) IS DISTINCT FROM (OLD.staffing_required, OLD.qualifications) THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'requirement_changed', pg_catalog.jsonb_build_object(
      'from', pg_catalog.jsonb_build_object('count', OLD.staffing_required, 'qualifications', OLD.qualifications),
      'to', pg_catalog.jsonb_build_object('count', NEW.staffing_required, 'qualifications', NEW.qualifications)
    ));
  END IF;
  IF NEW.instructions IS DISTINCT FROM OLD.instructions THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, 'instructions_changed');
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_kind := CASE
      WHEN NEW.status = 'blocked' THEN 'blocked'
      WHEN NEW.status = 'completed' THEN 'completed'
      WHEN NEW.status = 'cancelled' THEN 'cancelled'
      WHEN OLD.status = 'open' THEN 'started'
      WHEN OLD.status = 'blocked' THEN 'unblocked'
      ELSE 'reopened'
    END;
    v_payload := CASE v_kind
      WHEN 'blocked' THEN pg_catalog.jsonb_build_object('reason', NEW.block_reason)
      WHEN 'completed' THEN pg_catalog.jsonb_build_object('note', NEW.completion_note)
      WHEN 'cancelled' THEN pg_catalog.jsonb_build_object('reason', NEW.cancellation_reason)
      ELSE '{}'::jsonb
    END;
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.id, NEW.updated_by, NEW.updated_at, v_kind, v_payload);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.record_calendar_tasking_activity() OWNER TO postgres;

--
-- Name: record_calendar_tasking_checklist_activity(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.record_calendar_tasking_checklist_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.tasking_id, NEW.created_by, NEW.created_at, 'checklist_added',
      pg_catalog.jsonb_build_object('label', NEW.label));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    SELECT OLD.organization_id, OLD.tasking_id, auth.uid(), pg_catalog.now(), 'checklist_removed',
      pg_catalog.jsonb_build_object('label', OLD.label)
    WHERE EXISTS (
      SELECT 1 FROM public.calendar_taskings AS t WHERE t.organization_id = OLD.organization_id AND t.id = OLD.tasking_id
    );
  ELSE
    IF NEW.label IS DISTINCT FROM OLD.label THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.tasking_id, NEW.updated_by, NEW.updated_at, 'checklist_renamed',
        pg_catalog.jsonb_build_object('from', OLD.label, 'to', NEW.label));
    END IF;
    IF NEW.done IS DISTINCT FROM OLD.done THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.tasking_id, NEW.updated_by, NEW.updated_at,
        CASE WHEN NEW.done THEN 'checklist_completed' ELSE 'checklist_reopened' END,
        pg_catalog.jsonb_build_object('label', NEW.label));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.record_calendar_tasking_checklist_activity() OWNER TO postgres;

--
-- Name: record_calendar_tasking_equipment_activity(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.record_calendar_tasking_equipment_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (NEW.organization_id, NEW.tasking_id, NEW.created_by, NEW.created_at, 'equipment_added',
      pg_catalog.jsonb_build_object('name', NEW.name, 'quantity', NEW.quantity, 'securedQuantity', NEW.secured_quantity));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    SELECT OLD.organization_id, OLD.tasking_id, auth.uid(), pg_catalog.now(), 'equipment_removed',
      pg_catalog.jsonb_build_object('name', OLD.name, 'quantity', OLD.quantity, 'securedQuantity', OLD.secured_quantity)
    WHERE EXISTS (
      SELECT 1 FROM public.calendar_taskings AS t WHERE t.organization_id = OLD.organization_id AND t.id = OLD.tasking_id
    );
  ELSE
    IF (NEW.name, NEW.quantity) IS DISTINCT FROM (OLD.name, OLD.quantity) THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.tasking_id, NEW.updated_by, NEW.updated_at, 'equipment_changed',
        pg_catalog.jsonb_build_object(
          'from', pg_catalog.jsonb_build_object('name', OLD.name, 'quantity', OLD.quantity),
          'to', pg_catalog.jsonb_build_object('name', NEW.name, 'quantity', NEW.quantity)
        ));
    END IF;
    IF NEW.secured_quantity IS DISTINCT FROM OLD.secured_quantity THEN
      INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
      VALUES (NEW.organization_id, NEW.tasking_id, NEW.updated_by, NEW.updated_at, 'equipment_secured',
        pg_catalog.jsonb_build_object(
          'name', NEW.name, 'quantity', NEW.quantity, 'from', OLD.secured_quantity, 'to', NEW.secured_quantity
        ));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.record_calendar_tasking_equipment_activity() OWNER TO postgres;

--
-- Name: record_deleted_calendar_event(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.record_deleted_calendar_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, kind, payload)
  SELECT t.organization_id, t.id, auth.uid(), 'event_deleted',
    pg_catalog.jsonb_build_object('eventId', OLD.id, 'eventTitle', OLD.title)
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = OLD.organization_id AND t.event_id = OLD.id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION calendar_private.record_deleted_calendar_event() OWNER TO postgres;

--
-- Name: record_tasking_equipment_return(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.record_tasking_equipment_return() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.returned_quantity IS DISTINCT FROM OLD.returned_quantity THEN
    INSERT INTO public.calendar_tasking_activity(organization_id, tasking_id, actor_id, kind, payload)
    VALUES(NEW.organization_id, NEW.tasking_id, NEW.updated_by, 'equipment_returned',
      pg_catalog.jsonb_build_object('name', NEW.name, 'quantity', NEW.quantity,
        'from', OLD.returned_quantity, 'to', NEW.returned_quantity));
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION calendar_private.record_tasking_equipment_return() OWNER TO postgres;

--
-- Name: require_roster_swap_access(uuid, date); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.require_roster_swap_access(p_organization_id uuid, p_today date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
    OR NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    ) THEN
    RAISE EXCEPTION 'Duty swaps need Organization-wide Calendar operation access' USING ERRCODE = '42501';
  END IF;
  IF p_today IS NULL OR pg_catalog.abs(p_today - (pg_catalog.now() AT TIME ZONE 'UTC')::date) > 1 THEN
    RAISE EXCEPTION 'The date on this device is off' USING ERRCODE = 'RSD01';
  END IF;
END;
$$;


ALTER FUNCTION calendar_private.require_roster_swap_access(p_organization_id uuid, p_today date) OWNER TO postgres;

--
-- Name: review_picks_after_group_move(uuid, uuid); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.review_picks_after_group_move(p_organization_id uuid, p_group_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  UPDATE public.calendar_tasking_participants p SET review_since = pg_catalog.now()
  FROM public.calendar_taskings t, public.personnel person
  WHERE p.organization_id = p_organization_id AND p.review_since IS NULL
    AND t.organization_id = p.organization_id AND t.id = p.tasking_id
    AND t.status NOT IN ('completed', 'cancelled')
    AND person.organization_id = p.organization_id AND person.id = p.personnel_id
    AND person.group_id = p_group_id
    AND NOT organization_private.group_within(p_organization_id, person.group_id, t.responsible_group_id);
$$;


ALTER FUNCTION calendar_private.review_picks_after_group_move(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: stamp_calendar_event(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.stamp_calendar_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := pg_catalog.now();
    NEW.created_by := auth.uid();
    NEW.cancelled_at := NULL;
    NEW.cancelled_by := NULL;
    NEW.cancellation_reason := NULL;
  ELSE
    IF OLD.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'A cancelled event cannot change' USING ERRCODE = '55000';
    END IF;
    NEW.id := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    IF NEW.cancelled_at IS NOT NULL THEN
      NEW.cancelled_at := pg_catalog.now();
      NEW.cancelled_by := auth.uid();
    END IF;
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();

  -- Only an authorized writer learns whether someone is a member; RLS refuses everyone else.
  IF (TG_OP = 'INSERT' OR NEW.coordinator_user_id IS DISTINCT FROM OLD.coordinator_user_id)
    AND calendar_private.can_manage_calendar_events(NEW.organization_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships AS m
      WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.coordinator_user_id
    )
  THEN
    RAISE EXCEPTION 'The coordinator must be a member of this organization' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION calendar_private.stamp_calendar_event() OWNER TO postgres;

--
-- Name: stamp_calendar_tasking(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.stamp_calendar_tasking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := pg_catalog.now();
    NEW.created_by := auth.uid();
    NEW.status := 'open';
    NEW.block_reason := NULL;
    NEW.blocked_at := NULL;
    NEW.blocked_by := NULL;
    NEW.completion_note := NULL;
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
    NEW.cancellation_reason := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancelled_by := NULL;
  ELSE
    IF OLD.status IN ('completed', 'cancelled') AND NEW.status = OLD.status
      AND NOT (
        OLD.event_id IS NOT NULL AND NEW.event_id IS NULL
        AND pg_catalog.to_jsonb(NEW) - 'event_id' = pg_catalog.to_jsonb(OLD) - 'event_id'
        AND NOT EXISTS (
          SELECT 1 FROM public.calendar_events AS e
          WHERE e.organization_id = OLD.organization_id AND e.id = OLD.event_id
        )
      ) THEN
      RAISE EXCEPTION 'A completed or cancelled tasking cannot change' USING ERRCODE = '55000';
    END IF;
    IF NEW.responsible_group_id IS DISTINCT FROM OLD.responsible_group_id
      AND NOT calendar_private.can_manage_calendar_tasking(NEW.organization_id, NULL)
    THEN
      RAISE EXCEPTION 'Only Organization-wide Calendar operators change responsibility' USING ERRCODE = '42501';
    END IF;
    NEW.id := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


ALTER FUNCTION calendar_private.stamp_calendar_tasking() OWNER TO postgres;

--
-- Name: stamp_calendar_tasking_checklist_item(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.stamp_calendar_tasking_checklist_item() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
  v_last integer;
BEGIN
  PERFORM calendar_private.lock_calendar_tasking_for_list_write(NEW.organization_id, NEW.tasking_id, TG_OP = 'INSERT');
  IF TG_OP = 'INSERT' THEN
    SELECT pg_catalog.count(*), pg_catalog.max(position) INTO v_count, v_last
    FROM public.calendar_tasking_checklist_items
    WHERE organization_id = NEW.organization_id AND tasking_id = NEW.tasking_id;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'A tasking holds up to 100 checklist items' USING ERRCODE = '54000';
    END IF;
    NEW.position := COALESCE(v_last, 0) + 1;
    NEW.done := false;
    NEW.done_at := NULL;
    NEW.done_by := NULL;
    NEW.created_at := pg_catalog.now();
    NEW.created_by := auth.uid();
  ELSE
    NEW.id := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.tasking_id := OLD.tasking_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    IF NEW.done AND NOT OLD.done THEN
      NEW.done_at := pg_catalog.now();
      NEW.done_by := auth.uid();
    ELSIF NOT NEW.done THEN
      NEW.done_at := NULL;
      NEW.done_by := NULL;
    ELSE
      NEW.done_at := OLD.done_at;
      NEW.done_by := OLD.done_by;
    END IF;
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


ALTER FUNCTION calendar_private.stamp_calendar_tasking_checklist_item() OWNER TO postgres;

--
-- Name: stamp_calendar_tasking_equipment(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.stamp_calendar_tasking_equipment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
  v_last integer;
  v_status text;
  v_group uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.returned_quantity IS DISTINCT FROM OLD.returned_quantity
    AND (NEW.name, NEW.quantity, NEW.secured_quantity, NEW.position)
      IS NOT DISTINCT FROM (OLD.name, OLD.quantity, OLD.secured_quantity, OLD.position) THEN
    SELECT t.status, t.responsible_group_id INTO v_status, v_group
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = NEW.organization_id AND t.id = NEW.tasking_id
    FOR SHARE;
    IF v_status = 'cancelled' AND calendar_private.can_manage_calendar_tasking(NEW.organization_id, v_group) THEN
      RAISE EXCEPTION 'A completed or cancelled tasking cannot change' USING ERRCODE = '55000';
    END IF;
  ELSE
    PERFORM calendar_private.lock_calendar_tasking_for_list_write(NEW.organization_id, NEW.tasking_id, TG_OP = 'INSERT');
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT pg_catalog.count(*), pg_catalog.max(position) INTO v_count, v_last
    FROM public.calendar_tasking_equipment
    WHERE organization_id = NEW.organization_id AND tasking_id = NEW.tasking_id;
    IF v_count >= 100 THEN
      RAISE EXCEPTION 'A tasking holds up to 100 equipment requirements' USING ERRCODE = '54000';
    END IF;
    NEW.position := COALESCE(v_last, 0) + 1;
    NEW.created_at := pg_catalog.now();
    NEW.created_by := auth.uid();
  ELSE
    NEW.id := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.tasking_id := OLD.tasking_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


ALTER FUNCTION calendar_private.stamp_calendar_tasking_equipment() OWNER TO postgres;

--
-- Name: stamp_daily_assignment_source(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.stamp_daily_assignment_source() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
    OR pg_catalog.current_setting('calendar.roster_write', true) IS DISTINCT FROM 'on'
  THEN
    NEW.source := 'manual';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION calendar_private.stamp_daily_assignment_source() OWNER TO postgres;

--
-- Name: tasking_conflicts(uuid); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.tasking_conflicts(p_organization_id uuid) RETURNS TABLE(tasking_id uuid, personnel_id uuid, availability_id uuid, label text, starts_on date, ends_on date, overlap_days integer, execution_days integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT t.id, p.personnel_id, a.id, s.name, a.start_date, a.end_date,
    least(a.end_date, t.execution_ends_on) - greatest(a.start_date, t.execution_starts_on) + 1,
    t.execution_ends_on - t.execution_starts_on + 1
  FROM public.calendar_taskings t
  JOIN public.calendar_tasking_participants p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
    AND p.review_since IS NULL
  JOIN public.personnel person ON person.organization_id = p.organization_id AND person.id = p.personnel_id
    AND person.archived_at IS NULL
  JOIN public.availability_entries a ON a.organization_id = p.organization_id AND a.personnel_id = p.personnel_id
    AND a.start_date <= t.execution_ends_on AND a.end_date >= t.execution_starts_on
    AND a.set_for_tasking_id IS DISTINCT FROM t.id
  JOIN public.status_types s ON s.organization_id = a.organization_id AND s.id = a.status_type_id
    AND s.roster_effect <> 'available'
  WHERE t.organization_id = p_organization_id AND t.status IN ('open', 'in_progress', 'blocked');
$$;


ALTER FUNCTION calendar_private.tasking_conflicts(p_organization_id uuid) OWNER TO postgres;

--
-- Name: viewable_assignees(); Type: FUNCTION; Schema: calendar_private; Owner: postgres
--

CREATE FUNCTION calendar_private.viewable_assignees() RETURNS TABLE(organization_id uuid, assignment_type_id uuid, assignee_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT t.organization_id, t.id, v.personnel_id::text
  FROM member_access_private.viewable_personnel('calendar') v
  JOIN public.assignment_types t ON t.organization_id = v.organization_id AND t.assign_to = 'personnel'
  UNION ALL
  SELECT t.organization_id, t.id, g.id::text
  FROM public.organization_memberships m
  JOIN public.groups g ON g.organization_id = m.organization_id
  JOIN public.assignment_types t ON t.organization_id = m.organization_id AND t.assign_to = 'group'
  WHERE m.user_id = auth.uid()
    AND public.member_access_has_capability(m.organization_id, 'calendar', 'view')
    AND (
      m.role IN ('owner', 'admin')
      OR m.access_scope_kind = 'organization'
      OR (m.access_scope_kind = 'groups' AND g.path && m.access_scope_group_ids)
    );
$$;


ALTER FUNCTION calendar_private.viewable_assignees() OWNER TO postgres;

--
-- Name: viewable_personnel(text); Type: FUNCTION; Schema: member_access_private; Owner: postgres
--

CREATE FUNCTION member_access_private.viewable_personnel(p_lane text) RETURNS TABLE(organization_id uuid, personnel_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.organization_id, p.id
  FROM public.organization_memberships m
  JOIN public.personnel p ON p.organization_id = m.organization_id
  LEFT JOIN public.groups g ON g.organization_id = p.organization_id AND g.id = p.group_id
  WHERE m.user_id = auth.uid()
    AND public.member_access_has_capability(m.organization_id, p_lane, 'view')
    AND (
      m.role IN ('owner', 'admin')
      OR m.access_scope_kind = 'organization'
      OR (m.access_scope_kind = 'groups' AND g.path && m.access_scope_group_ids)
    );
$$;


ALTER FUNCTION member_access_private.viewable_personnel(p_lane text) OWNER TO postgres;

--
-- Name: admit_template_command(uuid); Type: FUNCTION; Schema: onboarding_private; Owner: postgres
--

CREATE FUNCTION onboarding_private.admit_template_command(p_organization_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Onboarding template changes require READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  PERFORM onboarding_private.require_template_configuration(p_organization_id);
END;
$$;


ALTER FUNCTION onboarding_private.admit_template_command(p_organization_id uuid) OWNER TO postgres;

--
-- Name: admitted_member_training_is_off(uuid); Type: FUNCTION; Schema: onboarding_private; Owner: postgres
--

CREATE FUNCTION onboarding_private.admitted_member_training_is_off(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.is_org_member(p_organization_id)
    AND public.feature_is_off(p_organization_id, 'training');
$$;


ALTER FUNCTION onboarding_private.admitted_member_training_is_off(p_organization_id uuid) OWNER TO postgres;

--
-- Name: onboarding_parent_scope_matches(uuid, uuid); Type: FUNCTION; Schema: onboarding_private; Owner: postgres
--

CREATE FUNCTION onboarding_private.onboarding_parent_scope_matches(p_organization_id uuid, p_onboarding_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel_onboardings po
    WHERE po.id = p_onboarding_id AND po.organization_id = p_organization_id
      AND onboarding_private.onboarding_personnel_scope_matches(p_organization_id, po.personnel_id)
  );
$$;


ALTER FUNCTION onboarding_private.onboarding_parent_scope_matches(p_organization_id uuid, p_onboarding_id uuid) OWNER TO postgres;

--
-- Name: onboarding_personnel_scope_matches(uuid, uuid); Type: FUNCTION; Schema: onboarding_private; Owner: postgres
--

CREATE FUNCTION onboarding_private.onboarding_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION onboarding_private.onboarding_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: onboarding_step_references_match(uuid, uuid, uuid); Type: FUNCTION; Schema: onboarding_private; Owner: postgres
--

CREATE FUNCTION onboarding_private.onboarding_step_references_match(p_organization_id uuid, p_template_step_id uuid, p_training_type_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT "public"."is_org_member"("p_organization_id") AND ("p_template_step_id" IS NULL OR EXISTS (
		SELECT 1 FROM "public"."onboarding_template_steps" "s"
		WHERE "s"."id" = "p_template_step_id" AND "s"."organization_id" = "p_organization_id"
	)) AND ("p_training_type_id" IS NULL OR EXISTS (
		SELECT 1 FROM "public"."training_types" "t"
		WHERE "t"."id" = "p_training_type_id" AND "t"."organization_id" = "p_organization_id"
	));
$$;


ALTER FUNCTION onboarding_private.onboarding_step_references_match(p_organization_id uuid, p_template_step_id uuid, p_training_type_id uuid) OWNER TO postgres;

--
-- Name: onboarding_template_reference_matches(uuid, uuid); Type: FUNCTION; Schema: onboarding_private; Owner: postgres
--

CREATE FUNCTION onboarding_private.onboarding_template_reference_matches(p_organization_id uuid, p_template_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT "public"."is_org_member"("p_organization_id") AND ("p_template_id" IS NULL OR EXISTS (
		SELECT 1 FROM "public"."onboarding_templates" "t"
		WHERE "t"."id" = "p_template_id" AND "t"."organization_id" = "p_organization_id"
	));
$$;


ALTER FUNCTION onboarding_private.onboarding_template_reference_matches(p_organization_id uuid, p_template_id uuid) OWNER TO postgres;

--
-- Name: require_template_configuration(uuid); Type: FUNCTION; Schema: onboarding_private; Owner: postgres
--

CREATE FUNCTION onboarding_private.require_template_configuration(p_organization_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF public.can_manage_onboarding_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION onboarding_private.require_template_configuration(p_organization_id uuid) OWNER TO postgres;

--
-- Name: touch_step_progress_changed_at(); Type: FUNCTION; Schema: onboarding_private; Owner: postgres
--

CREATE FUNCTION onboarding_private.touch_step_progress_changed_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
	IF (NEW.completed, NEW.current_stage) IS DISTINCT FROM (OLD.completed, OLD.current_stage) THEN
		NEW.progress_changed_at := now();
	END IF;
	RETURN NEW;
END;
$$;


ALTER FUNCTION onboarding_private.touch_step_progress_changed_at() OWNER TO postgres;

--
-- Name: apply_artifact_file_changes(text, text[], text[]); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.apply_artifact_file_changes(p_kind text, p_attached text[], p_detached text[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_bucket text := organization_private.artifact_bucket(p_kind);
  v_key record;
BEGIN
  FOR v_key IN
    SELECT file_path, bool_or(attach) AS attach, organization_private.file_key_lock(v_bucket, file_path) AS lock_id
    FROM (
      SELECT pg_catalog.unnest(p_attached) AS file_path, true AS attach
      UNION ALL
      SELECT pg_catalog.unnest(p_detached), false
    ) AS changed
    WHERE file_path IS NOT NULL
    GROUP BY file_path
    ORDER BY lock_id, file_path
  LOOP
    IF v_key.attach THEN
      PERFORM organization_private.lock_file_key(v_bucket, v_key.file_path);
      IF organization_private.file_key_retired(v_bucket, v_key.file_path) THEN
        RAISE EXCEPTION 'This stored file was deleted and cannot be attached' USING ERRCODE = '23514';
      END IF;
    ELSE
      PERFORM organization_private.retire_unreferenced_file(p_kind, v_key.file_path);
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION organization_private.apply_artifact_file_changes(p_kind text, p_attached text[], p_detached text[]) OWNER TO postgres;

--
-- Name: archive_locked_personnel(uuid, uuid[], timestamp with time zone); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.archive_locked_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.personnel AS person SET archived_at = p_archived_at
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND person.archived_at IS NULL;

  UPDATE public.personnel_follow_ups AS child SET archived_at = person.archived_at, status = 'archived'
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND child.organization_id = person.organization_id AND child.personnel_id = person.id
    AND child.archived_at IS NULL AND child.status = 'open';
  UPDATE public.counseling_records AS child SET archived_at = person.archived_at
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND child.organization_id = person.organization_id AND child.personnel_id = person.id
    AND child.archived_at IS NULL;
  UPDATE public.personnel_documents AS child SET archived_at = person.archived_at
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND child.organization_id = person.organization_id AND child.personnel_id = person.id
    AND child.archived_at IS NULL;
  UPDATE public.leader_notes AS child SET archived_at = person.archived_at
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND child.organization_id = person.organization_id AND child.personnel_id = person.id
    AND child.archived_at IS NULL;
END;
$$;


ALTER FUNCTION organization_private.archive_locked_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone) OWNER TO postgres;

--
-- Name: artifact_bucket(text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.artifact_bucket(p_kind text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE p_kind
    WHEN 'counseling' THEN 'counseling-files'
    WHEN 'document' THEN 'personnel-documents'
    WHEN 'roster' THEN 'counseling-files'
    WHEN 'certificate' THEN 'training-certificates'
  END;
$$;


ALTER FUNCTION organization_private.artifact_bucket(p_kind text) OWNER TO postgres;

--
-- Name: artifact_file_deletion(uuid, uuid, text, uuid); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.artifact_file_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid) RETURNS TABLE(bucket_id text, object_name text, file_removed boolean)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT retirement.bucket_id, retirement.object_name, retirement.object_name IS NULL
  FROM organization_private.file_artifact_deletions AS deletion
  LEFT JOIN organization_private.file_retirements AS retirement ON retirement.key_digest = deletion.retired_key_digest
  WHERE deletion.artifact_kind = p_kind AND deletion.artifact_id = p_artifact_id
    AND deletion.organization_id = p_organization_id AND deletion.personnel_id = p_personnel_id;
$$;


ALTER FUNCTION organization_private.artifact_file_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid) OWNER TO postgres;

--
-- Name: artifact_file_owned(text, uuid, uuid, text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.artifact_file_owned(p_kind text, p_organization_id uuid, p_personnel_id uuid, p_path text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT p_path IS NOT NULL AND p_organization_id IS NOT NULL AND p_personnel_id IS NOT NULL
    AND pg_catalog.left(p_path, pg_catalog.length(prefix)) = prefix
    AND pg_catalog.length(p_path) > pg_catalog.length(prefix)
    AND NOT ('..' = ANY (pg_catalog.string_to_array(p_path, '/')))
    AND NOT ('.' = ANY (pg_catalog.string_to_array(p_path, '/')))
  FROM (SELECT CASE p_kind
    WHEN 'counseling' THEN p_organization_id::text || '/counseling-records/' || p_personnel_id::text || '/'
    WHEN 'document' THEN p_organization_id::text || '/personnel/' || p_personnel_id::text || '/documents/'
    WHEN 'roster' THEN p_organization_id::text || '/sign-in-rosters/' || p_personnel_id::text || '/'
    WHEN 'certificate' THEN
      p_organization_id::text || '/personnel/' || p_personnel_id::text || '/training-certificates/'
  END AS prefix) AS owned;
$$;


ALTER FUNCTION organization_private.artifact_file_owned(p_kind text, p_organization_id uuid, p_personnel_id uuid, p_path text) OWNER TO postgres;

--
-- Name: artifact_file_referenced(text, text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.artifact_file_referenced(p_kind text, p_path text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
  CASE p_kind
    WHEN 'counseling', 'roster' THEN
      RETURN EXISTS (SELECT 1 FROM public.counseling_records WHERE file_path = p_path)
        OR EXISTS (SELECT 1 FROM public.sign_in_rosters WHERE signed_file_path = p_path);
    WHEN 'document' THEN
      RETURN EXISTS (SELECT 1 FROM public.personnel_documents WHERE file_path = p_path);
    WHEN 'certificate' THEN
      RETURN EXISTS (SELECT 1 FROM public.personnel_trainings WHERE certificate_url = p_path)
        OR EXISTS (SELECT 1 FROM public.personnel_training_history WHERE certificate_url = p_path);
    ELSE
      RAISE EXCEPTION 'Unknown stored file kind' USING ERRCODE = '22023';
  END CASE;
END;
$$;


ALTER FUNCTION organization_private.artifact_file_referenced(p_kind text, p_path text) OWNER TO postgres;

--
-- Name: cascade_group_path(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.cascade_group_path() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.groups SET parent_id = parent_id
  WHERE organization_id = NEW.organization_id AND parent_id = NEW.id;
  PERFORM calendar_private.review_picks_after_group_move(NEW.organization_id, NEW.id);
  IF NEW.parent_id IS NOT NULL THEN
    DELETE FROM public.user_pinned_groups WHERE organization_id = NEW.organization_id AND group_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.cascade_group_path() OWNER TO postgres;

--
-- Name: fence_inserted_artifact_files(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.fence_inserted_artifact_files() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_kind text := CASE TG_TABLE_NAME WHEN 'counseling_records' THEN 'counseling' ELSE 'document' END;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Stored file changes require read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF EXISTS (SELECT 1 FROM new_rows JOIN organization_private.file_artifact_deletions AS deletion
      ON deletion.artifact_kind = v_kind AND deletion.artifact_id = new_rows.id)
  THEN
    RAISE EXCEPTION 'A deleted Personnel file record id cannot be reused' USING ERRCODE = '23505';
  END IF;
  PERFORM organization_private.apply_artifact_file_changes(v_kind, ARRAY(SELECT file_path FROM new_rows), '{}');
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.fence_inserted_artifact_files() OWNER TO postgres;

--
-- Name: fence_inserted_roster_scans(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.fence_inserted_roster_scans() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM organization_private.apply_artifact_file_changes(
    'roster', ARRAY(SELECT signed_file_path FROM new_rows), '{}');
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.fence_inserted_roster_scans() OWNER TO postgres;

--
-- Name: fence_training_certificates(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.fence_training_certificates() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM organization_private.apply_artifact_file_changes('certificate',
      ARRAY(SELECT certificate_url FROM new_rows
        WHERE organization_private.artifact_file_owned('certificate', organization_id, personnel_id, certificate_url)),
      '{}');
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM organization_private.apply_artifact_file_changes('certificate',
      ARRAY(SELECT after_row.certificate_url FROM new_rows AS after_row
        JOIN old_rows AS before_row ON before_row.id = after_row.id
        WHERE after_row.certificate_url IS DISTINCT FROM before_row.certificate_url
          AND organization_private.artifact_file_owned('certificate',
            after_row.organization_id, after_row.personnel_id, after_row.certificate_url)),
      ARRAY(SELECT before_row.certificate_url FROM new_rows AS after_row
        JOIN old_rows AS before_row ON before_row.id = after_row.id
        WHERE after_row.certificate_url IS DISTINCT FROM before_row.certificate_url
          AND organization_private.artifact_file_owned('certificate',
            before_row.organization_id, before_row.personnel_id, before_row.certificate_url)));
  ELSE
    PERFORM organization_private.apply_artifact_file_changes('certificate', '{}',
      ARRAY(SELECT certificate_url FROM old_rows
        WHERE organization_private.artifact_file_owned('certificate', organization_id, personnel_id, certificate_url)));
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.fence_training_certificates() OWNER TO postgres;

--
-- Name: fence_updated_artifact_files(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.fence_updated_artifact_files() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_kind text := CASE TG_TABLE_NAME WHEN 'counseling_records' THEN 'counseling' ELSE 'document' END;
BEGIN
  PERFORM organization_private.apply_artifact_file_changes(
    v_kind,
    ARRAY(SELECT after_row.file_path FROM new_rows AS after_row JOIN old_rows AS before_row ON before_row.id = after_row.id
      WHERE after_row.file_path IS DISTINCT FROM before_row.file_path),
    ARRAY(SELECT before_row.file_path FROM new_rows AS after_row JOIN old_rows AS before_row ON before_row.id = after_row.id
      WHERE after_row.file_path IS DISTINCT FROM before_row.file_path
        AND organization_private.artifact_file_owned(v_kind, before_row.organization_id, before_row.personnel_id, before_row.file_path)));
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.fence_updated_artifact_files() OWNER TO postgres;

--
-- Name: fence_updated_roster_scans(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.fence_updated_roster_scans() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM organization_private.apply_artifact_file_changes(
    'roster',
    ARRAY(SELECT after_row.signed_file_path FROM new_rows AS after_row JOIN old_rows AS before_row ON before_row.id = after_row.id
      WHERE after_row.signed_file_path IS DISTINCT FROM before_row.signed_file_path),
    ARRAY(SELECT before_row.signed_file_path FROM new_rows AS after_row JOIN old_rows AS before_row ON before_row.id = after_row.id
      WHERE after_row.signed_file_path IS DISTINCT FROM before_row.signed_file_path
        AND organization_private.artifact_file_owned('roster', before_row.organization_id, before_row.id, before_row.signed_file_path)));
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.fence_updated_roster_scans() OWNER TO postgres;

--
-- Name: file_key_digest(text, text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.file_key_digest(p_bucket_id text, p_object_name text) RETURNS bytea
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT pg_catalog.sha256(pg_catalog.convert_to(p_bucket_id || '/' || p_object_name, 'UTF8'));
$$;


ALTER FUNCTION organization_private.file_key_digest(p_bucket_id text, p_object_name text) OWNER TO postgres;

--
-- Name: file_key_lock(text, text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.file_key_lock(p_bucket_id text, p_object_name text) RETURNS bigint
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT pg_catalog.hashtextextended('organization-file-key:' || p_bucket_id || '/' || p_object_name, 0);
$$;


ALTER FUNCTION organization_private.file_key_lock(p_bucket_id text, p_object_name text) OWNER TO postgres;

--
-- Name: file_key_retired(text, text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.file_key_retired(p_bucket_id text, p_object_name text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM organization_private.file_retirements
    WHERE key_digest = organization_private.file_key_digest(p_bucket_id, p_object_name));
$$;


ALTER FUNCTION organization_private.file_key_retired(p_bucket_id text, p_object_name text) OWNER TO postgres;

--
-- Name: group_within(uuid, uuid, uuid); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.group_within(p_organization_id uuid, p_group_id uuid, p_ancestor_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT p_ancestor_id IS NULL OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.organization_id = p_organization_id AND g.id = p_group_id AND p_ancestor_id = ANY(g.path)
  );
$$;


ALTER FUNCTION organization_private.group_within(p_organization_id uuid, p_group_id uuid, p_ancestor_id uuid) OWNER TO postgres;

--
-- Name: guard_sign_in_roster(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.guard_sign_in_roster() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)
  THEN
    RAISE EXCEPTION 'A roster cannot change identity' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND (current_user IN ('authenticated', 'anon') OR auth.role() IN ('authenticated', 'anon')) THEN
    NEW.id := pg_catalog.gen_random_uuid();
  END IF;
  IF current_user IN ('authenticated', 'anon')
    AND NEW.signed_file_path IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.signed_file_path END)
  THEN
    RAISE EXCEPTION 'Signed scans change only through roster scan commands' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.guard_sign_in_roster() OWNER TO postgres;

--
-- Name: keep_artifact_identity(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.keep_artifact_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Personnel file record identity cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.keep_artifact_identity() OWNER TO postgres;

--
-- Name: lane_feature(text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.lane_feature(p_lane text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT CASE p_lane WHEN 'ratingScheme' THEN 'evaluations' ELSE p_lane END; $$;


ALTER FUNCTION organization_private.lane_feature(p_lane text) OWNER TO postgres;

--
-- Name: lock_file_key(text, text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.lock_file_key(p_bucket_id text, p_object_name text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Stored file changes require read committed isolation' USING ERRCODE = '25000';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(organization_private.file_key_lock(p_bucket_id, p_object_name));
END;
$$;


ALTER FUNCTION organization_private.lock_file_key(p_bucket_id text, p_object_name text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: sign_in_rosters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sign_in_rosters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    roster_date date,
    blank_date boolean DEFAULT false NOT NULL,
    separate_by_group boolean DEFAULT false NOT NULL,
    sort_by text DEFAULT 'alphabetical'::text NOT NULL,
    personnel_snapshot jsonb NOT NULL,
    filter_config jsonb,
    signed_file_path text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    personnel_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    scope_group_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    CONSTRAINT sign_in_rosters_sort_by_check CHECK ((sort_by = ANY (ARRAY['alphabetical'::text, 'rank'::text])))
);


ALTER TABLE public.sign_in_rosters OWNER TO postgres;

--
-- Name: lock_managed_sign_in_roster(uuid, uuid); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.lock_managed_sign_in_roster(p_organization_id uuid, p_roster_id uuid) RETURNS public.sign_in_rosters
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_roster public.sign_in_rosters;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Signed scan changes require read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF auth.uid() IS NULL
    OR NOT public.member_access_has_capability(p_organization_id, 'training', 'operate')
  THEN
    RAISE EXCEPTION 'Sign-in roster management is not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sign_in_rosters
      WHERE organization_id = p_organization_id AND id = p_roster_id
        AND public.can_access_sign_in_roster_scope(organization_id, scope_group_ids, 'view'))
  THEN
    RAISE EXCEPTION 'This roster is no longer available' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_roster FROM public.sign_in_rosters
    WHERE organization_id = p_organization_id AND id = p_roster_id
    FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_sign_in_roster_scope(p_organization_id, v_roster.scope_group_ids, 'view') THEN
    RAISE EXCEPTION 'This roster is no longer available' USING ERRCODE = 'P0002';
  END IF;
  PERFORM organization_private.require_managed_sign_in_roster(p_organization_id, v_roster.scope_group_ids);
  IF v_roster.signed_file_path IS NOT NULL
    AND NOT organization_private.artifact_file_owned('roster', p_organization_id, p_roster_id, v_roster.signed_file_path)
  THEN
    RAISE EXCEPTION 'This roster''s signed scan uses an unsupported storage location' USING ERRCODE = '22023';
  END IF;
  RETURN v_roster;
END;
$$;


ALTER FUNCTION organization_private.lock_managed_sign_in_roster(p_organization_id uuid, p_roster_id uuid) OWNER TO postgres;

--
-- Name: pending_roster_file_retirement(text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.pending_roster_file_retirement(p_object_name text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT object_name FROM organization_private.file_retirements
  WHERE p_object_name IS NOT NULL
    AND key_digest = organization_private.file_key_digest('counseling-files', p_object_name)
    AND object_name IS NOT NULL;
$$;


ALTER FUNCTION organization_private.pending_roster_file_retirement(p_object_name text) OWNER TO postgres;

--
-- Name: promote_file_retirement_holds(integer); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.promote_file_retirement_holds(p_limit integer) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_hold record;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Stored file changes require read committed isolation' USING ERRCODE = '25000';
  END IF;
  FOR v_hold IN
    WITH picked AS (
      SELECT key_digest FROM organization_private.file_retirement_holds
      ORDER BY attempted_at NULLS FIRST, held_at, key_digest
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 0), 0), 1000)
      FOR UPDATE SKIP LOCKED
    )
    UPDATE organization_private.file_retirement_holds AS hold
    SET attempted_at = pg_catalog.clock_timestamp()
    FROM picked WHERE hold.key_digest = picked.key_digest
    RETURNING hold.bucket_id, hold.object_name
  LOOP
    CONTINUE WHEN NOT pg_catalog.pg_try_advisory_xact_lock(
      organization_private.file_key_lock(v_hold.bucket_id, v_hold.object_name));
    PERFORM organization_private.retire_unreferenced_file(
      CASE v_hold.bucket_id WHEN 'counseling-files' THEN 'counseling' ELSE 'document' END, v_hold.object_name);
  END LOOP;
END;
$$;


ALTER FUNCTION organization_private.promote_file_retirement_holds(p_limit integer) OWNER TO postgres;

--
-- Name: record_personnel_attributes(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.record_personnel_attributes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  -- The day of the write, not created_at, which a client can set.
  v_on date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.personnel_attribute_history
    (organization_id, personnel_id, effective_on, rank, mos, clinic_role, group_id, archived)
  VALUES
    (NEW.organization_id, NEW.id, v_on, NEW.rank, NEW.mos, NEW.clinic_role, NEW.group_id, NEW.archived_at IS NOT NULL)
  ON CONFLICT (personnel_id, effective_on) DO UPDATE SET
    rank = EXCLUDED.rank,
    mos = EXCLUDED.mos,
    clinic_role = EXCLUDED.clinic_role,
    group_id = EXCLUDED.group_id,
    archived = EXCLUDED.archived;
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.record_personnel_attributes() OWNER TO postgres;

--
-- Name: require_access_scope_groups_in_organization(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_access_scope_groups_in_organization() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = ANY (NEW.access_scope_group_ids) AND organization_id <> NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Access scope Groups must belong to the Organization' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.require_access_scope_groups_in_organization() OWNER TO postgres;

--
-- Name: require_artifact_file_under_person(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_artifact_file_under_person() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION organization_private.require_artifact_file_under_person() OWNER TO postgres;

--
-- Name: require_award_tracking_enabled(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_award_tracking_enabled() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Any UPDATE naming the column is refused, even a no-op, so the outcome
  -- cannot reveal the stored value the column grant hides.
  IF (TG_OP = 'UPDATE' OR NEW.award_tracking_acknowledged_at IS NOT NULL)
    AND public.feature_is_off(NEW.organization_id, 'lossesAndAwards')
  THEN
    RAISE EXCEPTION 'Losses and awards is turned off for this organization' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.require_award_tracking_enabled() OWNER TO postgres;

--
-- Name: require_configurable_personnel(uuid, uuid[]); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_configurable_personnel(p_organization_id uuid, p_personnel_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
      AND NOT public.can_configure_personnel_record(person.organization_id, person.group_id)
  ) THEN
    RAISE EXCEPTION 'Archiving or restoring Personnel requires configure access' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION organization_private.require_configurable_personnel(p_organization_id uuid, p_personnel_ids uuid[]) OWNER TO postgres;

--
-- Name: require_configure_and_lock_personnel(uuid, uuid[]); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_configure_and_lock_personnel(p_organization_id uuid, p_personnel_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_locked integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Personnel lifecycle changes require READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Archiving or restoring Personnel requires configure access' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_personnel_ids IS NULL
    OR pg_catalog.cardinality(p_personnel_ids) = 0 OR pg_catalog.array_position(p_personnel_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Personnel lifecycle change needs Personnel' USING ERRCODE = '22023';
  END IF;
  IF NOT public.member_access_has_capability(p_organization_id, 'personnel', 'configure') THEN
    RAISE EXCEPTION 'Archiving or restoring Personnel requires configure access' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*) INTO v_locked FROM (
    SELECT person.id FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
      AND public.can_configure_personnel_record(person.organization_id, person.group_id)
    ORDER BY person.id
    FOR NO KEY UPDATE
  ) AS locked;
  IF v_locked <> (SELECT pg_catalog.count(DISTINCT id) FROM pg_catalog.unnest(p_personnel_ids) AS ids(id)) THEN
    RAISE EXCEPTION 'Personnel not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


ALTER FUNCTION organization_private.require_configure_and_lock_personnel(p_organization_id uuid, p_personnel_ids uuid[]) OWNER TO postgres;

--
-- Name: require_empty_files_before_delete(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_empty_files_before_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Organization deletion requires read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF pg_catalog.current_setting('role', true) = 'authenticated' OR auth.role() = 'authenticated' THEN
    -- RLS still owns ordinary deletion authority. Recheck current authority
    -- after a waited row lock rather than rely on its older statement snapshot.
    IF NOT EXISTS (SELECT 1 FROM public.organizations AS organization
      JOIN public.organization_memberships AS membership ON membership.organization_id = organization.id
      WHERE organization.id = OLD.id AND organization.suspended_at IS NULL
        AND membership.user_id = auth.uid() AND membership.role = 'owner'
        AND NOT EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = auth.uid()))
    THEN
      RAISE EXCEPTION 'Current Organization owner access is required' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- The ordinary DELETE already holds the Organization's FOR UPDATE row lock
  -- before its BEFORE ROW trigger. These separate VOLATILE queries therefore
  -- see registrations/files committed while that DELETE was waiting for it.
  IF EXISTS (SELECT 1 FROM organization_private.file_uploads WHERE organization_id = OLD.id) THEN
    RAISE EXCEPTION 'An Organization file upload is still in progress' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
    WHERE bucket_id IN ('counseling-files', 'personnel-documents', 'training-certificates')
      AND pg_catalog.lower(name) COLLATE "C" >= (OLD.id::text || '/') COLLATE "C"
      AND pg_catalog.lower(name) COLLATE "C" < (OLD.id::text || '0') COLLATE "C"
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      AND pg_catalog.lower(pg_catalog.split_part(name, '/', 1)) = OLD.id::text)
  THEN
    RAISE EXCEPTION 'Organization files must be removed before deletion' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION organization_private.require_empty_files_before_delete() OWNER TO postgres;

--
-- Name: require_managed_sign_in_roster(uuid, uuid[]); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_managed_sign_in_roster(p_organization_id uuid, p_scope_group_ids uuid[]) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.can_access_sign_in_roster_scope(p_organization_id, p_scope_group_ids, 'operate') THEN
    RAISE EXCEPTION 'Sign-in roster management is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION organization_private.require_managed_sign_in_roster(p_organization_id uuid, p_scope_group_ids uuid[]) OWNER TO postgres;

--
-- Name: require_onboarding_operation_rules(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_onboarding_operation_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION organization_private.require_onboarding_operation_rules() OWNER TO postgres;

--
-- Name: require_personnel_lifecycle_authority(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_personnel_lifecycle_authority() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION organization_private.require_personnel_lifecycle_authority() OWNER TO postgres;

--
-- Name: require_registered_file_upload(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_registered_file_upload() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.bucket_id NOT IN ('counseling-files', 'personnel-documents', 'training-certificates')
    AND (TG_OP = 'INSERT' OR OLD.bucket_id NOT IN ('counseling-files', 'personnel-documents', 'training-certificates'))
  THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.bucket_id IS NOT DISTINCT FROM NEW.bucket_id
    AND OLD.name IS NOT DISTINCT FROM NEW.name AND OLD.version IS NOT DISTINCT FROM NEW.version
  THEN RETURN NEW; END IF;

  -- No writer, including fixtures, may put bytes back under a retired key.
  IF NEW.bucket_id IN ('counseling-files', 'personnel-documents', 'training-certificates') THEN
    PERFORM organization_private.lock_file_key(NEW.bucket_id, NEW.name);
    IF organization_private.file_key_retired(NEW.bucket_id, NEW.name) THEN
      RAISE EXCEPTION 'This stored file was deleted and cannot be reused' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Historical SQL fixtures/migrations may seed metadata without a provider
  -- call. SECURITY DEFINER changes current_user, so inspect the session role
  -- and JWT explicitly; RESET ROLE alone does not clear authenticated claims.
  IF SESSION_USER = 'postgres'
    AND COALESCE(pg_catalog.current_setting('role', true), 'none') IN ('', 'none', 'postgres')
    AND auth.role() IS NULL AND auth.uid() IS NULL
    AND NULLIF(pg_catalog.current_setting('request.jwt', true), '') IS NULL
    AND COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb = '{}'::jsonb
  THEN RETURN NEW; END IF;

  -- Raw client uploads cannot borrow or end a server registration. Both
  -- preflight and final metadata writes require the trusted provider identity
  -- and exact committed, fresh server-generated key. Old tokens for other keys
  -- cannot admit writes; maintained callers never reuse registered keys.
  IF pg_catalog.current_setting('role', true) IS DISTINCT FROM 'service_role'
    OR auth.role() IS DISTINCT FROM 'service_role'
    OR NOT EXISTS (SELECT 1 FROM organization_private.file_uploads
      WHERE bucket_id = NEW.bucket_id AND object_name = NEW.name)
  THEN
    RAISE EXCEPTION 'A registered server file upload is required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.require_registered_file_upload() OWNER TO postgres;

--
-- Name: require_training_certificate_under_person(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.require_training_certificate_under_person() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  prefix text;
  segments text[];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.certificate_url IS NOT DISTINCT FROM OLD.certificate_url
    AND NEW.personnel_id IS NOT DISTINCT FROM OLD.personnel_id
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
  THEN
    RETURN NEW;
  END IF;
  IF NEW.certificate_url IS NULL
    OR NEW.certificate_url !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
  THEN
    RETURN NEW;
  END IF;
  prefix := NEW.organization_id::text || '/personnel/' || NEW.personnel_id::text || '/training-certificates/';
  segments := string_to_array(NEW.certificate_url, '/');
  IF left(NEW.certificate_url, length(prefix)) <> prefix
    OR length(NEW.certificate_url) = length(prefix)
    OR '..' = ANY (segments)
    OR '.' = ANY (segments)
  THEN
    RAISE EXCEPTION 'A stored certificate must belong to its Person' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.require_training_certificate_under_person() OWNER TO postgres;

--
-- Name: restore_locked_personnel(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.restore_locked_personnel(p_organization_id uuid, p_personnel_id uuid, p_archived_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.personnel_follow_ups AS child SET archived_at = NULL, status = 'open'
  WHERE child.organization_id = p_organization_id AND child.personnel_id = p_personnel_id
    AND child.archived_at = p_archived_at AND child.status = 'archived';
  UPDATE public.counseling_records AS child SET archived_at = NULL
  WHERE child.organization_id = p_organization_id AND child.personnel_id = p_personnel_id
    AND child.archived_at = p_archived_at;
  UPDATE public.personnel_documents AS child SET archived_at = NULL
  WHERE child.organization_id = p_organization_id AND child.personnel_id = p_personnel_id
    AND child.archived_at = p_archived_at;
  UPDATE public.leader_notes AS child SET archived_at = NULL
  WHERE child.organization_id = p_organization_id AND child.personnel_id = p_personnel_id
    AND child.archived_at = p_archived_at;
  UPDATE public.personnel AS person SET archived_at = NULL
  WHERE person.organization_id = p_organization_id AND person.id = p_personnel_id
    AND person.archived_at = p_archived_at;
END;
$$;


ALTER FUNCTION organization_private.restore_locked_personnel(p_organization_id uuid, p_personnel_id uuid, p_archived_at timestamp with time zone) OWNER TO postgres;

--
-- Name: retire_deleted_artifact_files(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.retire_deleted_artifact_files() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_kind text := CASE TG_TABLE_NAME WHEN 'counseling_records' THEN 'counseling' ELSE 'document' END;
  v_bucket text := organization_private.artifact_bucket(v_kind);
  v_key record;
  v_retired bytea[] := '{}';
  v_digest bytea;
BEGIN
  FOR v_key IN
    SELECT DISTINCT file_path, organization_private.file_key_lock(v_bucket, file_path) AS lock_id
    FROM deleted_rows
    WHERE organization_private.artifact_file_owned(v_kind, organization_id, personnel_id, file_path)
    ORDER BY lock_id, file_path
  LOOP
    v_digest := organization_private.retire_unreferenced_file(v_kind, v_key.file_path);
    IF v_digest IS NOT NULL THEN v_retired := v_retired || v_digest; END IF;
  END LOOP;

  -- A cascade from a deleted Person has no one left to ask for a receipt.
  INSERT INTO organization_private.file_artifact_deletions
    (artifact_kind, artifact_id, organization_id, personnel_id, retired_key_digest)
  SELECT v_kind, deleted.id, deleted.organization_id, deleted.personnel_id,
    CASE WHEN organization_private.artifact_file_owned(v_kind, deleted.organization_id, deleted.personnel_id, deleted.file_path)
      AND organization_private.file_key_digest(v_bucket, deleted.file_path) = ANY (v_retired)
    THEN organization_private.file_key_digest(v_bucket, deleted.file_path) END
  FROM deleted_rows AS deleted
  WHERE EXISTS (SELECT 1 FROM public.personnel WHERE id = deleted.personnel_id);
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.retire_deleted_artifact_files() OWNER TO postgres;

--
-- Name: retire_deleted_roster_scans(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.retire_deleted_roster_scans() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM organization_private.apply_artifact_file_changes(
    'roster', '{}',
    ARRAY(SELECT signed_file_path FROM deleted_rows
      WHERE organization_private.artifact_file_owned('roster', organization_id, id, signed_file_path)));
  RETURN NULL;
END;
$$;


ALTER FUNCTION organization_private.retire_deleted_roster_scans() OWNER TO postgres;

--
-- Name: retire_unreferenced_file(text, text); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.retire_unreferenced_file(p_kind text, p_path text) RETURNS bytea
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_bucket text := organization_private.artifact_bucket(p_kind);
  v_key bytea := organization_private.file_key_digest(v_bucket, p_path);
  v_digest bytea;
BEGIN
  PERFORM organization_private.lock_file_key(v_bucket, p_path);
  IF organization_private.artifact_file_referenced(p_kind, p_path) THEN
    IF p_kind <> 'certificate' AND NOT organization_private.file_key_retired(v_bucket, p_path) THEN
      INSERT INTO organization_private.file_retirement_holds (key_digest, bucket_id, object_name)
        VALUES (v_key, v_bucket, p_path)
        ON CONFLICT (key_digest) DO NOTHING;
    END IF;
    RETURN NULL;
  END IF;
  INSERT INTO organization_private.file_retirements (key_digest, bucket_id, object_name)
    VALUES (v_key, v_bucket, p_path)
    ON CONFLICT (key_digest) DO NOTHING
    RETURNING key_digest INTO v_digest;
  DELETE FROM organization_private.file_retirement_holds WHERE key_digest = v_key;
  RETURN v_digest;
END;
$$;


ALTER FUNCTION organization_private.retire_unreferenced_file(p_kind text, p_path text) OWNER TO postgres;

--
-- Name: set_group_path(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.set_group_path() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_parent_path uuid[];
BEGIN
  IF TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT g.path INTO v_parent_path FROM public.groups g
    WHERE g.organization_id = NEW.organization_id AND g.id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent Group not found' USING ERRCODE = '23503', CONSTRAINT = 'groups_parent_fkey';
    END IF;
    IF NEW.id = ANY(v_parent_path) THEN
      RAISE EXCEPTION 'A Group cannot sit inside itself' USING ERRCODE = '22023';
    END IF;
  END IF;
  NEW.path := coalesce(v_parent_path, ARRAY[]::uuid[]) || NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.set_group_path() OWNER TO postgres;

--
-- Name: stamp_archived_by(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.stamp_archived_by() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_actor text := auth.uid()::text;
BEGIN
  IF NEW.archived_at IS NULL THEN
    NEW.archived_by := NULL;
  ELSIF v_actor IS NOT NULL THEN
    NEW.archived_by := CASE
      WHEN TG_OP = 'UPDATE' AND OLD.archived_at IS NOT NULL THEN OLD.archived_by
      ELSE v_actor
    END;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.stamp_archived_by() OWNER TO postgres;

--
-- Name: stamp_follow_up_completed_by(); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.stamp_follow_up_completed_by() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_actor text := auth.uid()::text;
  v_keeps_completion boolean := TG_OP = 'UPDATE' AND OLD.status <> 'open';
BEGIN
  -- status owns the lifecycle: reopening clears the completion, archiving and restoring keep it,
  -- and only an open (or new) follow-up becomes completed by the caller.
  IF NEW.status = 'open' THEN
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  ELSIF v_actor IS NULL THEN
    IF NEW.status = 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
  ELSIF v_keeps_completion THEN
    NEW.completed_at := OLD.completed_at;
    NEW.completed_by := OLD.completed_by;
  ELSIF NEW.status = 'completed' THEN
    NEW.completed_at := now();
    NEW.completed_by := v_actor;
  ELSE
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION organization_private.stamp_follow_up_completed_by() OWNER TO postgres;

--
-- Name: valid_setup_answers(jsonb); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.valid_setup_answers(p_answers jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN jsonb_typeof(p_answers) <> 'object' THEN false ELSE NOT EXISTS (
    SELECT 1 FROM jsonb_each(p_answers) AS entry(key, value)
    WHERE key <> ALL (ARRAY['welcome','groups','ranks','personnel','calendar','training','criticalTasks','evaluations','onboarding','lossesAndAwards','eventsAndTaskings','invite']::text[])
      OR value NOT IN ('"reviewed"'::jsonb, '"later"'::jsonb)
  ) END;
$$;


ALTER FUNCTION organization_private.valid_setup_answers(p_answers jsonb) OWNER TO postgres;

--
-- Name: valid_setup_prompt(jsonb); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.valid_setup_prompt(p_state jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
DECLARE day text;
BEGIN
  IF p_state = '{"never":true}'::jsonb THEN RETURN true; END IF;
  IF jsonb_typeof(p_state) <> 'object' OR NOT (p_state ? 'snoozedUntil')
    OR p_state - 'snoozedUntil' <> '{}'::jsonb
    OR jsonb_typeof(p_state -> 'snoozedUntil') <> 'string' THEN RETURN false; END IF;
  day := p_state ->> 'snoozedUntil';
  IF day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
  PERFORM make_date(substring(day,1,4)::integer, substring(day,6,2)::integer, substring(day,9,2)::integer);
  RETURN true;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
END;
$_$;


ALTER FUNCTION organization_private.valid_setup_prompt(p_state jsonb) OWNER TO postgres;

--
-- Name: valid_setup_prompts(jsonb); Type: FUNCTION; Schema: organization_private; Owner: postgres
--

CREATE FUNCTION organization_private.valid_setup_prompts(p_prompts jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN jsonb_typeof(p_prompts) <> 'object' THEN false ELSE NOT EXISTS (
    SELECT 1 FROM jsonb_each(p_prompts) AS entry(key, value)
    WHERE key <> ALL (ARRAY['setup','welcome','groups','ranks','personnel','calendar','training','criticalTasks','evaluations','onboarding','lossesAndAwards','eventsAndTaskings','invite']::text[])
      OR NOT organization_private.valid_setup_prompt(value)
  ) END;
$$;


ALTER FUNCTION organization_private.valid_setup_prompts(p_prompts jsonb) OWNER TO postgres;

--
-- Name: can_use_group_pins(uuid); Type: FUNCTION; Schema: personnel_private; Owner: postgres
--

CREATE FUNCTION personnel_private.can_use_group_pins(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.is_org_member(p_organization_id) AND EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
      AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
  );
$$;


ALTER FUNCTION personnel_private.can_use_group_pins(p_organization_id uuid) OWNER TO postgres;

--
-- Name: lock_group_catalog(uuid); Type: FUNCTION; Schema: personnel_private; Owner: postgres
--

CREATE FUNCTION personnel_private.lock_group_catalog(p_organization_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
END;
$$;


ALTER FUNCTION personnel_private.lock_group_catalog(p_organization_id uuid) OWNER TO postgres;

--
-- Name: require_group_manager(uuid); Type: FUNCTION; Schema: personnel_private; Owner: postgres
--

CREATE FUNCTION personnel_private.require_group_manager(p_organization_id uuid) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_groups(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Group management is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION personnel_private.require_group_manager(p_organization_id uuid) OWNER TO postgres;

--
-- Name: require_top_level_group_pin(); Type: FUNCTION; Schema: personnel_private; Owner: postgres
--

CREATE FUNCTION personnel_private.require_top_level_group_pin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_parent_id uuid;
BEGIN
  SELECT parent_id INTO v_parent_id FROM public.groups
  WHERE organization_id = NEW.organization_id AND id = NEW.group_id
  FOR SHARE;
  IF v_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only top-level Groups can be pinned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION personnel_private.require_top_level_group_pin() OWNER TO postgres;

--
-- Name: accept_organization_invitation(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.accept_organization_invitation(p_invitation_id uuid) RETURNS TABLE(accept_status text, accepted_organization_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.accept_organization_invitation(p_invitation_id uuid) OWNER TO postgres;

--
-- Name: access_request_setup_grant_is_live(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.access_request_setup_grant_is_live(p_access_request_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."access_requests" AS "request"
		WHERE "request"."id" = "p_access_request_id"
			AND "request"."status" = 'approved'
			AND "request"."setup_completed_at" IS NULL
			AND (
				"request"."approval_basis" = 'platform_review'
				OR EXISTS (
					SELECT 1
					FROM "public"."access_request_organization_invitation_links" AS "link"
					JOIN "public"."organization_invitations" AS "invitation"
						ON "invitation"."id" = "link"."organization_invitation_id"
					WHERE "link"."access_request_id" = "request"."id"
						AND "invitation"."status" <> ALL (
							ARRAY['revoked'::"public"."invitation_status", 'blocked'::"public"."invitation_status"]
						)
				)
			)
	);
$$;


ALTER FUNCTION public.access_request_setup_grant_is_live(p_access_request_id uuid) OWNER TO postgres;

--
-- Name: active_onboarding_calendar_personnel_ids(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.active_onboarding_calendar_personnel_ids(p_organization_id uuid) RETURNS TABLE(personnel_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT DISTINCT po.personnel_id
  FROM public.personnel_onboardings po
  WHERE po.organization_id = p_organization_id AND po.status = 'in_progress'
    AND (SELECT public.can_view_calendar(p_organization_id))
    AND (SELECT public.organization_feature_enabled(p_organization_id, 'onboarding'))
    AND onboarding_private.onboarding_personnel_scope_matches(p_organization_id, po.personnel_id)
  ORDER BY po.personnel_id;
$$;


ALTER FUNCTION public.active_onboarding_calendar_personnel_ids(p_organization_id uuid) OWNER TO postgres;

--
-- Name: active_personnel_ict_completion_trend(uuid, uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.active_personnel_ict_completion_trend(p_organization_id uuid, p_personnel_ids uuid[] DEFAULT NULL::uuid[], p_ict_task_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(month text, completions integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT to_char(pic.completed_at, 'YYYY-MM') AS month, COUNT(*)::integer AS completions
  FROM public.personnel_ict_completions pic
  JOIN public.personnel p
    ON p.id = pic.personnel_id AND p.organization_id = pic.organization_id AND p.archived_at IS NULL
  JOIN public.ict_tasks t
    ON t.id = pic.ict_task_id AND t.organization_id = pic.organization_id AND t.archived_at IS NULL
  WHERE pic.organization_id = p_organization_id
    AND (pic.organization_id, pic.personnel_id) IN (
      SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('criticalTasks') v
    )
    AND (p_personnel_ids IS NULL OR pic.personnel_id = ANY(p_personnel_ids))
    AND (p_ict_task_ids IS NULL OR pic.ict_task_id = ANY(p_ict_task_ids))
    AND (
      COALESCE(array_length(t.mos, 1), 0) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(t.mos) AS task_mos(value)
        WHERE upper(btrim(task_mos.value)) = upper(btrim(COALESCE(p.mos, '')))
      )
    )
  GROUP BY 1 ORDER BY 1;
$$;


ALTER FUNCTION public.active_personnel_ict_completion_trend(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) OWNER TO postgres;

--
-- Name: special_days; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.special_days (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    date date NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT special_days_type_check CHECK ((type = ANY (ARRAY['federal-holiday'::text, 'org-closure'::text])))
);


ALTER TABLE public.special_days OWNER TO postgres;

--
-- Name: add_closure_days(uuid, text, date[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_closure_days(p_organization_id uuid, p_name text, p_dates date[]) RETURNS SETOF public.special_days
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_name text := pg_catalog.btrim(p_name);
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 120
    OR p_dates IS NULL OR pg_catalog.array_ndims(p_dates) IS DISTINCT FROM 1
    OR pg_catalog.cardinality(p_dates) NOT BETWEEN 1 AND 366
    OR pg_catalog.array_position(p_dates, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT requested) FROM pg_catalog.unnest(p_dates) AS requested)
      <> pg_catalog.cardinality(p_dates)
  THEN
    RAISE EXCEPTION 'Invalid closure days' USING ERRCODE = '22023';
  END IF;

  -- Two overlapping ranges serialize here, so the second sees the first's
  -- committed days and skips them instead of duplicating a date.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('calendar-closure-days:' || p_organization_id::text, 0)
  );
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    WITH inserted AS (
      INSERT INTO public.special_days (organization_id, date, name, type)
      SELECT p_organization_id, requested.date, v_name, 'org-closure'
      FROM pg_catalog.unnest(p_dates) AS requested(date)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.special_days existing
        WHERE existing.organization_id = p_organization_id AND existing.date = requested.date
      )
      RETURNING *
    )
    SELECT * FROM inserted ORDER BY inserted.date;
  -- The INSERT's policy check admits the caller before its foreign-key check
  -- can wait on the Organization row.
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION public.add_closure_days(p_organization_id uuid, p_name text, p_dates date[]) OWNER TO postgres;

--
-- Name: append_onboarding_step_note(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.append_onboarding_step_note(p_organization_id uuid, p_step_id uuid, p_text text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
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


ALTER FUNCTION public.append_onboarding_step_note(p_organization_id uuid, p_step_id uuid, p_text text) OWNER TO postgres;

--
-- Name: approve_counseling_deletion_request(uuid, uuid, uuid, uuid, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.approve_counseling_deletion_request(p_organization_id uuid, p_request_id uuid, p_record_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone, p_expected_file_path text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.deletion_requests
  SET status = 'approved',
      reviewed_by = p_reviewer_id,
      reviewed_at = p_reviewed_at,
      denial_reason = NULL
  WHERE organization_id = p_organization_id
    AND id = p_request_id
    AND resource_type = 'counseling_record'
    AND resource_id = p_record_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.counseling_records
  WHERE organization_id = p_organization_id
    AND id = p_record_id
    AND file_path IS NOT DISTINCT FROM p_expected_file_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Counseling record not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


ALTER FUNCTION public.approve_counseling_deletion_request(p_organization_id uuid, p_request_id uuid, p_record_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone, p_expected_file_path text) OWNER TO postgres;

--
-- Name: approve_personnel_archive_request(uuid, uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.approve_personnel_archive_request(p_organization_id uuid, p_request_id uuid, p_personnel_id uuid, p_reviewed_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_reviewer uuid := auth.uid();
  v_status text;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Deletion request review requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF v_reviewer IS NULL THEN
    RAISE EXCEPTION 'Deletion request review is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_request_id IS NULL OR p_personnel_id IS NULL OR p_reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Invalid deletion request review' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_org_privileged(p_organization_id) THEN
    RAISE EXCEPTION 'Deletion request review is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT request.status INTO v_status FROM public.deletion_requests AS request
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.resource_type = 'personnel' AND request.resource_id = p_personnel_id
  FOR UPDATE;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = p_personnel_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personnel not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM organization_private.archive_locked_personnel(p_organization_id, ARRAY[p_personnel_id], p_reviewed_at);

  UPDATE public.deletion_requests AS request
  SET status = 'approved', reviewed_by = v_reviewer, reviewed_at = p_reviewed_at, denial_reason = NULL
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id AND request.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Fresh statement after the last write: reviewer access may have changed
  -- during the request, Person or child waits.
  IF NOT public.is_org_privileged(p_organization_id) THEN
    RAISE EXCEPTION 'Deletion request review is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;


ALTER FUNCTION public.approve_personnel_archive_request(p_organization_id uuid, p_request_id uuid, p_personnel_id uuid, p_reviewed_at timestamp with time zone) OWNER TO postgres;

--
-- Name: approve_record_deletion_request(uuid, uuid, text, uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.approve_record_deletion_request(p_organization_id uuid, p_request_id uuid, p_resource_type text, p_resource_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
	IF public.feature_is_off(p_organization_id, CASE p_resource_type
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


ALTER FUNCTION public.approve_record_deletion_request(p_organization_id uuid, p_request_id uuid, p_resource_type text, p_resource_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone) OWNER TO postgres;

--
-- Name: archive_personnel(uuid, uuid[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.archive_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_archived_at IS NULL THEN
    RAISE EXCEPTION 'Personnel archive needs an event time' USING ERRCODE = '22023';
  END IF;
  PERFORM organization_private.require_configure_and_lock_personnel(p_organization_id, p_personnel_ids);
  PERFORM organization_private.archive_locked_personnel(p_organization_id, p_personnel_ids, p_archived_at);
  PERFORM organization_private.require_configurable_personnel(p_organization_id, p_personnel_ids);
  RETURN (SELECT pg_catalog.count(DISTINCT id)::integer FROM pg_catalog.unnest(p_personnel_ids) AS ids(id));
END;
$$;


ALTER FUNCTION public.archive_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone) OWNER TO postgres;

--
-- Name: attach_sign_in_roster_scan(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.attach_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_object_name text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_roster public.sign_in_rosters;
BEGIN
  IF NOT COALESCE(organization_private.artifact_file_owned('roster', p_organization_id, p_roster_id, p_object_name), false) THEN
    RAISE EXCEPTION 'Invalid signed scan key' USING ERRCODE = '22023';
  END IF;
  v_roster := organization_private.lock_managed_sign_in_roster(p_organization_id, p_roster_id);
  IF v_roster.signed_file_path = p_object_name THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_private.file_uploads
      WHERE bucket_id = 'counseling-files' AND object_name = p_object_name
        AND organization_id = p_organization_id AND actor_id = auth.uid())
    OR NOT EXISTS (SELECT 1 FROM storage.objects
      WHERE bucket_id = 'counseling-files' AND name = p_object_name)
  THEN
    RAISE EXCEPTION 'This scan upload is no longer in progress' USING ERRCODE = '55000';
  END IF;
  UPDATE public.sign_in_rosters SET signed_file_path = p_object_name
    WHERE organization_id = p_organization_id AND id = p_roster_id;
  PERFORM organization_private.require_managed_sign_in_roster(p_organization_id, v_roster.scope_group_ids);
  RETURN organization_private.pending_roster_file_retirement(v_roster.signed_file_path);
END;
$$;


ALTER FUNCTION public.attach_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_object_name text) OWNER TO postgres;

--
-- Name: calendar_deletion_references(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_deletion_references(p_organization_id uuid, p_personnel_id uuid, p_group_id uuid) RETURNS TABLE(tasking_id uuid, title text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN visible THEN t.id END, CASE WHEN visible THEN t.title END
  FROM public.calendar_taskings AS t
  CROSS JOIN LATERAL (
    SELECT calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id) AS visible
  ) AS access
  WHERE t.organization_id = p_organization_id
    AND (
      (p_group_id IS NOT NULL AND organization_private.group_within(t.organization_id, t.responsible_group_id, p_group_id)
        AND public.can_manage_groups(p_organization_id))
      OR (p_personnel_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.calendar_tasking_participants AS p
        JOIN public.personnel AS person ON person.organization_id = p.organization_id AND person.id = p.personnel_id
        WHERE p.organization_id = t.organization_id AND p.tasking_id = t.id AND p.personnel_id = p_personnel_id
          AND public.can_configure_personnel_record(person.organization_id, person.group_id)
      ))
    )
  ORDER BY t.suspense_on DESC, t.id;
$$;


ALTER FUNCTION public.calendar_deletion_references(p_organization_id uuid, p_personnel_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: calendar_person_labels(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_person_labels(p_organization_id uuid, p_personnel_ids uuid[]) RETURNS TABLE(personnel_id uuid, label text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT person.id, pg_catalog.concat_ws(' ', NULLIF(person.rank, ''), pg_catalog.concat_ws(', ', person.last_name, person.first_name))
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND calendar_private.can_view_calendar_events(p_organization_id)
    AND public.calendar_personnel_group_scope_matches(person.organization_id, person.group_id)
  ORDER BY person.id;
$$;


ALTER FUNCTION public.calendar_person_labels(p_organization_id uuid, p_personnel_ids uuid[]) OWNER TO postgres;

--
-- Name: calendar_personnel_group_scope_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN p_group_id IS NOT NULL THEN
      public.member_access_group_scope_matches(p_organization_id, p_group_id)
    ELSE EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    )
  END;
$$;


ALTER FUNCTION public.calendar_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: calendar_range_projection(uuid, date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_range_projection(p_organization_id uuid, p_range_start date, p_range_end date) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE v_conflicts jsonb;
BEGIN
  IF p_range_start IS NULL OR p_range_end IS NULL OR p_range_end < p_range_start OR p_range_end - p_range_start > 400 THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_object_agg(c.tasking_id::text || ':' || c.personnel_id::text, true), '{}'::jsonb)
    INTO v_conflicts FROM public.calendar_tasking_conflict_people(p_organization_id) c;
  RETURN pg_catalog.jsonb_build_object(
    'events', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'title', e.title, 'startsOn', e.starts_on, 'endsOn', e.ends_on, 'cancelled', e.cancelled_at IS NOT NULL,
        'hasWork', EXISTS (
          SELECT 1 FROM public.calendar_taskings AS t
          WHERE t.organization_id = e.organization_id AND t.event_id = e.id AND t.status <> 'cancelled'
        )
      ) ORDER BY e.starts_on, e.title, e.id)
      FROM public.calendar_events AS e
      WHERE e.organization_id = p_organization_id AND e.starts_on <= p_range_end AND e.ends_on >= p_range_start
    ), '[]'::jsonb),
    'suspenses', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'taskingId', t.id, 'title', t.title, 'suspenseOn', t.suspense_on, 'status', t.status
      ) ORDER BY t.suspense_on, t.title, t.id)
      FROM public.calendar_taskings AS t
      WHERE t.organization_id = p_organization_id AND t.status IN ('open', 'in_progress', 'blocked')
        AND t.suspense_on BETWEEN p_range_start AND p_range_end
    ), '[]'::jsonb),
    'commitments', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'taskingId', t.id, 'title', t.title, 'personnelId', p.personnel_id,
        'startsOn', t.execution_starts_on, 'endsOn', t.execution_ends_on,
        'conflicts', coalesce((v_conflicts ->> (t.id::text || ':' || p.personnel_id::text))::boolean, false)
      ) ORDER BY p.personnel_id, t.execution_starts_on, t.id)
      FROM public.calendar_taskings AS t
      JOIN public.calendar_tasking_participants AS p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
      WHERE t.organization_id = p_organization_id AND t.status IN ('open', 'in_progress', 'blocked')
        AND t.execution_starts_on <= p_range_end AND t.execution_ends_on >= p_range_start
        AND p.review_since IS NULL
    ), '[]'::jsonb)
  );
END;
$$;


ALTER FUNCTION public.calendar_range_projection(p_organization_id uuid, p_range_start date, p_range_end date) OWNER TO postgres;

--
-- Name: calendar_roster_attribute_timelines(uuid, date, date, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_roster_attribute_timelines(p_organization_id uuid, p_from date, p_through date, p_group_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(id uuid, rank text, last_name text, first_name text, mos text, clinic_role text, group_id uuid, created_at timestamp with time zone, archived_at timestamp with time zone, history jsonb)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT p.id, p.rank, p.last_name, p.first_name, p.mos, p.clinic_role,
    p.group_id, p.created_at, p.archived_at, states.history
  FROM public.personnel p
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(to_jsonb(h) ORDER BY h.effective_on) AS history, bool_or(NOT h.archived) AS active
    FROM (
      (SELECT h.effective_on, h.rank, h.mos, h.clinic_role, h.group_id, h.archived
        FROM public.personnel_attribute_history h
        WHERE h.organization_id = p.organization_id AND h.personnel_id = p.id AND h.effective_on <= p_from
        ORDER BY h.effective_on DESC LIMIT 1)
      UNION ALL
      SELECT h.effective_on, h.rank, h.mos, h.clinic_role, h.group_id, h.archived
        FROM public.personnel_attribute_history h
        WHERE h.organization_id = p.organization_id AND h.personnel_id = p.id
          AND h.effective_on > p_from AND h.effective_on <= p_through
    ) h
  ) states ON true
  WHERE p.organization_id = p_organization_id
    AND (p_group_ids IS NULL OR p.group_id = ANY(p_group_ids))
    AND (states.history IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.personnel_attribute_history h WHERE h.organization_id = p.organization_id AND h.personnel_id = p.id
    ))
    AND (states.active OR states.history IS NULL OR EXISTS (
      SELECT 1 FROM public.daily_assignments a WHERE a.organization_id = p.organization_id
        AND a.assignee_id = p.id::text AND a.date BETWEEN p_from AND p_through
    ) OR EXISTS (
      SELECT 1 FROM public.roster_excusals x WHERE x.organization_id = p.organization_id AND x.personnel_id = p.id
        AND x.starts_on <= p_through AND (x.ends_on IS NULL OR x.ends_on >= p_from)
    ) OR EXISTS (
      SELECT 1 FROM public.roster_starting_numbers n JOIN public.roster_forms f ON f.id = n.form_id
      WHERE n.organization_id = p.organization_id AND n.personnel_id = p.id AND f.ends_on IS NULL
    ));
$$;


ALTER FUNCTION public.calendar_roster_attribute_timelines(p_organization_id uuid, p_from date, p_through date, p_group_ids uuid[]) OWNER TO postgres;

--
-- Name: calendar_tasking_advisories(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_tasking_advisories(p_organization_id uuid, p_tasking_id uuid) RETURNS TABLE(personnel_id uuid, kind text, label text, starts_on date, ends_on date, other_tasking_id uuid, is_conflict boolean, overlap_days integer, execution_days integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH tasking AS MATERIALIZED (
    SELECT t.* FROM public.calendar_taskings t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id AND t.execution_starts_on IS NOT NULL
      AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  ), people AS MATERIALIZED (
    SELECT person.id FROM member_access_private.viewable_personnel('calendar') v
    JOIN public.personnel person ON person.organization_id = v.organization_id AND person.id = v.personnel_id
    JOIN tasking t ON t.organization_id = person.organization_id
    WHERE person.archived_at IS NULL
      AND (organization_private.group_within(t.organization_id, person.group_id, t.responsible_group_id)
        OR EXISTS (SELECT 1 FROM public.calendar_tasking_participants p
          WHERE p.tasking_id = t.id AND p.personnel_id = person.id))
  )
  SELECT a.personnel_id, 'availability', s.name, a.start_date, a.end_date, NULL::uuid,
    t.status IN ('open', 'in_progress', 'blocked') AND a.set_for_tasking_id IS DISTINCT FROM t.id
      AND s.roster_effect <> 'available',
    least(a.end_date, t.execution_ends_on) - greatest(a.start_date, t.execution_starts_on) + 1,
    t.execution_ends_on - t.execution_starts_on + 1
  FROM tasking t
  JOIN public.availability_entries a ON a.organization_id = t.organization_id
    AND a.start_date <= t.execution_ends_on AND a.end_date >= t.execution_starts_on
  JOIN people ON people.id = a.personnel_id
  JOIN public.status_types s ON s.organization_id = a.organization_id AND s.id = a.status_type_id
  UNION ALL
  SELECT p.personnel_id, 'tasking', CASE WHEN visible THEN other.title END,
    CASE WHEN visible THEN other.execution_starts_on END, CASE WHEN visible THEN other.execution_ends_on END,
    CASE WHEN visible THEN other.id END, false, NULL::integer, NULL::integer
  FROM tasking t
  JOIN public.calendar_taskings other ON other.organization_id = t.organization_id AND other.id <> t.id
    AND other.status IN ('open', 'in_progress', 'blocked')
    AND other.execution_starts_on <= t.execution_ends_on AND other.execution_ends_on >= t.execution_starts_on
  JOIN public.calendar_tasking_participants p ON p.organization_id = other.organization_id AND p.tasking_id = other.id
    AND p.review_since IS NULL
  JOIN people ON people.id = p.personnel_id
  CROSS JOIN LATERAL (SELECT calendar_private.can_view_calendar_tasking(other.organization_id,
    other.responsible_group_id) AS visible) access
  ORDER BY 1, 4 NULLS LAST, 3, 2, 5, 6;
$$;


ALTER FUNCTION public.calendar_tasking_advisories(p_organization_id uuid, p_tasking_id uuid) OWNER TO postgres;

--
-- Name: calendar_tasking_attention(uuid, date, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_tasking_attention(p_organization_id uuid, p_today date, p_limit integer DEFAULT 100) RETURNS TABLE(tasking_id uuid, kind text, title text, responsible_group_id uuid, event_title text, status text, suspense_on date, execution_starts_on date, staffing_required integer, staffing_picked integer, equipment_not_ready integer, attention_total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH active AS (
    SELECT t.id, t.title, t.responsible_group_id, e.title AS event_title, t.status, t.suspense_on,
      t.execution_starts_on, t.execution_ends_on, t.staffing_required,
      (SELECT count(*)::integer FROM public.calendar_tasking_participants AS p
       WHERE p.organization_id = t.organization_id AND p.tasking_id = t.id AND p.review_since IS NULL) AS picked,
      (SELECT count(*)::integer FROM public.calendar_tasking_equipment AS q
       WHERE q.organization_id = t.organization_id AND q.tasking_id = t.id
         AND q.secured_quantity < q.quantity) AS not_ready
    FROM public.calendar_taskings AS t
    LEFT JOIN public.calendar_events AS e ON e.organization_id = t.organization_id AND e.id = t.event_id
    WHERE t.organization_id = p_organization_id
      AND t.status IN ('open', 'in_progress', 'blocked')
      AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  ),
  kinded AS (
    SELECT a.*,
      CASE
        WHEN a.suspense_on < p_today THEN 'overdue'
        WHEN a.status = 'blocked' THEN 'blocked'
        WHEN a.execution_starts_on IS NOT NULL
          AND a.execution_ends_on >= p_today
          AND a.execution_starts_on <= p_today + 14
          AND (a.picked < coalesce(a.staffing_required, 0) OR a.not_ready > 0) THEN 'short'
        WHEN a.suspense_on <= p_today + 7 THEN 'due_soon'
      END AS kind
    FROM active AS a
  ),
  ranked AS (
    SELECT k.*, count(*) OVER () AS total
    FROM kinded AS k
    WHERE k.kind IS NOT NULL
  )
  SELECT r.id, r.kind, r.title, r.responsible_group_id, r.event_title, r.status, r.suspense_on,
    r.execution_starts_on, r.staffing_required, r.picked, r.not_ready, r.total
  FROM ranked AS r
  ORDER BY
    CASE r.kind WHEN 'overdue' THEN 1 WHEN 'blocked' THEN 2 WHEN 'short' THEN 3 ELSE 4 END,
    CASE WHEN r.kind = 'short' THEN r.execution_starts_on ELSE r.suspense_on END,
    r.title, r.id
  LIMIT greatest(p_limit, 0);
$$;


ALTER FUNCTION public.calendar_tasking_attention(p_organization_id uuid, p_today date, p_limit integer) OWNER TO postgres;

--
-- Name: calendar_tasking_availability_gaps(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_tasking_availability_gaps(p_organization_id uuid, p_tasking_id uuid) RETURNS TABLE(personnel_id uuid, covered boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH tasking AS (
    SELECT t.organization_id, t.id, t.execution_starts_on AS starts_on, t.execution_ends_on AS ends_on
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id AND t.execution_starts_on IS NOT NULL
      AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  ),
  picked AS (
    SELECT p.personnel_id
    FROM tasking
    JOIN public.calendar_tasking_participants AS p ON p.organization_id = tasking.organization_id
      AND p.tasking_id = tasking.id AND p.review_since IS NULL
    WHERE public.can_edit_availability_record(tasking.organization_id, p.personnel_id)
  ),
  clipped AS (
    SELECT a.personnel_id, greatest(a.start_date, tasking.starts_on) AS lo, least(a.end_date, tasking.ends_on) AS hi
    FROM tasking
    JOIN public.availability_entries AS a ON a.organization_id = tasking.organization_id
      AND a.set_for_tasking_id = tasking.id
      AND a.start_date <= tasking.ends_on AND a.end_date >= tasking.starts_on
    WHERE a.personnel_id IN (SELECT picked.personnel_id FROM picked)
  ),
  -- Each entry adds only the days past everything that started before it.
  fresh AS (
    SELECT clipped.personnel_id,
      greatest(0, clipped.hi - greatest(
        clipped.lo - 1,
        coalesce(max(clipped.hi) OVER (
          PARTITION BY clipped.personnel_id ORDER BY clipped.lo, clipped.hi ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), clipped.lo - 1)
      )) AS days
    FROM clipped
  ),
  covered AS (
    SELECT fresh.personnel_id, sum(fresh.days) AS days FROM fresh GROUP BY fresh.personnel_id
  )
  SELECT picked.personnel_id, coalesce(covered.days, 0) >= tasking.ends_on - tasking.starts_on + 1
  FROM picked CROSS JOIN tasking
  LEFT JOIN covered ON covered.personnel_id = picked.personnel_id
  ORDER BY picked.personnel_id;
$$;


ALTER FUNCTION public.calendar_tasking_availability_gaps(p_organization_id uuid, p_tasking_id uuid) OWNER TO postgres;

--
-- Name: calendar_tasking_conflict_people(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_tasking_conflict_people(p_organization_id uuid) RETURNS TABLE(tasking_id uuid, personnel_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH people AS MATERIALIZED (
    SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
    WHERE v.organization_id = p_organization_id
  )
  SELECT DISTINCT c.tasking_id, c.personnel_id FROM calendar_private.tasking_conflicts(p_organization_id) c
  JOIN public.calendar_taskings t ON t.organization_id = p_organization_id AND t.id = c.tasking_id
  JOIN people ON people.personnel_id = c.personnel_id
  WHERE calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id);
$$;


ALTER FUNCTION public.calendar_tasking_conflict_people(p_organization_id uuid) OWNER TO postgres;

--
-- Name: calendar_tasking_dashboard(uuid, date, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_tasking_dashboard(p_organization_id uuid, p_today date, p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH workspace AS MATERIALIZED (
    SELECT public.calendar_tasking_workspace(p_organization_id, p_today)->'taskings' AS facts
  ), active AS MATERIALIZED (
    SELECT t.*, e.title AS event_title, (f.value->>'picked')::integer AS picked, (f.value->>'conflicts')::integer AS conflict_count,
      (f.value->'equipment'->>'total')::integer - (f.value->'equipment'->>'ready')::integer AS not_ready
    FROM workspace w CROSS JOIN LATERAL pg_catalog.jsonb_each(w.facts) f
    JOIN public.calendar_taskings t ON t.id = f.key::uuid AND t.organization_id = p_organization_id
    LEFT JOIN public.calendar_events e ON e.organization_id = t.organization_id AND e.id = t.event_id
    WHERE t.status IN ('open', 'in_progress', 'blocked')
  ), people AS MATERIALIZED (
    SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
    WHERE v.organization_id = p_organization_id
  ), conflicts AS MATERIALIZED (
    SELECT DISTINCT ON(c.tasking_id, c.personnel_id) c.*, person.rank, person.first_name, person.last_name
    FROM calendar_private.tasking_conflicts(p_organization_id) c
    JOIN active a ON a.id = c.tasking_id
    JOIN people v ON v.personnel_id = c.personnel_id
    JOIN public.personnel person ON person.organization_id = p_organization_id AND person.id = c.personnel_id
    ORDER BY c.tasking_id, c.personnel_id, c.starts_on, c.availability_id
  ), windowed AS (
    SELECT a.*, a.execution_starts_on IS NOT NULL AND a.execution_ends_on >= p_today
      AND a.execution_starts_on <= p_today + 14 AS executing_soon
    FROM active a
  ), kinded AS (
    SELECT a.*, CASE WHEN a.suspense_on < p_today THEN 'overdue'
      WHEN a.status = 'blocked' THEN 'blocked'
      -- Incomplete work due within a week is short even with no execution dates near.
      WHEN (a.executing_soon OR a.suspense_on <= p_today + 7)
        AND (a.picked < coalesce(a.staffing_required, 0) OR a.not_ready > 0) THEN 'short'
      END AS kind FROM windowed a
  ), attention AS (
    -- An execution start goes out only when its window drives the row's timing; otherwise the suspense does.
    SELECT a.id, a.title, a.responsible_group_id, a.event_title, a.suspense_on,
      CASE WHEN a.executing_soon THEN a.execution_starts_on END AS execution_starts_on,
      a.staffing_required, a.picked, a.not_ready, a.kind, NULL::jsonb AS conflict,
      CASE WHEN a.kind = 'short' AND a.execution_starts_on = p_today THEN 0
        WHEN a.kind = 'overdue' THEN 1 WHEN a.kind = 'blocked' THEN 3 ELSE 4 END AS priority,
      CASE WHEN a.kind = 'short' AND a.executing_soon THEN a.execution_starts_on ELSE a.suspense_on END AS next_date,
      '' AS person_key
    FROM kinded a WHERE a.kind IS NOT NULL
    UNION ALL
    SELECT a.id, a.title, a.responsible_group_id, a.event_title, a.suspense_on, a.execution_starts_on,
      a.staffing_required, a.picked, a.not_ready, 'conflict',
      pg_catalog.jsonb_build_object('personnelId', c.personnel_id,
        'personLabel', pg_catalog.concat_ws(' ', nullif(c.rank, ''), c.first_name, c.last_name),
        'statusLabel', c.label, 'startsOn', c.starts_on, 'endsOn', c.ends_on,
        'overlapDays', c.overlap_days, 'executionDays', c.execution_days), 2, c.starts_on, c.personnel_id::text
    FROM conflicts c JOIN active a ON a.id = c.tasking_id
  ), limited AS (
    SELECT * FROM attention ORDER BY priority, next_date, title, id, person_key
    LIMIT greatest(0, least(p_limit, 1000))
  )
  SELECT pg_catalog.jsonb_build_object(
    'rows', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'tasking_id', a.id, 'kind', a.kind, 'title', a.title, 'responsible_group_id', a.responsible_group_id,
      'event_title', a.event_title, 'suspense_on', a.suspense_on, 'execution_starts_on', a.execution_starts_on,
      'staffing_required', a.staffing_required, 'staffing_picked', a.picked,
      'equipment_not_ready', a.not_ready, 'conflict', a.conflict
    ) ORDER BY a.priority, a.next_date, a.title, a.id, a.person_key) FROM limited a), '[]'::jsonb),
    'total', (SELECT count(*) FROM attention),
    'onTrack', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'taskingId', a.id, 'title', a.title, 'suspenseOn', a.suspense_on,
      'responsibleGroupId', a.responsible_group_id, 'picked', a.picked, 'required', a.staffing_required,
      'status', a.status
    ) ORDER BY a.suspense_on, a.title, a.id)
      FROM kinded a WHERE a.kind IS NULL AND a.suspense_on BETWEEN p_today AND p_today + 7
        AND a.picked >= coalesce(a.staffing_required, 0) AND a.not_ready = 0
        AND a.conflict_count = 0), '[]'::jsonb)
  );
$$;


ALTER FUNCTION public.calendar_tasking_dashboard(p_organization_id uuid, p_today date, p_limit integer) OWNER TO postgres;

--
-- Name: calendar_tasking_people(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid) RETURNS TABLE(personnel_id uuid, rank text, first_name text, last_name text, group_id uuid, archived boolean, selected_at timestamp with time zone, review_since timestamp with time zone, mos text, clinic_role text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT person.id, person.rank, person.first_name, person.last_name, person.group_id, person.archived_at IS NOT NULL,
    p.selected_at, p.review_since, person.mos, person.clinic_role
  FROM public.calendar_taskings AS t
  JOIN public.calendar_tasking_participants AS p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
  JOIN public.personnel AS person ON person.organization_id = p.organization_id AND person.id = p.personnel_id
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
    AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
    AND public.calendar_personnel_group_scope_matches(person.organization_id, person.group_id)
  ORDER BY person.last_name, person.first_name, person.id;
$$;


ALTER FUNCTION public.calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid) OWNER TO postgres;

--
-- Name: calendar_tasking_staffing(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_tasking_staffing(p_organization_id uuid, p_tasking_ids uuid[]) RETURNS TABLE(tasking_id uuid, revision integer, picked integer, needs_review integer, outside_scope integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT t.id, t.staffing_revision,
    (count(p.personnel_id) FILTER (WHERE p.review_since IS NULL))::integer,
    (count(p.personnel_id) FILTER (WHERE p.review_since IS NOT NULL))::integer,
    (count(p.personnel_id) FILTER (
      WHERE NOT calendar_private.calendar_person_in_scope(p.organization_id, p.personnel_id)
    ))::integer
  FROM public.calendar_taskings AS t
  LEFT JOIN public.calendar_tasking_participants AS p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
  WHERE t.organization_id = p_organization_id AND t.id = ANY (p_tasking_ids)
    AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  GROUP BY t.id, t.staffing_revision
  ORDER BY t.id;
$$;


ALTER FUNCTION public.calendar_tasking_staffing(p_organization_id uuid, p_tasking_ids uuid[]) OWNER TO postgres;

--
-- Name: calendar_tasking_workspace(uuid, date, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calendar_tasking_workspace(p_organization_id uuid, p_today date, p_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH membership AS MATERIALIZED (
    SELECT m.role, m.access_scope_kind, m.access_scope_group_ids
    FROM public.organization_memberships m
    WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
      AND calendar_private.can_view_calendar_events(p_organization_id)
  ), picked AS (
    -- Same rule as calendar_tasking_staffing: a closed Tasking keeps a pick whose Person is archived later.
    SELECT p.tasking_id, count(*) FILTER (WHERE p.review_since IS NULL)::integer AS picked
    FROM public.calendar_tasking_participants p
    WHERE p.organization_id = p_organization_id GROUP BY p.tasking_id
  ), equipment AS (
    SELECT q.tasking_id, count(*)::integer AS total,
      count(*) FILTER (WHERE q.secured_quantity = q.quantity)::integer AS ready,
      sum(q.quantity)::integer AS quantity, sum(q.returned_quantity)::integer AS returned
    FROM public.calendar_tasking_equipment q WHERE q.organization_id = p_organization_id GROUP BY q.tasking_id
  ), conflicts AS MATERIALIZED (
    SELECT c.tasking_id, count(DISTINCT c.personnel_id)::integer AS conflicts
    FROM calendar_private.tasking_conflicts(p_organization_id) c GROUP BY c.tasking_id
  ), facts AS MATERIALIZED (
    SELECT t.id, t.event_id, t.status, t.responsible_group_id, t.suspense_on, t.execution_starts_on,
      t.staffing_required, coalesce(p.picked, 0) AS picked, coalesce(q.total, 0) AS equipment_total,
      coalesce(q.ready, 0) AS equipment_ready, coalesce(q.quantity, 0) AS equipment_quantity,
      coalesce(q.returned, 0) AS equipment_returned, coalesce(c.conflicts, 0) AS conflicts,
      t.status IN ('open', 'in_progress', 'blocked') AS active,
      CASE WHEN t.event_id IS NULL THEN 'standalone'
        WHEN t.suspense_on BETWEEN e.starts_on AND e.ends_on
          OR (t.execution_starts_on <= e.ends_on AND t.execution_ends_on >= e.starts_on) THEN 'execution'
        WHEN t.suspense_on < e.starts_on THEN 'preparation' ELSE 'closeout' END AS relation,
      CASE WHEN t.status IN ('open', 'in_progress', 'blocked') AND t.execution_starts_on >= p_today
        AND t.execution_starts_on < t.suspense_on THEN t.execution_starts_on ELSE t.suspense_on END AS next_date,
      m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization'
        OR rg.path && m.access_scope_group_ids AS visible
    FROM public.calendar_taskings t CROSS JOIN membership m
    LEFT JOIN public.groups rg ON rg.organization_id = t.organization_id AND rg.id = t.responsible_group_id
    LEFT JOIN public.calendar_events e ON e.organization_id = t.organization_id AND e.id = t.event_id
    LEFT JOIN picked p ON p.tasking_id = t.id
    LEFT JOIN equipment q ON q.tasking_id = t.id
    LEFT JOIN conflicts c ON c.tasking_id = t.id
    WHERE t.organization_id = p_organization_id AND (p_event_id IS NULL OR t.event_id = p_event_id)
  ), event_totals AS (
    SELECT e.id,
      count(f.id)::integer AS total,
      count(f.id) FILTER (WHERE f.active AND (f.suspense_on < p_today OR f.status = 'blocked'
        OR f.picked < coalesce(f.staffing_required, 0)))::integer AS need_action,
      count(f.id) FILTER (WHERE f.active AND f.suspense_on < p_today)::integer AS overdue,
      count(f.id) FILTER (WHERE f.status = 'blocked')::integer AS blocked,
      count(f.id) FILTER (WHERE f.active AND f.picked < coalesce(f.staffing_required, 0))::integer AS need_people,
      count(f.id) FILTER (WHERE f.active AND f.staffing_required IS NOT NULL AND f.picked >= f.staffing_required
        AND f.equipment_ready = f.equipment_total AND f.conflicts = 0)::integer AS ready,
      coalesce(sum(f.conflicts), 0)::integer AS conflicts
    FROM public.calendar_events e CROSS JOIN membership m
    LEFT JOIN facts f ON f.event_id = e.id
    WHERE e.organization_id = p_organization_id AND (p_event_id IS NULL OR e.id = p_event_id)
    GROUP BY e.id
  )
  SELECT pg_catalog.jsonb_build_object(
    'taskings', coalesce((SELECT pg_catalog.jsonb_object_agg(f.id, pg_catalog.jsonb_build_object(
      'eventRelation', f.relation, 'picked', f.picked, 'required', f.staffing_required,
      'equipment', pg_catalog.jsonb_build_object('ready', f.equipment_ready, 'total', f.equipment_total,
        'returnedQuantity', f.equipment_returned, 'totalQuantity', f.equipment_quantity),
      'conflicts', f.conflicts, 'nextDate', f.next_date, 'suspenseOn', f.suspense_on,
      'status', f.status, 'responsibleGroupId', f.responsible_group_id
    )) FROM facts f WHERE f.visible), '{}'::jsonb),
    'events', coalesce((SELECT pg_catalog.jsonb_object_agg(e.id, pg_catalog.jsonb_build_object(
      'total', e.total, 'needAction', e.need_action, 'overdue', e.overdue, 'blocked', e.blocked,
      'needPeople', e.need_people, 'fullyStaffedAndReady', e.ready, 'conflicts', e.conflicts
    )) FROM event_totals e), '{}'::jsonb),
    'counts', (SELECT pg_catalog.jsonb_build_object(
      'active', count(*) FILTER (WHERE f.active),
      'overdue', count(*) FILTER (WHERE f.active AND f.suspense_on < p_today),
      'blocked', count(*) FILTER (WHERE f.status = 'blocked'),
      'needsPeople', count(*) FILTER (WHERE f.active AND f.picked < coalesce(f.staffing_required, 0)),
      'completed', count(*) FILTER (WHERE f.status = 'completed')
    ) FROM facts f WHERE f.visible)
  );
$$;


ALTER FUNCTION public.calendar_tasking_workspace(p_organization_id uuid, p_today date, p_event_id uuid) OWNER TO postgres;

--
-- Name: can_access_sign_in_roster(uuid, uuid[], uuid[], jsonb, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_access_sign_in_roster(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb, p_required_capability text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.can_access_sign_in_roster(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb, p_required_capability text) OWNER TO postgres;

--
-- Name: can_access_sign_in_roster_scope(uuid, uuid[], text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_access_sign_in_roster_scope(p_organization_id uuid, p_scope_group_ids uuid[], p_required_capability text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.can_access_sign_in_roster_scope(p_organization_id uuid, p_scope_group_ids uuid[], p_required_capability text) OWNER TO postgres;

--
-- Name: can_configure_personnel_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_configure_personnel_record(p_organization_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.can_configure_personnel_record(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: can_configure_personnel_training_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_configure_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'configure')
		AND "public"."training_personnel_scope_matches"("p_organization_id", "p_personnel_id");
$$;


ALTER FUNCTION public.can_configure_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: can_edit_availability_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_availability_record(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
        AND public.calendar_personnel_group_scope_matches(p_organization_id, p.group_id)
    );
$$;


ALTER FUNCTION public.can_edit_availability_record(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: can_edit_calendar(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_calendar(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'operate');
$$;


ALTER FUNCTION public.can_edit_calendar(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_edit_critical_tasks(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_critical_tasks(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'operate');
$$;


ALTER FUNCTION public.can_edit_critical_tasks(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_edit_daily_assignment_record(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_daily_assignment_record(p_organization_id uuid, p_assignment_type_id uuid, p_assignee_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND EXISTS (
      SELECT 1 FROM public.assignment_types t
      WHERE t.id = p_assignment_type_id AND t.organization_id = p_organization_id
        AND (
          (t.assign_to = 'personnel' AND EXISTS (
            SELECT 1 FROM public.personnel p
            WHERE p.id::text = p_assignee_id AND p.organization_id = p_organization_id
              AND public.calendar_personnel_group_scope_matches(p_organization_id, p.group_id)
          ))
          OR (t.assign_to = 'group' AND EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id::text = p_assignee_id AND g.organization_id = p_organization_id
              AND public.member_access_group_scope_matches(p_organization_id, g.id)
          ))
        )
    );
$$;


ALTER FUNCTION public.can_edit_daily_assignment_record(p_organization_id uuid, p_assignment_type_id uuid, p_assignee_id text) OWNER TO postgres;

--
-- Name: can_edit_onboarding(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_onboarding(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'operate');
$$;


ALTER FUNCTION public.can_edit_onboarding(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_edit_personnel(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_personnel(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'operate');
$$;


ALTER FUNCTION public.can_edit_personnel(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_edit_personnel_ict_completion_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_personnel_ict_completion_record(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'criticalTasks', 'operate')
     AND public.critical_tasks_personnel_scope_matches(p_organization_id, p_personnel_id);
$$;


ALTER FUNCTION public.can_edit_personnel_ict_completion_record(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: can_edit_personnel_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_personnel_record(p_organization_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'personnel', 'operate')
    AND CASE
      WHEN p_group_id IS NOT NULL THEN
        public.member_access_group_scope_matches(p_organization_id, p_group_id)
      ELSE EXISTS (
        SELECT 1 FROM public.organization_memberships m
        WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
          AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
      )
    END;
$$;


ALTER FUNCTION public.can_edit_personnel_record(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: can_edit_personnel_training_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'training', 'operate')
     AND public.training_personnel_scope_matches(p_organization_id, p_personnel_id);
$$;


ALTER FUNCTION public.can_edit_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: can_edit_personnel_training_record_with_type(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_personnel_training_record_with_type(p_organization_id uuid, p_personnel_id uuid, p_training_type_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.can_edit_personnel_training_record(p_organization_id, p_personnel_id)
     AND public.training_record_type_matches(p_organization_id, p_training_type_id);
$$;


ALTER FUNCTION public.can_edit_personnel_training_record_with_type(p_organization_id uuid, p_personnel_id uuid, p_training_type_id uuid) OWNER TO postgres;

--
-- Name: can_edit_rating_scheme(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_rating_scheme(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'operate');
$$;


ALTER FUNCTION public.can_edit_rating_scheme(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_edit_rating_scheme_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'ratingScheme', 'operate')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_rated_person_id AND p.organization_id = p_organization_id
        AND public.rating_scheme_personnel_group_scope_matches(p_organization_id, p.group_id)
    );
$$;


ALTER FUNCTION public.can_edit_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) OWNER TO postgres;

--
-- Name: can_edit_training(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_training(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'operate');
$$;


ALTER FUNCTION public.can_edit_training(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_export_organization_data(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_export_organization_data(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT "public"."can_manage_org_members"("p_organization_id");
$$;


ALTER FUNCTION public.can_export_organization_data(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_manage_calendar_configuration(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_manage_calendar_configuration(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;


ALTER FUNCTION public.can_manage_calendar_configuration(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_manage_groups(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_manage_groups(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'configure')
		AND EXISTS (
			SELECT 1 FROM "public"."organization_memberships"
			WHERE "organization_memberships"."organization_id" = "p_organization_id"
				AND "organization_memberships"."user_id" = "auth"."uid"()
				AND (
					"organization_memberships"."role" IN ('owner', 'admin')
					OR "organization_memberships"."access_scope_kind" = 'organization'
				)
		);
$$;


ALTER FUNCTION public.can_manage_groups(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_manage_ict_task_library(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_manage_ict_task_library(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'criticalTasks', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;


ALTER FUNCTION public.can_manage_ict_task_library(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_manage_onboarding_configuration(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_manage_onboarding_configuration(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'onboarding', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;


ALTER FUNCTION public.can_manage_onboarding_configuration(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_manage_org_members(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_manage_org_members(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" IN ('owner', 'admin')
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;


ALTER FUNCTION public.can_manage_org_members(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_manage_training_configuration(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_manage_training_configuration(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'training', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;


ALTER FUNCTION public.can_manage_training_configuration(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_update_organization_settings(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_update_organization_settings(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" IN ('owner', 'admin')
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;


ALTER FUNCTION public.can_update_organization_settings(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_view_calendar(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_calendar(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'calendar', 'view');
$$;


ALTER FUNCTION public.can_view_calendar(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_view_critical_tasks(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_critical_tasks(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view');
$$;


ALTER FUNCTION public.can_view_critical_tasks(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_view_groups(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_groups(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT
		"public"."member_access_has_capability"("p_organization_id", 'calendar', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'training', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'criticalTasks', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'view')
		OR "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view');
$$;


ALTER FUNCTION public.can_view_groups(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_view_onboarding(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_onboarding(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'onboarding', 'view');
$$;


ALTER FUNCTION public.can_view_onboarding(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_view_personnel(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_personnel(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'personnel', 'view');
$$;


ALTER FUNCTION public.can_view_personnel(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_view_personnel_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_personnel_record(p_organization_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'personnel', 'view')
    AND CASE
      WHEN p_group_id IS NOT NULL THEN
        public.member_access_group_scope_matches(p_organization_id, p_group_id)
      ELSE EXISTS (
        SELECT 1 FROM public.organization_memberships m
        WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
          AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
      )
    END;
$$;


ALTER FUNCTION public.can_view_personnel_record(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: can_view_rating_scheme(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_rating_scheme(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'ratingScheme', 'view');
$$;


ALTER FUNCTION public.can_view_rating_scheme(p_organization_id uuid) OWNER TO postgres;

--
-- Name: can_view_rating_scheme_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'ratingScheme', 'view')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_rated_person_id AND p.organization_id = p_organization_id
        AND public.rating_scheme_personnel_group_scope_matches(p_organization_id, p.group_id)
    );
$$;


ALTER FUNCTION public.can_view_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) OWNER TO postgres;

--
-- Name: can_view_training(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_training(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT "public"."member_access_has_capability"("p_organization_id", 'training', 'view');
$$;


ALTER FUNCTION public.can_view_training(p_organization_id uuid) OWNER TO postgres;

--
-- Name: cancel_calendar_event(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cancel_calendar_event(p_organization_id uuid, p_event_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL OR calendar_private.can_manage_calendar_events(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Cancelling events needs Organization-wide Calendar operation access' USING ERRCODE = '42501';
  END IF;
  UPDATE public.calendar_events
  SET cancelled_at = pg_catalog.now(), cancellation_reason = NULLIF(pg_catalog.btrim(p_reason), '')
  WHERE organization_id = p_organization_id AND id = p_event_id AND cancelled_at IS NULL;
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.calendar_events WHERE organization_id = p_organization_id AND id = p_event_id
  ) THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


ALTER FUNCTION public.cancel_calendar_event(p_organization_id uuid, p_event_id uuid, p_reason text) OWNER TO postgres;

--
-- Name: cancel_own_deletion_request(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cancel_own_deletion_request(p_organization_id uuid, p_request_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id uuid := auth.uid();
  saved_status text;
BEGIN
  -- A fresh statement after the request-row wait must see committed access
  -- changes. Fixed-snapshot transactions cannot provide that guarantee.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Cancellation requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Deletion request cancellation is not allowed' USING ERRCODE = '42501';
  END IF;

  -- Conceal missing, foreign, other-requester and terminal targets alike.
  PERFORM 1 FROM public.deletion_requests AS request
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.requested_by = actor_id AND request.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS membership
    JOIN public.organizations AS organization ON organization.id = membership.organization_id
    WHERE membership.organization_id = p_organization_id AND membership.user_id = actor_id
      AND organization.suspended_at IS NULL
  ) OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = actor_id) THEN
    RAISE EXCEPTION 'Deletion request cancellation is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT request.status INTO saved_status FROM public.deletion_requests AS request
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.requested_by = actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Separate READ COMMITTED statement: do not reuse admission from before a
  -- wait on a reviewer or another cancellation of this request.
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS membership
    JOIN public.organizations AS organization ON organization.id = membership.organization_id
    WHERE membership.organization_id = p_organization_id AND membership.user_id = actor_id
      AND organization.suspended_at IS NULL
  ) OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = actor_id) THEN
    RAISE EXCEPTION 'Deletion request cancellation is not allowed' USING ERRCODE = '42501';
  END IF;
  IF saved_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.deletion_requests AS request SET status = 'cancelled'
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.requested_by = actor_id AND request.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN true;
END;
$$;


ALTER FUNCTION public.cancel_own_deletion_request(p_organization_id uuid, p_request_id uuid) OWNER TO postgres;

--
-- Name: check_account_setup_rate_limit(text, integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_account_setup_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone DEFAULT now()) RETURNS TABLE(limited boolean, retry_after_ms integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.check_account_setup_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone) OWNER TO postgres;

--
-- Name: check_durable_rate_limit(text, integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_durable_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone DEFAULT now()) RETURNS TABLE(limited boolean, retry_after_ms integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.check_durable_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone) OWNER TO postgres;

--
-- Name: claim_account_setup_link_for_session(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.claim_account_setup_link_for_session(p_setup_link_id uuid, p_access_request_id uuid, p_claimed_at timestamp with time zone DEFAULT now()) RETURNS TABLE(claim_status text, setup_link_id uuid, access_request_id uuid, expires_at timestamp with time zone, created_at timestamp with time zone, claimed_at timestamp with time zone, failed_at timestamp with time zone, failure_reason text, used_at timestamp with time zone, revoked_at timestamp with time zone, revocation_reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
	link_row public.account_setup_links%ROWTYPE;
	request_row public.access_requests%ROWTYPE;
	normalized_email text;
	other_claim_in_progress boolean;
BEGIN
	-- The separate scan below gets a fresh READ COMMITTED snapshot after any
	-- transaction that held the advisory lock has committed.
	SELECT *
	INTO request_row
	FROM public.access_requests
	WHERE access_requests.id = p_access_request_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT
			'missing'::text, NULL::uuid, NULL::uuid, NULL::timestamp with time zone, NULL::timestamp with time zone,
			NULL::timestamp with time zone, NULL::timestamp with time zone, NULL::text, NULL::timestamp with time zone,
			NULL::timestamp with time zone, NULL::text;
		RETURN;
	END IF;

	normalized_email := lower(btrim(request_row.email));
	PERFORM pg_advisory_xact_lock(hashtextextended('account-setup-claim:' || normalized_email, 0));

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

	IF NOT public.access_request_setup_grant_is_live(request_row.id) THEN
		RETURN QUERY SELECT
			'access-request-not-approved'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
			link_row.claimed_at, link_row.failed_at, link_row.failure_reason, link_row.used_at,
			link_row.revoked_at, link_row.revocation_reason;
		RETURN;
	END IF;

	-- A claimed link remains a credential-mutation hold until it is completed or
	-- explicitly failed. Expiry and revocation do not establish that Auth stopped.
	-- This statement must run after the advisory lock as its own SQL command.
	SELECT EXISTS (
		SELECT 1
		FROM public.account_setup_links AS other_link
		JOIN public.access_requests AS other_request ON other_request.id = other_link.access_request_id
		WHERE lower(btrim(other_request.email)) = normalized_email
			AND other_link.id <> link_row.id
			AND other_link.claimed_at IS NOT NULL
			AND other_link.used_at IS NULL
			AND other_link.failed_at IS NULL
	) INTO other_claim_in_progress;

	IF other_claim_in_progress THEN
		RETURN QUERY SELECT
			'claim-in-progress'::text, link_row.id, link_row.access_request_id, link_row.expires_at, link_row.created_at,
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


ALTER FUNCTION public.claim_account_setup_link_for_session(p_setup_link_id uuid, p_access_request_id uuid, p_claimed_at timestamp with time zone) OWNER TO postgres;

--
-- Name: cleanup_old_audit_logs(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_old_audit_logs() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


ALTER FUNCTION public.cleanup_old_audit_logs() OWNER TO postgres;

--
-- Name: close_roster_form(uuid, uuid, uuid, uuid, date, jsonb, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.close_roster_form(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_pool_rules jsonb, p_weekend_mode text, p_record jsonb, p_carry jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_form public.roster_forms%ROWTYPE;
  v_rules jsonb;
  v_next uuid;
  v_pool jsonb := NULLIF(p_pool_rules, 'null'::jsonb);
  v_ending boolean := p_weekend_mode IS NULL;
BEGIN
  IF p_actor IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_assignment_type_id IS NULL OR p_form_id IS NULL
    OR p_weekend_mode NOT IN ('same', 'separate', 'none')
    OR (p_record IS NOT NULL AND pg_catalog.jsonb_typeof(p_record) <> 'object')
    OR p_carry IS NULL OR pg_catalog.jsonb_typeof(p_carry) <> 'array'
    OR (v_ending AND (v_pool IS NOT NULL OR pg_catalog.jsonb_array_length(p_carry) > 0))
  THEN
    RAISE EXCEPTION 'Invalid roster rules' USING ERRCODE = '22023';
  END IF;
  IF v_pool IS NOT NULL AND NOT public.is_roster_pool_rules(v_pool) THEN
    RAISE EXCEPTION 'Pool rules need a rank range or null, and lists of MOS, roles and group ids' USING ERRCODE = '22023';
  END IF;
  IF p_today IS NULL OR pg_catalog.abs(p_today - (pg_catalog.now() AT TIME ZONE 'UTC')::date) > 1 THEN
    RAISE EXCEPTION 'The date on this device is off' USING ERRCODE = 'RSD01';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('roster-form:' || p_assignment_type_id::text, 0)
  );
  PERFORM 1 FROM public.assignment_types
  WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND assign_to = 'personnel'
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Assignment type not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_form FROM public.roster_forms
  WHERE organization_id = p_organization_id AND assignment_type_id = p_assignment_type_id AND ends_on IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_form.id <> p_form_id THEN
    RAISE EXCEPTION 'The DA 6 form changed' USING ERRCODE = 'RSF01';
  END IF;
  v_form.starts_on := public.roster_form_effective_start(v_form);
  IF (v_form.starts_on > p_today) <> (p_record IS NULL) THEN
    RAISE EXCEPTION 'Invalid DA 6 record' USING ERRCODE = '22023';
  END IF;

  v_rules := pg_catalog.jsonb_build_object('pool', v_pool, 'weekendMode', p_weekend_mode);
  PERFORM pg_catalog.set_config('trooptotask.roster_close', 'on', true);
  IF p_record IS NULL AND v_ending THEN
    DELETE FROM public.roster_forms WHERE id = v_form.id;
  ELSIF p_record IS NULL THEN
    UPDATE public.roster_forms SET rules = v_rules WHERE id = v_form.id;
    DELETE FROM public.roster_starting_numbers WHERE form_id = v_form.id;
    v_next := v_form.id;
  ELSE
    UPDATE public.roster_forms SET starts_on = v_form.starts_on, ends_on = p_today, record = p_record WHERE id = v_form.id;
    IF NOT v_ending THEN
      INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, rules)
      VALUES (p_organization_id, p_assignment_type_id, p_today + 1, v_rules)
      RETURNING id INTO v_next;
    END IF;
  END IF;

  -- People deleted since the application read the form have nothing to carry.
  INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin)
  SELECT p_organization_id, v_next, c.personnel_id, c.track, c.count, 'carried'
  FROM pg_catalog.jsonb_to_recordset(p_carry) AS c(personnel_id uuid, track text, count integer)
  WHERE c.personnel_id IN (
    SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
    WHERE v.organization_id = p_organization_id
  );

  IF v_ending THEN
    UPDATE public.assignment_types SET assign_to = 'group'
    WHERE organization_id = p_organization_id AND id = p_assignment_type_id;
  ELSE
    UPDATE public.assignment_types SET roster_pool_rules = v_pool, roster_weekend_mode = p_weekend_mode
    WHERE organization_id = p_organization_id AND id = p_assignment_type_id;
  END IF;
  PERFORM pg_catalog.set_config('trooptotask.roster_close', '', true);

  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_ending THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.assignment_types
      WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND assign_to = 'group'
    ) THEN
      RAISE EXCEPTION 'The DA 6 form was not saved' USING ERRCODE = 'RSF01';
    END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assignment_types
    WHERE organization_id = p_organization_id AND id = p_assignment_type_id
      AND roster_pool_rules IS NOT DISTINCT FROM v_pool AND roster_weekend_mode = p_weekend_mode
  ) OR NOT EXISTS (
    SELECT 1 FROM public.roster_forms WHERE id = v_next AND ends_on IS NULL AND rules = v_rules
  ) THEN
    RAISE EXCEPTION 'The DA 6 form was not saved' USING ERRCODE = 'RSF01';
  END IF;
  RETURN v_next;
END;
$$;


ALTER FUNCTION public.close_roster_form(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_pool_rules jsonb, p_weekend_mode text, p_record jsonb, p_carry jsonb) OWNER TO postgres;

--
-- Name: complete_account_setup_recovery(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.complete_account_setup_recovery(p_source_setup_link_id uuid, p_target_setup_link_id uuid, p_target_access_request_id uuid, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
	source_request public.access_requests%ROWTYPE;
	target_request public.access_requests%ROWTYPE;
	source_link public.account_setup_links%ROWTYPE;
	target_link public.account_setup_links%ROWTYPE;
	attempt public.account_setup_attempts%ROWTYPE;
	setup_email text;
	completed_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
	-- Discover the source request without a lock, then lock both request rows
	-- in UUID order before taking the email advisory lock. Recheck everything
	-- after those locks; this also matches concurrent claim/staff lock order.
	SELECT * INTO source_link FROM public.account_setup_links WHERE id = p_source_setup_link_id;
	IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	PERFORM 1 FROM public.access_requests
	WHERE id IN (source_link.access_request_id, p_target_access_request_id)
	ORDER BY id FOR NO KEY UPDATE;
	SELECT * INTO source_request FROM public.access_requests WHERE id = source_link.access_request_id;
	SELECT * INTO target_request FROM public.access_requests WHERE id = p_target_access_request_id;
	IF source_request.id IS NULL OR target_request.id IS NULL THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;
	setup_email := pg_catalog.lower(pg_catalog.btrim(target_request.email));
	IF setup_email IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(source_request.email)) THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;
	PERFORM pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended('account-setup-claim:' || setup_email, 0));
	PERFORM 1 FROM public.account_setup_links
	WHERE id IN (p_source_setup_link_id, p_target_setup_link_id) ORDER BY id FOR UPDATE;
	SELECT * INTO source_link FROM public.account_setup_links WHERE id = p_source_setup_link_id;
	SELECT * INTO target_link FROM public.account_setup_links
	WHERE id = p_target_setup_link_id AND access_request_id = p_target_access_request_id;
	SELECT * INTO attempt FROM public.account_setup_attempts
	WHERE setup_link_id = p_source_setup_link_id FOR UPDATE;
	IF target_link.id IS NULL OR source_link.access_request_id <> source_request.id
		OR attempt.state IS DISTINCT FROM 'committed' OR attempt.auth_user_id IS NULL
		OR attempt.normalized_email <> setup_email OR source_link.claimed_at IS NULL
		OR source_link.failed_at IS NOT NULL OR target_request.status <> 'approved'
		OR source_request.status <> 'approved'
		OR (source_request.setup_user_id IS NOT NULL
			AND source_request.setup_user_id IS DISTINCT FROM attempt.auth_user_id)
		OR (target_request.setup_user_id IS NOT NULL
			AND target_request.setup_user_id IS DISTINCT FROM attempt.auth_user_id)
		OR NOT EXISTS (SELECT 1 FROM public.user_email_identities i
			WHERE i.user_id = attempt.auth_user_id AND i.normalized_email = setup_email)
	THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;

	-- A repeated call is harmless after the first complete transaction. Before
	-- that transaction, only a live target credential can authorize recovery.
	IF target_request.setup_completed_at IS NOT NULL AND target_link.used_at IS NOT NULL THEN
		IF source_request.setup_completed_at IS NULL OR source_link.used_at IS NULL THEN
			RETURN pg_catalog.jsonb_build_object('state', 'support-required');
		END IF;
	ELSE
		IF target_link.failed_at IS NOT NULL OR target_link.used_at IS NOT NULL
			OR target_link.revoked_at IS NOT NULL OR target_link.expires_at <= completed_at
			OR (target_link.claimed_at IS NOT NULL AND target_link.id <> source_link.id)
		THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	END IF;

	IF p_first_name IS NOT NULL AND pg_catalog.btrim(p_first_name) <> ''
		AND p_last_name IS NOT NULL AND pg_catalog.btrim(p_last_name) <> '' THEN
		INSERT INTO public.user_profiles(user_id, first_name, last_name)
		VALUES (attempt.auth_user_id, pg_catalog.btrim(p_first_name), pg_catalog.btrim(p_last_name))
		ON CONFLICT (user_id) DO NOTHING;
	END IF;
	UPDATE public.access_requests
	SET setup_completed_at = COALESCE(setup_completed_at, completed_at),
		setup_user_id = attempt.auth_user_id
	WHERE id IN (source_request.id, target_request.id)
		AND (setup_completed_at IS NULL OR setup_user_id IS NULL);
	UPDATE public.account_setup_links
	SET used_at = COALESCE(used_at, completed_at),
		claimed_at = COALESCE(claimed_at, completed_at)
	WHERE id IN (source_link.id, target_link.id) AND used_at IS NULL;
	RETURN pg_catalog.jsonb_build_object('state', 'completed', 'userId', attempt.auth_user_id);
END;
$$;


ALTER FUNCTION public.complete_account_setup_recovery(p_source_setup_link_id uuid, p_target_setup_link_id uuid, p_target_access_request_id uuid, p_first_name text, p_last_name text) OWNER TO postgres;

--
-- Name: complete_organization_file_retirements(text, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.complete_organization_file_retirements(p_bucket_id text, p_object_names text[]) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH completed AS (
    UPDATE organization_private.file_retirements SET object_name = NULL
    WHERE object_name IS NOT NULL AND key_digest IN (
      SELECT organization_private.file_key_digest(p_bucket_id, name) FROM pg_catalog.unnest(p_object_names) AS name)
    RETURNING 1
  )
  SELECT count(*)::integer FROM completed;
$$;


ALTER FUNCTION public.complete_organization_file_retirements(p_bucket_id text, p_object_names text[]) OWNER TO postgres;

--
-- Name: confirm_account_setup_create(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confirm_account_setup_create() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE marker text;
BEGIN
	marker := NEW.raw_user_meta_data ->> 'ttt_setup_attempt';
	IF marker IS NULL THEN RETURN NEW; END IF;
	UPDATE public.account_setup_attempts SET state = 'committed', auth_user_id = NEW.id
	WHERE id::text = marker AND state = 'started'
		AND normalized_email = pg_catalog.lower(pg_catalog.btrim(NEW.email))
		AND NEW.encrypted_password IS NOT NULL;
	IF NOT FOUND THEN RAISE EXCEPTION 'Account setup attempt fenced' USING ERRCODE = '42501'; END IF;
	NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'ttt_setup_attempt';
	-- GoTrue can echo its in-memory metadata in later UPDATEs during this same
	-- create transaction. Only that transaction may consume the echoed marker.
	PERFORM pg_catalog.set_config('app.setup_created_actor', NEW.id::text, true);
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.confirm_account_setup_create() OWNER TO postgres;

--
-- Name: confirm_password_change_attempt(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confirm_password_change_attempt() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE password_marker text; setup_marker text;
BEGIN
	IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
		PERFORM pg_catalog.set_config('app.password_changed_actor', NEW.id::text, true);
	END IF;
	password_marker := NEW.raw_user_meta_data ->> 'ttt_password_attempt';
	setup_marker := NEW.raw_user_meta_data ->> 'ttt_setup_attempt';
	IF password_marker IS NOT NULL AND setup_marker IS NOT NULL THEN
		RAISE EXCEPTION 'Conflicting password attempt markers' USING ERRCODE = '42501';
	END IF;
	IF password_marker IS NOT NULL THEN
		IF pg_catalog.current_setting('app.password_changed_actor', true) IS DISTINCT FROM NEW.id::text THEN
			RAISE EXCEPTION 'Password change witness missing' USING ERRCODE = '42501';
		END IF;
		UPDATE public.password_change_attempts SET state = 'pending'
		WHERE actor = NEW.id AND id::text = password_marker AND state = 'started'
			AND expires_at > pg_catalog.clock_timestamp()
			AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = session_id AND s.user_id = NEW.id);
		IF NOT FOUND THEN RAISE EXCEPTION 'Password attempt fenced' USING ERRCODE = '42501'; END IF;
		NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'ttt_password_attempt';
		PERFORM pg_catalog.set_config('app.password_changed_actor', '', true);
	END IF;
	IF setup_marker IS NOT NULL THEN
		IF pg_catalog.current_setting('app.setup_created_actor', true) = NEW.id::text THEN
			PERFORM 1 FROM public.account_setup_attempts
			WHERE id::text = setup_marker AND state = 'committed' AND auth_user_id = NEW.id
				AND normalized_email = pg_catalog.lower(pg_catalog.btrim(NEW.email));
			IF NOT FOUND THEN RAISE EXCEPTION 'Account setup attempt fenced' USING ERRCODE = '42501'; END IF;
		ELSE
			IF pg_catalog.current_setting('app.password_changed_actor', true) IS DISTINCT FROM NEW.id::text THEN
				RAISE EXCEPTION 'Account setup password witness missing' USING ERRCODE = '42501';
			END IF;
			UPDATE public.account_setup_attempts SET state = 'committed', auth_user_id = NEW.id
			WHERE id::text = setup_marker AND state = 'started'
				AND normalized_email = pg_catalog.lower(pg_catalog.btrim(NEW.email));
			IF NOT FOUND THEN RAISE EXCEPTION 'Account setup attempt fenced' USING ERRCODE = '42501'; END IF;
		END IF;
		NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'ttt_setup_attempt';
		PERFORM pg_catalog.set_config('app.password_changed_actor', '', true);
	END IF;
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.confirm_password_change_attempt() OWNER TO postgres;

--
-- Name: correct_training_completion(uuid, text, uuid, date, date, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.correct_training_completion(p_organization_id uuid, p_kind text, p_id uuid, p_completion_date date, p_expiration_date date, p_notes text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF p_kind = 'current' THEN
    PERFORM pg_catalog.set_config('trooptotask.training_correction', 'on', true);
    UPDATE public.personnel_trainings
      SET completion_date = p_completion_date, expiration_date = p_expiration_date, notes = p_notes,
        updated_at = pg_catalog.now()
      WHERE organization_id = p_organization_id AND id = p_id
      RETURNING pg_catalog.to_jsonb(personnel_trainings) INTO v_row;
    PERFORM pg_catalog.set_config('trooptotask.training_correction', '', true);
  ELSIF p_kind = 'history' THEN
    UPDATE public.personnel_training_history
      SET completion_date = p_completion_date, expiration_date = p_expiration_date, notes = p_notes
      WHERE organization_id = p_organization_id AND id = p_id
      RETURNING pg_catalog.to_jsonb(personnel_training_history) INTO v_row;
  ELSE
    RAISE EXCEPTION 'Unknown Training completion kind' USING ERRCODE = '22023';
  END IF;
  RETURN v_row;
END;
$$;


ALTER FUNCTION public.correct_training_completion(p_organization_id uuid, p_kind text, p_id uuid, p_completion_date date, p_expiration_date date, p_notes text) OWNER TO postgres;

--
-- Name: count_memberships_by_organization(uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.count_memberships_by_organization(p_org_ids uuid[]) RETURNS TABLE(organization_id uuid, membership_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
	SELECT "organization_memberships"."organization_id", COUNT(*)::bigint AS "membership_count"
	FROM "public"."organization_memberships"
	WHERE "organization_memberships"."organization_id" = ANY("p_org_ids")
	GROUP BY "organization_memberships"."organization_id";
$$;


ALTER FUNCTION public.count_memberships_by_organization(p_org_ids uuid[]) OWNER TO postgres;

--
-- Name: count_org_personnel(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.count_org_personnel(p_org_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::integer
  FROM public.personnel
  WHERE organization_id = p_org_id
    AND archived_at IS NULL;
$$;


ALTER FUNCTION public.count_org_personnel(p_org_id uuid) OWNER TO postgres;

--
-- Name: count_personnel_by_organization(uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.count_personnel_by_organization(p_org_ids uuid[]) RETURNS TABLE(organization_id uuid, personnel_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    SELECT "personnel"."organization_id", COUNT(*)::bigint AS "personnel_count"
    FROM "public"."personnel"
    WHERE "personnel"."organization_id" = ANY("p_org_ids")
      AND "personnel"."archived_at" IS NULL
    GROUP BY "personnel"."organization_id";
$$;


ALTER FUNCTION public.count_personnel_by_organization(p_org_ids uuid[]) OWNER TO postgres;

--
-- Name: count_platform_users(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.count_platform_users() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
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


ALTER FUNCTION public.count_platform_users() OWNER TO postgres;

--
-- Name: create_organization(text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_organization(p_name text, p_request_id uuid, p_defaults jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


ALTER FUNCTION public.create_organization(p_name text, p_request_id uuid, p_defaults jsonb) OWNER TO postgres;

--
-- Name: critical_tasks_personnel_scope_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.critical_tasks_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel p
    WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
      AND (
        (p.group_id IS NOT NULL AND public.member_access_group_scope_matches(p_organization_id, p.group_id))
        OR (p.group_id IS NULL AND EXISTS (
          SELECT 1 FROM public.organization_memberships m
          WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
            AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
        ))
      )
  );
$$;


ALTER FUNCTION public.critical_tasks_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: current_session_sensitive_action_assured(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.current_session_sensitive_action_assured() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT COALESCE((
		SELECT CASE "current_session"."claims" ->> 'aal'
			WHEN 'aal2' THEN true
			WHEN 'aal1' THEN NOT EXISTS (
					SELECT 1 FROM "auth"."mfa_factors" AS "factor"
					WHERE "factor"."user_id" = "current_session"."user_id"
						AND "factor"."status" = 'verified'::"auth"."factor_status"
				)
				AND (
					SELECT pg_catalog.count(*) > 0
						AND pg_catalog.bool_and(COALESCE(
							"method"."name" <> ''
								AND "method"."signed_in_at" = pg_catalog.trunc("method"."signed_in_at")
								AND "method"."signed_in_at" > 0
								AND "method"."signed_in_at" <= "current_session"."now_epoch",
							false
						))
						AND pg_catalog.max("method"."signed_in_at") >= "current_session"."now_epoch" - 900
					FROM pg_catalog.jsonb_array_elements(
						CASE WHEN pg_catalog.jsonb_typeof("current_session"."claims" -> 'amr') = 'array'
							THEN "current_session"."claims" -> 'amr' ELSE '[]'::jsonb END
					) AS "entry"
					CROSS JOIN LATERAL (
						SELECT
							CASE WHEN pg_catalog.jsonb_typeof("entry" -> 'method') = 'string'
								THEN pg_catalog.btrim("entry" ->> 'method') END AS "name",
							CASE WHEN pg_catalog.jsonb_typeof("entry" -> 'timestamp') = 'number'
								THEN ("entry" ->> 'timestamp')::numeric END AS "signed_in_at"
					) AS "method"
				)
			ELSE false
		END
		FROM (
			SELECT "auth"."uid"() AS "user_id", "auth"."jwt"() AS "claims",
				extract(epoch FROM pg_catalog.now()) AS "now_epoch"
		) AS "current_session"
		WHERE "current_session"."user_id" IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 FROM "public"."user_suspensions" AS "suspension"
				WHERE "suspension"."user_id" = "current_session"."user_id"
			)
	), false);
$$;


ALTER FUNCTION public.current_session_sensitive_action_assured() OWNER TO postgres;

--
-- Name: daily_signups_last_30_days(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.daily_signups_last_30_days() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
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


ALTER FUNCTION public.daily_signups_last_30_days() OWNER TO postgres;

--
-- Name: decline_organization_invitation(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.decline_organization_invitation(p_invitation_id uuid) RETURNS TABLE(decline_status text, declined_organization_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.decline_organization_invitation(p_invitation_id uuid) OWNER TO postgres;

--
-- Name: delete_archived_personnel_artifact(uuid, uuid, text, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_archived_personnel_artifact(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid, p_archived_at timestamp with time zone) RETURNS TABLE(deleted boolean, bucket_id text, object_name text, file_removed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_deleted boolean;
BEGIN
  IF p_kind = 'counseling' THEN
    DELETE FROM public.counseling_records
      WHERE id = p_artifact_id AND organization_id = p_organization_id AND personnel_id = p_personnel_id
        AND archived_at = p_archived_at;
  ELSIF p_kind = 'document' THEN
    DELETE FROM public.personnel_documents
      WHERE id = p_artifact_id AND organization_id = p_organization_id AND personnel_id = p_personnel_id
        AND archived_at = p_archived_at;
  ELSE
    RAISE EXCEPTION 'Unknown Personnel file artifact' USING ERRCODE = '22023';
  END IF;
  v_deleted := FOUND;
  RETURN QUERY SELECT v_deleted, deletion.bucket_id, deletion.object_name, deletion.file_removed
    FROM organization_private.artifact_file_deletion(p_organization_id, p_personnel_id, p_kind, p_artifact_id) AS deletion;
END;
$$;


ALTER FUNCTION public.delete_archived_personnel_artifact(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid, p_archived_at timestamp with time zone) OWNER TO postgres;

--
-- Name: delete_availability_entries(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_availability_entries(p_organization_id uuid, p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL
    OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar availability removal is not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL
    OR cardinality(p_ids) NOT BETWEEN 1 AND 500
    OR array_position(p_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Invalid Calendar availability removal' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.availability_entries
  WHERE organization_id = p_organization_id AND id = ANY(p_ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.delete_availability_entries(p_organization_id uuid, p_ids uuid[]) OWNER TO postgres;

--
-- Name: delete_calendar_event(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_calendar_event(p_organization_id uuid, p_event_id uuid, p_taskings text) RETURNS TABLE(taskings integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_count integer;
BEGIN
  IF p_taskings IS NULL OR p_taskings NOT IN ('standalone', 'delete') THEN
    RAISE EXCEPTION 'Choose standalone or delete for linked taskings' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL OR calendar_private.can_manage_calendar_events(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Deleting events needs Organization-wide Calendar operation access' USING ERRCODE = '42501';
  END IF;

  -- This also holds off new links through the Event FK until deletion commits.
  PERFORM e.id FROM public.calendar_events AS e
  WHERE e.organization_id = p_organization_id AND e.id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM t.id FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.event_id = p_event_id
  ORDER BY t.id FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_taskings = 'delete' THEN
    DELETE FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.event_id = p_event_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  DELETE FROM public.calendar_events AS e
  WHERE e.organization_id = p_organization_id AND e.id = p_event_id;
  RETURN QUERY SELECT v_count;
END;
$$;


ALTER FUNCTION public.delete_calendar_event(p_organization_id uuid, p_event_id uuid, p_taskings text) OWNER TO postgres;

--
-- Name: delete_expired_personnel(uuid, uuid[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_expired_personnel(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_org_id IS NULL OR p_candidate_ids IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization, candidate IDs and cutoff are required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.personnel AS person
  WHERE person.organization_id = p_org_id
    AND person.id = ANY (p_candidate_ids)
    AND person.archived_at IS NOT NULL
    AND person.archived_at < p_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.calendar_tasking_participants AS p
      WHERE p.organization_id = person.organization_id AND p.personnel_id = person.id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


ALTER FUNCTION public.delete_expired_personnel(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) OWNER TO postgres;

--
-- Name: delete_expired_unreferenced_assignment_types(uuid, uuid[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_expired_unreferenced_assignment_types(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_type_id uuid;
  v_deleted integer := 0;
  v_count integer;
BEGIN
  IF p_org_id IS NULL OR p_candidate_ids IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization, candidate IDs and cutoff are required' USING ERRCODE = '22023';
  END IF;

  FOR v_type_id IN
    SELECT assignment_type.id
    FROM public.assignment_types AS assignment_type
    WHERE assignment_type.organization_id = p_org_id
      AND assignment_type.id = ANY (p_candidate_ids)
      AND assignment_type.archived_at < p_cutoff
    ORDER BY assignment_type.id
    FOR UPDATE OF assignment_type
  LOOP
    -- Check every reference, even a malformed cross-Organization legacy row, before a cascading delete.
    IF EXISTS (
      SELECT 1 FROM public.daily_assignments
      WHERE assignment_type_id = v_type_id
    ) THEN
      CONTINUE;
    END IF;

    DELETE FROM public.assignment_types
    WHERE id = v_type_id AND organization_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + v_count;
  END LOOP;

  RETURN v_deleted;
END;
$$;


ALTER FUNCTION public.delete_expired_unreferenced_assignment_types(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) OWNER TO postgres;

--
-- Name: delete_expired_unreferenced_critical_tasks(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_expired_unreferenced_critical_tasks(p_org_id uuid, p_cutoff timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_task_id uuid;
  v_deleted integer := 0;
  v_count integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Critical task retention requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF p_org_id IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization and cutoff are required' USING ERRCODE = '22023';
  END IF;

  FOR v_task_id IN
    SELECT task.id
    FROM public.ict_tasks AS task
    WHERE task.organization_id = p_org_id AND task.archived_at < p_cutoff
    ORDER BY task.id
    FOR UPDATE OF task
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.personnel_ict_completions
      WHERE ict_task_id = v_task_id
    ) THEN
      CONTINUE;
    END IF;

    DELETE FROM public.ict_tasks
    WHERE id = v_task_id AND organization_id = p_org_id AND archived_at < p_cutoff;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + v_count;
  END LOOP;

  RETURN v_deleted;
END;
$$;


ALTER FUNCTION public.delete_expired_unreferenced_critical_tasks(p_org_id uuid, p_cutoff timestamp with time zone) OWNER TO postgres;

--
-- Name: delete_group_with_reassignment(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_group_with_reassignment(p_organization_id uuid, p_group_id uuid, p_target_group_id uuid) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_moved integer;
  v_group uuid;
  v_subtree uuid[];
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF p_group_id IS NULL OR p_group_id = p_target_group_id THEN
    RAISE EXCEPTION 'Choose another Group for the members' USING ERRCODE = '22023';
  END IF;
  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM personnel_private.require_group_manager(p_organization_id);
  PERFORM 1 FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_target_group_id IS NOT NULL THEN
    PERFORM 1 FROM public.groups AS g
    WHERE g.organization_id = p_organization_id AND g.id = p_target_group_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT array_agg(g.id) INTO v_subtree FROM public.groups g
  WHERE g.organization_id = p_organization_id AND p_group_id = ANY(g.path);
  IF p_target_group_id = ANY(v_subtree) THEN
    RAISE EXCEPTION 'Choose another Group for the members' USING ERRCODE = '22023';
  END IF;

  UPDATE public.personnel AS p SET group_id = p_target_group_id
  WHERE p.organization_id = p_organization_id AND p.group_id = ANY(v_subtree);
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  FOR v_group IN SELECT g.id FROM public.groups g
    WHERE g.organization_id = p_organization_id AND g.id = ANY(v_subtree)
    ORDER BY pg_catalog.cardinality(g.path) DESC, g.id
  LOOP
    DELETE FROM public.groups AS g WHERE g.organization_id = p_organization_id AND g.id = v_group;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Group management is not allowed' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN v_moved;
END;
$$;


ALTER FUNCTION public.delete_group_with_reassignment(p_organization_id uuid, p_group_id uuid, p_target_group_id uuid) OWNER TO postgres;

--
-- Name: delete_onboarding_template(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_onboarding_template(p_organization_id uuid, p_template_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_deleted boolean;
BEGIN
  PERFORM onboarding_private.admit_template_command(p_organization_id);
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'Deleting a template needs its id' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_template_id;
  v_deleted := FOUND;

  PERFORM onboarding_private.require_template_configuration(p_organization_id);
  RETURN v_deleted;
END;
$$;


ALTER FUNCTION public.delete_onboarding_template(p_organization_id uuid, p_template_id uuid) OWNER TO postgres;

--
-- Name: delete_sign_in_roster(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_sign_in_roster(p_organization_id uuid, p_roster_id uuid) RETURNS TABLE(title text, retired_object_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_roster public.sign_in_rosters;
BEGIN
  v_roster := organization_private.lock_managed_sign_in_roster(p_organization_id, p_roster_id);
  DELETE FROM public.sign_in_rosters WHERE organization_id = p_organization_id AND id = p_roster_id;
  PERFORM organization_private.require_managed_sign_in_roster(p_organization_id, v_roster.scope_group_ids);
  RETURN QUERY SELECT v_roster.title, organization_private.pending_roster_file_retirement(v_roster.signed_file_path);
END;
$$;


ALTER FUNCTION public.delete_sign_in_roster(p_organization_id uuid, p_roster_id uuid) OWNER TO postgres;

--
-- Name: delete_unused_organization_rank_catalog_entry(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_unused_organization_rank_catalog_entry(p_organization_id uuid, p_entry_id uuid, p_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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
    "public"."sign_in_rosters"
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


ALTER FUNCTION public.delete_unused_organization_rank_catalog_entry(p_organization_id uuid, p_entry_id uuid, p_code text) OWNER TO postgres;

--
-- Name: duplicate_onboarding_template(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.duplicate_onboarding_template(p_organization_id uuid, p_source_template_id uuid, p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_copy_id uuid := gen_random_uuid();
  v_inserted uuid;
  v_receipt onboarding_private.template_duplicate_receipts%ROWTYPE;
  v_source public.onboarding_templates%ROWTYPE;
  v_attempt integer := 1;
  v_name text;
  v_result jsonb;
BEGIN
  PERFORM onboarding_private.admit_template_command(p_organization_id);
  IF p_source_template_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Duplicating a template needs the template and a request id' USING ERRCODE = '22023';
  END IF;

  -- A concurrent attempt with the same key waits here until it commits or rolls back.
  INSERT INTO onboarding_private.template_duplicate_receipts (
    organization_id, user_id, request_id, source_template_id, result_template_id
  ) VALUES (p_organization_id, auth.uid(), p_request_id, p_source_template_id, v_copy_id)
  ON CONFLICT (organization_id, user_id, request_id) DO NOTHING
  RETURNING result_template_id INTO v_inserted;
  PERFORM onboarding_private.require_template_configuration(p_organization_id);

  IF v_inserted IS NULL THEN
    SELECT receipt.* INTO v_receipt FROM onboarding_private.template_duplicate_receipts AS receipt
    WHERE receipt.organization_id = p_organization_id AND receipt.user_id = auth.uid()
      AND receipt.request_id = p_request_id;
    IF v_receipt.source_template_id <> p_source_template_id THEN
      RAISE EXCEPTION 'This duplicate request was made for another template' USING ERRCODE = 'OTD01';
    END IF;
    v_copy_id := v_receipt.result_template_id;
  ELSE
    SELECT t.* INTO v_source FROM public.onboarding_templates AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_source_template_id
    FOR SHARE;
    PERFORM onboarding_private.require_template_configuration(p_organization_id);
    IF v_source.id IS NULL THEN
      RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
    END IF;

    LOOP
      v_name := v_source.name || ' Copy' || CASE
        WHEN v_attempt = 1 THEN ''
        WHEN v_attempt < 1000 THEN ' ' || v_attempt
        ELSE ' ' || pg_catalog.left(gen_random_uuid()::text, 8) END;
      -- An uncommitted insert of the same name makes this wait for its outcome.
      INSERT INTO public.onboarding_templates (id, organization_id, name, description)
      VALUES (v_copy_id, p_organization_id, v_name, v_source.description)
      ON CONFLICT ON CONSTRAINT onboarding_templates_org_name_unique DO NOTHING;
      EXIT WHEN FOUND;
      v_attempt := v_attempt + 1;
    END LOOP;

    INSERT INTO public.onboarding_template_steps (
      organization_id, template_id, name, description, step_type, training_type_id, stages, sort_order
    ) SELECT p_organization_id, v_copy_id, s.name, s.description, s.step_type, s.training_type_id, s.stages,
      (pg_catalog.row_number() OVER (ORDER BY s.sort_order, s.id) - 1)::integer
    FROM public.onboarding_template_steps AS s
    WHERE s.organization_id = p_organization_id AND s.template_id = p_source_template_id;
  END IF;

  PERFORM onboarding_private.require_template_configuration(p_organization_id);
  -- One statement, so a concurrent delete yields OTD02 rather than the copy without its steps.
  SELECT jsonb_build_object(
    'template', to_jsonb(t),
    'steps', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order, s.id), '[]'::jsonb)
      FROM public.onboarding_template_steps AS s
      WHERE s.organization_id = p_organization_id AND s.template_id = t.id),
    'created', v_inserted IS NOT NULL
  ) INTO v_result
  FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = v_copy_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'The copy from this request was deleted' USING ERRCODE = 'OTD02';
  END IF;
  RETURN v_result;
END;
$$;


ALTER FUNCTION public.duplicate_onboarding_template(p_organization_id uuid, p_source_template_id uuid, p_request_id uuid) OWNER TO postgres;

--
-- Name: enforce_personnel_document_storage_cap(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_personnel_document_storage_cap() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.enforce_personnel_document_storage_cap() OWNER TO postgres;

--
-- Name: organization_setup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_setup (
    organization_id uuid NOT NULL,
    branch text,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    prompts jsonb DEFAULT '{}'::jsonb NOT NULL,
    finished_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_setup_answers_check CHECK (organization_private.valid_setup_answers(answers)),
    CONSTRAINT organization_setup_branch_check CHECK ((branch = ANY (ARRAY['army'::text, 'navy'::text, 'air-force'::text, 'marine-corps'::text, 'coast-guard'::text, 'space-force'::text, 'civilian'::text, 'custom'::text]))),
    CONSTRAINT organization_setup_prompts_check CHECK (organization_private.valid_setup_prompts(prompts))
);


ALTER TABLE public.organization_setup OWNER TO postgres;

--
-- Name: export_organization_setup(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.export_organization_setup(p_organization_id uuid) RETURNS SETOF public.organization_setup
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.is_org_privileged(p_organization_id) THEN RAISE insufficient_privilege; END IF;
  RETURN QUERY SELECT * FROM public.organization_setup WHERE organization_id = p_organization_id;
END;
$$;


ALTER FUNCTION public.export_organization_setup(p_organization_id uuid) OWNER TO postgres;

--
-- Name: feature_is_off(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.feature_is_off(p_organization_id uuid, p_feature text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations AS o
    WHERE o.id = p_organization_id AND p_feature = ANY (o.disabled_features)
  );
$$;


ALTER FUNCTION public.feature_is_off(p_organization_id uuid, p_feature text) OWNER TO postgres;

--
-- Name: fence_failed_account_setup_attempt(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fence_failed_account_setup_attempt() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
	IF OLD.failed_at IS NULL AND NEW.failed_at IS NOT NULL THEN
		UPDATE public.account_setup_attempts SET state = 'fenced'
		WHERE setup_link_id = NEW.id AND state = 'started';
	END IF;
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.fence_failed_account_setup_attempt() OWNER TO postgres;

--
-- Name: finish_organization_setup(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finish_organization_setup(p_organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- The capability helper accepts feature lanes. Governance still needs its fixed-role gate.
  IF NOT public.is_org_privileged(p_organization_id)
    OR NOT public.member_access_has_capability(p_organization_id, 'organization', 'configure')
    THEN RAISE insufficient_privilege; END IF;
  INSERT INTO public.organization_setup(organization_id, finished_at) VALUES (p_organization_id,now())
  ON CONFLICT (organization_id) DO UPDATE SET finished_at = now(), updated_at = now();
  RETURN public.read_organization_setup(p_organization_id);
END;
$$;


ALTER FUNCTION public.finish_organization_setup(p_organization_id uuid) OWNER TO postgres;

--
-- Name: get_current_session_started_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_current_session_started_at() RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT session.created_at
  FROM auth.sessions AS session
  WHERE session.id = (NULLIF(auth.jwt() ->> 'session_id', ''))::uuid
    AND session.user_id = auth.uid();
$$;


ALTER FUNCTION public.get_current_session_started_at() OWNER TO postgres;

--
-- Name: FUNCTION get_current_session_started_at(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.get_current_session_started_at() IS 'Original start of the bearer session owned by auth.uid(); null for an absent/revoked session. No account-wide sign-in fallback.';


--
-- Name: guard_onboarding_workflow_identity(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_onboarding_workflow_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Onboarding row identity cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'personnel_onboardings' THEN
    IF NEW.personnel_id IS DISTINCT FROM OLD.personnel_id THEN
      RAISE EXCEPTION 'Onboarding personnel cannot change' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'onboarding_step_progress' THEN
    IF NEW.onboarding_id IS DISTINCT FROM OLD.onboarding_id THEN
      RAISE EXCEPTION 'Onboarding step parent cannot change' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.guard_onboarding_workflow_identity() OWNER TO postgres;

--
-- Name: import_availability_entries(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.import_availability_entries(p_organization_id uuid, p_entries jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  personnel_id uuid;
  replaced_count integer;
  replaced_id_missing boolean;
  stale integer[];
  deleted_count integer;
  inserted_count integer;
BEGIN
  IF auth.uid() IS NULL
    OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar availability import is not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_entries IS NULL
    OR jsonb_typeof(p_entries) <> 'array'
    OR jsonb_array_length(p_entries) NOT BETWEEN 1 AND 500
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_entries) AS item(value)
      WHERE jsonb_typeof(item.value) <> 'object'
        OR coalesce(item.value->>'overlap', '') NOT IN ('none', 'keep', 'replace')
        OR jsonb_typeof(coalesce(item.value->'replaces', '[]'::jsonb)) <> 'array'
        OR jsonb_typeof(coalesce(item.value->'alongside', '[]'::jsonb)) <> 'array'
    )
  THEN
    RAISE EXCEPTION 'Invalid Calendar availability import' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), coalesce(bool_or(reviewed.value->>'id' IS NULL), false)
  INTO replaced_count, replaced_id_missing
  FROM jsonb_array_elements(p_entries) AS item(value)
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(item.value->'replaces', '[]'::jsonb)) AS reviewed(value);
  IF replaced_count > 500 OR replaced_id_missing THEN
    RAISE EXCEPTION 'Invalid Calendar availability import' USING ERRCODE = '22023';
  END IF;

  FOR personnel_id IN
    SELECT DISTINCT (item.value->>'personnel_id')::uuid
    FROM jsonb_array_elements(p_entries) AS item(value)
    ORDER BY (item.value->>'personnel_id')::uuid
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_organization_id::text || ':' || personnel_id::text, 1861)
    );
  END LOOP;

  PERFORM 1
  FROM public.availability_entries saved
  WHERE saved.organization_id = p_organization_id
    AND saved.id IN (
      SELECT (reviewed.value->>'id')::uuid
      FROM jsonb_array_elements(p_entries) AS item(value)
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(item.value->'replaces', '[]'::jsonb)) AS reviewed(value)
      WHERE item.value->>'overlap' = 'replace'
    )
  ORDER BY saved.id
  FOR UPDATE;

  SELECT coalesce(array_agg((item.position - 1)::integer ORDER BY item.position), '{}')
  INTO stale
  FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS item(value, position)
  CROSS JOIN LATERAL jsonb_to_record(item.value) AS entry(
    personnel_id uuid, status_type_id uuid, start_date date, end_date date, overlap text
  )
  WHERE (entry.overlap = 'replace' AND EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(coalesce(item.value->'replaces', '[]'::jsonb))
      AS reviewed(id uuid, status_type_id uuid, start_date date, end_date date, note text)
    JOIN public.availability_entries saved
      ON saved.organization_id = p_organization_id AND saved.id = reviewed.id
    WHERE saved.personnel_id IS DISTINCT FROM entry.personnel_id
      OR saved.status_type_id IS DISTINCT FROM reviewed.status_type_id
      OR saved.start_date IS DISTINCT FROM reviewed.start_date
      OR saved.end_date IS DISTINCT FROM reviewed.end_date
      OR saved.note IS DISTINCT FROM reviewed.note
      OR saved.start_date > entry.end_date
      OR saved.end_date < entry.start_date
  )) OR EXISTS (
    SELECT 1 FROM public.availability_entries saved
    WHERE saved.organization_id = p_organization_id
      AND saved.personnel_id = entry.personnel_id
      AND saved.start_date <= entry.end_date
      AND saved.end_date >= entry.start_date
      AND (
        (saved.status_type_id = entry.status_type_id
          AND saved.start_date = entry.start_date AND saved.end_date = entry.end_date)
        OR (entry.overlap <> 'keep'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_to_recordset(coalesce(item.value->'replaces', '[]'::jsonb)) AS reviewed(id uuid)
            WHERE entry.overlap = 'replace' AND reviewed.id = saved.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_to_recordset(coalesce(item.value->'alongside', '[]'::jsonb))
              AS partner(status_type_id uuid, start_date date, end_date date)
            WHERE partner.status_type_id = saved.status_type_id
              AND partner.start_date = saved.start_date AND partner.end_date = saved.end_date
          )
        )
      )
  );

  DELETE FROM public.availability_entries saved
  USING jsonb_array_elements(p_entries) WITH ORDINALITY AS item(value, position),
    jsonb_to_recordset(coalesce(item.value->'replaces', '[]'::jsonb)) AS reviewed(id uuid)
  WHERE item.position - 1 <> ALL(stale)
    AND item.value->>'overlap' = 'replace'
    AND saved.organization_id = p_organization_id
    AND saved.id = reviewed.id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  INSERT INTO public.availability_entries(
    organization_id, personnel_id, status_type_id, start_date, end_date, note
  )
  SELECT p_organization_id, entry.personnel_id, entry.status_type_id, entry.start_date, entry.end_date, entry.note
  FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS item(value, position)
  CROSS JOIN LATERAL jsonb_to_record(item.value) AS entry(
    personnel_id uuid, status_type_id uuid, start_date date, end_date date, note text
  )
  WHERE item.position - 1 <> ALL(stale);
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object('inserted', inserted_count, 'deleted', deleted_count, 'stale', to_jsonb(stale));
END;
$$;


ALTER FUNCTION public.import_availability_entries(p_organization_id uuid, p_entries jsonb) OWNER TO postgres;

--
-- Name: is_org_member(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_org_member(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;


ALTER FUNCTION public.is_org_member(p_organization_id uuid) OWNER TO postgres;

--
-- Name: is_org_owner(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_org_owner(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" = 'owner'
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;


ALTER FUNCTION public.is_org_owner(p_organization_id uuid) OWNER TO postgres;

--
-- Name: is_org_privileged(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_org_privileged(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT EXISTS (
		SELECT 1
		FROM "public"."organization_memberships"
		WHERE "organization_memberships"."organization_id" = "p_organization_id"
			AND "organization_memberships"."user_id" = "auth"."uid"()
			AND "organization_memberships"."role" IN ('owner', 'admin')
	) AND "public"."organization_access_admitted"("p_organization_id");
$$;


ALTER FUNCTION public.is_org_privileged(p_organization_id uuid) OWNER TO postgres;

--
-- Name: is_platform_operator(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_platform_operator() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT coalesce((SELECT auth.jwt()->>'aal') = 'aal2', false)
  AND EXISTS (SELECT 1 FROM public.platform_operators WHERE user_id = (SELECT auth.uid()))
  AND NOT EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = (SELECT auth.uid()));
$$;


ALTER FUNCTION public.is_platform_operator() OWNER TO postgres;

--
-- Name: is_roster_form_rules(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_roster_form_rules(p_rules jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
BEGIN
  IF p_rules IS NULL OR pg_catalog.jsonb_typeof(p_rules) <> 'object'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_rules)) <> 2
  THEN
    RETURN false;
  END IF;
  IF pg_catalog.jsonb_typeof(p_rules -> 'weekendMode') IS DISTINCT FROM 'string'
    OR (p_rules ->> 'weekendMode') NOT IN ('same', 'separate', 'none')
  THEN
    RETURN false;
  END IF;
  RETURN pg_catalog.jsonb_typeof(p_rules -> 'pool') IS NOT DISTINCT FROM 'null'
    OR public.is_roster_pool_rules(p_rules -> 'pool');
END;
$$;


ALTER FUNCTION public.is_roster_form_rules(p_rules jsonb) OWNER TO postgres;

--
-- Name: is_roster_pool_rules(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_roster_pool_rules(p_rules jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_key text;
BEGIN
  IF p_rules IS NULL OR pg_catalog.jsonb_typeof(p_rules) <> 'object'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_rules)) <> 4
  THEN
    RETURN false;
  END IF;
  FOREACH v_key IN ARRAY ARRAY['mos', 'role', 'groupIds'] LOOP
    IF pg_catalog.jsonb_typeof(p_rules -> v_key) IS DISTINCT FROM 'array' THEN
      RETURN false;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_rules -> v_key) AS e(value)
      WHERE pg_catalog.jsonb_typeof(e.value) <> 'string'
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  IF pg_catalog.jsonb_typeof(p_rules -> 'rank') = 'null' THEN
    RETURN true;
  END IF;
  IF pg_catalog.jsonb_typeof(p_rules -> 'rank') IS DISTINCT FROM 'object'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_rules -> 'rank')) <> 2
  THEN
    RETURN false;
  END IF;
  RETURN pg_catalog.jsonb_typeof(p_rules -> 'rank' -> 'from') IS NOT DISTINCT FROM 'string'
    AND pg_catalog.jsonb_typeof(p_rules -> 'rank' -> 'to') IS NOT DISTINCT FROM 'string'
    AND (p_rules -> 'rank' ->> 'from') IS DISTINCT FROM ''
    AND (p_rules -> 'rank' ->> 'to') IS DISTINCT FROM '';
END;
$$;


ALTER FUNCTION public.is_roster_pool_rules(p_rules jsonb) OWNER TO postgres;

--
-- Name: is_user_suspended(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_user_suspended(check_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT CASE WHEN current_setting('role', true) = 'service_role'
  OR public.is_platform_operator() OR (SELECT auth.uid()) = check_user_id
 THEN EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = check_user_id)
 ELSE false END;
$$;


ALTER FUNCTION public.is_user_suspended(check_user_id uuid) OWNER TO postgres;

--
-- Name: is_valid_sensitive_file_path(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_valid_sensitive_file_path(bucket_name text, object_name text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT
    bucket_name = 'counseling-files'
    AND public.storage_object_org_id(object_name) IS NOT NULL
    AND public.storage_object_scope(object_name) = ANY (ARRAY['sign-in-rosters', 'counseling-records'])
    AND COALESCE(storage.extension(object_name), '') = 'pdf'
$$;


ALTER FUNCTION public.is_valid_sensitive_file_path(bucket_name text, object_name text) OWNER TO postgres;

--
-- Name: issue_account_setup_link(uuid, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.issue_account_setup_link(p_access_request_id uuid, p_token_hash text, p_expires_at timestamp with time zone, p_created_at timestamp with time zone DEFAULT now()) RETURNS TABLE(issue_status text, setup_link_id uuid, expires_at timestamp with time zone, created_at timestamp with time zone, revoked_setup_link_ids uuid[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
	"request_row" "public"."access_requests"%ROWTYPE;
	"link_row" "public"."account_setup_links"%ROWTYPE;
	"revoked_ids" uuid[];
BEGIN
	SELECT *
	INTO "request_row"
	FROM "public"."access_requests"
	WHERE "access_requests"."id" = "p_access_request_id"
	FOR SHARE;

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'access-request-missing'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END IF;

	IF "request_row"."status" <> 'approved' THEN
		RETURN QUERY SELECT 'access-request-not-approved'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END IF;

	IF "request_row"."setup_completed_at" IS NOT NULL THEN
		RETURN QUERY SELECT 'access-request-completed'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END IF;

	IF NOT "public"."access_request_setup_grant_is_live"("p_access_request_id") THEN
		RETURN QUERY SELECT 'access-request-not-approved'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END IF;

	BEGIN
		WITH "revoked" AS (
			UPDATE "public"."account_setup_links"
			SET "revoked_at" = "p_created_at", "revocation_reason" = 'replaced'
			WHERE "account_setup_links"."access_request_id" = "p_access_request_id"
				AND "account_setup_links"."claimed_at" IS NULL
				AND "account_setup_links"."used_at" IS NULL
				AND "account_setup_links"."revoked_at" IS NULL
			RETURNING "account_setup_links"."id"
		)
		SELECT coalesce(array_agg("revoked"."id"), ARRAY[]::uuid[]) INTO "revoked_ids" FROM "revoked";

		INSERT INTO "public"."account_setup_links" ("access_request_id", "token_hash", "expires_at", "created_at")
		VALUES ("p_access_request_id", "p_token_hash", "p_expires_at", "p_created_at")
		RETURNING * INTO "link_row";
	EXCEPTION WHEN unique_violation THEN
		RETURN QUERY SELECT 'concurrent-create'::text, NULL::uuid, NULL::timestamp with time zone,
			NULL::timestamp with time zone, ARRAY[]::uuid[];
		RETURN;
	END;

	RETURN QUERY SELECT 'created'::text, "link_row"."id", "link_row"."expires_at", "link_row"."created_at", "revoked_ids";
END;
$$;


ALTER FUNCTION public.issue_account_setup_link(p_access_request_id uuid, p_token_hash text, p_expires_at timestamp with time zone, p_created_at timestamp with time zone) OWNER TO postgres;

--
-- Name: personnel_ict_completions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel_ict_completions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    ict_task_id uuid NOT NULL,
    completed_at date NOT NULL,
    validation_method public.ict_validation_method NOT NULL,
    validated_by text,
    notes text,
    logged_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.personnel_ict_completions OWNER TO postgres;

--
-- Name: latest_active_personnel_ict_completions(uuid, uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.latest_active_personnel_ict_completions(p_organization_id uuid, p_personnel_ids uuid[] DEFAULT NULL::uuid[], p_ict_task_ids uuid[] DEFAULT NULL::uuid[]) RETURNS SETOF public.personnel_ict_completions
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT DISTINCT ON (pic.personnel_id, pic.ict_task_id) pic.*
  FROM public.personnel_ict_completions pic
  JOIN public.personnel p
    ON p.id = pic.personnel_id AND p.organization_id = pic.organization_id AND p.archived_at IS NULL
  JOIN public.ict_tasks t
    ON t.id = pic.ict_task_id AND t.organization_id = pic.organization_id AND t.archived_at IS NULL
  WHERE pic.organization_id = p_organization_id
    AND (pic.organization_id, pic.personnel_id) IN (
      SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('criticalTasks') v
    )
    AND (p_personnel_ids IS NULL OR pic.personnel_id = ANY(p_personnel_ids))
    AND (p_ict_task_ids IS NULL OR pic.ict_task_id = ANY(p_ict_task_ids))
  ORDER BY pic.personnel_id, pic.ict_task_id, pic.completed_at DESC, pic.created_at DESC;
$$;


ALTER FUNCTION public.latest_active_personnel_ict_completions(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) OWNER TO postgres;

--
-- Name: link_organization_invitation_access_request(uuid, uuid, text, uuid, timestamp with time zone, text, text, jsonb, text, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.link_organization_invitation_access_request(p_invitation_id uuid, p_organization_id uuid, p_email text, p_invited_by uuid, p_invited_at timestamp with time zone, p_role text, p_member_preset text, p_capability_overrides jsonb, p_access_scope_kind text, p_access_scope_group_ids uuid[]) RETURNS TABLE(bridge_status text, access_request_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
	"invitee_email" text := lower(btrim("p_email"));
	"request_id" uuid;
	"linked_request_id" uuid;
	"created_request" boolean := false;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('access-request-invitation-bridge:' || "invitee_email", 0));

	SELECT "link"."access_request_id"
	INTO "linked_request_id"
	FROM "public"."access_request_organization_invitation_links" AS "link"
	WHERE "link"."organization_invitation_id" = "p_invitation_id";

	IF FOUND THEN
		RETURN QUERY SELECT 'already-linked'::text, "linked_request_id";
		RETURN;
	END IF;

	PERFORM 1
	FROM "public"."organization_invitations" AS "invitation"
	WHERE "invitation"."id" = "p_invitation_id"
		AND "invitation"."organization_id" = "p_organization_id"
		AND "invitation"."normalized_email" = "invitee_email"
		AND "invitation"."status" = 'pending'::"public"."invitation_status";

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'invitation-not-pending'::text, NULL::uuid;
		RETURN;
	END IF;

	FOR "attempt" IN 1..3 LOOP
		SELECT "request"."id"
		INTO "request_id"
		FROM "public"."access_requests" AS "request"
		WHERE "request"."email" = "invitee_email"
			AND (
				"request"."status" = 'pending'
				OR (
					"request"."status" = 'approved'
					AND "request"."setup_completed_at" IS NULL
					AND coalesce("request"."reviewed_at", "request"."created_at") >= now() - interval '90 days'
				)
			)
		ORDER BY ("request"."status" = 'pending') DESC, "request"."reviewed_at" DESC NULLS LAST, "request"."created_at" DESC
		LIMIT 1
		FOR UPDATE;

		EXIT WHEN "request_id" IS NOT NULL;

		INSERT INTO "public"."access_requests" ("email", "name", "reason", "heard_about", "heard_about_details")
		VALUES (
			"invitee_email",
			"invitee_email",
			'Created from an Organization Invitation.',
			'other',
			'Organization Invitation'
		)
		ON CONFLICT (lower("email")) WHERE "status" = 'pending' DO NOTHING
		RETURNING "access_requests"."id" INTO "request_id";

		IF "request_id" IS NOT NULL THEN
			"created_request" := true;
			EXIT;
		END IF;
	END LOOP;

	IF "request_id" IS NULL THEN
		RAISE EXCEPTION 'Access Request for invitation % could not be found or created', "p_invitation_id";
	END IF;

	INSERT INTO "public"."access_request_organization_invitation_links" (
		"access_request_id",
		"organization_invitation_id",
		"organization_id",
		"invited_by",
		"invited_at",
		"intended_membership_role",
		"intended_member_preset",
		"intended_capability_overrides",
		"intended_access_scope_kind",
		"intended_access_scope_group_ids"
	)
	VALUES (
		"request_id",
		"p_invitation_id",
		"p_organization_id",
		"p_invited_by",
		"p_invited_at",
		"p_role",
		"p_member_preset",
		coalesce("p_capability_overrides", '{}'::jsonb),
		"p_access_scope_kind",
		coalesce("p_access_scope_group_ids", ARRAY[]::uuid[])
	);

	UPDATE "public"."access_requests"
	SET
		"status" = 'approved',
		"approval_basis" = 'organization_invitation',
		"reviewed_by" = "p_invited_by",
		"reviewed_at" = now()
	WHERE "access_requests"."id" = "request_id"
		AND "access_requests"."status" = 'pending';

	RETURN QUERY SELECT CASE WHEN "created_request" THEN 'created' ELSE 'linked' END::text, "request_id";
END;
$$;


ALTER FUNCTION public.link_organization_invitation_access_request(p_invitation_id uuid, p_organization_id uuid, p_email text, p_invited_by uuid, p_invited_at timestamp with time zone, p_role text, p_member_preset text, p_capability_overrides jsonb, p_access_scope_kind text, p_access_scope_group_ids uuid[]) OWNER TO postgres;

--
-- Name: list_audit_log_actions(uuid, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_audit_log_actions(p_org_id uuid, p_excluded_actions text[] DEFAULT ARRAY[]::text[]) RETURNS TABLE(action text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    SELECT DISTINCT "audit_logs"."action"
    FROM "public"."audit_logs"
    WHERE "audit_logs"."org_id" = "p_org_id"
      AND NOT ("audit_logs"."action" = ANY("p_excluded_actions"))
    ORDER BY "audit_logs"."action";
$$;


ALTER FUNCTION public.list_audit_log_actions(p_org_id uuid, p_excluded_actions text[]) OWNER TO postgres;

--
-- Name: list_calendar_event_tasking_summaries(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_calendar_event_tasking_summaries(p_organization_id uuid, p_event_id uuid) RETURNS TABLE(id uuid, title text, responsible_group_name text, status text, staffing_required integer, staffing_picked integer, suspense_on date, execution_starts_on date, execution_ends_on date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL
    OR calendar_private.can_view_calendar_events(p_organization_id) IS NOT TRUE
    OR NOT EXISTS (
      SELECT 1 FROM public.calendar_events AS e
      WHERE e.organization_id = p_organization_id AND e.id = p_event_id
    )
  THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT t.id, t.title, g.name, t.status, t.staffing_required,
    (SELECT count(*)::integer FROM public.calendar_tasking_participants AS p
     WHERE p.organization_id = t.organization_id AND p.tasking_id = t.id AND p.review_since IS NULL),
    t.suspense_on, t.execution_starts_on, t.execution_ends_on
  FROM public.calendar_taskings AS t
  LEFT JOIN public.groups AS g
    ON g.organization_id = t.organization_id AND g.id = t.responsible_group_id
  WHERE t.organization_id = p_organization_id
    AND t.event_id = p_event_id
    AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id) IS NOT TRUE
  ORDER BY t.suspense_on, t.title, t.id;
END;
$$;


ALTER FUNCTION public.list_calendar_event_tasking_summaries(p_organization_id uuid, p_event_id uuid) OWNER TO postgres;

--
-- Name: list_pending_organization_file_retirements(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_pending_organization_file_retirements(p_limit integer) RETURNS TABLE(bucket_id text, object_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_column
BEGIN
  PERFORM organization_private.promote_file_retirement_holds(p_limit);
  RETURN QUERY
  WITH picked AS (
    SELECT key_digest FROM organization_private.file_retirements
    WHERE object_name IS NOT NULL
    ORDER BY attempted_at NULLS FIRST, retired_at
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 0), 0), 1000)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE organization_private.file_retirements AS retirement
  SET attempted_at = pg_catalog.clock_timestamp()
  FROM picked WHERE retirement.key_digest = picked.key_digest
  RETURNING retirement.bucket_id, retirement.object_name;
END;
$$;


ALTER FUNCTION public.list_pending_organization_file_retirements(p_limit integer) OWNER TO postgres;

--
-- Name: list_personnel_award_tracking_acknowledged(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_personnel_award_tracking_acknowledged(p_organization_id uuid) RETURNS TABLE(personnel_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.list_personnel_award_tracking_acknowledged(p_organization_id uuid) OWNER TO postgres;

--
-- Name: list_platform_activity(text[], text[], text, timestamp with time zone, timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_platform_activity(p_actions text[], p_prefixes text[], p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) RETURNS TABLE(id uuid, "timestamp" timestamp with time zone, user_id uuid, org_id uuid, org_name text, actor_email text, actor_name text, action text, resource_type text, resource_id uuid, ip_address text, details jsonb, severity text, total_count bigint, page_offset integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH matched AS MATERIALIZED (
    SELECT a.id, a."timestamp", a.user_id, a.org_id, o.name AS org_name, u.email::text AS actor_email,
      CASE WHEN person.name IS NULL THEN NULL
        ELSE nullif(trim(concat_ws(' ', person.rank, person.name)), '') END AS actor_name,
      a.action, a.resource_type, a.resource_id, a.ip_address::text AS ip_address, a.details, a.severity
    FROM public.audit_logs a
    LEFT JOIN public.organizations o ON o.id = a.org_id
    LEFT JOIN auth.users u ON u.id = a.user_id
    LEFT JOIN public.user_profiles up ON up.user_id = u.id
    LEFT JOIN auth.users t ON a.resource_type = 'user' AND t.id = a.resource_id
    LEFT JOIN public.user_profiles tp ON tp.user_id = t.id
    LEFT JOIN LATERAL (
      SELECT coalesce(
        nullif(trim(concat_ws(' ', up.first_name, up.last_name)), ''),
        nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(u.raw_user_meta_data ->> 'name'), '')
      ) AS name,
      coalesce(nullif(up.rank, 'CIV'), nullif(nullif(trim(u.raw_user_meta_data ->> 'rank'), ''), 'CIV')) AS rank
    ) person ON true
    WHERE (
        a.action = ANY (coalesce(p_actions, ARRAY[]::text[]))
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(p_prefixes, ARRAY[]::text[])) AS prefix WHERE starts_with(a.action, prefix)
        )
      )
      AND (p_from IS NULL OR a."timestamp" >= p_from)
      AND (p_to IS NULL OR a."timestamp" < p_to)
      AND (
        coalesce(p_search, '') = ''
        OR strpos(lower(a.action), lower(p_search)) > 0
        OR strpos(lower(coalesce(a.details ->> 'actorEmail', '')), lower(p_search)) > 0
        OR strpos(lower(coalesce(u.email, '')), lower(p_search)) > 0
        OR strpos(lower(coalesce(person.name, '')), lower(p_search)) > 0
        OR strpos(lower(coalesce(t.email, '')), lower(p_search)) > 0
        OR strpos(lower(concat_ws(' ', tp.first_name, tp.last_name)), lower(p_search)) > 0
        OR strpos(lower(coalesce(a.details ->> 'targetName', '')), lower(p_search)) > 0
        OR strpos(lower(coalesce(a.resource_id::text, '')), lower(p_search)) > 0
        OR strpos(lower(coalesce(o.name, '')), lower(p_search)) > 0
      )
  ),
  bounds AS (
    SELECT count(*) AS total,
      least(greatest(p_offset, 0), (greatest(count(*) - 1, 0) / greatest(p_limit, 1)) * greatest(p_limit, 1))::integer AS skip
    FROM matched
  )
  SELECT m.id, m."timestamp", m.user_id, m.org_id, m.org_name, m.actor_email, m.actor_name, m.action, m.resource_type, m.resource_id, m.ip_address,
    m.details, m.severity, b.total, b.skip
  FROM matched m CROSS JOIN bounds b
  ORDER BY m."timestamp" DESC, m.id
  OFFSET (SELECT skip FROM bounds) LIMIT greatest(p_limit, 1);
$$;


ALTER FUNCTION public.list_platform_activity(p_actions text[], p_prefixes text[], p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) OWNER TO postgres;

--
-- Name: list_platform_owner_membership_metrics(uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_platform_owner_membership_metrics(p_org_ids uuid[]) RETURNS TABLE(organization_id uuid, owner_count bigint, owner_user_id uuid, owner_email text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
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


ALTER FUNCTION public.list_platform_owner_membership_metrics(p_org_ids uuid[]) OWNER TO postgres;

--
-- Name: list_rating_scheme_personnel_lookup(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_rating_scheme_personnel_lookup(p_organization_id uuid) RETURNS TABLE(id uuid, rank text, last_name text, first_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.id, p.rank, p.last_name, p.first_name
  FROM public.personnel p
  WHERE p.organization_id = p_organization_id
    AND p.archived_at IS NULL
    AND public.member_access_has_capability(p_organization_id, 'ratingScheme', 'view')
    AND public.rating_scheme_personnel_group_scope_matches(p_organization_id, p.group_id)
  ORDER BY p.last_name ASC, p.first_name ASC;
$$;


ALTER FUNCTION public.list_rating_scheme_personnel_lookup(p_organization_id uuid) OWNER TO postgres;

--
-- Name: list_roster_detail_days(uuid, uuid, date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.list_roster_detail_days(p_organization_id uuid, p_assignment_type_id uuid, p_from date, p_through date) RETURNS TABLE(date date, assignee_id text, source text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL OR public.can_view_calendar(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar access is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.date, a.assignee_id, a.source
  FROM public.daily_assignments a
  WHERE a.organization_id = p_organization_id AND a.assignment_type_id = p_assignment_type_id
    AND a.date BETWEEN p_from AND p_through
    AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.organization_id = a.organization_id AND g.id::text = a.assignee_id)
    AND EXISTS (
      SELECT 1 FROM public.assignment_types t
      WHERE t.organization_id = p_organization_id AND t.id = a.assignment_type_id AND t.assign_to = 'personnel'
    )
    AND (
      a.assignee_id IN (
        SELECT v.personnel_id::text FROM member_access_private.viewable_personnel('calendar') v
        WHERE v.organization_id = p_organization_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.personnel p WHERE p.organization_id = p_organization_id AND p.id::text = a.assignee_id
      )
    )
  ORDER BY a.date;
END;
$$;


ALTER FUNCTION public.list_roster_detail_days(p_organization_id uuid, p_assignment_type_id uuid, p_from date, p_through date) OWNER TO postgres;

--
-- Name: organization_invitation_email_outbox; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_invitation_email_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    invitation_id uuid NOT NULL,
    recipient text NOT NULL,
    purpose text DEFAULT 'organization_invitation'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT organization_invitation_email_outbox_purpose_check CHECK ((purpose = 'organization_invitation'::text)),
    CONSTRAINT organization_invitation_email_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


ALTER TABLE public.organization_invitation_email_outbox OWNER TO postgres;

--
-- Name: mark_organization_invitation_email_outbox_delivery(uuid, text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_organization_invitation_email_outbox_delivery(p_outbox_id uuid, p_status text, p_marked_at timestamp with time zone DEFAULT now(), p_last_error text DEFAULT NULL::text) RETURNS SETOF public.organization_invitation_email_outbox
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.mark_organization_invitation_email_outbox_delivery(p_outbox_id uuid, p_status text, p_marked_at timestamp with time zone, p_last_error text) OWNER TO postgres;

--
-- Name: member_access_capability_level(boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.member_access_capability_level(p_can_view boolean, p_can_edit boolean) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN "p_can_edit" THEN 'configure'
    WHEN "p_can_view" THEN 'view'
    ELSE 'none'
  END;
$$;


ALTER FUNCTION public.member_access_capability_level(p_can_view boolean, p_can_edit boolean) OWNER TO postgres;

--
-- Name: member_access_capability_override(text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.member_access_capability_override(p_base_level text, p_can_view boolean, p_can_edit boolean) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN "public"."member_access_capability_level"("p_can_view", "p_can_edit") = "p_base_level" THEN NULL
    ELSE "public"."member_access_capability_level"("p_can_view", "p_can_edit")
  END;
$$;


ALTER FUNCTION public.member_access_capability_override(p_base_level text, p_can_view boolean, p_can_edit boolean) OWNER TO postgres;

--
-- Name: member_access_group_scope_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.member_access_group_scope_matches(p_organization_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
      AND (
        m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization' OR p_group_id IS NULL
        OR (m.access_scope_kind = 'groups' AND EXISTS (
          SELECT 1 FROM public.groups g WHERE g.organization_id = p_organization_id AND g.id = p_group_id
            AND g.path && m.access_scope_group_ids
        ))
      )
  );
$$;


ALTER FUNCTION public.member_access_group_scope_matches(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: member_access_has_capability(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.member_access_has_capability(p_organization_id uuid, p_lane text, p_required_capability text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.member_access_has_capability(p_organization_id uuid, p_lane text, p_required_capability text) OWNER TO postgres;

--
-- Name: member_access_lane_capability(text, jsonb, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.member_access_lane_capability(p_member_preset text, p_capability_overrides jsonb, p_lane text) RETURNS text
    LANGUAGE sql IMMUTABLE
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


ALTER FUNCTION public.member_access_lane_capability(p_member_preset text, p_capability_overrides jsonb, p_lane text) OWNER TO postgres;

--
-- Name: member_access_required_capability_rank(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.member_access_required_capability_rank(p_capability text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE "p_capability"
    WHEN 'none' THEN 0
    WHEN 'view' THEN 1
    WHEN 'operate' THEN 2
    WHEN 'configure' THEN 3
    ELSE 0
  END;
$$;


ALTER FUNCTION public.member_access_required_capability_rank(p_capability text) OWNER TO postgres;

--
-- Name: onboarding_template_training_type_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.onboarding_template_training_type_matches(p_organization_id uuid, p_training_type_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.can_view_onboarding(p_organization_id)
    AND (p_training_type_id IS NULL OR EXISTS (
      SELECT 1 FROM public.training_types t
      WHERE t.id = p_training_type_id AND t.organization_id = p_organization_id
    ));
$$;


ALTER FUNCTION public.onboarding_template_training_type_matches(p_organization_id uuid, p_training_type_id uuid) OWNER TO postgres;

--
-- Name: organization_access_admitted(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.organization_access_admitted(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT public.organization_access_admitted(p_organization_id, NULL); $$;


ALTER FUNCTION public.organization_access_admitted(p_organization_id uuid) OWNER TO postgres;

--
-- Name: organization_access_admitted(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.organization_access_admitted(p_organization_id uuid, p_feature text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_suspensions WHERE user_suspensions.user_id = auth.uid()
  ) AND EXISTS (
    SELECT 1 FROM public.organizations AS o
    WHERE o.id = p_organization_id AND o.suspended_at IS NULL
      AND (p_feature IS NULL OR NOT (p_feature = ANY (o.disabled_features)))
  );
$$;


ALTER FUNCTION public.organization_access_admitted(p_organization_id uuid, p_feature text) OWNER TO postgres;

--
-- Name: organization_feature_enabled(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.organization_feature_enabled(p_organization_id uuid, p_feature text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships AS m
    WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
  ) AND public.organization_access_admitted(p_organization_id, p_feature);
$$;


ALTER FUNCTION public.organization_feature_enabled(p_organization_id uuid, p_feature text) OWNER TO postgres;

--
-- Name: organization_member_labels(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.organization_member_labels(p_organization_id uuid) RETURNS TABLE(user_id uuid, rank text, first_name text, last_name text, email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT m.user_id, p.rank, p.first_name, p.last_name, m.email
  FROM public.organization_memberships m
  LEFT JOIN public.user_profiles p ON p.user_id = m.user_id
  WHERE m.organization_id = p_organization_id
    AND EXISTS (SELECT 1 FROM public.organization_memberships caller
      WHERE caller.organization_id = p_organization_id AND caller.user_id = auth.uid())
  ORDER BY m.user_id;
$$;


ALTER FUNCTION public.organization_member_labels(p_organization_id uuid) OWNER TO postgres;

--
-- Name: organization_rank_catalog_reference_matches(text, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.organization_rank_catalog_reference_matches(p_value text, p_code text, p_allow_normalized boolean) RETURNS boolean
    LANGUAGE sql IMMUTABLE
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


ALTER FUNCTION public.organization_rank_catalog_reference_matches(p_value text, p_code text, p_allow_normalized boolean) OWNER TO postgres;

--
-- Name: organization_storage_object_is_owner_removable(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.organization_storage_object_is_owner_removable(bucket_name text, object_name text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN bucket_name IN ('counseling-files', 'personnel-documents', 'training-certificates')
      AND object_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    THEN (SELECT auth.uid()) IS NOT NULL
      AND public.is_user_suspended((SELECT auth.uid())) IS FALSE
      AND public.is_org_owner(pg_catalog.split_part(object_name, '/', 1)::uuid)
      AND EXISTS (
        SELECT 1 FROM public.organizations AS organization
        WHERE organization.id = pg_catalog.split_part(object_name, '/', 1)::uuid
          AND organization.suspended_at IS NULL
      )
    ELSE false
  END;
$$;


ALTER FUNCTION public.organization_storage_object_is_owner_removable(bucket_name text, object_name text) OWNER TO postgres;

--
-- Name: password_change_attempt(uuid, uuid, text, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.password_change_attempt(p_actor uuid, p_session uuid, p_action text, p_flow text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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
  -- Inside a pending recovery or invite flow, an expired completion stays
  -- expired: that flow skips current-password proof and must not mutate twice.
  IF p_action IN ('read', 'begin', 'restart') AND attempt.state = 'complete'
    AND (attempt.session_id <> p_session OR (attempt.expires_at <= clock_timestamp() AND p_flow IS NULL)) THEN
    IF p_action <> 'read' THEN DELETE FROM public.password_change_attempts WHERE actor = p_actor; END IF;
    attempt := NULL;
  END IF;
  IF p_action = 'begin' AND attempt.actor IS NULL THEN
    IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '24 hours'
      THEN RAISE EXCEPTION 'Invalid password expiry'; END IF;
    INSERT INTO public.password_change_attempts(actor, session_id, flow, expires_at, state)
      VALUES (p_actor, p_session, p_flow, p_expires_at, 'started') RETURNING * INTO attempt;
    acquired := true;
  END IF;
  IF attempt.actor IS NULL THEN RETURN jsonb_build_object('state', NULL); END IF;
  -- A fresh authenticated session may retire an expired unfinished attempt.
  IF p_action = 'restart' AND (
    (attempt.session_id = p_session AND attempt.state = 'failed') OR
    (attempt.session_id = p_session AND attempt.state = 'complete' AND p_flow IS NULL) OR
    (attempt.session_id <> p_session AND attempt.expires_at <= clock_timestamp())
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
    THEN RAISE EXCEPTION 'Password attempt changed' USING ERRCODE = 'PT409'; END IF;
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


ALTER FUNCTION public.password_change_attempt(p_actor uuid, p_session uuid, p_action text, p_flow text, p_expires_at timestamp with time zone, p_id uuid) OWNER TO postgres;

--
-- Name: personnel_extended_info_scope_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.personnel_extended_info_scope_matches(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel p
    WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
      AND public.can_edit_personnel_record(p_organization_id, p.group_id)
  );
$$;


ALTER FUNCTION public.personnel_extended_info_scope_matches(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: personnel_file_artifact_deletion(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.personnel_file_artifact_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid) RETURNS TABLE(bucket_id text, object_name text, file_removed boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT * FROM organization_private.artifact_file_deletion(p_organization_id, p_personnel_id, p_kind, p_artifact_id);
$$;


ALTER FUNCTION public.personnel_file_artifact_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid) OWNER TO postgres;

--
-- Name: personnel_sensitive_artifact_is_readable(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.personnel_sensitive_artifact_is_readable(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'personnel', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
        AND public.can_view_personnel_record(p_organization_id, p.group_id)
    );
$$;


ALTER FUNCTION public.personnel_sensitive_artifact_is_readable(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: platform_account_directory(text, text, integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_account_directory(p_search text DEFAULT ''::text, p_filter text DEFAULT 'all'::text, p_page integer DEFAULT 1, p_limit integer DEFAULT 20, p_sort text DEFAULT 'added'::text, p_dir text DEFAULT 'desc'::text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH input AS (
    SELECT CASE WHEN p_sort IN ('person', 'organizations', 'lastSignIn', 'status', 'added') AND p_dir IN ('asc', 'desc')
        THEN p_sort ELSE 'added' END AS sort_key,
      CASE WHEN p_sort IN ('person', 'organizations', 'lastSignIn', 'status', 'added') AND p_dir IN ('asc', 'desc')
        THEN p_dir ELSE 'desc' END AS direction,
      '%' || replace(replace(replace(left(trim(coalesce(p_search, '')), 100), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' AS pattern,
      greatest(1, least(coalesce(p_limit, 20), 100)) AS lim,
      greatest(1, coalesce(p_page, 1)) AS requested_page
  ), request_candidates AS MATERIALIZED (
    SELECT r.id, r.email, r.created_at FROM public.access_requests r, input
    WHERE p_filter IN ('all', 'notSetUp') AND (r.name ILIKE input.pattern OR r.email ILIKE input.pattern)
      AND r.status = 'approved' AND r.setup_completed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.access_requests newer
        WHERE lower(newer.email) = lower(r.email) AND (newer.created_at, newer.id) > (r.created_at, r.id))
  ), requests AS (
    SELECT DISTINCT ON (lower(r.email)) r.id FROM request_candidates r
    WHERE public.access_request_setup_grant_is_live(r.id)
    ORDER BY lower(r.email), r.created_at DESC, r.id DESC
  ), people AS (
    SELECT u.id, u.email, coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email, 'Unnamed account') AS name,
      u.created_at, u.last_sign_in_at, u.email_confirmed_at,
      CASE WHEN s.user_id IS NULL THEN jsonb_build_object('kind', 'active', 'userId', u.id)
        ELSE jsonb_build_object('kind', 'suspended', 'userId', u.id, 'reason', coalesce(s.reason, ''), 'suspendedAt', s.suspended_at) END AS state
    FROM auth.users u LEFT JOIN public.user_profiles p ON p.user_id = u.id
      LEFT JOIN public.user_suspensions s ON s.user_id = u.id
    UNION ALL
    SELECT r.id, r.email, r.name, r.created_at, NULL::timestamptz, NULL::timestamptz,
      jsonb_build_object('kind', 'notSetUp', 'requestId', r.id, 'approvedAt', coalesce(r.reviewed_at, r.created_at), 'linkExpiresAt', l.expires_at)
    FROM public.access_requests r JOIN requests ON requests.id = r.id
      LEFT JOIN LATERAL (SELECT x.expires_at FROM public.account_setup_links x
        WHERE x.access_request_id = r.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1) l ON true
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.setup_user_id OR lower(u.email) = lower(r.email))
  ), filtered AS MATERIALIZED (
    SELECT people.*,
      CASE WHEN state->>'kind' = 'notSetUp' THEN 0 ELSE
        (SELECT count(*) FROM public.organization_memberships m WHERE m.user_id = people.id) END AS organization_count
    FROM people, input
    WHERE (name ILIKE input.pattern OR email ILIKE input.pattern)
      AND (p_filter = 'all' OR (p_filter = 'notSetUp' AND state->>'kind' = 'notSetUp')
        OR (p_filter = 'suspended' AND state->>'kind' = 'suspended'))
  ), paging AS (
    SELECT count(filtered.id) AS total, i.lim,
      least(i.requested_page, greatest(1, ceil(count(filtered.id)::numeric / i.lim)::integer)) AS page
    FROM filtered RIGHT JOIN input i ON true GROUP BY i.lim, i.requested_page
  ), page_rows AS (
    SELECT f.*, row_number() OVER (ORDER BY
      CASE WHEN input.sort_key = 'person' AND input.direction = 'asc' THEN lower(f.name) END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'person' AND input.direction = 'desc' THEN lower(f.name) END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'organizations' AND input.direction = 'asc' THEN f.organization_count END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'organizations' AND input.direction = 'desc' THEN f.organization_count END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'lastSignIn' AND input.direction = 'asc' THEN f.last_sign_in_at END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'lastSignIn' AND input.direction = 'desc' THEN f.last_sign_in_at END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'status' AND input.direction = 'asc' THEN CASE f.state->>'kind' WHEN 'active' THEN 0 WHEN 'notSetUp' THEN 1 ELSE 2 END END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'status' AND input.direction = 'desc' THEN CASE f.state->>'kind' WHEN 'active' THEN 0 WHEN 'notSetUp' THEN 1 ELSE 2 END END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'added' AND input.direction = 'asc' THEN f.created_at END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'added' AND input.direction = 'desc' THEN f.created_at END DESC NULLS LAST,
      f.created_at DESC,
      f.id DESC) AS position
    FROM filtered f CROSS JOIN input ORDER BY position
      LIMIT (SELECT lim FROM paging) OFFSET (SELECT (page::bigint - 1) * lim FROM paging)
  ) SELECT jsonb_build_object('people', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'email', email, 'createdAt', created_at, 'lastSignInAt', last_sign_in_at,
    'emailConfirmedAt', email_confirmed_at, 'organizationCount', organization_count, 'state', state
  ) ORDER BY position) FROM page_rows), '[]'::jsonb),
    'totalCount', paging.total, 'page', paging.page, 'limit', paging.lim) FROM paging;
$$;


ALTER FUNCTION public.platform_account_directory(p_search text, p_filter text, p_page integer, p_limit integer, p_sort text, p_dir text) OWNER TO postgres;

--
-- Name: platform_announcement_dismissal_counts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_announcement_dismissal_counts() RETURNS TABLE(announcement_id uuid, dismissal_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
	SELECT d.announcement_id, pg_catalog.count(*) FROM public.announcement_dismissals d GROUP BY d.announcement_id;
$$;


ALTER FUNCTION public.platform_announcement_dismissal_counts() OWNER TO postgres;

--
-- Name: platform_inbox_stats(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_inbox_stats(p_since timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT pg_catalog.jsonb_build_object(
		'newPeople', (SELECT pg_catalog.count(*) FROM auth.users WHERE created_at >= p_since),
		'newOrganizations', (SELECT pg_catalog.count(*) FROM public.organizations WHERE created_at >= p_since)
	);
$$;


ALTER FUNCTION public.platform_inbox_stats(p_since timestamp with time zone) OWNER TO postgres;

--
-- Name: platform_list_organizations(text, text, integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_list_organizations(p_search text, p_filter text, p_page integer, p_page_size integer, p_sort text DEFAULT 'lastActive'::text, p_dir text DEFAULT 'desc'::text) RETURNS TABLE(total_count bigint, page integer, all_count bigint, active_week_count bigint, quiet_count bigint, suspended_count bigint, organization_id uuid, name text, created_at timestamp with time zone, status text, last_active_at timestamp with time zone, member_count bigint, personnel_count bigint, owner_count bigint, owner_email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	WITH input AS (
    SELECT CASE WHEN p_sort IN ('name', 'owner', 'members', 'personnel', 'lastActive', 'created', 'status') AND p_dir IN ('asc', 'desc')
      THEN p_sort ELSE 'lastActive' END AS sort_key,
      CASE WHEN p_sort IN ('name', 'owner', 'members', 'personnel', 'lastActive', 'created', 'status') AND p_dir IN ('asc', 'desc')
      THEN p_dir ELSE 'desc' END AS direction
  ), search AS (
		SELECT '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
			pg_catalog.btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pattern,
			pg_catalog.btrim(coalesce(p_search, '')) = '' AS empty
	),
	matched AS (
		SELECT o.id, o.name, o.created_at, o.suspended_at, activity.last_active_at,
			facts.member_count, facts.personnel_count, facts.owner_count, facts.owner_email,
			public.platform_organization_status(o.suspended_at, activity.last_active_at, o.created_at) AS status,
			coalesce(o.suspended_at IS NULL AND activity.last_active_at >= pg_catalog.now() - interval '7 days', false) AS active_week
		FROM public.organizations o
		CROSS JOIN search
		CROSS JOIN LATERAL (
			SELECT pg_catalog.max(a."timestamp") AS last_active_at FROM public.audit_logs a WHERE a.org_id = o.id
		) activity
		CROSS JOIN LATERAL (
		SELECT
			(SELECT pg_catalog.count(*) FROM public.organization_memberships m WHERE m.organization_id = o.id) AS member_count,
			(SELECT pg_catalog.count(*) FROM public.personnel p
				WHERE p.organization_id = o.id AND p.archived_at IS NULL) AS personnel_count,
			(SELECT pg_catalog.count(*) FROM public.organization_memberships m
				WHERE m.organization_id = o.id AND m.role = 'owner') AS owner_count,
			(SELECT pg_catalog.min(coalesce(m.email, u.email))
				FROM public.organization_memberships m LEFT JOIN auth.users u ON u.id = m.user_id
				WHERE m.organization_id = o.id AND m.role = 'owner') AS owner_email
	) facts
		WHERE search.empty
			OR o.name ILIKE search.pattern
			OR EXISTS (
				SELECT 1 FROM public.organization_memberships m
				LEFT JOIN auth.users owner_account ON owner_account.id = m.user_id
				WHERE m.organization_id = o.id AND m.role = 'owner'
					AND coalesce(m.email, owner_account.email) ILIKE search.pattern
			)
	),
	filtered AS (
		SELECT matched.*,
			pg_catalog.row_number() OVER (
				ORDER BY
      CASE WHEN input.sort_key = 'name' AND input.direction = 'asc' THEN lower(matched.name) END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'name' AND input.direction = 'desc' THEN lower(matched.name) END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'owner' AND input.direction = 'asc' THEN lower(matched.owner_email) END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'owner' AND input.direction = 'desc' THEN lower(matched.owner_email) END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'members' AND input.direction = 'asc' THEN matched.member_count END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'members' AND input.direction = 'desc' THEN matched.member_count END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'personnel' AND input.direction = 'asc' THEN matched.personnel_count END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'personnel' AND input.direction = 'desc' THEN matched.personnel_count END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'lastActive' AND input.direction = 'asc' THEN matched.last_active_at END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'lastActive' AND input.direction = 'desc' THEN matched.last_active_at END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'created' AND input.direction = 'asc' THEN matched.created_at END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'created' AND input.direction = 'desc' THEN matched.created_at END DESC NULLS LAST,
      CASE WHEN input.sort_key = 'status' AND input.direction = 'asc' THEN CASE matched.status WHEN 'active' THEN 0 WHEN 'quiet' THEN 1 ELSE 2 END END ASC NULLS LAST,
      CASE WHEN input.sort_key = 'status' AND input.direction = 'desc' THEN CASE matched.status WHEN 'active' THEN 0 WHEN 'quiet' THEN 1 ELSE 2 END END DESC NULLS LAST,
      matched.created_at DESC,
      matched.id DESC
			) AS position,
			pg_catalog.count(*) OVER () AS total
		FROM matched CROSS JOIN input
		WHERE CASE p_filter
			WHEN 'active-week' THEN matched.active_week
			WHEN 'quiet' THEN matched.status = 'quiet'
			WHEN 'suspended' THEN matched.status = 'suspended'
			ELSE true
		END
	),
	counts AS (
		SELECT pg_catalog.count(*) AS all_count,
			pg_catalog.count(*) FILTER (WHERE active_week) AS active_week_count,
			pg_catalog.count(*) FILTER (WHERE status = 'quiet') AS quiet_count,
			pg_catalog.count(*) FILTER (WHERE status = 'suspended') AS suspended_count
		FROM matched
	),
	bounds AS (
		SELECT greatest(1, least(greatest(1, p_page),
			greatest(1, pg_catalog.ceil(coalesce(
				(SELECT pg_catalog.max(total) FROM filtered), 0)::numeric / greatest(1, p_page_size))::integer)
		)) AS page,
		coalesce((SELECT pg_catalog.max(total) FROM filtered), 0)::bigint AS total
	)
	SELECT bounds.total, bounds.page, counts.all_count, counts.active_week_count, counts.quiet_count,
		counts.suspended_count, f.id, f.name, f.created_at, f.status, f.last_active_at,
		f.member_count, f.personnel_count, f.owner_count, f.owner_email
	FROM bounds
	CROSS JOIN counts
	LEFT JOIN filtered f
		ON f.position > (bounds.page - 1) * p_page_size AND f.position <= bounds.page * p_page_size
	ORDER BY f.position;
$$;


ALTER FUNCTION public.platform_list_organizations(p_search text, p_filter text, p_page integer, p_page_size integer, p_sort text, p_dir text) OWNER TO postgres;

--
-- Name: platform_organization_detail(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_organization_detail(p_organization_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
	SELECT pg_catalog.jsonb_build_object(
		'id', o.id,
		'name', o.name,
		'createdAt', o.created_at,
		'suspendedAt', o.suspended_at,
		'status', public.platform_organization_status(o.suspended_at, activity.last_active_at, o.created_at),
		'lastActiveAt', activity.last_active_at,
		'personnelCount', (SELECT pg_catalog.count(*) FROM public.personnel p
			WHERE p.organization_id = o.id AND p.archived_at IS NULL),
		'suspension', (
			SELECT pg_catalog.jsonb_build_object('reason', s.reason, 'suspendedAt', s.suspended_at,
				'suspendedByEmail', operator.email)
			FROM public.organization_suspensions s LEFT JOIN auth.users operator ON operator.id = s.suspended_by
			WHERE s.organization_id = o.id
		),
		'members', coalesce((
			SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
				'userId', m.user_id, 'email', coalesce(m.email, u.email), 'role', m.role,
				'lastSignInAt', u.last_sign_in_at
			) ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at, m.id)
			FROM public.organization_memberships m LEFT JOIN auth.users u ON u.id = m.user_id
			WHERE m.organization_id = o.id
		), '[]'::jsonb),
		'invitations', coalesce((
			SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
				'id', i.id, 'email', i.email, 'role', i.role, 'invitedAt', i.created_at, 'expiresAt', i.expires_at
			) ORDER BY i.created_at DESC, i.id DESC)
			FROM public.organization_invitations i
			WHERE i.organization_id = o.id AND i.status = 'pending' AND i.expires_at > pg_catalog.now()
		), '[]'::jsonb)
	)
	FROM public.organizations o
	CROSS JOIN LATERAL (
		SELECT pg_catalog.max(a."timestamp") AS last_active_at FROM public.audit_logs a WHERE a.org_id = o.id
	) activity
	WHERE o.id = p_organization_id;
$$;


ALTER FUNCTION public.platform_organization_detail(p_organization_id uuid) OWNER TO postgres;

--
-- Name: platform_organization_status(timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_organization_status(p_suspended_at timestamp with time zone, p_last_active_at timestamp with time zone, p_created_at timestamp with time zone) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
	SELECT CASE
		WHEN p_suspended_at IS NOT NULL THEN 'suspended'
		WHEN coalesce(p_last_active_at, p_created_at) < pg_catalog.now() - interval '30 days' THEN 'quiet'
		ELSE 'active'
	END;
$$;


ALTER FUNCTION public.platform_organization_status(p_suspended_at timestamp with time zone, p_last_active_at timestamp with time zone, p_created_at timestamp with time zone) OWNER TO postgres;

--
-- Name: platform_setup_email_inbox(text, integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_setup_email_inbox(p_tab text DEFAULT 'open'::text, p_limit integer DEFAULT 50, p_now timestamp with time zone DEFAULT now(), p_link_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH failures AS (
    SELECT l.*, r.name, r.email, r.status, r.setup_completed_at, public.access_request_setup_grant_is_live(r.id) AS setup_grant_live,
      CASE WHEN l.bounced_at IS NOT NULL THEN 'bounced' ELSE 'expiredUnused' END AS reason,
      coalesce(l.bounced_at, l.expires_at) AS failed_at_inbox,
      least(r.setup_completed_at, l.used_at,
        r.rescinded_at,
        (SELECT min(next_request.setup_completed_at) FROM public.access_requests next_request
          WHERE lower(next_request.email) = lower(r.email)
            AND (next_request.created_at, next_request.id) > (r.created_at, r.id)),
        (SELECT min(o.sent_at) FROM public.account_setup_links newer JOIN public.auth_email_outbox o ON o.setup_link_id = newer.id
          JOIN public.access_requests next_request ON next_request.id = newer.access_request_id
          WHERE ((newer.access_request_id = l.access_request_id AND (newer.created_at, newer.id) > (l.created_at, l.id))
            OR (lower(next_request.email) = lower(r.email) AND (next_request.created_at, next_request.id) > (r.created_at, r.id)))
            AND o.status = 'sent')
      ) AS closed_at,
      NOT EXISTS (SELECT 1 FROM public.account_setup_links newer
        JOIN public.access_requests next_request ON next_request.id = newer.access_request_id
        WHERE ((newer.access_request_id = l.access_request_id AND (newer.created_at, newer.id) > (l.created_at, l.id))
          OR (lower(next_request.email) = lower(r.email) AND (next_request.created_at, next_request.id) > (r.created_at, r.id)))
        AND (newer.bounced_at IS NOT NULL OR (newer.expires_at <= p_now AND newer.claimed_at IS NULL
          AND (newer.revoked_at IS NULL OR newer.revoked_at >= newer.expires_at)))) AS latest
    FROM public.account_setup_links l JOIN public.access_requests r ON r.id = l.access_request_id
    WHERE (l.bounced_at IS NOT NULL OR (l.expires_at <= p_now AND l.claimed_at IS NULL AND (l.revoked_at IS NULL OR l.revoked_at >= l.expires_at)))
      AND (p_link_id IS NULL OR l.id = p_link_id)
  ), selected AS MATERIALIZED (
    SELECT * FROM failures WHERE (closed_at IS NULL OR closed_at >= failed_at_inbox)
      AND ((p_tab = 'open' AND latest AND closed_at IS NULL AND (revoked_at IS NULL OR revocation_reason IN ('replaced', 'cleanup'))
        AND status = 'approved' AND setup_completed_at IS NULL AND setup_grant_live)
      OR (p_tab = 'done' AND closed_at >= p_now - interval '30 days' AND closed_at <= p_now)
      OR p_link_id IS NOT NULL)
  ), page_rows AS (
    SELECT * FROM selected ORDER BY coalesce(closed_at, failed_at_inbox) DESC, id DESC LIMIT greatest(0, least(p_limit, 100))
  ) SELECT jsonb_build_object('count', (SELECT count(*) FROM selected), 'rows', coalesce((SELECT jsonb_agg(
    jsonb_build_object('id', id, 'requestId', access_request_id, 'name', name, 'email', email, 'reason', reason,
      'failedAt', failed_at_inbox, 'closedAt', closed_at, 'bounceReason', bounce_reason, 'expiresAt', expires_at,
      'createdAt', created_at, 'claimedAt', claimed_at, 'revokedAt', revoked_at, 'completedAt', setup_completed_at,
      'status', status, 'isOpen', latest AND closed_at IS NULL AND (revoked_at IS NULL OR revocation_reason IN ('replaced', 'cleanup')) AND status = 'approved' AND setup_completed_at IS NULL AND setup_grant_live) ORDER BY coalesce(closed_at, failed_at_inbox) DESC, id DESC) FROM page_rows), '[]'::jsonb));
$$;


ALTER FUNCTION public.platform_setup_email_inbox(p_tab text, p_limit integer, p_now timestamp with time zone, p_link_id uuid) OWNER TO postgres;

--
-- Name: platform_suspend_organization(uuid, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_suspend_organization(p_actor_user_id uuid, p_organization_id uuid, p_reason text, p_suspended_at timestamp with time zone) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
	v_previous timestamptz;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM public.platform_operators WHERE user_id = p_actor_user_id)
		OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_user_id) THEN
		RAISE EXCEPTION 'Current platform operator access is required' USING ERRCODE = '42501';
	END IF;
	SELECT o.suspended_at INTO v_previous FROM public.organizations o WHERE o.id = p_organization_id FOR UPDATE;
	IF NOT FOUND THEN RETURN 'not_found'; END IF;
	IF v_previous IS NOT NULL THEN RETURN 'already_suspended'; END IF;
	UPDATE public.organizations SET suspended_at = p_suspended_at WHERE id = p_organization_id;
	INSERT INTO public.organization_suspensions (organization_id, reason, suspended_by, suspended_at)
	VALUES (p_organization_id, p_reason, p_actor_user_id, p_suspended_at)
	ON CONFLICT (organization_id) DO UPDATE
	SET reason = EXCLUDED.reason, suspended_by = EXCLUDED.suspended_by, suspended_at = EXCLUDED.suspended_at;
	RETURN 'suspended';
END;
$$;


ALTER FUNCTION public.platform_suspend_organization(p_actor_user_id uuid, p_organization_id uuid, p_reason text, p_suspended_at timestamp with time zone) OWNER TO postgres;

--
-- Name: platform_transfer_org_ownership(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_transfer_org_ownership(p_actor_user_id uuid, p_organization_id uuid, p_target_user_id uuid, p_confirm_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_exists boolean;
  v_name text;
  v_operator_id uuid;
  v_owner_count integer;
  v_owner_user_id uuid;
  v_target_role public.organization_role;
  v_changed integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Membership commands require read committed isolation' USING ERRCODE = '25000';
  END IF;
  SELECT name INTO v_name FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  v_exists := FOUND;
  SELECT user_id INTO v_operator_id FROM public.platform_operators
    WHERE user_id = p_actor_user_id FOR SHARE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_user_id) THEN
    RAISE EXCEPTION 'Current platform operator access is required' USING ERRCODE = '42501';
  END IF;
  IF NOT v_exists THEN RETURN pg_catalog.jsonb_build_object('status','organization_not_found'); END IF;
  IF p_confirm_name IS DISTINCT FROM v_name THEN RETURN pg_catalog.jsonb_build_object('status','name_mismatch'); END IF;
  -- Lock the current rows before discovering the owner; no saved row is recreated.
  PERFORM id FROM public.organization_memberships WHERE organization_id = p_organization_id
    AND (role = 'owner' OR user_id = p_target_user_id) ORDER BY id FOR UPDATE;
  SELECT pg_catalog.count(*)::integer, (pg_catalog.array_agg(user_id))[1]
    INTO v_owner_count, v_owner_user_id FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND role = 'owner';
  IF v_owner_count = 0 THEN RETURN pg_catalog.jsonb_build_object('status','no_current_owner'); END IF;
  IF v_owner_count <> 1 THEN RETURN pg_catalog.jsonb_build_object('status','multiple_current_owners'); END IF;
  SELECT role INTO v_target_role FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_target_user_id;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','target_not_member'); END IF;
  IF v_target_role = 'owner' THEN RETURN pg_catalog.jsonb_build_object('status','already_owner'); END IF;
  UPDATE public.organization_memberships
    SET role = 'admin', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE organization_id = p_organization_id AND user_id = v_owner_user_id AND role = 'owner';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Ownership demotion was not acknowledged'; END IF;
  UPDATE public.organization_memberships
    SET role = 'owner', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE organization_id = p_organization_id AND user_id = p_target_user_id AND role = v_target_role;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Ownership promotion was not acknowledged'; END IF;
  RETURN pg_catalog.jsonb_build_object('status','updated','org_id',p_organization_id,
    'from_user_id',v_owner_user_id,'to_user_id',p_target_user_id,'org_name',v_name);
END;
$$;


ALTER FUNCTION public.platform_transfer_org_ownership(p_actor_user_id uuid, p_organization_id uuid, p_target_user_id uuid, p_confirm_name text) OWNER TO postgres;

--
-- Name: platform_unsuspend_organization(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.platform_unsuspend_organization(p_actor_user_id uuid, p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM public.platform_operators WHERE user_id = p_actor_user_id)
		OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_user_id) THEN
		RAISE EXCEPTION 'Current platform operator access is required' USING ERRCODE = '42501';
	END IF;
	UPDATE public.organizations SET suspended_at = NULL WHERE id = p_organization_id;
	IF NOT FOUND THEN RETURN false; END IF;
	DELETE FROM public.organization_suspensions WHERE organization_id = p_organization_id;
	RETURN true;
END;
$$;


ALTER FUNCTION public.platform_unsuspend_organization(p_actor_user_id uuid, p_organization_id uuid) OWNER TO postgres;

--
-- Name: prevent_account_setup_email_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_account_setup_email_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
	IF OLD.email IS DISTINCT FROM NEW.email AND
		(OLD.status <> 'pending' OR NEW.status <> 'pending' OR EXISTS (
			SELECT 1 FROM public.account_setup_links WHERE access_request_id = OLD.id
		)) THEN
		RAISE EXCEPTION 'Access Request email cannot change after approval or setup-link issuance'
			USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.prevent_account_setup_email_change() OWNER TO postgres;

--
-- Name: prevent_organization_rank_catalog_org_move(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_organization_rank_catalog_org_move() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" THEN
    RAISE EXCEPTION 'organization_rank_catalog.organization_id cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.prevent_organization_rank_catalog_org_move() OWNER TO postgres;

--
-- Name: rating_scheme_personnel_group_scope_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rating_scheme_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN p_group_id IS NOT NULL THEN
      public.member_access_group_scope_matches(p_organization_id, p_group_id)
    ELSE EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    )
  END;
$$;


ALTER FUNCTION public.rating_scheme_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid) OWNER TO postgres;

--
-- Name: read_calendar_tasking_activity(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.read_calendar_tasking_activity(p_organization_id uuid, p_tasking_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id bigint, organization_id uuid, tasking_id uuid, actor_id uuid, occurred_at timestamp with time zone, kind text, payload jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH readable_groups AS MATERIALIZED (
    SELECT g.id FROM public.groups AS g
    WHERE g.organization_id = p_organization_id
      AND calendar_private.can_view_calendar_tasking(p_organization_id, g.id)
    UNION ALL
    SELECT NULL::uuid WHERE calendar_private.can_view_calendar_tasking(p_organization_id, NULL)
  ),
  activity AS MATERIALIZED (
    SELECT a.* FROM public.calendar_tasking_activity AS a
    JOIN public.calendar_taskings AS t ON t.organization_id = a.organization_id AND t.id = a.tasking_id
    WHERE a.organization_id = p_organization_id AND (p_tasking_id IS NULL OR a.tasking_id = p_tasking_id)
      AND EXISTS (
        SELECT 1 FROM readable_groups AS g WHERE g.id IS NOT DISTINCT FROM t.responsible_group_id
      )
  ),
  staffing_changes AS MATERIALIZED (
    SELECT a.id, change.key, pick.personnel_id
    FROM activity AS a
    CROSS JOIN LATERAL pg_catalog.jsonb_each(
      CASE WHEN a.kind = 'staffing_changed' THEN a.payload ELSE '{}'::jsonb END
    ) AS change
    LEFT JOIN LATERAL (
      SELECT value::uuid AS personnel_id FROM pg_catalog.jsonb_array_elements_text(change.value)
    ) AS pick ON true
  ),
  labels AS MATERIALIZED (
    SELECT * FROM public.calendar_person_labels(p_organization_id, ARRAY(
      SELECT DISTINCT c.personnel_id FROM staffing_changes AS c WHERE c.personnel_id IS NOT NULL
    ))
  ),
  staffing_payloads AS (
    SELECT people.id, pg_catalog.jsonb_object_agg(people.key, people.summary) AS payload
    FROM (
      SELECT c.id, c.key, pg_catalog.jsonb_build_object(
        'names', coalesce(pg_catalog.jsonb_agg(l.label ORDER BY l.label) FILTER (WHERE l.personnel_id IS NOT NULL), '[]'::jsonb),
        'others', count(c.personnel_id) FILTER (WHERE l.personnel_id IS NULL)
      ) AS summary
      FROM staffing_changes AS c LEFT JOIN labels AS l ON l.personnel_id = c.personnel_id
      GROUP BY c.id, c.key
    ) AS people
    GROUP BY people.id
  )
  SELECT a.id, a.organization_id, a.tasking_id, a.actor_id, a.occurred_at, a.kind,
    CASE WHEN a.kind = 'staffing_changed' THEN s.payload ELSE a.payload END
  FROM activity AS a LEFT JOIN staffing_payloads AS s ON s.id = a.id
  ORDER BY a.id;
$$;


ALTER FUNCTION public.read_calendar_tasking_activity(p_organization_id uuid, p_tasking_id uuid) OWNER TO postgres;

--
-- Name: read_organization_setup(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.read_organization_setup(p_organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN RAISE insufficient_privilege; END IF;
  RETURN COALESCE((
    SELECT jsonb_build_object('branch', s.branch, 'answers', s.answers,
      'prompts', s.prompts, 'finishedAt', s.finished_at)
    FROM public.organization_setup AS s WHERE s.organization_id = p_organization_id
  ), '{"branch":null,"answers":{},"prompts":{},"finishedAt":null}'::jsonb);
END;
$$;


ALTER FUNCTION public.read_organization_setup(p_organization_id uuid) OWNER TO postgres;

--
-- Name: read_request_member_access(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.read_request_member_access(p_organization_id uuid) RETURNS TABLE(id uuid, role text, member_preset text, capability_overrides jsonb, access_scope_kind text, access_scope_group_ids uuid[], covered_group_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT m.id, m.role, m.member_preset, m.capability_overrides, m.access_scope_kind, m.access_scope_group_ids,
    CASE WHEN m.role = 'member' AND m.access_scope_kind = 'groups' THEN ARRAY(
      SELECT g.id FROM public.groups g
      WHERE g.organization_id = m.organization_id AND g.path && m.access_scope_group_ids ORDER BY g.id
    ) ELSE NULL::uuid[] END
  FROM public.organization_memberships m
  WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
    AND public.organization_access_admitted(p_organization_id);
$$;


ALTER FUNCTION public.read_request_member_access(p_organization_id uuid) OWNER TO postgres;

--
-- Name: reconcile_account_setup_claim(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reconcile_account_setup_claim(p_target_setup_link_id uuid, p_target_access_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
	target_request public.access_requests%ROWTYPE;
	target_link public.account_setup_links%ROWTYPE;
	source_link public.account_setup_links%ROWTYPE;
	attempt public.account_setup_attempts%ROWTYPE;
	setup_email text;
	held_count integer;
	source_id uuid;
BEGIN
	SELECT * INTO target_request FROM public.access_requests
	WHERE id = p_target_access_request_id FOR NO KEY UPDATE;
	IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	setup_email := pg_catalog.lower(pg_catalog.btrim(target_request.email));
	IF setup_email IS NULL OR setup_email = '' THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;
	PERFORM pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended('account-setup-claim:' || setup_email, 0));
	SELECT * INTO target_link FROM public.account_setup_links
	WHERE id = p_target_setup_link_id AND access_request_id = p_target_access_request_id FOR UPDATE;
	IF NOT FOUND OR target_request.status <> 'approved'
		OR target_link.failed_at IS NOT NULL OR target_link.used_at IS NOT NULL
		OR target_link.revoked_at IS NOT NULL OR target_link.expires_at <= pg_catalog.clock_timestamp()
	THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;

	-- A held claim is the only source of an Auth write to reconcile. The scan is
	-- a separate statement after the advisory lock for a fresh READ COMMITTED view.
	SELECT count(*)::integer, min(l.id::text)::uuid INTO held_count, source_id
	FROM public.account_setup_links l
	JOIN public.access_requests r ON r.id = l.access_request_id
	WHERE pg_catalog.lower(pg_catalog.btrim(r.email)) = setup_email
		AND l.claimed_at IS NOT NULL AND l.used_at IS NULL AND l.failed_at IS NULL;
	IF held_count = 0 THEN RETURN pg_catalog.jsonb_build_object('state', 'clear'); END IF;
	IF held_count <> 1 THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	SELECT * INTO source_link FROM public.account_setup_links WHERE id = source_id FOR UPDATE;
	IF NOT FOUND OR source_link.claimed_at IS NULL OR source_link.used_at IS NOT NULL
		OR source_link.failed_at IS NOT NULL
	THEN RETURN pg_catalog.jsonb_build_object('state', 'support-required'); END IF;
	SELECT * INTO attempt FROM public.account_setup_attempts WHERE setup_link_id = source_id FOR UPDATE;
	IF NOT FOUND OR attempt.normalized_email <> setup_email THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;

	IF attempt.state = 'committed' THEN
		IF target_request.setup_completed_at IS NOT NULL AND
			target_request.setup_user_id IS DISTINCT FROM attempt.auth_user_id THEN
			RETURN pg_catalog.jsonb_build_object('state', 'support-required');
		END IF;
		RETURN pg_catalog.jsonb_build_object('state', 'committed',
			'sourceLinkId', source_id, 'sourceAccessRequestId', source_link.access_request_id,
			'userId', attempt.auth_user_id);
	END IF;
	IF attempt.state <> 'started' THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;
	IF target_request.setup_completed_at IS NOT NULL THEN
		RETURN pg_catalog.jsonb_build_object('state', 'support-required');
	END IF;

	UPDATE public.account_setup_attempts SET state = 'fenced'
	WHERE setup_link_id = source_id AND state = 'started';
	UPDATE public.account_setup_links
	SET failed_at = pg_catalog.clock_timestamp(), failure_reason = 'reconciled-no-write'
	WHERE id = source_id AND claimed_at IS NOT NULL AND used_at IS NULL AND failed_at IS NULL;
	IF NOT FOUND THEN RAISE EXCEPTION 'Account setup claim changed' USING ERRCODE = '40001'; END IF;
	RETURN pg_catalog.jsonb_build_object('state', 'fenced',
		'sourceLinkId', source_id, 'sourceAccessRequestId', source_link.access_request_id);
END;
$$;


ALTER FUNCTION public.reconcile_account_setup_claim(p_target_setup_link_id uuid, p_target_access_request_id uuid) OWNER TO postgres;

--
-- Name: reconcile_onboarding_packet(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reconcile_onboarding_packet(p_organization_id uuid, p_onboarding_id uuid, p_new_template_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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

  -- A new step's foreign keys can wait on the Organization row. Access lost
  -- during that wait rolls back every write above.
  IF public.member_access_has_capability(p_organization_id, 'onboarding', 'configure') IS NOT TRUE
    OR onboarding_private.onboarding_personnel_scope_matches(p_organization_id, packet.personnel_id) IS NOT TRUE
  THEN
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


ALTER FUNCTION public.reconcile_onboarding_packet(p_organization_id uuid, p_onboarding_id uuid, p_new_template_id uuid) OWNER TO postgres;

--
-- Name: reconcile_personnel_file_attachment(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reconcile_personnel_file_attachment(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_object_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_bucket text := organization_private.artifact_bucket(p_kind);
  v_id uuid;
BEGIN
  IF v_bucket IS NULL
    OR NOT organization_private.artifact_file_owned(p_kind, p_organization_id, p_personnel_id, p_object_name)
  THEN
    RAISE EXCEPTION 'Invalid Personnel file key' USING ERRCODE = '22023';
  END IF;
  PERFORM organization_private.lock_file_key(v_bucket, p_object_name);
  IF p_kind = 'counseling' THEN
    SELECT id INTO v_id FROM public.counseling_records
      WHERE organization_id = p_organization_id AND personnel_id = p_personnel_id AND file_path = p_object_name
      ORDER BY created_at LIMIT 1;
  ELSIF p_kind = 'certificate' THEN
    SELECT id INTO v_id FROM public.personnel_trainings
      WHERE organization_id = p_organization_id AND personnel_id = p_personnel_id AND certificate_url = p_object_name
      ORDER BY created_at LIMIT 1;
  ELSE
    SELECT id INTO v_id FROM public.personnel_documents
      WHERE organization_id = p_organization_id AND personnel_id = p_personnel_id AND file_path = p_object_name
      ORDER BY created_at LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    IF organization_private.artifact_file_referenced(p_kind, p_object_name) THEN
      RAISE EXCEPTION 'This stored file is attached to another record' USING ERRCODE = '23505';
    END IF;
    PERFORM organization_private.retire_unreferenced_file(p_kind, p_object_name);
  END IF;
  RETURN v_id;
END;
$$;


ALTER FUNCTION public.reconcile_personnel_file_attachment(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_object_name text) OWNER TO postgres;

--
-- Name: record_superseded_training_completion(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.record_superseded_training_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF pg_catalog.current_setting('trooptotask.training_correction', true) = 'on' THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.personnel_training_history
    (organization_id, personnel_id, training_type_id, completion_date, expiration_date, notes, certificate_url)
  VALUES
    (OLD.organization_id, OLD.personnel_id, OLD.training_type_id, OLD.completion_date, OLD.expiration_date,
     OLD.notes, OLD.certificate_url);
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.record_superseded_training_completion() OWNER TO postgres;

--
-- Name: register_organization_file_upload(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.register_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'File uploads require read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF p_upload_id IS NULL OR p_actor_id IS NULL OR p_organization_id IS NULL
    OR p_bucket_id IS NULL OR p_bucket_id NOT IN ('counseling-files', 'personnel-documents', 'training-certificates')
    OR p_object_name IS NULL
    OR p_object_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    OR pg_catalog.lower(pg_catalog.split_part(p_object_name, '/', 1)) <> p_organization_id::text
    OR p_object_name ~ '(^|/)[.]{1,2}(/|$)'
  THEN
    RAISE EXCEPTION 'Invalid Organization file upload' USING ERRCODE = '22023';
  END IF;

  -- Begin, settle and the ordinary DELETE all exclude each other on this row.
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization is unavailable for file uploads' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations
      WHERE id = p_organization_id AND suspended_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_id)
    OR NOT EXISTS (SELECT 1 FROM public.organization_memberships
      WHERE organization_id = p_organization_id AND user_id = p_actor_id)
  THEN
    RAISE EXCEPTION 'Organization file upload is not allowed' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(organization_private.file_key_lock(p_bucket_id, p_object_name));
  IF organization_private.file_key_retired(p_bucket_id, p_object_name) THEN
    RAISE EXCEPTION 'This stored file was deleted and cannot be reused' USING ERRCODE = '23514';
  END IF;
  INSERT INTO organization_private.file_uploads(id, organization_id, actor_id, bucket_id, object_name)
    VALUES (p_upload_id, p_organization_id, p_actor_id, p_bucket_id, p_object_name);
  RETURN p_upload_id;
END;
$_$;


ALTER FUNCTION public.register_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text) OWNER TO postgres;

--
-- Name: reject_access_request_and_block_linked_invitations(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reject_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid) RETURNS TABLE(reject_status text, organization_invitation_id uuid, organization_id uuid, invitation_email text, blocked_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.reject_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid) OWNER TO postgres;

--
-- Name: release_account_setup_claim_for_staff(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.release_account_setup_claim_for_staff(p_setup_link_id uuid, p_access_request_id uuid, p_operator_user_id uuid, p_release_reason text, p_evidence_reference text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
	request_row public.access_requests%ROWTYPE;
	link_row public.account_setup_links%ROWTYPE;
BEGIN
	IF p_release_reason IS NULL OR p_release_reason NOT IN ('provider-terminal', 'provider-quiescent') THEN
		RAISE EXCEPTION 'A provider operation attestation is required' USING ERRCODE = '22023';
	END IF;
	-- Require a case/ticket ID such as INC-12345. A free-form string could
	-- accidentally persist a setup token or provider credential in audit_logs.
	IF p_evidence_reference IS NULL OR p_evidence_reference !~ '^[A-Z][A-Z0-9]{1,15}-[0-9]{3,12}$' THEN
		RAISE EXCEPTION 'A case or ticket ID is required' USING ERRCODE = '22023';
	END IF;

	-- The service-role operational caller authenticates the human operator at
	-- the application edge and supplies that actor's ID. SQL also requires the
	-- attested actor to remain the platform operator for this write.
	PERFORM 1
	FROM public.platform_operators
	WHERE user_id = p_operator_user_id
	FOR SHARE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Platform operator authorization is required' USING ERRCODE = '42501';
	END IF;

	-- Match claim admission's lock order: request row, normalized stored-email
	-- advisory lock, target link. A different request for this email cannot claim
	-- while the release and its audit record are uncommitted.
	SELECT * INTO request_row
	FROM public.access_requests
	WHERE id = p_access_request_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Access Request for claim release is missing' USING ERRCODE = '55000';
	END IF;

	PERFORM pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended('account-setup-claim:' || pg_catalog.lower(pg_catalog.btrim(request_row.email)), 0)
	);

	SELECT * INTO link_row
	FROM public.account_setup_links
	WHERE id = p_setup_link_id AND access_request_id = p_access_request_id
	FOR UPDATE;
	IF NOT FOUND OR link_row.claimed_at IS NULL OR link_row.used_at IS NOT NULL OR link_row.failed_at IS NOT NULL THEN
		RAISE EXCEPTION 'Account Setup claim is not held' USING ERRCODE = '55000';
	END IF;

	UPDATE public.account_setup_links
	SET failed_at = pg_catalog.clock_timestamp(), failure_reason = 'operator-released'
	WHERE id = p_setup_link_id
		AND access_request_id = p_access_request_id
		AND claimed_at IS NOT NULL
		AND used_at IS NULL
		AND failed_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Account Setup claim changed before release' USING ERRCODE = '40001';
	END IF;

	-- Audit and release are one transaction: a failed audit insert rolls back
	-- the terminal state. The evidence reference must never be a raw token or URL.
	INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details, severity)
	VALUES (
		p_operator_user_id,
		'account_setup.claim_released_by_staff',
		'account_setup_link',
		p_setup_link_id,
		pg_catalog.jsonb_build_object(
			'accessRequestId', p_access_request_id,
			'releaseReason', p_release_reason,
			'evidenceReference', p_evidence_reference,
			'priorClaimedAt', link_row.claimed_at
		),
		'warning'
	);

	RETURN true;
END;
$_$;


ALTER FUNCTION public.release_account_setup_claim_for_staff(p_setup_link_id uuid, p_access_request_id uuid, p_operator_user_id uuid, p_release_reason text, p_evidence_reference text) OWNER TO postgres;

--
-- Name: remove_sign_in_roster_scan(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.remove_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_expected_object_name text) RETURNS TABLE(outcome text, retired_object_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_roster public.sign_in_rosters;
BEGIN
  IF NOT COALESCE(organization_private.artifact_file_owned('roster', p_organization_id, p_roster_id, p_expected_object_name), false) THEN
    RAISE EXCEPTION 'Invalid signed scan key' USING ERRCODE = '22023';
  END IF;
  v_roster := organization_private.lock_managed_sign_in_roster(p_organization_id, p_roster_id);
  IF v_roster.signed_file_path IS NOT NULL AND v_roster.signed_file_path <> p_expected_object_name THEN
    RETURN QUERY SELECT 'changed'::text, NULL::text;
    RETURN;
  END IF;
  IF v_roster.signed_file_path IS NOT NULL THEN
    UPDATE public.sign_in_rosters SET signed_file_path = NULL
      WHERE organization_id = p_organization_id AND id = p_roster_id;
    PERFORM organization_private.require_managed_sign_in_roster(p_organization_id, v_roster.scope_group_ids);
  END IF;
  RETURN QUERY SELECT 'removed'::text, organization_private.pending_roster_file_retirement(p_expected_object_name);
END;
$$;


ALTER FUNCTION public.remove_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_expected_object_name text) OWNER TO postgres;

--
-- Name: rename_group(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rename_group(p_organization_id uuid, p_group_id uuid, p_name text) RETURNS TABLE(id uuid, name text, sort_order integer, parent_id uuid, depth integer)
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_name text := pg_catalog.btrim(p_name);
  v_old text;
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Group name must be 1 to 100 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM personnel_private.require_group_manager(p_organization_id);
  SELECT g.name INTO v_old FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old <> v_name THEN
    UPDATE public.groups AS g SET name = v_name
    WHERE g.organization_id = p_organization_id AND g.id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Group management is not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT g.id, g.name, g.sort_order, g.parent_id, g.depth FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id;
END;
$$;


ALTER FUNCTION public.rename_group(p_organization_id uuid, p_group_id uuid, p_name text) OWNER TO postgres;

--
-- Name: reorder_calendar_tasking_list(uuid, uuid, text, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reorder_calendar_tasking_list(p_organization_id uuid, p_tasking_id uuid, p_list text, p_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_status text;
  v_group uuid;
BEGIN
  IF p_list NOT IN ('equipment', 'checklist') THEN
    RAISE EXCEPTION 'Unknown tasking list' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, t.responsible_group_id INTO v_status, v_group
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR calendar_private.can_view_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tasking not found' USING ERRCODE = 'P0002';
  END IF;
  IF calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing this tasking needs Calendar operation access for its scope' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('open', 'in_progress', 'blocked') THEN
    RAISE EXCEPTION 'A % tasking cannot change', v_status USING ERRCODE = '55000';
  END IF;

  IF p_list = 'equipment' THEN
    WITH wanted AS (
      SELECT u.id, pg_catalog.min(u.ord) AS ord FROM pg_catalog.unnest(p_ids) WITH ORDINALITY AS u(id, ord) GROUP BY u.id
    ), ranked AS (
      SELECT i.id, pg_catalog.row_number() OVER (
        ORDER BY COALESCE(w.ord, 9223372036854775807), i.position, i.created_at, i.id
      )::integer AS position
      FROM public.calendar_tasking_equipment AS i LEFT JOIN wanted AS w ON w.id = i.id
      WHERE i.organization_id = p_organization_id AND i.tasking_id = p_tasking_id
    )
    UPDATE public.calendar_tasking_equipment AS i SET position = ranked.position
    FROM ranked WHERE i.id = ranked.id AND i.position IS DISTINCT FROM ranked.position;
  ELSE
    WITH wanted AS (
      SELECT u.id, pg_catalog.min(u.ord) AS ord FROM pg_catalog.unnest(p_ids) WITH ORDINALITY AS u(id, ord) GROUP BY u.id
    ), ranked AS (
      SELECT i.id, pg_catalog.row_number() OVER (
        ORDER BY COALESCE(w.ord, 9223372036854775807), i.position, i.created_at, i.id
      )::integer AS position
      FROM public.calendar_tasking_checklist_items AS i LEFT JOIN wanted AS w ON w.id = i.id
      WHERE i.organization_id = p_organization_id AND i.tasking_id = p_tasking_id
    )
    UPDATE public.calendar_tasking_checklist_items AS i SET position = ranked.position
    FROM ranked WHERE i.id = ranked.id AND i.position IS DISTINCT FROM ranked.position;
  END IF;
END;
$$;


ALTER FUNCTION public.reorder_calendar_tasking_list(p_organization_id uuid, p_tasking_id uuid, p_list text, p_ids uuid[]) OWNER TO postgres;

--
-- Name: ict_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ict_tasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    task_code text NOT NULL,
    title text NOT NULL,
    mos text[] DEFAULT '{}'::text[] NOT NULL,
    expiration_months integer,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    category text,
    CONSTRAINT ict_tasks_expiration_months_positive CHECK (((expiration_months IS NULL) OR (expiration_months > 0))),
    CONSTRAINT ict_tasks_sort_order_non_negative CHECK ((sort_order >= 0)),
    CONSTRAINT ict_tasks_task_code_not_blank CHECK ((length(btrim(task_code)) > 0)),
    CONSTRAINT ict_tasks_title_not_blank CHECK ((length(btrim(title)) > 0))
);


ALTER TABLE public.ict_tasks OWNER TO postgres;

--
-- Name: reorder_ict_tasks(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reorder_ict_tasks(p_organization_id uuid, p_changes jsonb) RETURNS SETOF public.ict_tasks
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
  v_found integer;
  v_current integer;
  v_changed integer;
  v_expected_changes integer;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_ict_task_library(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Critical Tasks library configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
    OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 1000
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_changes) AS item(value)
      WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
        OR jsonb_typeof(item.value->'id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(item.value->'expected_sort_order') IS DISTINCT FROM 'number'
        OR jsonb_typeof(item.value->'sort_order') IS DISTINCT FROM 'number'
    )
  THEN
    RAISE EXCEPTION 'Invalid task order' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), count(DISTINCT c.id) FILTER (
      WHERE c.expected_sort_order >= 0 AND c.sort_order >= 0
    )
  INTO v_count, v_found
  FROM jsonb_to_recordset(p_changes) AS c(id uuid, expected_sort_order integer, sort_order integer);
  IF v_found <> v_count THEN
    RAISE EXCEPTION 'Invalid task order' USING ERRCODE = '22023';
  END IF;

  -- NO KEY UPDATE also applies the update policy, so authority is rechecked
  -- below before a hidden row is reported as missing.
  PERFORM 1 FROM public.ict_tasks AS t
  WHERE t.organization_id = p_organization_id
    AND t.id IN (SELECT c.id FROM jsonb_to_recordset(p_changes) AS c(id uuid))
  ORDER BY t.id
  FOR NO KEY UPDATE;
  IF public.can_manage_ict_task_library(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Critical Tasks library configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE t.sort_order = c.expected_sort_order)
  INTO v_found, v_current
  FROM public.ict_tasks AS t
  JOIN jsonb_to_recordset(p_changes) AS c(id uuid, expected_sort_order integer) ON c.id = t.id
  WHERE t.organization_id = p_organization_id AND t.archived_at IS NULL;
  IF v_found <> v_count THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_current <> v_count THEN
    -- A business conflict must not trigger PostgREST's serialization retries.
    RAISE EXCEPTION 'Task order changed' USING ERRCODE = 'PT409';
  END IF;

  SELECT count(*) INTO v_expected_changes
  FROM jsonb_to_recordset(p_changes) AS c(expected_sort_order integer, sort_order integer)
  WHERE c.sort_order <> c.expected_sort_order;

  UPDATE public.ict_tasks AS t SET sort_order = c.sort_order
  FROM jsonb_to_recordset(p_changes) AS c(id uuid, expected_sort_order integer, sort_order integer)
  WHERE t.organization_id = p_organization_id AND t.id = c.id
    AND t.archived_at IS NULL AND t.sort_order = c.expected_sort_order
    AND c.sort_order <> c.expected_sort_order;
  -- The rows are locked, so only row security can hide one from the update.
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> v_expected_changes THEN
    RAISE EXCEPTION 'Critical Tasks library configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT t.* FROM public.ict_tasks AS t
    JOIN jsonb_to_recordset(p_changes) AS c(id uuid) ON c.id = t.id
    WHERE t.organization_id = p_organization_id AND t.archived_at IS NULL
    ORDER BY t.id;
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found <> v_count THEN
    RAISE EXCEPTION 'Critical Tasks library configuration is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION public.reorder_ict_tasks(p_organization_id uuid, p_changes jsonb) OWNER TO postgres;

--
-- Name: reorder_onboarding_template_steps(uuid, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reorder_onboarding_template_steps(p_organization_id uuid, p_template_id uuid, p_step_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_template_id uuid;
BEGIN
  PERFORM onboarding_private.admit_template_command(p_organization_id);
  IF p_template_id IS NULL OR p_step_ids IS NULL OR pg_catalog.array_ndims(p_step_ids) > 1
    OR pg_catalog.array_position(p_step_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Reordering steps needs the template and its step ids' USING ERRCODE = '22023';
  END IF;

  SELECT t.id INTO v_template_id FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_template_id
  FOR UPDATE;
  PERFORM 1 FROM public.onboarding_template_steps AS s
  WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id
  ORDER BY s.id
  FOR UPDATE;
  PERFORM onboarding_private.require_template_configuration(p_organization_id);
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
  END IF;

  IF pg_catalog.cardinality(p_step_ids) <> (
      SELECT pg_catalog.count(*) FROM public.onboarding_template_steps AS s
      WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id)
    OR (SELECT pg_catalog.array_agg(s.id ORDER BY s.id) FROM public.onboarding_template_steps AS s
      WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id)
      IS DISTINCT FROM (SELECT pg_catalog.array_agg(DISTINCT ids.id ORDER BY ids.id)
      FROM pg_catalog.unnest(p_step_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Step order does not match the selected onboarding template' USING ERRCODE = 'OTR01';
  END IF;

  UPDATE public.onboarding_template_steps AS s SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_step_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id AND s.id = o.id;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order, s.id), '[]'::jsonb)
    FROM public.onboarding_template_steps AS s
    WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id);
END;
$$;


ALTER FUNCTION public.reorder_onboarding_template_steps(p_organization_id uuid, p_template_id uuid, p_step_ids uuid[]) OWNER TO postgres;

--
-- Name: daily_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.daily_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    assignment_type_id uuid NOT NULL,
    date date NOT NULL,
    assignee_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    CONSTRAINT daily_assignments_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'roster'::text])))
);


ALTER TABLE public.daily_assignments OWNER TO postgres;

--
-- Name: replace_daily_assignment_slots(uuid, date[], jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.replace_daily_assignment_slots(p_organization_id uuid, p_replace_days date[], p_slots jsonb) RETURNS SETOF public.daily_assignments
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  slot jsonb;
  slot_date date;
  slot_type uuid;
  slot_assignee text;
  affected_date date;
  affected_days date[];
  normalized_slots jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar assignment operation is not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_replace_days IS NULL OR p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array'
    OR array_position(p_replace_days, NULL) IS NOT NULL
    OR cardinality(p_replace_days) + jsonb_array_length(p_slots) = 0
    OR cardinality(p_replace_days) > 1000 OR jsonb_array_length(p_slots) > 1000
    OR (SELECT count(*) FROM unnest(p_replace_days) AS day(value)) <> (
      SELECT count(DISTINCT value) FROM unnest(p_replace_days) AS day(value)
    )
  THEN
    RAISE EXCEPTION 'Invalid Calendar assignment replacement' USING ERRCODE = '22023';
  END IF;

  FOR slot IN SELECT value FROM jsonb_array_elements(p_slots)
  LOOP
    IF jsonb_typeof(slot) IS DISTINCT FROM 'object'
      OR jsonb_typeof(slot->'date') IS DISTINCT FROM 'string'
      OR jsonb_typeof(slot->'assignment_type_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(slot->'assignee_id') IS DISTINCT FROM 'string'
      OR (slot->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RAISE EXCEPTION 'Invalid Calendar assignment slot' USING ERRCODE = '22023';
    END IF;

    BEGIN
      slot_date := (slot->>'date')::date;
      slot_type := (slot->>'assignment_type_id')::uuid;
    EXCEPTION
      WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid Calendar assignment slot' USING ERRCODE = '22023';
    END;
    slot_assignee := btrim(slot->>'assignee_id');
    IF to_char(slot_date, 'YYYY-MM-DD') <> slot->>'date' THEN
      RAISE EXCEPTION 'Invalid Calendar assignment date' USING ERRCODE = '22023';
    END IF;
    IF slot_assignee <> '' AND public.can_edit_daily_assignment_record(
      p_organization_id, slot_type, slot_assignee
    ) IS NOT TRUE THEN
      RAISE EXCEPTION 'Calendar assignment operation is not allowed' USING ERRCODE = '42501';
    END IF;

    normalized_slots := normalized_slots || jsonb_build_array(jsonb_build_object(
      'date', slot_date, 'assignment_type_id', slot_type, 'assignee_id', slot_assignee
    ));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(normalized_slots)
      AS item(date date, assignment_type_id uuid, assignee_id text)
    GROUP BY item.date, item.assignment_type_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Calendar assignment slot' USING ERRCODE = '22023';
  END IF;

  affected_days := ARRAY(
    SELECT DISTINCT day FROM (
      SELECT unnest(p_replace_days) AS day
      UNION ALL
      SELECT item.date AS day FROM jsonb_to_recordset(normalized_slots)
        AS item(date date, assignment_type_id uuid, assignee_id text)
    ) AS affected ORDER BY day
  );

  -- Lock empty days too; row locks alone cannot serialize competing inserts.
  FOREACH affected_date IN ARRAY affected_days
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(affected_date::text)
    );
  END LOOP;

  IF calendar_private.can_replace_daily_assignment_rows(
    p_organization_id, p_replace_days, normalized_slots
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Assignment slot unavailable' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.daily_assignments AS existing
  WHERE existing.organization_id = p_organization_id
    AND existing.date = ANY(affected_days)
    AND (
      (existing.date = ANY(p_replace_days) AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(normalized_slots)
          AS item(date date, assignment_type_id uuid, assignee_id text)
        WHERE item.date = existing.date
          AND item.assignment_type_id = existing.assignment_type_id
          AND item.assignee_id <> ''
      ))
      OR EXISTS (
        SELECT 1 FROM jsonb_to_recordset(normalized_slots)
          AS item(date date, assignment_type_id uuid, assignee_id text)
        WHERE item.date = existing.date
          AND item.assignment_type_id = existing.assignment_type_id
          AND item.assignee_id = ''
      )
    );

  INSERT INTO public.daily_assignments AS existing (organization_id, assignment_type_id, date, assignee_id)
  SELECT p_organization_id, item.assignment_type_id, item.date, item.assignee_id
  FROM jsonb_to_recordset(normalized_slots)
    AS item(date date, assignment_type_id uuid, assignee_id text)
  WHERE item.assignee_id <> ''
  ORDER BY item.date, item.assignment_type_id
  ON CONFLICT (organization_id, assignment_type_id, date)
  DO UPDATE SET assignee_id = EXCLUDED.assignee_id
    WHERE existing.assignee_id IS DISTINCT FROM EXCLUDED.assignee_id;

  RETURN QUERY
    SELECT saved.* FROM public.daily_assignments AS saved
    JOIN jsonb_to_recordset(normalized_slots)
      AS item(date date, assignment_type_id uuid, assignee_id text)
      ON item.date = saved.date AND item.assignment_type_id = saved.assignment_type_id
    WHERE saved.organization_id = p_organization_id AND item.assignee_id <> ''
    ORDER BY saved.date, saved.assignment_type_id;
END;
$_$;


ALTER FUNCTION public.replace_daily_assignment_slots(p_organization_id uuid, p_replace_days date[], p_slots jsonb) OWNER TO postgres;

--
-- Name: reply_to_feedback(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reply_to_feedback(p_feedback_id uuid, p_body text, p_close boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
 v_reply public.feedback_replies;
 v_feedback public.beta_feedback;
BEGIN
 IF NOT public.is_platform_operator() THEN RAISE EXCEPTION 'Platform operator access is required' USING ERRCODE = '42501'; END IF;
 IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 5000 OR p_close IS NULL THEN
  RAISE EXCEPTION 'A reply between 1 and 5000 characters is required' USING ERRCODE = '22023';
 END IF;
 SELECT * INTO v_feedback FROM public.beta_feedback WHERE id = p_feedback_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_feedback.status = 'resolved' THEN RETURN jsonb_build_object('status', 'closed'); END IF;
 INSERT INTO public.feedback_replies(feedback_id, body, author) VALUES(p_feedback_id, btrim(p_body), 'operator') RETURNING * INTO v_reply;
 UPDATE public.beta_feedback SET status = CASE WHEN p_close THEN 'resolved' ELSE 'reviewed' END,
  updated_by = auth.uid() WHERE id = p_feedback_id;
 INSERT INTO public.notifications(user_id, organization_id, type, title, message, link)
 VALUES(v_feedback.user_id, NULL, 'feedback_reply', 'A reply to your feedback',
  'The TroopToTask operator replied to your feedback.', '/account/feedback/' || p_feedback_id::text);
 RETURN to_jsonb(v_reply);
END;
$$;


ALTER FUNCTION public.reply_to_feedback(p_feedback_id uuid, p_body text, p_close boolean) OWNER TO postgres;

--
-- Name: reply_to_own_feedback(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reply_to_own_feedback(p_feedback_id uuid, p_body text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
 v_reply public.feedback_replies;
 v_feedback public.beta_feedback;
BEGIN
 IF public.is_user_suspended((SELECT auth.uid())) THEN
  RAISE EXCEPTION 'Suspended accounts cannot reply to feedback' USING ERRCODE = '42501';
 END IF;
 IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 5000 THEN
  RAISE EXCEPTION 'A reply between 1 and 5000 characters is required' USING ERRCODE = '22023';
 END IF;
 SELECT * INTO v_feedback FROM public.beta_feedback
  WHERE id = p_feedback_id AND user_id = (SELECT auth.uid()) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_feedback.status = 'resolved' THEN RETURN jsonb_build_object('status', 'closed'); END IF;
 INSERT INTO public.feedback_replies(feedback_id, body, author)
  VALUES(p_feedback_id, btrim(p_body), 'reporter') RETURNING * INTO v_reply;
 UPDATE public.beta_feedback SET status = 'new', updated_by = auth.uid() WHERE id = p_feedback_id;
 RETURN to_jsonb(v_reply);
END;
$$;


ALTER FUNCTION public.reply_to_own_feedback(p_feedback_id uuid, p_body text) OWNER TO postgres;

--
-- Name: rescind_access_request_and_block_linked_invitations(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rescind_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid) RETURNS TABLE(rescind_status text, organization_invitation_id uuid, organization_id uuid, invitation_email text, blocked_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
	"request_row" "public"."access_requests"%ROWTYPE;
BEGIN
	SELECT *
	INTO "request_row"
	FROM "public"."access_requests"
	WHERE "access_requests"."id" = "p_access_request_id"
	FOR UPDATE;

	IF NOT FOUND OR "request_row"."status" <> 'approved' THEN
		RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamp with time zone;
		RETURN;
	END IF;

	IF "request_row"."setup_completed_at" IS NOT NULL THEN
		RETURN QUERY SELECT 'completed'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamp with time zone;
		RETURN;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "public"."account_setup_links"
		WHERE "account_setup_links"."access_request_id" = "p_access_request_id"
			AND "account_setup_links"."claimed_at" IS NOT NULL
			AND "account_setup_links"."used_at" IS NULL
			AND "account_setup_links"."failed_at" IS NULL
	) THEN
		RETURN QUERY SELECT 'claim-held'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamp with time zone;
		RETURN;
	END IF;

	UPDATE "public"."access_requests"
	SET "status" = 'rescinded'
	WHERE "access_requests"."id" = "p_access_request_id";

	UPDATE "public"."account_setup_links"
	SET "revoked_at" = now(), "revocation_reason" = 'manual'
	WHERE "account_setup_links"."access_request_id" = "p_access_request_id"
		AND "account_setup_links"."claimed_at" IS NULL
		AND "account_setup_links"."used_at" IS NULL
		AND "account_setup_links"."revoked_at" IS NULL;

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
			AND "organization_invitations"."normalized_email" = lower(btrim("request_row"."email"))
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
			'organization_invitation.blocked_by_access_request_rescission',
			'organization_invitation',
			"blocked"."id",
			jsonb_build_object(
				'accessRequestId', "p_access_request_id",
				'invitationId', "blocked"."id",
				'reason', 'linked_platform_access_rescinded'
			),
			'warning'
		FROM "blocked"
		RETURNING "audit_logs"."id"
	)
	SELECT
		'rescinded'::text,
		"blocked"."id",
		"blocked"."organization_id",
		"blocked"."email",
		"blocked"."blocked_at"
	FROM "blocked";

	IF NOT FOUND THEN
		RETURN QUERY SELECT 'rescinded'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamp with time zone;
	END IF;
END;
$$;


ALTER FUNCTION public.rescind_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid) OWNER TO postgres;

--
-- Name: reset_federal_holidays(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reset_federal_holidays(p_organization_id uuid, p_holidays jsonb) RETURNS SETOF public.special_days
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_holidays IS NULL OR jsonb_typeof(p_holidays) <> 'array'
    OR jsonb_array_length(p_holidays) NOT BETWEEN 1 AND 500
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_holidays) AS item(value)
      WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'object'
    )
  THEN
    RAISE EXCEPTION 'Invalid federal holiday defaults' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('calendar-federal-holiday-reset:' || p_organization_id::text, 0)
  );
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.special_days
  WHERE organization_id = p_organization_id AND type = 'federal-holiday';

  RETURN QUERY
    WITH inserted AS (
      INSERT INTO public.special_days (organization_id, date, name, type)
      SELECT p_organization_id, item.date, item.name, 'federal-holiday'
      FROM jsonb_to_recordset(p_holidays) AS item(date date, name text)
      RETURNING *
    )
    SELECT * FROM inserted ORDER BY inserted.date, inserted.name;
  -- The INSERT's policy check admits the caller before its foreign-key check
  -- can wait on the Organization row.
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION public.reset_federal_holidays(p_organization_id uuid, p_holidays jsonb) OWNER TO postgres;

--
-- Name: restore_personnel(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.restore_personnel(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_archived_at timestamptz;
BEGIN
  PERFORM organization_private.require_configure_and_lock_personnel(p_organization_id, ARRAY[p_personnel_id]);
  SELECT person.archived_at INTO v_archived_at FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = p_personnel_id;
  IF v_archived_at IS NOT NULL THEN
    PERFORM organization_private.restore_locked_personnel(p_organization_id, p_personnel_id, v_archived_at);
  END IF;
  PERFORM organization_private.require_configurable_personnel(p_organization_id, ARRAY[p_personnel_id]);
  RETURN v_archived_at IS NOT NULL;
END;
$$;


ALTER FUNCTION public.restore_personnel(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: revoke_organization_invitation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revoke_organization_invitation(p_invitation_id uuid, p_organization_id uuid) RETURNS TABLE(revoke_status text, revoked_email text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.revoke_organization_invitation(p_invitation_id uuid, p_organization_id uuid) OWNER TO postgres;

--
-- Name: roster_forms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roster_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    assignment_type_id uuid NOT NULL,
    starts_on date NOT NULL,
    ends_on date,
    rules jsonb NOT NULL,
    record jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roster_forms_dates_check CHECK ((ends_on >= starts_on)),
    CONSTRAINT roster_forms_record_check CHECK (((ends_on IS NULL) = (record IS NULL))),
    CONSTRAINT roster_forms_record_object_check CHECK ((jsonb_typeof(record) = 'object'::text)),
    CONSTRAINT roster_forms_rules_check CHECK (public.is_roster_form_rules(rules))
);


ALTER TABLE public.roster_forms OWNER TO postgres;

--
-- Name: roster_form_effective_start(public.roster_forms); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.roster_form_effective_start(p_form public.roster_forms) RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN f.ends_on IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.roster_forms previous
        WHERE previous.organization_id = f.organization_id AND previous.assignment_type_id = f.assignment_type_id
          AND previous.ends_on IS NOT NULL AND previous.id <> f.id)
      OR EXISTS (SELECT 1 FROM public.roster_starting_numbers n WHERE n.form_id = f.id AND n.origin = 'carried')
    THEN f.starts_on
    ELSE LEAST(f.starts_on, (SELECT min(a.date) FROM public.daily_assignments a
      WHERE a.organization_id = f.organization_id AND a.assignment_type_id = f.assignment_type_id
        AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.organization_id = a.organization_id AND g.id::text = a.assignee_id)))
    END
  FROM public.roster_forms f
  WHERE f.id = p_form.id AND (
    auth.role() = 'service_role'
    OR f.organization_id IN (SELECT v.organization_id FROM calendar_private.organization_wide_viewer_organizations() v)
  );
$$;


ALTER FUNCTION public.roster_form_effective_start(p_form public.roster_forms) OWNER TO postgres;

--
-- Name: roster_signals(uuid, date, date, text[], uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.roster_signals(p_organization_id uuid, p_as_of date, p_since date, p_sources text[], p_personnel_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH active AS MATERIALIZED (
    SELECT p.id, p.rank, p.mos, p.clinic_role
    FROM public.personnel p
    WHERE p.organization_id = p_organization_id AND p.archived_at IS NULL
      AND (p.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('personnel') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
      AND (SELECT public.is_org_member(p_organization_id))
      AND (p_personnel_ids IS NULL OR p.id = ANY (p_personnel_ids))
  ),
  presence_cohort AS (
    SELECT a.id
    FROM active a
    WHERE 'availability' = ANY (p_sources)
      AND (a.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
  ),
  training_cohort AS (
    SELECT a.id, a.rank, a.mos, a.clinic_role
    FROM active a
    WHERE 'training' = ANY (p_sources)
      AND (a.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('training') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
  ),
  task_cohort AS (
    SELECT a.id, a.mos
    FROM active a
    WHERE 'criticalTasks' = ANY (p_sources)
      AND (a.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('criticalTasks') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
  ),
  evaluation_cohort AS (
    SELECT a.id
    FROM active a
    WHERE 'evaluations' = ANY (p_sources)
      AND (a.id IN (
        SELECT v.personnel_id FROM member_access_private.viewable_personnel('ratingScheme') v
        WHERE v.organization_id = p_organization_id
      )) IS TRUE
  ),
  record_cohort AS (
    SELECT a.id
    FROM active a
    WHERE ('followUps' = ANY (p_sources) OR 'counseling' = ANY (p_sources))
      AND (SELECT public.member_access_has_capability(p_organization_id, 'personnel', 'configure'))
  ),
  tasks AS (
    SELECT t.id, t.task_code, t.title, t.mos, t.expiration_months, t.sort_order
    FROM public.ict_tasks t
    WHERE 'criticalTasks' = ANY (p_sources) AND t.organization_id = p_organization_id AND t.archived_at IS NULL
      AND (SELECT public.member_access_has_capability(p_organization_id, 'criticalTasks', 'view'))
  ),
  latest_completions AS (
    SELECT DISTINCT ON (pc.personnel_id, pc.ict_task_id)
      pc.personnel_id, pc.ict_task_id, pc.completed_at, pc.created_at, pc.validated_by
    FROM public.personnel_ict_completions pc
    JOIN task_cohort c ON c.id = pc.personnel_id
    JOIN tasks t ON t.id = pc.ict_task_id
    WHERE pc.organization_id = p_organization_id AND pc.completed_at <= p_as_of
    ORDER BY pc.personnel_id, pc.ict_task_id, pc.completed_at DESC, pc.created_at DESC
  ),
  active_evaluations AS (
    SELECT DISTINCT ON (r.rated_person_id)
      r.rated_person_id, r.id, r.eval_type, r.report_type, r.rating_period_start, r.rating_period_end, r.status,
      r.workflow_status
    FROM public.rating_scheme_entries r
    JOIN evaluation_cohort c ON c.id = r.rated_person_id
    WHERE r.organization_id = p_organization_id AND r.status IS DISTINCT FROM 'completed'
    ORDER BY r.rated_person_id, r.rating_period_end DESC, r.id DESC
  )
  SELECT jsonb_build_object(
    'availability', CASE WHEN 'availability' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM presence_cohort c), '[]'::jsonb),
      'statusTypes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'color', s.color, 'textColor', s.text_color, 'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.name)
        FROM public.status_types s
        WHERE s.organization_id = p_organization_id
          AND (SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view'))
      ), '[]'::jsonb),
      'entries', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(e.id, e.personnel_id, e.status_type_id, e.start_date)
          ORDER BY e.personnel_id, e.id)
        FROM public.availability_entries e
        JOIN presence_cohort c ON c.id = e.personnel_id
        WHERE e.organization_id = p_organization_id AND e.start_date <= p_as_of AND e.end_date >= p_as_of
      ), '[]'::jsonb)
    ) END,
    'training', CASE WHEN 'training' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(c.id, c.rank, c.mos, c.clinic_role) ORDER BY c.id) FROM training_cohort c
      ), '[]'::jsonb),
      'types', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', t.id, 'name', t.name, 'expiration_months', t.expiration_months,
          'warning_days_yellow', t.warning_days_yellow, 'warning_days_orange', t.warning_days_orange,
          'applies_to_roles', t.applies_to_roles, 'applies_to_mos', t.applies_to_mos, 'applies_to_ranks', t.applies_to_ranks,
          'excluded_roles', t.excluded_roles, 'excluded_mos', t.excluded_mos, 'excluded_ranks', t.excluded_ranks,
          'expiration_date_only', t.expiration_date_only, 'can_be_exempted', t.can_be_exempted,
          'exempt_personnel_ids', t.exempt_personnel_ids, 'is_optional', t.is_optional
        ) ORDER BY t.sort_order, t.id)
        FROM public.training_types t
        WHERE t.organization_id = p_organization_id
          AND (SELECT public.member_access_has_capability(p_organization_id, 'training', 'view'))
      ), '[]'::jsonb),
      'completions', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(pt.personnel_id, pt.training_type_id, pt.completion_date, pt.expiration_date)
          ORDER BY pt.personnel_id, pt.training_type_id)
        FROM public.personnel_trainings pt
        JOIN training_cohort c ON c.id = pt.personnel_id
        WHERE pt.organization_id = p_organization_id
      ), '[]'::jsonb)
    ) END,
    'criticalTasks', CASE WHEN 'criticalTasks' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(jsonb_build_array(c.id, c.mos) ORDER BY c.id) FROM task_cohort c), '[]'::jsonb),
      'tasks', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', t.id, 'task_code', t.task_code, 'title', t.title, 'mos', t.mos, 'expiration_months', t.expiration_months
        ) ORDER BY t.sort_order, t.task_code)
        FROM tasks t
      ), '[]'::jsonb),
      'settings', (
        SELECT jsonb_build_object(
          'defaultExpirationMonths', o.critical_tasks_default_expiration_months,
          'expiringSoonWarningDays', o.critical_tasks_expiring_soon_warning_days
        )
        FROM public.organizations o
        WHERE o.id = p_organization_id AND EXISTS (
          SELECT 1 FROM public.organization_memberships m
          WHERE m.organization_id = p_organization_id AND m.user_id = (SELECT auth.uid())
        )
      ),
      'completions', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(l.personnel_id, l.ict_task_id, l.completed_at, l.created_at, l.validated_by)
          ORDER BY l.personnel_id, l.ict_task_id)
        FROM latest_completions l
      ), '[]'::jsonb)
    ) END,
    'evaluations', CASE WHEN 'evaluations' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM evaluation_cohort c), '[]'::jsonb),
      'entries', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(
          a.rated_person_id, a.id, a.eval_type, a.report_type, a.rating_period_start, a.rating_period_end, a.status,
          a.workflow_status
        ) ORDER BY a.rated_person_id)
        FROM active_evaluations a
      ), '[]'::jsonb)
    ) END,
    'followUps', CASE WHEN 'followUps' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM record_cohort c), '[]'::jsonb),
      'open', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(f.id, f.personnel_id, f.title, f.due_date)
          ORDER BY f.due_date NULLS LAST, f.created_at, f.id)
        FROM public.personnel_follow_ups f
        JOIN record_cohort c ON c.id = f.personnel_id
        WHERE f.organization_id = p_organization_id AND f.status = 'open'
      ), '[]'::jsonb)
    ) END,
    'counseling', CASE WHEN 'counseling' = ANY (p_sources) THEN jsonb_build_object(
      'cohort', COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM record_cohort c), '[]'::jsonb),
      'latest', COALESCE((
        SELECT jsonb_agg(jsonb_build_array(l.personnel_id, l.conducted_on) ORDER BY l.personnel_id)
        FROM (
          SELECT cr.personnel_id, max(cr.date_conducted) AS conducted_on
          FROM public.counseling_records cr
          JOIN record_cohort c ON c.id = cr.personnel_id
          WHERE cr.organization_id = p_organization_id AND cr.archived_at IS NULL
            AND cr.date_conducted BETWEEN p_since AND p_as_of
          GROUP BY cr.personnel_id
        ) l
      ), '[]'::jsonb)
    ) END
  );
$$;


ALTER FUNCTION public.roster_signals(p_organization_id uuid, p_as_of date, p_since date, p_sources text[], p_personnel_ids uuid[]) OWNER TO postgres;

--
-- Name: save_calendar_tasking_people(uuid, uuid, uuid[], uuid[], boolean, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid, p_personnel_ids uuid[], p_kept_ids uuid[], p_remove_outside_scope boolean, p_expected_revision integer) RETURNS TABLE(outcome text, revision integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_ids uuid[] := coalesce(p_personnel_ids, ARRAY[]::uuid[]);
  v_kept uuid[] := coalesce(p_kept_ids, ARRAY[]::uuid[]);
  v_status text;
  v_group uuid;
  v_revision integer;
  v_current uuid[];
  v_flagged uuid[];
  v_outside uuid[];
  v_added uuid[];
  v_removed uuid[];
  v_checked uuid[];
  v_eligible integer;
BEGIN
  IF array_position(v_ids, NULL) IS NOT NULL OR array_position(v_kept, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(v_ids) AS id) <> cardinality(v_ids)
    OR (SELECT count(DISTINCT id) FROM unnest(v_kept) AS id) <> cardinality(v_kept)
    OR NOT v_kept <@ v_ids
    OR cardinality(v_ids) > 9999
  THEN
    RAISE EXCEPTION 'Pick each person once' USING ERRCODE = '22023';
  END IF;

  -- A structure move reviews committed picks, so hold it out until this save commits.
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR SHARE;
  SELECT t.status, t.responsible_group_id, t.staffing_revision INTO v_status, v_group, v_revision
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR calendar_private.can_view_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tasking not found' USING ERRCODE = 'P0002';
  END IF;
  IF calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Staffing this tasking needs Calendar operation access for its scope' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(p.personnel_id), ARRAY[]::uuid[]),
    coalesce(array_agg(p.personnel_id) FILTER (WHERE p.review_since IS NOT NULL), ARRAY[]::uuid[]),
    coalesce(array_agg(p.personnel_id) FILTER (
      WHERE NOT calendar_private.calendar_person_in_scope(p.organization_id, p.personnel_id)
    ), ARRAY[]::uuid[])
  INTO v_current, v_flagged, v_outside
  FROM public.calendar_tasking_participants AS p
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id;
  IF p_remove_outside_scope IS NOT TRUE THEN
    v_ids := v_ids || ARRAY(SELECT id FROM unnest(v_outside) AS id WHERE NOT id = ANY (v_ids));
  END IF;

  v_kept := ARRAY(SELECT id FROM unnest(v_kept) AS id WHERE id = ANY (v_flagged));
  IF v_ids @> v_current AND v_current @> v_ids AND cardinality(v_kept) = 0 THEN
    RETURN QUERY SELECT 'unchanged'::text, v_revision;
    RETURN;
  END IF;
  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'A % tasking cannot change its staffing', v_status USING ERRCODE = '55000';
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_revision THEN
    RETURN QUERY SELECT 'conflict'::text, v_revision;
    RETURN;
  END IF;

  v_added := ARRAY(SELECT id FROM unnest(v_ids) AS id WHERE NOT id = ANY (v_current));
  v_removed := ARRAY(SELECT id FROM unnest(v_current) AS id WHERE NOT id = ANY (v_ids));
  v_checked := v_added || v_kept;
  -- Lock the People so an archive or Group move lands before or after this save, never beside it.
  SELECT count(*) INTO v_eligible FROM (
    SELECT 1 FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.id = ANY (v_checked)
      AND person.archived_at IS NULL
      AND organization_private.group_within(person.organization_id, person.group_id, v_group)
    FOR SHARE
  ) AS eligible;
  IF v_eligible <> cardinality(v_checked) THEN
    RAISE EXCEPTION 'Pick active people from this tasking''s roster' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.calendar_tasking_participants AS p
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id AND p.personnel_id = ANY (v_removed);
  INSERT INTO public.calendar_tasking_participants (organization_id, tasking_id, personnel_id, selected_by)
  SELECT p_organization_id, p_tasking_id, id, auth.uid() FROM unnest(v_added) AS id;
  UPDATE public.calendar_tasking_participants AS p SET review_since = NULL
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id AND p.personnel_id = ANY (v_kept);

  UPDATE public.calendar_taskings AS t SET staffing_revision = t.staffing_revision + 1
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id;
  INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, kind, payload)
  VALUES (p_organization_id, p_tasking_id, auth.uid(), 'staffing_changed', pg_catalog.jsonb_build_object(
    'added', pg_catalog.to_jsonb(v_added), 'removed', pg_catalog.to_jsonb(v_removed), 'kept', pg_catalog.to_jsonb(v_kept)
  ));
  RETURN QUERY SELECT 'saved'::text, v_revision + 1;
END;
$$;


ALTER FUNCTION public.save_calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid, p_personnel_ids uuid[], p_kept_ids uuid[], p_remove_outside_scope boolean, p_expected_revision integer) OWNER TO postgres;

--
-- Name: save_feedback_github_issue(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_feedback_github_issue(p_feedback_id uuid, p_issue_number integer, p_issue_url text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
 IF NOT public.is_platform_operator() THEN RAISE EXCEPTION 'Platform operator access is required' USING ERRCODE = '42501'; END IF;
 IF p_issue_number IS NULL OR p_issue_number <= 0 OR p_issue_url IS DISTINCT FROM
  'https://github.com/waffleflopper/trooptotask/issues/' || p_issue_number::text THEN
  RAISE EXCEPTION 'Invalid GitHub issue' USING ERRCODE = '22023';
 END IF;
 UPDATE public.beta_feedback SET github_issue_number = p_issue_number, github_issue_url = p_issue_url,
  updated_by = auth.uid() WHERE id = p_feedback_id AND github_issue_number IS NULL AND github_issue_url IS NULL;
 RETURN FOUND;
END;
$$;


ALTER FUNCTION public.save_feedback_github_issue(p_feedback_id uuid, p_issue_number integer, p_issue_url text) OWNER TO postgres;

--
-- Name: save_feedback_staff_note(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_feedback_staff_note(p_feedback_id uuid, p_body text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
 IF NOT public.is_platform_operator() THEN RAISE EXCEPTION 'Platform operator access is required' USING ERRCODE = '42501'; END IF;
 IF p_body IS NULL OR length(p_body) > 5000 THEN RAISE EXCEPTION 'Invalid staff note' USING ERRCODE = '22023'; END IF;
 PERFORM 1 FROM public.beta_feedback WHERE id = p_feedback_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF btrim(p_body) = '' THEN
  DELETE FROM public.feedback_staff_notes WHERE feedback_id = p_feedback_id;
 ELSE
  INSERT INTO public.feedback_staff_notes(feedback_id, body) VALUES (p_feedback_id, btrim(p_body))
  ON CONFLICT (feedback_id) DO UPDATE SET body = excluded.body, updated_by = auth.uid(), updated_at = now();
 END IF;
 RETURN true;
END;
$$;


ALTER FUNCTION public.save_feedback_staff_note(p_feedback_id uuid, p_body text) OWNER TO postgres;

--
-- Name: save_organization_setup_answer(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_organization_setup_answer(p_organization_id uuid, p_step text, p_answer text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- The capability helper accepts feature lanes. Governance still needs its fixed-role gate.
  IF NOT public.is_org_privileged(p_organization_id)
    OR NOT public.member_access_has_capability(p_organization_id, 'organization', 'configure')
    THEN RAISE insufficient_privilege; END IF;
  IF p_step IS NULL OR p_step <> ALL (ARRAY['welcome','groups','ranks','personnel','calendar','training','criticalTasks','evaluations','onboarding','lossesAndAwards','eventsAndTaskings','invite']::text[])
    OR (p_answer IS NOT NULL AND p_answer NOT IN ('reviewed','later'))
    THEN RAISE invalid_parameter_value USING MESSAGE = 'Invalid setup answer'; END IF;
  INSERT INTO public.organization_setup(organization_id, answers)
  VALUES (p_organization_id, CASE WHEN p_answer IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p_step,p_answer) END)
  ON CONFLICT (organization_id) DO UPDATE SET
    answers = CASE WHEN p_answer IS NULL THEN organization_setup.answers - p_step
      ELSE jsonb_set(organization_setup.answers, ARRAY[p_step], to_jsonb(p_answer)) END,
    updated_at = now();
  RETURN public.read_organization_setup(p_organization_id);
END;
$$;


ALTER FUNCTION public.save_organization_setup_answer(p_organization_id uuid, p_step text, p_answer text) OWNER TO postgres;

--
-- Name: save_organization_setup_branch(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_organization_setup_branch(p_organization_id uuid, p_branch text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- The capability helper accepts feature lanes. Governance still needs its fixed-role gate.
  IF NOT public.is_org_privileged(p_organization_id)
    OR NOT public.member_access_has_capability(p_organization_id, 'organization', 'configure')
    THEN RAISE insufficient_privilege; END IF;
  IF p_branch IS NOT NULL AND p_branch NOT IN ('army','navy','air-force','marine-corps','coast-guard','space-force','civilian','custom')
    THEN RAISE invalid_parameter_value USING MESSAGE = 'Invalid setup branch'; END IF;
  INSERT INTO public.organization_setup(organization_id, branch) VALUES (p_organization_id,p_branch)
  ON CONFLICT (organization_id) DO UPDATE SET branch = EXCLUDED.branch, updated_at = now();
  RETURN public.read_organization_setup(p_organization_id);
END;
$$;


ALTER FUNCTION public.save_organization_setup_branch(p_organization_id uuid, p_branch text) OWNER TO postgres;

--
-- Name: save_organization_setup_prompt(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_organization_setup_prompt(p_organization_id uuid, p_key text, p_state jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.is_org_owner(p_organization_id) THEN RAISE insufficient_privilege; END IF;
  IF p_key IS NULL OR p_key <> ALL (ARRAY['setup','welcome','groups','ranks','personnel','calendar','training','criticalTasks','evaluations','onboarding','lossesAndAwards','eventsAndTaskings','invite']::text[])
    OR (p_state IS NOT NULL AND NOT organization_private.valid_setup_prompt(p_state))
    THEN RAISE invalid_parameter_value USING MESSAGE = 'Invalid setup prompt'; END IF;
  INSERT INTO public.organization_setup(organization_id, prompts)
  VALUES (p_organization_id, CASE WHEN p_state IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p_key,p_state) END)
  ON CONFLICT (organization_id) DO UPDATE SET
    prompts = CASE WHEN p_state IS NULL THEN organization_setup.prompts - p_key
      ELSE jsonb_set(organization_setup.prompts, ARRAY[p_key], p_state) END,
    updated_at = now();
  RETURN public.read_organization_setup(p_organization_id);
END;
$$;


ALTER FUNCTION public.save_organization_setup_prompt(p_organization_id uuid, p_key text, p_state jsonb) OWNER TO postgres;

--
-- Name: search_users_by_email(text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_users_by_email(search_query text, max_results integer DEFAULT 5) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


ALTER FUNCTION public.search_users_by_email(search_query text, max_results integer) OWNER TO postgres;

--
-- Name: sensitive_file_object_is_readable(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sensitive_file_object_is_readable(bucket_name text, object_name text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'storage'
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
        SELECT 1 FROM public.sign_in_rosters r
        WHERE r.id = roster_id AND r.organization_id = org_id
          AND r.signed_file_path = object_name
          AND public.can_access_sign_in_roster_scope(
            r.organization_id, r.scope_group_ids, 'view'
          )
      );
    WHEN 'counseling-records' THEN
      BEGIN
        personnel_id := (storage.foldername(object_name))[3]::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN FALSE;
      END;

      RETURN public.personnel_sensitive_artifact_is_readable(org_id, personnel_id);
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;


ALTER FUNCTION public.sensitive_file_object_is_readable(bucket_name text, object_name text) OWNER TO postgres;

--
-- Name: sensitive_file_object_is_writable(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sensitive_file_object_is_writable(bucket_name text, object_name text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'storage'
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
        SELECT 1 FROM public.sign_in_rosters r
        WHERE r.id = roster_id AND r.organization_id = org_id
          AND public.can_access_sign_in_roster_scope(
            r.organization_id, r.scope_group_ids, 'operate'
          )
      );
    WHEN 'counseling-records' THEN
      BEGIN
        personnel_id := (storage.foldername(object_name))[3]::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN FALSE;
      END;

      RETURN EXISTS (
        SELECT 1 FROM public.personnel p
        WHERE p.id = personnel_id AND p.organization_id = org_id
          AND public.can_edit_personnel_record(org_id, p.group_id)
      );
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;


ALTER FUNCTION public.sensitive_file_object_is_writable(bucket_name text, object_name text) OWNER TO postgres;

--
-- Name: set_calendar_lanes(uuid, uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_calendar_lanes(p_organization_id uuid, p_lane_type_ids uuid[], p_expected_lane_type_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_saved uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_lane_type_ids IS NULL OR p_expected_lane_type_ids IS NULL
    OR pg_catalog.array_ndims(p_lane_type_ids) > 1
    OR pg_catalog.array_ndims(p_expected_lane_type_ids) > 1
    OR pg_catalog.array_position(p_lane_type_ids, NULL) IS NOT NULL
    OR pg_catalog.array_position(p_expected_lane_type_ids, NULL) IS NOT NULL
    OR pg_catalog.cardinality(p_lane_type_ids) <> (
      SELECT pg_catalog.count(DISTINCT ids.id) FROM pg_catalog.unnest(p_lane_type_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Choose the assignment types to show on the calendar' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('calendar-lanes:' || p_organization_id::text, 0)
  );
  -- NO KEY UPDATE on every type holds the lane set against delete, archive and
  -- edits without waiting on daily-assignment foreign-key checks. It also
  -- applies the update policy, so authority is checked before reporting a
  -- missing target.
  PERFORM 1 FROM public.assignment_types
  WHERE organization_id = p_organization_id
  ORDER BY id
  FOR NO KEY UPDATE;
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.assignment_types
      WHERE organization_id = p_organization_id AND archived_at IS NULL AND id = ANY (p_lane_type_ids))
     <> pg_catalog.cardinality(p_lane_type_ids)
  THEN
    RAISE EXCEPTION 'Assignment type not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}') INTO v_saved
  FROM public.assignment_types
  WHERE organization_id = p_organization_id AND show_on_calendar AND archived_at IS NULL;
  -- A replay after a lost reply, or the same change from two people, converges
  -- before the precondition can report a false conflict.
  IF v_saved = p_lane_type_ids THEN
    IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  -- CLN01, not 40001: PostgREST silently retries a serialization failure, so a
  -- stale command would loop and could later commit over the newer list.
  IF v_saved IS DISTINCT FROM p_expected_lane_type_ids THEN
    RAISE EXCEPTION 'Calendar lanes changed' USING ERRCODE = 'CLN01';
  END IF;

  UPDATE public.assignment_types SET show_on_calendar = false
  WHERE organization_id = p_organization_id AND show_on_calendar AND NOT (id = ANY (p_lane_type_ids));
  UPDATE public.assignment_types AS t
  SET show_on_calendar = true, sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_lane_type_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE t.organization_id = p_organization_id AND t.id = o.id
    AND (NOT t.show_on_calendar OR t.sort_order <> o.ordinal - 1);

  -- Row security silently hides rows from a write whose author lost authority
  -- after the check above.
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}')
      FROM public.assignment_types
      WHERE organization_id = p_organization_id AND show_on_calendar AND archived_at IS NULL)
     IS DISTINCT FROM p_lane_type_ids
  THEN
    RAISE EXCEPTION 'Calendar lanes were not saved' USING ERRCODE = 'CLN01';
  END IF;
END;
$$;


ALTER FUNCTION public.set_calendar_lanes(p_organization_id uuid, p_lane_type_ids uuid[], p_expected_lane_type_ids uuid[]) OWNER TO postgres;

--
-- Name: set_critical_tasks_defaults(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_critical_tasks_defaults(p_organization_id uuid, p_default_expiration_months integer, p_expiring_soon_warning_days integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.can_manage_ict_task_library(p_organization_id) THEN
    RAISE EXCEPTION 'Critical Tasks configure access with Organization scope is required' USING ERRCODE = '42501';
  END IF;
  IF p_default_expiration_months IS NOT NULL
     AND p_default_expiration_months NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Default expiration must be between 1 and 120 months' USING ERRCODE = '22023';
  END IF;
  IF p_expiring_soon_warning_days IS NOT NULL
     AND p_expiring_soon_warning_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION 'Warning window must be between 1 and 365 days' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organizations
  SET critical_tasks_default_expiration_months = p_default_expiration_months,
      critical_tasks_expiring_soon_warning_days = p_expiring_soon_warning_days
  WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


ALTER FUNCTION public.set_critical_tasks_defaults(p_organization_id uuid, p_default_expiration_months integer, p_expiring_soon_warning_days integer) OWNER TO postgres;

--
-- Name: set_group_order(uuid, uuid[], uuid[], uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_group_order(p_organization_id uuid, p_group_ids uuid[], p_expected_group_ids uuid[], p_parent_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_saved uuid[];
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF p_group_ids IS NULL OR p_expected_group_ids IS NULL
    OR pg_catalog.array_ndims(p_group_ids) > 1
    OR pg_catalog.array_ndims(p_expected_group_ids) > 1
    OR pg_catalog.array_position(p_group_ids, NULL) IS NOT NULL
    OR pg_catalog.array_position(p_expected_group_ids, NULL) IS NOT NULL
    OR pg_catalog.cardinality(p_group_ids) <> (
      SELECT pg_catalog.count(DISTINCT ids.id) FROM pg_catalog.unnest(p_group_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Choose every Group once' USING ERRCODE = '22023';
  END IF;

  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM 1 FROM public.groups
  WHERE organization_id = p_organization_id AND parent_id IS NOT DISTINCT FROM p_parent_id
  ORDER BY id
  FOR NO KEY UPDATE;
  PERFORM personnel_private.require_group_manager(p_organization_id);

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, name, id), '{}') INTO v_saved
  FROM public.groups
  WHERE organization_id = p_organization_id AND parent_id IS NOT DISTINCT FROM p_parent_id;
  IF v_saved = p_group_ids THEN
    RETURN;
  END IF;
  IF v_saved IS DISTINCT FROM p_expected_group_ids THEN
    RAISE EXCEPTION 'Group order changed' USING ERRCODE = 'GRP01';
  END IF;
  IF pg_catalog.cardinality(p_group_ids) <> pg_catalog.cardinality(v_saved)
    OR NOT (p_group_ids @> v_saved)
  THEN
    RAISE EXCEPTION 'Choose every Group once' USING ERRCODE = '22023';
  END IF;

  UPDATE public.groups AS g SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_group_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE g.organization_id = p_organization_id AND g.parent_id IS NOT DISTINCT FROM p_parent_id AND g.id = o.id AND g.sort_order <> o.ordinal - 1;

  -- Row security silently hides rows from a write whose author lost authority.
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, name, id), '{}')
      FROM public.groups WHERE organization_id = p_organization_id AND parent_id IS NOT DISTINCT FROM p_parent_id)
     IS DISTINCT FROM p_group_ids
  THEN
    RAISE EXCEPTION 'Group order was not saved' USING ERRCODE = 'GRP01';
  END IF;
END;
$$;


ALTER FUNCTION public.set_group_order(p_organization_id uuid, p_group_ids uuid[], p_expected_group_ids uuid[], p_parent_id uuid) OWNER TO postgres;

--
-- Name: set_roster_excusals(uuid, uuid, date, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_roster_excusals(p_organization_id uuid, p_assignment_type_id uuid, p_today date, p_excusals jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_written integer;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_assignment_type_id IS NULL OR p_excusals IS NULL OR pg_catalog.jsonb_typeof(p_excusals) <> 'array'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_excusals) AS e(value)
      WHERE pg_catalog.jsonb_typeof(e.value) <> 'object'
        OR pg_catalog.jsonb_typeof(e.value -> 'personnel_id') <> 'string'
        OR (e.value ->> 'personnel_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(e.value -> 'reason') <> 'string'
        OR pg_catalog.btrim(e.value ->> 'reason') = ''
        OR pg_catalog.char_length(pg_catalog.btrim(e.value ->> 'reason')) > 120
    )
    OR pg_catalog.jsonb_array_length(p_excusals) <> (
      SELECT pg_catalog.count(DISTINCT e.value ->> 'personnel_id') FROM pg_catalog.jsonb_array_elements(p_excusals) AS e(value))
  THEN
    RAISE EXCEPTION 'Give each excused person a reason' USING ERRCODE = '22023';
  END IF;
  -- The Organization has no timezone. The caller's calendar day must be one the
  -- server could also be on.
  IF p_today IS NULL OR pg_catalog.abs(p_today - (pg_catalog.now() AT TIME ZONE 'UTC')::date) > 1 THEN
    RAISE EXCEPTION 'The date on this device is off' USING ERRCODE = 'RSD01';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('roster-form:' || p_assignment_type_id::text, 0)
  );
  PERFORM 1 FROM public.assignment_types
  WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND assign_to = 'personnel'
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Assignment type not found' USING ERRCODE = 'P0002';
  END IF;
  -- Calendar configuration does not require the Personnel capability, so the
  -- check reads the people the caller sees on the Calendar.
  IF (SELECT pg_catalog.count(*) FROM member_access_private.viewable_personnel('calendar') p
      WHERE p.organization_id = p_organization_id
        AND p.personnel_id IN (SELECT (e.value ->> 'personnel_id')::uuid FROM pg_catalog.jsonb_array_elements(p_excusals) AS e(value)))
     <> pg_catalog.jsonb_array_length(p_excusals)
  THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.roster_excusals x
  WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id
    AND x.ends_on IS NULL AND x.starts_on >= p_today
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid) WHERE w.personnel_id = x.personnel_id);
  UPDATE public.roster_excusals x SET ends_on = p_today - 1
  WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id
    AND x.ends_on IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid) WHERE w.personnel_id = x.personnel_id);
  UPDATE public.roster_excusals x SET reason = pg_catalog.btrim(w.reason)
  FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid, reason text)
  WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id
    AND x.ends_on IS NULL AND x.personnel_id = w.personnel_id AND x.reason <> pg_catalog.btrim(w.reason);
  INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
  SELECT p_organization_id, p_assignment_type_id, w.personnel_id, pg_catalog.btrim(w.reason), p_today
  FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid, reason text)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.roster_excusals x
    WHERE x.assignment_type_id = p_assignment_type_id AND x.personnel_id = w.personnel_id AND x.ends_on IS NULL
  );

  -- Row security silently hides rows from a write whose author lost authority
  -- after the first check.
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT pg_catalog.count(*) INTO v_written
  FROM public.roster_excusals x
  JOIN pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid, reason text)
    ON w.personnel_id = x.personnel_id AND pg_catalog.btrim(w.reason) = x.reason
  WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id AND x.ends_on IS NULL;
  IF v_written <> pg_catalog.jsonb_array_length(p_excusals) OR EXISTS (
    SELECT 1 FROM public.roster_excusals x
    WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id AND x.ends_on IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid) WHERE w.personnel_id = x.personnel_id)
  ) THEN
    RAISE EXCEPTION 'Excusals were not saved' USING ERRCODE = 'RSF01';
  END IF;
END;
$_$;


ALTER FUNCTION public.set_roster_excusals(p_organization_id uuid, p_assignment_type_id uuid, p_today date, p_excusals jsonb) OWNER TO postgres;

--
-- Name: set_roster_starting_numbers(uuid, uuid, uuid, uuid, date, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_roster_starting_numbers(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_numbers jsonb, p_repicks jsonb) RETURNS SETOF public.daily_assignments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_form public.roster_forms%ROWTYPE;
  v_mode text;
  v_tracks text[];
  v_slots jsonb;
  v_day date;
BEGIN
  IF p_actor IS NULL OR p_organization_id IS NULL OR p_assignment_type_id IS NULL OR p_form_id IS NULL
    OR p_numbers IS NULL OR pg_catalog.jsonb_typeof(p_numbers) <> 'array'
    OR p_repicks IS NULL OR pg_catalog.jsonb_typeof(p_repicks) <> 'array'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_numbers) AS n(value)
      WHERE pg_catalog.jsonb_typeof(n.value) IS DISTINCT FROM 'object'
        OR (n.value ->> 'personnel_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(n.value -> 'track') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(n.value -> 'count') IS DISTINCT FROM 'number'
        OR (n.value ->> 'count') !~ '^[0-9]{1,4}$'
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_repicks) AS r(value)
      WHERE pg_catalog.jsonb_typeof(r.value) IS DISTINCT FROM 'object'
        OR (r.value ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR (r.value ->> 'assignee_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(r.value -> 'was') IS DISTINCT FROM 'string'
    )
  THEN
    RAISE EXCEPTION 'Invalid starting numbers' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);

  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_today IS NULL OR pg_catalog.abs(p_today - (pg_catalog.now() AT TIME ZONE 'UTC')::date) > 1 THEN
    RAISE EXCEPTION 'The date on this device is off' USING ERRCODE = 'RSD01';
  END IF;

  -- The same lock close_roster_form takes, so a close and this save never interleave.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('roster-form:' || p_assignment_type_id::text, 0)
  );
  SELECT roster_weekend_mode INTO v_mode FROM public.assignment_types
  WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND assign_to = 'personnel'
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment type not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_form FROM public.roster_forms
  WHERE organization_id = p_organization_id AND assignment_type_id = p_assignment_type_id AND ends_on IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_form.id <> p_form_id THEN
    RAISE EXCEPTION 'The DA 6 form changed' USING ERRCODE = 'RSF01';
  END IF;

  -- The lock, as the count engine's startingNumbersLocked decides it: carried
  -- numbers, or a detail dated on or before today on one of the form's tracks.
  -- Under No duty, a weekend or holiday assignment is not a detail.
  IF EXISTS (SELECT 1 FROM public.roster_starting_numbers WHERE form_id = v_form.id AND origin = 'carried')
    OR EXISTS (
      SELECT 1 FROM public.daily_assignments a
      WHERE a.organization_id = p_organization_id AND a.assignment_type_id = p_assignment_type_id
        AND a.date BETWEEN public.roster_form_effective_start(v_form) AND p_today
        AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.organization_id = a.organization_id AND g.id::text = a.assignee_id)
        AND (
          v_mode <> 'none'
          OR (
            pg_catalog.date_part('isodow', a.date) < 6
            AND NOT EXISTS (
              SELECT 1 FROM public.special_days s WHERE s.organization_id = p_organization_id AND s.date = a.date
            )
          )
        )
    )
  THEN
    RAISE EXCEPTION 'The starting numbers are part of the record' USING ERRCODE = 'RSL01';
  END IF;

  v_tracks := CASE v_mode WHEN 'separate' THEN ARRAY['weekday', 'weekend'] WHEN 'none' THEN ARRAY['weekday'] ELSE ARRAY['all'] END;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_numbers) AS n(personnel_id uuid, track text)
    WHERE n.track <> ALL (v_tracks)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_numbers) AS n(personnel_id uuid, track text)
    GROUP BY n.personnel_id, n.track HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_repicks) AS r(date date)
    WHERE r.date <= p_today
  ) THEN
    RAISE EXCEPTION 'Invalid starting numbers' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_numbers) AS n(personnel_id uuid)
    WHERE n.personnel_id NOT IN (
      SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
      WHERE v.organization_id = p_organization_id
    )
  ) THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.set_config('trooptotask.roster_close', 'on', true);
  DELETE FROM public.roster_starting_numbers WHERE form_id = v_form.id;
  INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin)
  SELECT p_organization_id, v_form.id, n.personnel_id, n.track, n.count, 'typed'
  FROM pg_catalog.jsonb_to_recordset(p_numbers) AS n(personnel_id uuid, track text, count integer);
  PERFORM pg_catalog.set_config('trooptotask.roster_close', '', true);

  IF pg_catalog.jsonb_array_length(p_repicks) = 0 THEN
    RETURN;
  END IF;

  -- The same per-day locks the replacement takes, in the same order, so the check holds through the write.
  FOR v_day IN
    SELECT DISTINCT r.date FROM pg_catalog.jsonb_to_recordset(p_repicks) AS r(date date) ORDER BY r.date
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(v_day::text)
    );
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_repicks) AS r(date date, was text)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.daily_assignments a
      WHERE a.organization_id = p_organization_id AND a.assignment_type_id = p_assignment_type_id
        AND a.date = r.date AND a.assignee_id = r.was AND a.source = 'roster'
    )
  ) THEN
    RAISE EXCEPTION 'Assignment slot unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'date', r.date, 'assignment_type_id', p_assignment_type_id, 'assignee_id', r.assignee_id,
    'was', r.was, 'source', 'roster'
  )) INTO v_slots
  FROM pg_catalog.jsonb_to_recordset(p_repicks) AS r(date date, assignee_id text, was text);
  RETURN QUERY SELECT * FROM public.write_roster_assignment_slots(p_actor, p_organization_id, v_slots);
END;
$_$;


ALTER FUNCTION public.set_roster_starting_numbers(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_numbers jsonb, p_repicks jsonb) OWNER TO postgres;

--
-- Name: set_status_type_order(uuid, uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_status_type_order(p_organization_id uuid, p_status_type_ids uuid[], p_expected_status_type_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_saved uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_status_type_ids IS NULL OR p_expected_status_type_ids IS NULL
    OR pg_catalog.array_ndims(p_status_type_ids) > 1
    OR pg_catalog.array_ndims(p_expected_status_type_ids) > 1
    OR pg_catalog.array_position(p_status_type_ids, NULL) IS NOT NULL
    OR pg_catalog.array_position(p_expected_status_type_ids, NULL) IS NOT NULL
    OR pg_catalog.cardinality(p_status_type_ids) <> (
      SELECT pg_catalog.count(DISTINCT ids.id) FROM pg_catalog.unnest(p_status_type_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Choose every status type once' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('calendar-status-order:' || p_organization_id::text, 0)
  );
  -- NO KEY UPDATE on every type holds the set against delete and edits without
  -- waiting on availability foreign-key checks. It also applies the update
  -- policy, so authority is rechecked after the waits.
  PERFORM 1 FROM public.status_types
  WHERE organization_id = p_organization_id
  ORDER BY id
  FOR NO KEY UPDATE;
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}') INTO v_saved
  FROM public.status_types
  WHERE organization_id = p_organization_id;
  -- A replay after a lost reply, or the same change from two people, converges
  -- before the precondition can report a false conflict.
  IF v_saved = p_status_type_ids THEN
    IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  -- STO01, not 40001: PostgREST silently retries a serialization failure, so a
  -- stale command would loop and could later commit over the newer order. A
  -- type created or deleted since the client read also lands here, so a stale
  -- order never drops a new type.
  IF v_saved IS DISTINCT FROM p_expected_status_type_ids THEN
    RAISE EXCEPTION 'Status type order changed' USING ERRCODE = 'STO01';
  END IF;
  IF pg_catalog.cardinality(p_status_type_ids) <> pg_catalog.cardinality(v_saved)
    OR NOT (p_status_type_ids @> v_saved)
  THEN
    RAISE EXCEPTION 'Choose every status type once' USING ERRCODE = '22023';
  END IF;

  UPDATE public.status_types AS t SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_status_type_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE t.organization_id = p_organization_id AND t.id = o.id AND t.sort_order <> o.ordinal - 1;

  -- Row security silently hides rows from a write whose author lost authority
  -- after the check above.
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}')
      FROM public.status_types WHERE organization_id = p_organization_id)
     IS DISTINCT FROM p_status_type_ids
  THEN
    RAISE EXCEPTION 'Status type order was not saved' USING ERRCODE = 'STO01';
  END IF;
END;
$$;


ALTER FUNCTION public.set_status_type_order(p_organization_id uuid, p_status_type_ids uuid[], p_expected_status_type_ids uuid[]) OWNER TO postgres;

--
-- Name: set_training_exemption(uuid, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_training_exemption(p_organization_id uuid, p_training_type_id uuid, p_personnel_id uuid, p_exempt boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_can_be_exempted boolean;
  v_person text := p_personnel_id::text;
BEGIN
  IF p_exempt IS NULL OR p_personnel_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Training exemption' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_manage_training_configuration(p_organization_id) THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT can_be_exempted INTO v_can_be_exempted FROM public.training_types
    WHERE organization_id = p_organization_id AND id = p_training_type_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This Training type is no longer available' USING ERRCODE = 'P0002';
  END IF;
  -- Authority revoked while this call waited for the row lock must still deny it.
  IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.personnel WHERE organization_id = p_organization_id AND id = p_personnel_id) THEN
    RAISE EXCEPTION 'Personnel not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_exempt THEN
    IF NOT v_can_be_exempted THEN
      RAISE EXCEPTION 'This Training type does not allow exemptions' USING ERRCODE = '55000';
    END IF;
    UPDATE public.training_types
      SET exempt_personnel_ids = exempt_personnel_ids || pg_catalog.jsonb_build_array(v_person)
      WHERE organization_id = p_organization_id AND id = p_training_type_id
        AND NOT exempt_personnel_ids @> pg_catalog.jsonb_build_array(v_person);
  ELSE
    UPDATE public.training_types
      SET exempt_personnel_ids = exempt_personnel_ids - v_person
      WHERE organization_id = p_organization_id AND id = p_training_type_id
        AND exempt_personnel_ids @> pg_catalog.jsonb_build_array(v_person);
  END IF;
  RETURN p_exempt;
END;
$$;


ALTER FUNCTION public.set_training_exemption(p_organization_id uuid, p_training_type_id uuid, p_personnel_id uuid, p_exempt boolean) OWNER TO postgres;

--
-- Name: settle_organization_file_upload(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.settle_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'File uploads require read committed isolation' USING ERRCODE = '25000';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM organization_private.file_uploads
    WHERE id = p_upload_id AND organization_id = p_organization_id AND actor_id = p_actor_id
      AND bucket_id = p_bucket_id AND object_name = p_object_name;
  RETURN FOUND;
END;
$$;


ALTER FUNCTION public.settle_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text) OWNER TO postgres;

--
-- Name: settle_sign_in_roster_scan_upload(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.settle_sign_in_roster_scan_upload(p_organization_id uuid, p_roster_id uuid, p_object_name text) RETURNS TABLE(attached boolean, retired_object_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT COALESCE(organization_private.artifact_file_owned('roster', p_organization_id, p_roster_id, p_object_name), false) THEN
    RAISE EXCEPTION 'Invalid signed scan key' USING ERRCODE = '22023';
  END IF;
  PERFORM organization_private.lock_file_key('counseling-files', p_object_name);
  IF EXISTS (SELECT 1 FROM public.sign_in_rosters
      WHERE organization_id = p_organization_id AND id = p_roster_id AND signed_file_path = p_object_name)
  THEN
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;
  IF organization_private.artifact_file_referenced('roster', p_object_name) THEN
    RAISE EXCEPTION 'This stored file is attached to another record' USING ERRCODE = '23505';
  END IF;
  PERFORM organization_private.retire_unreferenced_file('roster', p_object_name);
  RETURN QUERY SELECT false, organization_private.pending_roster_file_retirement(p_object_name);
END;
$$;


ALTER FUNCTION public.settle_sign_in_roster_scan_upload(p_organization_id uuid, p_roster_id uuid, p_object_name text) OWNER TO postgres;

--
-- Name: access_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    setup_completed_at timestamp with time zone,
    setup_user_id uuid,
    first_name text,
    last_name text,
    heard_about text,
    heard_about_details text,
    approval_basis text,
    rescinded_at timestamp with time zone,
    CONSTRAINT access_requests_approval_basis_check CHECK (((approval_basis IS NULL) OR (approval_basis = ANY (ARRAY['platform_review'::text, 'organization_invitation'::text])))),
    CONSTRAINT access_requests_approval_basis_status_check CHECK (((status = ANY (ARRAY['approved'::text, 'rescinded'::text])) = (approval_basis IS NOT NULL))),
    CONSTRAINT access_requests_email_normalized_check CHECK ((email = lower(regexp_replace(email, '^[[:space:]]+|[[:space:]]+$'::text, ''::text, 'g'::text)))),
    CONSTRAINT access_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'rescinded'::text])))
);


ALTER TABLE public.access_requests OWNER TO postgres;

--
-- Name: setup_grant_live(public.access_requests); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.setup_grant_live(request public.access_requests) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
	SELECT "public"."access_request_setup_grant_is_live"("request"."id");
$$;


ALTER FUNCTION public.setup_grant_live(request public.access_requests) OWNER TO postgres;

--
-- Name: sign_in_roster_scope_matches_personnel(uuid, uuid[], uuid[], jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sign_in_roster_scope_matches_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.sign_in_roster_scope_matches_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb) OWNER TO postgres;

--
-- Name: stamp_access_request_rescission(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.stamp_access_request_rescission() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.rescinded_at := CASE WHEN NEW.status = 'rescinded' AND OLD.status <> 'rescinded' THEN now() ELSE OLD.rescinded_at END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.stamp_access_request_rescission() OWNER TO postgres;

--
-- Name: stamp_personnel_extended_info_saver(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.stamp_personnel_extended_info_saver() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND to_jsonb(NEW) - ARRAY['award_tracking_acknowledged_at', 'updated_at']
         = to_jsonb(OLD) - ARRAY['award_tracking_acknowledged_at', 'updated_at'] THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid()::text;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.stamp_personnel_extended_info_saver() OWNER TO postgres;

--
-- Name: start_account_setup_attempt(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.start_account_setup_attempt() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE setup_email text;
BEGIN
	IF OLD.claimed_at IS NULL AND NEW.claimed_at IS NOT NULL AND NEW.used_at IS NULL THEN
		SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO setup_email
		FROM public.access_requests WHERE id = NEW.access_request_id;
		IF setup_email IS NULL OR setup_email = '' THEN
			RAISE EXCEPTION 'Account setup email missing' USING ERRCODE = '55000';
		END IF;
		INSERT INTO public.account_setup_attempts(setup_link_id, normalized_email, state)
		VALUES (NEW.id, setup_email, 'started');
	END IF;
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.start_account_setup_attempt() OWNER TO postgres;

--
-- Name: start_onboarding_packet(uuid, uuid, uuid, date, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.start_onboarding_packet(p_organization_id uuid, p_personnel_id uuid, p_template_id uuid, p_started_at date, p_steps jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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
      NOT public.feature_is_off(p_organization_id, 'training') AND s.step_type = 'training' AND s.training_type_id IS NOT NULL AND EXISTS (
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


ALTER FUNCTION public.start_onboarding_packet(p_organization_id uuid, p_personnel_id uuid, p_template_id uuid, p_started_at date, p_steps jsonb) OWNER TO postgres;

--
-- Name: storage_object_org_id(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.storage_object_org_id(object_name text) RETURNS uuid
    LANGUAGE plpgsql IMMUTABLE
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


ALTER FUNCTION public.storage_object_org_id(object_name text) OWNER TO postgres;

--
-- Name: storage_object_scope(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.storage_object_scope(object_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT (storage.foldername(object_name))[2]
$$;


ALTER FUNCTION public.storage_object_scope(object_name text) OWNER TO postgres;

--
-- Name: submit_deletion_request(uuid, uuid, text, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.submit_deletion_request(p_organization_id uuid, p_requested_by uuid, p_requester_email text, p_resource_type text, p_resource_id uuid, p_description text, p_resource_url text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_request public.deletion_requests;
BEGIN
  -- The pending check after the wait must see the earlier submission's commit.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Deletion request submission requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF p_organization_id IS NULL OR p_requested_by IS NULL OR p_resource_id IS NULL
    OR p_requester_email IS NULL OR p_description IS NULL
    OR p_resource_type IS NULL OR p_resource_type NOT IN (
      'personnel', 'training_type', 'personnel_training', 'rating_scheme_entry', 'counseling_record'
    )
  THEN
    RAISE EXCEPTION 'Invalid deletion request submission' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'deletion-request-pending:' || p_organization_id::text || ':' || p_resource_type || ':' || p_resource_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.deletion_requests AS request
    WHERE request.organization_id = p_organization_id AND request.resource_type = p_resource_type
      AND request.resource_id = p_resource_id AND request.status = 'pending'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'duplicate');
  END IF;

  INSERT INTO public.deletion_requests (
    organization_id, requested_by, requested_by_email, resource_type, resource_id,
    resource_description, resource_url, status
  ) VALUES (
    p_organization_id, p_requested_by, p_requester_email, p_resource_type, p_resource_id,
    p_description, p_resource_url, 'pending'
  ) RETURNING * INTO v_request;
  RETURN pg_catalog.jsonb_build_object('outcome', 'created', 'request', pg_catalog.to_jsonb(v_request));
END;
$$;


ALTER FUNCTION public.submit_deletion_request(p_organization_id uuid, p_requested_by uuid, p_requester_email text, p_resource_type text, p_resource_id uuid, p_description text, p_resource_url text) OWNER TO postgres;

--
-- Name: swap_roster_days(uuid, uuid, date, text, date, text, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.swap_roster_days(p_organization_id uuid, p_assignment_type_id uuid, p_first_date date, p_first_was text, p_second_date date, p_second_was text, p_today date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  first_row public.daily_assignments%ROWTYPE;
  second_row public.daily_assignments%ROWTYPE;
  swap_row public.roster_swaps%ROWTYPE;
  affected_date date;
BEGIN
  PERFORM calendar_private.require_roster_swap_access(p_organization_id, p_today);
  PERFORM 1 FROM public.assignment_types t WHERE t.organization_id = p_organization_id
    AND t.id = p_assignment_type_id AND t.assign_to = 'personnel' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Both days need a person-assigned duty' USING ERRCODE = 'RSW06';
  END IF;
  IF p_first_date IS NULL OR p_second_date IS NULL OR p_first_date = p_second_date THEN
    RAISE EXCEPTION 'Choose two different days' USING ERRCODE = 'RSW03';
  END IF;
  IF p_first_date < p_today OR p_second_date < p_today THEN
    RAISE EXCEPTION 'Swap only today or later days' USING ERRCODE = 'RSW02';
  END IF;
  FOR affected_date IN SELECT day FROM unnest(ARRAY[p_first_date, p_second_date]) day ORDER BY day LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(affected_date::text));
  END LOOP;
  PERFORM 1 FROM public.daily_assignments a
  WHERE a.organization_id = p_organization_id AND a.assignment_type_id = p_assignment_type_id
    AND a.date IN (p_first_date, p_second_date) ORDER BY a.date FOR UPDATE;
  SELECT * INTO first_row FROM public.daily_assignments a WHERE a.organization_id = p_organization_id
    AND a.assignment_type_id = p_assignment_type_id AND a.date = p_first_date;
  SELECT * INTO second_row FROM public.daily_assignments a WHERE a.organization_id = p_organization_id
    AND a.assignment_type_id = p_assignment_type_id AND a.date = p_second_date;
  IF first_row.id IS NULL OR second_row.id IS NULL
    OR btrim(first_row.assignee_id) = '' OR btrim(second_row.assignee_id) = '' THEN
    RAISE EXCEPTION 'Both days need an assigned person' USING ERRCODE = 'RSW04';
  END IF;
  IF first_row.assignee_id IS DISTINCT FROM p_first_was OR second_row.assignee_id IS DISTINCT FROM p_second_was THEN
    RAISE EXCEPTION 'The roster changed since this preview' USING ERRCODE = 'RSW01';
  END IF;
  IF first_row.assignee_id = second_row.assignee_id THEN
    RAISE EXCEPTION 'Choose days held by two different people' USING ERRCODE = 'RSW05';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roster_swaps s
    WHERE s.organization_id = p_organization_id AND s.assignment_type_id = p_assignment_type_id
      AND (s.first_date IN (p_first_date, p_second_date) OR s.second_date IN (p_first_date, p_second_date))) THEN
    RAISE EXCEPTION 'One of these days is already in a swap' USING ERRCODE = 'RSW07';
  END IF;
  PERFORM pg_catalog.set_config('calendar.roster_write', '', true);
  UPDATE public.daily_assignments SET assignee_id = second_row.assignee_id WHERE id = first_row.id;
  UPDATE public.daily_assignments SET assignee_id = first_row.assignee_id WHERE id = second_row.id;
  INSERT INTO public.roster_swaps(organization_id, assignment_type_id, first_date, first_held_by, first_source,
    second_date, second_held_by, second_source, created_by)
  VALUES (p_organization_id, p_assignment_type_id, LEAST(p_first_date, p_second_date),
    CASE WHEN p_first_date < p_second_date THEN first_row.assignee_id ELSE second_row.assignee_id END,
    CASE WHEN p_first_date < p_second_date THEN first_row.source ELSE second_row.source END,
    GREATEST(p_first_date, p_second_date),
    CASE WHEN p_first_date < p_second_date THEN second_row.assignee_id ELSE first_row.assignee_id END,
    CASE WHEN p_first_date < p_second_date THEN second_row.source ELSE first_row.source END, auth.uid())
  RETURNING * INTO swap_row;
  PERFORM calendar_private.require_roster_swap_access(p_organization_id, p_today);
  RETURN jsonb_build_object('swap', to_jsonb(swap_row), 'saved', (
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.date) FROM public.daily_assignments a
    WHERE a.id IN (first_row.id, second_row.id)));
END;
$$;


ALTER FUNCTION public.swap_roster_days(p_organization_id uuid, p_assignment_type_id uuid, p_first_date date, p_first_was text, p_second_date date, p_second_was text, p_today date) OWNER TO postgres;

--
-- Name: sync_user_email_identity_from_auth_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_user_email_identity_from_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION public.sync_user_email_identity_from_auth_user() OWNER TO postgres;

--
-- Name: touch_dashboard_config_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.touch_dashboard_config_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION public.touch_dashboard_config_updated_at() OWNER TO postgres;

--
-- Name: training_personnel_scope_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.training_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel p
    WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
      AND (
        (p.group_id IS NOT NULL AND public.member_access_group_scope_matches(p_organization_id, p.group_id))
        OR (p.group_id IS NULL AND EXISTS (
          SELECT 1 FROM public.organization_memberships m
          WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
            AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
        ))
      )
  );
$$;


ALTER FUNCTION public.training_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) OWNER TO postgres;

--
-- Name: training_record_type_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.training_record_type_matches(p_organization_id uuid, p_training_type_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.training_types t
    WHERE t.id = p_training_type_id AND t.organization_id = p_organization_id
  );
$$;


ALTER FUNCTION public.training_record_type_matches(p_organization_id uuid, p_training_type_id uuid) OWNER TO postgres;

--
-- Name: training_views_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.training_views_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.training_views_set_updated_at() OWNER TO postgres;

--
-- Name: transfer_org_ownership(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_owner_count integer;
  v_owner_user_id uuid;
  v_target_role public.organization_role;
  v_changed integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Membership commands require read committed isolation' USING ERRCODE = '25000';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_actor_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.organization_memberships
        WHERE organization_id = p_organization_id AND user_id = v_actor_user_id AND role = 'owner'
    ) OR EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id AND suspended_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = v_actor_user_id)
  THEN RAISE EXCEPTION 'Only the owner can transfer ownership'; END IF;
  IF NOT public.current_session_sensitive_action_assured() THEN
    RAISE EXCEPTION 'Recent sign-in or MFA verification is required to transfer ownership';
  END IF;
  PERFORM id FROM public.organization_memberships WHERE organization_id = p_organization_id
    AND (role = 'owner' OR user_id = p_new_owner_id) ORDER BY id FOR UPDATE;
  SELECT pg_catalog.count(*)::integer, (pg_catalog.array_agg(user_id))[1]
    INTO v_owner_count, v_owner_user_id FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND role = 'owner';
  IF v_owner_count <> 1 OR v_owner_user_id IS DISTINCT FROM v_actor_user_id THEN
    RAISE EXCEPTION 'Organization must have exactly one current owner';
  END IF;
  SELECT role INTO v_target_role FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_new_owner_id;
  IF NOT FOUND OR v_target_role = 'owner' THEN RAISE EXCEPTION 'New owner must be an existing member'; END IF;
  UPDATE public.organization_memberships
    SET role = 'admin', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE organization_id = p_organization_id AND user_id = v_actor_user_id AND role = 'owner';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Ownership demotion was not acknowledged'; END IF;
  UPDATE public.organization_memberships
    SET role = 'owner', member_preset = 'editor', capability_overrides = '{}'::jsonb,
      access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[]
    WHERE organization_id = p_organization_id AND user_id = p_new_owner_id AND role = v_target_role;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'Ownership promotion was not acknowledged'; END IF;
END;
$$;


ALTER FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid) OWNER TO postgres;

--
-- Name: transition_calendar_tasking(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.transition_calendar_tasking(p_organization_id uuid, p_tasking_id uuid, p_action text, p_note text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_status text;
  v_group uuid;
  v_reason text;
  v_note text := NULLIF(pg_catalog.btrim(p_note), '');
  v_target text;
  v_from text[];
BEGIN
  v_target := CASE p_action
    WHEN 'start' THEN 'in_progress'
    WHEN 'block' THEN 'blocked'
    WHEN 'unblock' THEN 'in_progress'
    WHEN 'complete' THEN 'completed'
    WHEN 'reopen' THEN 'in_progress'
    WHEN 'cancel' THEN 'cancelled'
  END;
  v_from := CASE p_action
    WHEN 'start' THEN ARRAY['open']
    WHEN 'block' THEN ARRAY['open', 'in_progress']
    WHEN 'unblock' THEN ARRAY['blocked']
    WHEN 'complete' THEN ARRAY['open', 'in_progress', 'blocked']
    WHEN 'reopen' THEN ARRAY['completed']
    WHEN 'cancel' THEN ARRAY['open', 'in_progress', 'blocked']
  END;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Unknown tasking action' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'block' AND v_note IS NULL THEN
    RAISE EXCEPTION 'A block needs a reason' USING ERRCODE = '23514';
  END IF;
  IF p_action NOT IN ('block', 'complete', 'cancel') THEN
    v_note := NULL;
  END IF;

  SELECT t.status, t.responsible_group_id, t.block_reason INTO v_status, v_group, v_reason
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR calendar_private.can_view_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tasking not found' USING ERRCODE = 'P0002';
  END IF;
  IF calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing this tasking needs Calendar operation access for its scope' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'block' AND v_status = 'blocked' THEN
    IF v_note = v_reason THEN
      RETURN false;
    END IF;
    UPDATE public.calendar_taskings SET block_reason = v_note
    WHERE organization_id = p_organization_id AND id = p_tasking_id;
    INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, occurred_at, kind, payload)
    VALUES (p_organization_id, p_tasking_id, auth.uid(), pg_catalog.now(), 'blocked',
      pg_catalog.jsonb_build_object('reason', v_note, 'edited', true));
    RETURN true;
  END IF;

  IF v_status = v_target THEN
    RETURN false;
  END IF;
  IF NOT v_status = ANY (v_from) THEN
    RAISE EXCEPTION 'A % tasking cannot %', v_status, p_action USING ERRCODE = '55000';
  END IF;

  UPDATE public.calendar_taskings SET
    status = v_target,
    block_reason = CASE WHEN v_target = 'blocked' THEN v_note END,
    blocked_at = CASE WHEN v_target = 'blocked' THEN pg_catalog.now() END,
    blocked_by = CASE WHEN v_target = 'blocked' THEN auth.uid() END,
    completion_note = CASE WHEN v_target = 'completed' THEN v_note END,
    completed_at = CASE WHEN v_target = 'completed' THEN pg_catalog.now() END,
    completed_by = CASE WHEN v_target = 'completed' THEN auth.uid() END,
    cancellation_reason = CASE WHEN v_target = 'cancelled' THEN v_note END,
    cancelled_at = CASE WHEN v_target = 'cancelled' THEN pg_catalog.now() END,
    cancelled_by = CASE WHEN v_target = 'cancelled' THEN auth.uid() END
  WHERE organization_id = p_organization_id AND id = p_tasking_id;
  RETURN true;
END;
$$;


ALTER FUNCTION public.transition_calendar_tasking(p_organization_id uuid, p_tasking_id uuid, p_action text, p_note text) OWNER TO postgres;

--
-- Name: undo_roster_swap(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.undo_roster_swap(p_organization_id uuid, p_swap_id uuid, p_today date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  swap_row public.roster_swaps%ROWTYPE;
  affected_date date;
BEGIN
  PERFORM calendar_private.require_roster_swap_access(p_organization_id, p_today);
  SELECT * INTO swap_row FROM public.roster_swaps WHERE organization_id = p_organization_id AND id = p_swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The roster changed since this preview' USING ERRCODE = 'RSW01';
  END IF;
  IF swap_row.first_date < p_today THEN
    RAISE EXCEPTION 'A swap cannot be undone after either day has passed' USING ERRCODE = 'RSW02';
  END IF;
  FOR affected_date IN SELECT day FROM unnest(ARRAY[swap_row.first_date, swap_row.second_date]) day ORDER BY day LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(affected_date::text));
  END LOOP;
  PERFORM 1 FROM public.daily_assignments a
  WHERE a.organization_id = p_organization_id AND a.assignment_type_id = swap_row.assignment_type_id
    AND a.date IN (swap_row.first_date, swap_row.second_date) ORDER BY a.date FOR UPDATE;
  DELETE FROM public.roster_swaps WHERE organization_id = p_organization_id AND id = p_swap_id RETURNING * INTO swap_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The roster changed since this preview' USING ERRCODE = 'RSW01';
  END IF;
  PERFORM pg_catalog.set_config('calendar.roster_write',
    CASE WHEN swap_row.first_source = 'roster' THEN 'on' ELSE '' END, true);
  UPDATE public.daily_assignments a SET assignee_id = swap_row.first_held_by, source = swap_row.first_source
  WHERE a.organization_id = p_organization_id AND a.assignment_type_id = swap_row.assignment_type_id
    AND a.date = swap_row.first_date;
  PERFORM pg_catalog.set_config('calendar.roster_write',
    CASE WHEN swap_row.second_source = 'roster' THEN 'on' ELSE '' END, true);
  UPDATE public.daily_assignments a SET assignee_id = swap_row.second_held_by, source = swap_row.second_source
  WHERE a.organization_id = p_organization_id AND a.assignment_type_id = swap_row.assignment_type_id
    AND a.date = swap_row.second_date;
  PERFORM pg_catalog.set_config('calendar.roster_write', '', true);
  PERFORM calendar_private.require_roster_swap_access(p_organization_id, p_today);
  RETURN jsonb_build_object('swap', to_jsonb(swap_row), 'saved', (
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.date) FROM public.daily_assignments a
    WHERE a.organization_id = p_organization_id AND a.assignment_type_id = swap_row.assignment_type_id
      AND a.date IN (swap_row.first_date, swap_row.second_date)));
END;
$$;


ALTER FUNCTION public.undo_roster_swap(p_organization_id uuid, p_swap_id uuid, p_today date) OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

--
-- Name: user_org_preferences_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_org_preferences_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.user_org_preferences_set_updated_at() OWNER TO postgres;

--
-- Name: whats_new_entries_stamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.whats_new_entries_stamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
	IF NEW.published_on IS NULL THEN
		NEW.published_seq := NULL;
	ELSIF TG_OP = 'UPDATE' AND OLD.published_seq IS NOT NULL THEN
		NEW.published_seq := OLD.published_seq;
	ELSE
		NEW.published_seq := pg_catalog.nextval('public.whats_new_publish_seq');
	END IF;
	IF TG_OP = 'UPDATE' THEN NEW.updated_at := pg_catalog.now(); END IF;
	RETURN NEW;
END $$;


ALTER FUNCTION public.whats_new_entries_stamp() OWNER TO postgres;

--
-- Name: write_roster_assignment_slots(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.write_roster_assignment_slots(p_actor uuid, p_organization_id uuid, p_slots jsonb) RETURNS SETOF public.daily_assignments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  affected_date date;
  written uuid[];
BEGIN
  IF p_actor IS NULL OR p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) = 0 THEN
    RAISE EXCEPTION 'Invalid roster write' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_slots) AS slot(value)
    WHERE jsonb_typeof(slot.value) IS DISTINCT FROM 'object'
      OR coalesce(btrim(slot.value->>'assignee_id'), '') = ''
      OR coalesce(jsonb_typeof(slot.value->'was'), 'missing') NOT IN ('string', 'null')
      OR coalesce(slot.value->>'source', '') NOT IN ('manual', 'roster')
  ) THEN
    RAISE EXCEPTION 'Invalid roster write' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);

  -- The same per-day locks the replacement takes, in the same order, so the check holds through the write.
  FOR affected_date IN
    SELECT DISTINCT (slot.value->>'date')::date AS day FROM jsonb_array_elements(p_slots) AS slot(value) ORDER BY day
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(affected_date::text)
    );
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_slots) AS slot(value)
    LEFT JOIN public.daily_assignments AS existing
      ON existing.organization_id = p_organization_id
      AND existing.date = (slot.value->>'date')::date
      AND existing.assignment_type_id = (slot.value->>'assignment_type_id')::uuid
    WHERE existing.assignee_id IS DISTINCT FROM slot.value->>'was'
  ) THEN
    RAISE EXCEPTION 'Assignment slot unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(row_value.id) INTO written
  FROM public.replace_daily_assignment_slots(p_organization_id, '{}'::date[], p_slots) AS row_value;

  PERFORM pg_catalog.set_config('calendar.roster_write', 'on', true);
  UPDATE public.daily_assignments AS row_value SET source = 'roster'
  FROM jsonb_array_elements(p_slots) AS slot(value)
  WHERE row_value.id = ANY(written)
    AND slot.value->>'source' = 'roster'
    AND row_value.date = (slot.value->>'date')::date
    AND row_value.assignment_type_id = (slot.value->>'assignment_type_id')::uuid;
  PERFORM pg_catalog.set_config('calendar.roster_write', '', true);

  RETURN QUERY SELECT * FROM public.daily_assignments WHERE id = ANY(written) ORDER BY date;
END;
$$;


ALTER FUNCTION public.write_roster_assignment_slots(p_actor uuid, p_organization_id uuid, p_slots jsonb) OWNER TO postgres;

--
-- Name: template_duplicate_receipts; Type: TABLE; Schema: onboarding_private; Owner: postgres
--

CREATE TABLE onboarding_private.template_duplicate_receipts (
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    source_template_id uuid NOT NULL,
    result_template_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE onboarding_private.template_duplicate_receipts OWNER TO postgres;

--
-- Name: file_artifact_deletions; Type: TABLE; Schema: organization_private; Owner: postgres
--

CREATE TABLE organization_private.file_artifact_deletions (
    artifact_kind text NOT NULL,
    artifact_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    retired_key_digest bytea,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT file_artifact_deletions_artifact_kind_check CHECK ((artifact_kind = ANY (ARRAY['counseling'::text, 'document'::text])))
);


ALTER TABLE organization_private.file_artifact_deletions OWNER TO postgres;

--
-- Name: file_retirement_holds; Type: TABLE; Schema: organization_private; Owner: postgres
--

CREATE TABLE organization_private.file_retirement_holds (
    key_digest bytea NOT NULL,
    bucket_id text NOT NULL,
    object_name text NOT NULL,
    held_at timestamp with time zone DEFAULT now() NOT NULL,
    attempted_at timestamp with time zone,
    CONSTRAINT file_retirement_holds_bucket_id_check CHECK ((bucket_id = ANY (ARRAY['counseling-files'::text, 'personnel-documents'::text])))
);


ALTER TABLE organization_private.file_retirement_holds OWNER TO postgres;

--
-- Name: file_retirements; Type: TABLE; Schema: organization_private; Owner: postgres
--

CREATE TABLE organization_private.file_retirements (
    key_digest bytea NOT NULL,
    bucket_id text NOT NULL,
    object_name text,
    retired_at timestamp with time zone DEFAULT now() NOT NULL,
    attempted_at timestamp with time zone,
    CONSTRAINT file_retirements_bucket_id_check CHECK ((bucket_id = ANY (ARRAY['counseling-files'::text, 'personnel-documents'::text, 'training-certificates'::text])))
);


ALTER TABLE organization_private.file_retirements OWNER TO postgres;

--
-- Name: file_uploads; Type: TABLE; Schema: organization_private; Owner: postgres
--

CREATE TABLE organization_private.file_uploads (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    bucket_id text NOT NULL,
    object_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT file_uploads_bucket_id_check CHECK ((bucket_id = ANY (ARRAY['counseling-files'::text, 'personnel-documents'::text, 'training-certificates'::text]))),
    CONSTRAINT file_uploads_check CHECK (((object_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'::text) AND (lower(split_part(object_name, '/'::text, 1)) = (organization_id)::text)))
);


ALTER TABLE organization_private.file_uploads OWNER TO postgres;

--
-- Name: access_request_organization_invitation_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.access_request_organization_invitation_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    access_request_id uuid NOT NULL,
    organization_invitation_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    invited_by uuid NOT NULL,
    invited_at timestamp with time zone NOT NULL,
    intended_membership_role text NOT NULL,
    intended_permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    intended_member_preset text,
    intended_capability_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    intended_access_scope_kind text NOT NULL,
    intended_access_scope_group_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_request_organization_invitation_links_role_check CHECK ((intended_membership_role = ANY (ARRAY['admin'::text, 'member'::text]))),
    CONSTRAINT access_request_organization_invitation_links_scope_kind_check CHECK ((intended_access_scope_kind = ANY (ARRAY['organization'::text, 'groups'::text])))
);


ALTER TABLE public.access_request_organization_invitation_links OWNER TO postgres;

--
-- Name: account_setup_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_setup_attempts (
    setup_link_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    normalized_email text NOT NULL,
    state text NOT NULL,
    auth_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_setup_attempts_check CHECK (((state = 'committed'::text) = (auth_user_id IS NOT NULL))),
    CONSTRAINT account_setup_attempts_normalized_email_check CHECK (((normalized_email = lower(btrim(normalized_email))) AND (normalized_email <> ''::text))),
    CONSTRAINT account_setup_attempts_state_check CHECK ((state = ANY (ARRAY['started'::text, 'committed'::text, 'fenced'::text])))
);


ALTER TABLE public.account_setup_attempts OWNER TO postgres;

--
-- Name: account_setup_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_setup_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    access_request_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_reason text,
    revocation_reason text,
    resend_email_id text,
    bounced_at timestamp with time zone,
    bounce_reason text,
    CONSTRAINT account_setup_links_completion_requires_claim_check CHECK (((used_at IS NULL) OR (claimed_at IS NOT NULL))),
    CONSTRAINT account_setup_links_failure_reason_check CHECK (((failure_reason IS NULL) OR ((failed_at IS NOT NULL) AND (failure_reason = ANY (ARRAY['access-request-missing'::text, 'access-request-completed'::text, 'access-request-not-approved'::text, 'account-create-failed'::text, 'completion-tracking-failed'::text, 'operator-released'::text, 'reconciled-no-write'::text]))))),
    CONSTRAINT account_setup_links_failure_requires_claim_check CHECK (((failed_at IS NULL) OR (claimed_at IS NOT NULL))),
    CONSTRAINT account_setup_links_revocation_reason_check CHECK (((revocation_reason IS NULL) OR (revocation_reason = ANY (ARRAY['manual'::text, 'replaced'::text, 'cleanup'::text])))),
    CONSTRAINT account_setup_links_revocation_reason_requires_revocation_check CHECK (((revocation_reason IS NULL) OR (revoked_at IS NOT NULL)))
);


ALTER TABLE public.account_setup_links OWNER TO postgres;

--
-- Name: account_setup_rate_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_setup_rate_limits (
    bucket_key text NOT NULL,
    request_count integer NOT NULL,
    reset_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_setup_rate_limits_request_count_check CHECK ((request_count >= 0))
);


ALTER TABLE public.account_setup_rate_limits OWNER TO postgres;

--
-- Name: announcement_dismissals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement_dismissals (
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.announcement_dismissals OWNER TO postgres;

--
-- Name: assignment_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assignment_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    short_name text NOT NULL,
    assign_to text NOT NULL,
    color text DEFAULT '#6b7280'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    show_on_calendar boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    roster_pool_rules jsonb,
    roster_weekend_mode text DEFAULT 'same'::text NOT NULL,
    CONSTRAINT assignment_types_assign_to_check CHECK ((assign_to = ANY (ARRAY['personnel'::text, 'group'::text]))),
    CONSTRAINT assignment_types_roster_pool_rules_check CHECK (((roster_pool_rules IS NULL) OR public.is_roster_pool_rules(roster_pool_rules))),
    CONSTRAINT assignment_types_roster_weekend_mode_check CHECK ((roster_weekend_mode = ANY (ARRAY['same'::text, 'separate'::text, 'none'::text])))
);


ALTER TABLE public.assignment_types OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    org_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid,
    ip_address inet,
    user_agent text,
    details jsonb DEFAULT '{}'::jsonb,
    severity text DEFAULT 'info'::text NOT NULL,
    CONSTRAINT audit_logs_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: auth_email_outbox; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auth_email_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    access_request_id uuid NOT NULL,
    setup_link_id uuid NOT NULL,
    recipient text NOT NULL,
    purpose text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT auth_email_outbox_purpose_check CHECK ((purpose = 'account_setup'::text)),
    CONSTRAINT auth_email_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


ALTER TABLE public.auth_email_outbox OWNER TO postgres;

--
-- Name: availability_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.availability_entries (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    status_type_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    set_for_tasking_id uuid,
    CONSTRAINT availability_entries_note_length CHECK ((char_length(note) <= 200)),
    CONSTRAINT valid_date_range CHECK ((end_date >= start_date))
);


ALTER TABLE public.availability_entries OWNER TO postgres;

--
-- Name: beta_feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.beta_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    user_email text NOT NULL,
    organization_id uuid,
    organization_name text,
    category text DEFAULT 'general'::text NOT NULL,
    message text NOT NULL,
    page_url text,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    github_issue_number integer,
    github_issue_url text,
    page_section text,
    updated_by uuid DEFAULT auth.uid(),
    CONSTRAINT beta_feedback_category_check CHECK ((category = ANY (ARRAY['bug'::text, 'feature'::text, 'general'::text]))),
    CONSTRAINT beta_feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewed'::text, 'resolved'::text])))
);


ALTER TABLE public.beta_feedback OWNER TO postgres;

--
-- Name: calendar_event_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_event_activity (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    event_id uuid NOT NULL,
    actor_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT calendar_event_activity_kind_check CHECK ((kind = ANY (ARRAY['created'::text, 'dates_changed'::text, 'coordination_changed'::text, 'cancelled'::text]))),
    CONSTRAINT calendar_event_activity_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
);


ALTER TABLE public.calendar_event_activity OWNER TO postgres;

--
-- Name: calendar_event_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_event_activity ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.calendar_event_activity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    host_name text,
    coordinator_user_id uuid NOT NULL,
    location text,
    description text,
    source_reference text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancellation_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT calendar_events_cancellation CHECK ((((cancelled_at IS NULL) = (cancelled_by IS NULL)) AND ((cancelled_at IS NOT NULL) OR (cancellation_reason IS NULL)))),
    CONSTRAINT calendar_events_cancellation_reason_check CHECK (((cancellation_reason IS NULL) OR ((btrim(cancellation_reason) <> ''::text) AND (char_length(cancellation_reason) <= 1000)))),
    CONSTRAINT calendar_events_date_order CHECK ((ends_on >= starts_on)),
    CONSTRAINT calendar_events_description_check CHECK (((description IS NULL) OR ((btrim(description) <> ''::text) AND (char_length(description) <= 4000)))),
    CONSTRAINT calendar_events_host_name_check CHECK (((host_name IS NULL) OR ((btrim(host_name) <> ''::text) AND (char_length(host_name) <= 200)))),
    CONSTRAINT calendar_events_location_check CHECK (((location IS NULL) OR ((btrim(location) <> ''::text) AND (char_length(location) <= 200)))),
    CONSTRAINT calendar_events_source_reference_check CHECK (((source_reference IS NULL) OR ((btrim(source_reference) <> ''::text) AND (char_length(source_reference) <= 500) AND ((source_reference ~* '^https?://\S+$'::text) OR ((source_reference !~* '^\s*[a-z][a-z0-9+.-]*://'::text) AND (source_reference !~* '^\s*(javascript|data|vbscript|file|blob):'::text)))))),
    CONSTRAINT calendar_events_title_check CHECK (((btrim(title) <> ''::text) AND (char_length(title) <= 200)))
);


ALTER TABLE public.calendar_events OWNER TO postgres;

--
-- Name: calendar_tasking_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_tasking_activity (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    tasking_id uuid NOT NULL,
    actor_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT calendar_tasking_activity_kind_check CHECK ((kind = ANY ('{blocked,cancelled,checklist_added,checklist_completed,checklist_removed,checklist_renamed,checklist_reopened,completed,created,dates_changed,equipment_added,equipment_changed,equipment_removed,equipment_returned,equipment_secured,instructions_changed,linked,outcome_changed,reopened,requirement_changed,responsibility_changed,staffing_changed,started,unblocked,unlinked,event_deleted}'::text[]))),
    CONSTRAINT calendar_tasking_activity_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
);


ALTER TABLE public.calendar_tasking_activity OWNER TO postgres;

--
-- Name: calendar_tasking_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_tasking_activity ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.calendar_tasking_activity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: calendar_tasking_checklist_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_tasking_checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tasking_id uuid NOT NULL,
    label text NOT NULL,
    done boolean DEFAULT false NOT NULL,
    done_at timestamp with time zone,
    done_by uuid,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT calendar_tasking_checklist_done CHECK (((done = (done_at IS NOT NULL)) AND (done OR (done_by IS NULL)))),
    CONSTRAINT calendar_tasking_checklist_items_label_check CHECK (((btrim(label) <> ''::text) AND (char_length(label) <= 200)))
);


ALTER TABLE public.calendar_tasking_checklist_items OWNER TO postgres;

--
-- Name: calendar_tasking_equipment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_tasking_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tasking_id uuid NOT NULL,
    name text NOT NULL,
    quantity integer NOT NULL,
    secured_quantity integer DEFAULT 0 NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    returned_quantity integer DEFAULT 0 NOT NULL,
    CONSTRAINT calendar_tasking_equipment_check CHECK (((returned_quantity >= 0) AND (returned_quantity <= quantity))),
    CONSTRAINT calendar_tasking_equipment_name_check CHECK (((btrim(name) <> ''::text) AND (char_length(name) <= 200))),
    CONSTRAINT calendar_tasking_equipment_quantity_check CHECK (((quantity >= 1) AND (quantity <= 9999))),
    CONSTRAINT calendar_tasking_equipment_secured CHECK (((secured_quantity >= 0) AND (secured_quantity <= quantity)))
);


ALTER TABLE public.calendar_tasking_equipment OWNER TO postgres;

--
-- Name: calendar_tasking_participants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_tasking_participants (
    organization_id uuid NOT NULL,
    tasking_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    selected_at timestamp with time zone DEFAULT now() NOT NULL,
    selected_by uuid,
    review_since timestamp with time zone
);


ALTER TABLE public.calendar_tasking_participants OWNER TO postgres;

--
-- Name: calendar_taskings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calendar_taskings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    event_id uuid,
    title text NOT NULL,
    responsible_group_id uuid,
    suspense_on date NOT NULL,
    execution_starts_on date,
    execution_ends_on date,
    report_time time without time zone,
    staffing_required integer,
    qualifications text,
    instructions text,
    status text DEFAULT 'open'::text NOT NULL,
    block_reason text,
    blocked_at timestamp with time zone,
    blocked_by uuid,
    completion_note text,
    completed_at timestamp with time zone,
    completed_by uuid,
    cancellation_reason text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    staffing_revision integer DEFAULT 0 NOT NULL,
    CONSTRAINT calendar_taskings_block_reason_check CHECK (((block_reason IS NULL) OR ((btrim(block_reason) <> ''::text) AND (char_length(block_reason) <= 1000)))),
    CONSTRAINT calendar_taskings_blocked CHECK ((((status = 'blocked'::text) = (blocked_at IS NOT NULL)) AND ((status = 'blocked'::text) = (block_reason IS NOT NULL)) AND ((blocked_at IS NOT NULL) OR (blocked_by IS NULL)))),
    CONSTRAINT calendar_taskings_cancellation_reason_check CHECK (((cancellation_reason IS NULL) OR ((btrim(cancellation_reason) <> ''::text) AND (char_length(cancellation_reason) <= 1000)))),
    CONSTRAINT calendar_taskings_cancelled CHECK ((((status = 'cancelled'::text) = (cancelled_at IS NOT NULL)) AND ((cancelled_at IS NOT NULL) OR ((cancelled_by IS NULL) AND (cancellation_reason IS NULL))))),
    CONSTRAINT calendar_taskings_completed CHECK ((((status = 'completed'::text) = (completed_at IS NOT NULL)) AND ((completed_at IS NOT NULL) OR ((completed_by IS NULL) AND (completion_note IS NULL))))),
    CONSTRAINT calendar_taskings_completion_note_check CHECK (((completion_note IS NULL) OR ((btrim(completion_note) <> ''::text) AND (char_length(completion_note) <= 1000)))),
    CONSTRAINT calendar_taskings_execution CHECK ((((execution_starts_on IS NULL) = (execution_ends_on IS NULL)) AND ((execution_ends_on IS NULL) OR (execution_ends_on >= execution_starts_on)) AND ((report_time IS NULL) OR (execution_starts_on IS NOT NULL)))),
    CONSTRAINT calendar_taskings_instructions_check CHECK (((instructions IS NULL) OR ((btrim(instructions) <> ''::text) AND (char_length(instructions) <= 4000)))),
    CONSTRAINT calendar_taskings_qualifications_check CHECK (((qualifications IS NULL) OR ((btrim(qualifications) <> ''::text) AND (char_length(qualifications) <= 1000)))),
    CONSTRAINT calendar_taskings_staffing CHECK (((qualifications IS NULL) OR (staffing_required IS NOT NULL))),
    CONSTRAINT calendar_taskings_staffing_required_check CHECK (((staffing_required IS NULL) OR ((staffing_required >= 1) AND (staffing_required <= 9999)))),
    CONSTRAINT calendar_taskings_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT calendar_taskings_title_check CHECK (((btrim(title) <> ''::text) AND (char_length(title) <= 200)))
);


ALTER TABLE public.calendar_taskings OWNER TO postgres;

--
-- Name: counseling_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.counseling_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    date_conducted date NOT NULL,
    subject text NOT NULL,
    key_points text,
    plan_of_action text,
    follow_up_date date,
    status text DEFAULT 'draft'::text NOT NULL,
    counselor_signed boolean DEFAULT false NOT NULL,
    counselor_signed_at timestamp with time zone,
    soldier_signed boolean DEFAULT false NOT NULL,
    soldier_signed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    file_path text,
    title text NOT NULL,
    summary text,
    uploaded_by text NOT NULL,
    archived_at timestamp with time zone,
    archived_by text,
    conducted_by text,
    CONSTRAINT counseling_records_conducted_by_check CHECK (((conducted_by IS NULL) OR ((conducted_by = btrim(conducted_by)) AND ((char_length(conducted_by) >= 1) AND (char_length(conducted_by) <= 120))))),
    CONSTRAINT counseling_records_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text, 'acknowledged'::text])))
);


ALTER TABLE public.counseling_records OWNER TO postgres;

--
-- Name: dashboard_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dashboard_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    config jsonb DEFAULT '{"version": 1, "widgets": []}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dashboard_configs OWNER TO postgres;

--
-- Name: data_exports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_exports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    file_path text,
    file_size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT data_exports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


ALTER TABLE public.data_exports OWNER TO postgres;

--
-- Name: deletion_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    requested_by_email text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    resource_description text NOT NULL,
    resource_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    denial_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.deletion_requests OWNER TO postgres;

--
-- Name: durable_rate_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.durable_rate_limits (
    bucket_key text NOT NULL,
    request_count integer NOT NULL,
    reset_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT durable_rate_limits_request_count_check CHECK ((request_count >= 0))
);


ALTER TABLE public.durable_rate_limits OWNER TO postgres;

--
-- Name: feedback_replies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedback_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_id uuid NOT NULL,
    body text NOT NULL,
    sent_by uuid DEFAULT auth.uid() NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    author text NOT NULL,
    CONSTRAINT feedback_replies_author_check CHECK ((author = ANY (ARRAY['operator'::text, 'reporter'::text]))),
    CONSTRAINT feedback_replies_body_check CHECK (((length(btrim(body)) >= 1) AND (length(btrim(body)) <= 5000)))
);


ALTER TABLE public.feedback_replies OWNER TO postgres;

--
-- Name: feedback_staff_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedback_staff_notes (
    feedback_id uuid NOT NULL,
    body text NOT NULL,
    updated_by uuid DEFAULT auth.uid(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.feedback_staff_notes OWNER TO postgres;

--
-- Name: groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.groups (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id uuid,
    path uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    depth integer GENERATED ALWAYS AS (cardinality(path)) STORED,
    CONSTRAINT groups_path_shape CHECK (((array_ndims(path) = 1) AND (array_lower(path, 1) = 1) AND ((cardinality(path) >= 1) AND (cardinality(path) <= 3)) AND (array_position(path, NULL::uuid) IS NULL) AND (path[cardinality(path)] = id)))
);


ALTER TABLE public.groups OWNER TO postgres;

--
-- Name: leader_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leader_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    author text NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    archived_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leader_notes_text_not_blank CHECK ((length(btrim(text)) > 0))
);


ALTER TABLE public.leader_notes OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_account_feedback_only CHECK (((organization_id IS NOT NULL) OR (type = 'feedback_reply'::text)))
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: onboarding_step_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.onboarding_step_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    onboarding_id uuid NOT NULL,
    step_name text NOT NULL,
    step_type text NOT NULL,
    training_type_id uuid,
    stages jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    current_stage text,
    notes jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    template_step_id uuid,
    active boolean DEFAULT true NOT NULL,
    organization_id uuid NOT NULL,
    progress_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT onboarding_step_progress_step_type_check CHECK ((step_type = ANY (ARRAY['training'::text, 'paperwork'::text, 'checkbox'::text])))
);


ALTER TABLE public.onboarding_step_progress OWNER TO postgres;

--
-- Name: onboarding_template_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.onboarding_template_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    step_type text NOT NULL,
    training_type_id uuid,
    stages jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    template_id uuid NOT NULL,
    CONSTRAINT onboarding_template_steps_step_type_check CHECK ((step_type = ANY (ARRAY['training'::text, 'paperwork'::text, 'checkbox'::text])))
);


ALTER TABLE public.onboarding_template_steps OWNER TO postgres;

--
-- Name: onboarding_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.onboarding_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.onboarding_templates OWNER TO postgres;

--
-- Name: organization_creation_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_creation_requests (
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.organization_creation_requests OWNER TO postgres;

--
-- Name: organization_invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_invitations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    invited_by uuid NOT NULL,
    status public.invitation_status DEFAULT 'pending'::public.invitation_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    member_preset text DEFAULT 'viewer'::text NOT NULL,
    capability_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    access_scope_kind text DEFAULT 'organization'::text NOT NULL,
    access_scope_group_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    normalized_email text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    declined_at timestamp with time zone,
    declined_by uuid,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    expired_at timestamp with time zone,
    blocked_at timestamp with time zone,
    blocked_by uuid,
    role public.organization_role DEFAULT 'member'::public.organization_role NOT NULL,
    CONSTRAINT organization_invitations_access_scope_kind_check CHECK ((access_scope_kind = ANY (ARRAY['organization'::text, 'groups'::text]))),
    CONSTRAINT organization_invitations_actor_timestamp_check CHECK ((((accepted_by IS NULL) OR (accepted_at IS NOT NULL)) AND ((declined_by IS NULL) OR (declined_at IS NOT NULL)) AND ((revoked_by IS NULL) OR (revoked_at IS NOT NULL)) AND ((blocked_by IS NULL) OR (blocked_at IS NOT NULL)))),
    CONSTRAINT organization_invitations_capability_overrides_check CHECK ((jsonb_typeof(capability_overrides) = 'object'::text)),
    CONSTRAINT organization_invitations_lifecycle_state_check CHECK (((((status)::text = 'pending'::text) AND (accepted_at IS NULL) AND (declined_at IS NULL) AND (revoked_at IS NULL) AND (expired_at IS NULL) AND (blocked_at IS NULL)) OR (((status)::text = 'accepted'::text) AND (accepted_at IS NOT NULL) AND (declined_at IS NULL) AND (revoked_at IS NULL) AND (expired_at IS NULL) AND (blocked_at IS NULL)) OR (((status)::text = 'declined'::text) AND (accepted_at IS NULL) AND (declined_at IS NOT NULL) AND (revoked_at IS NULL) AND (expired_at IS NULL) AND (blocked_at IS NULL)) OR (((status)::text = 'revoked'::text) AND (accepted_at IS NULL) AND (declined_at IS NULL) AND (revoked_at IS NOT NULL) AND (expired_at IS NULL) AND (blocked_at IS NULL)) OR (((status)::text = 'expired'::text) AND (accepted_at IS NULL) AND (declined_at IS NULL) AND (revoked_at IS NULL) AND (expired_at IS NOT NULL) AND (blocked_at IS NULL)) OR (((status)::text = 'blocked'::text) AND (accepted_at IS NULL) AND (declined_at IS NULL) AND (revoked_at IS NULL) AND (expired_at IS NULL) AND (blocked_at IS NOT NULL)))),
    CONSTRAINT organization_invitations_member_preset_check CHECK ((member_preset = ANY (ARRAY['viewer'::text, 'operator'::text, 'editor'::text]))),
    CONSTRAINT organization_invitations_pending_expiry_check CHECK ((((status)::text <> 'pending'::text) OR (expires_at IS NOT NULL))),
    CONSTRAINT organization_invitations_pending_role_check CHECK (((status <> 'pending'::public.invitation_status) OR (role <> 'owner'::public.organization_role)))
);


ALTER TABLE public.organization_invitations OWNER TO postgres;

--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_memberships (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.organization_role DEFAULT 'member'::public.organization_role NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    member_preset text DEFAULT 'viewer'::text NOT NULL,
    capability_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    access_scope_kind text DEFAULT 'organization'::text NOT NULL,
    access_scope_group_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    CONSTRAINT organization_memberships_access_scope_kind_check CHECK ((access_scope_kind = ANY (ARRAY['organization'::text, 'groups'::text]))),
    CONSTRAINT organization_memberships_capability_overrides_check CHECK ((jsonb_typeof(capability_overrides) = 'object'::text)),
    CONSTRAINT organization_memberships_member_preset_check CHECK ((member_preset = ANY (ARRAY['viewer'::text, 'operator'::text, 'editor'::text])))
);


ALTER TABLE public.organization_memberships OWNER TO postgres;

--
-- Name: organization_rank_catalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_rank_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    service text NOT NULL,
    category text NOT NULL,
    pay_grade text NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    source text DEFAULT 'custom'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_rank_catalog_category_check CHECK ((category = ANY (ARRAY['officer'::text, 'warrant'::text, 'enlisted'::text, 'civilian'::text, 'custom'::text]))),
    CONSTRAINT organization_rank_catalog_code_check CHECK ((((length(btrim(code)) >= 1) AND (length(btrim(code)) <= 80)) AND (code = btrim(code)))),
    CONSTRAINT organization_rank_catalog_label_check CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 120))),
    CONSTRAINT organization_rank_catalog_pay_grade_check CHECK ((pay_grade = ANY (ARRAY['O-1'::text, 'O-2'::text, 'O-3'::text, 'O-4'::text, 'O-5'::text, 'O-6'::text, 'O-7'::text, 'O-8'::text, 'O-9'::text, 'O-10'::text, 'W-1'::text, 'W-2'::text, 'W-3'::text, 'W-4'::text, 'W-5'::text, 'E-1'::text, 'E-2'::text, 'E-3'::text, 'E-4'::text, 'E-5'::text, 'E-6'::text, 'E-7'::text, 'E-8'::text, 'E-9'::text, 'ungraded'::text]))),
    CONSTRAINT organization_rank_catalog_service_check CHECK ((service = ANY (ARRAY['army'::text, 'navy'::text, 'air-force'::text, 'marine-corps'::text, 'coast-guard'::text, 'space-force'::text, 'civilian'::text, 'custom'::text]))),
    CONSTRAINT organization_rank_catalog_source_check CHECK ((source = ANY (ARRAY['built-in'::text, 'discovered'::text, 'custom'::text]))),
    CONSTRAINT organization_rank_catalog_state_check CHECK ((state = ANY (ARRAY['active'::text, 'retired'::text])))
);


ALTER TABLE public.organization_rank_catalog OWNER TO postgres;

--
-- Name: organization_suspensions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_suspensions (
    organization_id uuid NOT NULL,
    reason text NOT NULL,
    suspended_by uuid,
    suspended_at timestamp with time zone NOT NULL,
    CONSTRAINT organization_suspensions_reason_check CHECK (((char_length(btrim(reason)) >= 1) AND (char_length(btrim(reason)) <= 500)))
);


ALTER TABLE public.organization_suspensions OWNER TO postgres;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organizations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archive_retention_months integer DEFAULT 36,
    suspended_at timestamp with time zone,
    critical_tasks_default_expiration_months integer,
    critical_tasks_expiring_soon_warning_days integer,
    loss_warning_window_days integer DEFAULT 180 NOT NULL,
    personnel_document_storage_cap_bytes bigint DEFAULT 104857600 NOT NULL,
    url_slug text,
    training_readiness_goal_percent smallint DEFAULT 90 NOT NULL,
    disabled_features text[] DEFAULT '{}'::text[] NOT NULL,
    strength_floor_percent smallint DEFAULT 80 NOT NULL,
    CONSTRAINT organizations_critical_tasks_default_expiration_months_check CHECK (((critical_tasks_default_expiration_months IS NULL) OR ((critical_tasks_default_expiration_months >= 1) AND (critical_tasks_default_expiration_months <= 120)))),
    CONSTRAINT organizations_critical_tasks_expiring_soon_warning_days_check CHECK (((critical_tasks_expiring_soon_warning_days IS NULL) OR ((critical_tasks_expiring_soon_warning_days >= 1) AND (critical_tasks_expiring_soon_warning_days <= 365)))),
    CONSTRAINT organizations_disabled_features_check CHECK ((disabled_features <@ ARRAY['training'::text, 'criticalTasks'::text, 'evaluations'::text, 'onboarding'::text, 'lossesAndAwards'::text, 'eventsAndTaskings'::text])),
    CONSTRAINT organizations_loss_warning_window_days_check CHECK (((loss_warning_window_days >= 1) AND (loss_warning_window_days <= 365))),
    CONSTRAINT organizations_strength_floor_percent_check CHECK (((strength_floor_percent >= 1) AND (strength_floor_percent <= 100))),
    CONSTRAINT organizations_training_readiness_goal_percent_check CHECK (((training_readiness_goal_percent >= 1) AND (training_readiness_goal_percent <= 100))),
    CONSTRAINT organizations_url_slug_format_check CHECK (((url_slug IS NULL) OR (((char_length(url_slug) >= 3) AND (char_length(url_slug) <= 48)) AND (url_slug = lower(url_slug)) AND (url_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))))
);


ALTER TABLE public.organizations OWNER TO postgres;

--
-- Name: password_change_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_change_attempts (
    actor uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    flow text,
    expires_at timestamp with time zone NOT NULL,
    state text NOT NULL,
    CONSTRAINT password_change_attempts_flow_check CHECK ((flow = ANY (ARRAY['recovery'::text, 'invite'::text]))),
    CONSTRAINT password_change_attempts_state_check CHECK ((state = ANY (ARRAY['started'::text, 'pending'::text, 'complete'::text, 'failed'::text])))
);


ALTER TABLE public.password_change_attempts OWNER TO postgres;

--
-- Name: personnel; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    rank text NOT NULL,
    last_name text NOT NULL,
    first_name text NOT NULL,
    clinic_role text DEFAULT ''::text NOT NULL,
    group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mos text DEFAULT ''::text NOT NULL,
    archived_at timestamp with time zone,
    ets date,
    deros date,
    slug text NOT NULL,
    CONSTRAINT personnel_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))
);


ALTER TABLE public.personnel OWNER TO postgres;

--
-- Name: personnel_attribute_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel_attribute_history (
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    effective_on date NOT NULL,
    rank text NOT NULL,
    mos text NOT NULL,
    clinic_role text NOT NULL,
    group_id uuid,
    archived boolean NOT NULL
);


ALTER TABLE public.personnel_attribute_history OWNER TO postgres;

--
-- Name: personnel_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    title text NOT NULL,
    file_path text NOT NULL,
    file_size_bytes bigint NOT NULL,
    content_type text NOT NULL,
    uploaded_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    archived_by text,
    CONSTRAINT personnel_documents_file_size_check CHECK ((file_size_bytes > 0))
);


ALTER TABLE public.personnel_documents OWNER TO postgres;

--
-- Name: personnel_extended_info; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel_extended_info (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    emergency_contact_name text,
    emergency_contact_relationship text,
    emergency_contact_phone text,
    spouse_name text,
    spouse_phone text,
    vehicle_make_model text,
    vehicle_plate text,
    vehicle_color text,
    personal_email text,
    personal_phone text,
    address_street text,
    address_city text,
    address_state text,
    address_zip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    award_tracking_acknowledged_at timestamp with time zone,
    blood_type text,
    basd date,
    date_of_rank date,
    marital_status text,
    number_of_dependents integer,
    children jsonb,
    civilian_education text,
    military_education jsonb,
    marital_status_date date,
    updated_by text,
    CONSTRAINT personnel_extended_info_number_of_dependents_nonnegative CHECK (((number_of_dependents IS NULL) OR (number_of_dependents >= 0)))
);


ALTER TABLE public.personnel_extended_info OWNER TO postgres;

--
-- Name: personnel_follow_ups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel_follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    title text NOT NULL,
    notes text,
    due_date date,
    status text DEFAULT 'open'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    archived_at timestamp with time zone,
    completed_by text,
    archived_by text,
    CONSTRAINT personnel_follow_ups_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'archived'::text]))),
    CONSTRAINT personnel_follow_ups_title_check CHECK ((length(btrim(title)) > 0))
);


ALTER TABLE public.personnel_follow_ups OWNER TO postgres;

--
-- Name: personnel_onboardings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel_onboardings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    started_at date DEFAULT CURRENT_DATE NOT NULL,
    completed_at date,
    status text DEFAULT 'in_progress'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    template_id uuid,
    cancelled_at timestamp with time zone,
    CONSTRAINT personnel_onboardings_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


ALTER TABLE public.personnel_onboardings OWNER TO postgres;

--
-- Name: personnel_training_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel_training_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    training_type_id uuid NOT NULL,
    completion_date date,
    expiration_date date,
    notes text,
    certificate_url text,
    superseded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.personnel_training_history OWNER TO postgres;

--
-- Name: personnel_trainings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personnel_trainings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    training_type_id uuid NOT NULL,
    completion_date date,
    expiration_date date,
    notes text,
    certificate_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.personnel_trainings OWNER TO postgres;

--
-- Name: COLUMN personnel_trainings.completion_date; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.personnel_trainings.completion_date IS 'Date training was completed. NULL is allowed for never-expires training when marked complete without a specific date.';


--
-- Name: platform_announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type public.announcement_type DEFAULT 'info'::public.announcement_type NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.platform_announcements OWNER TO postgres;

--
-- Name: platform_operators; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_operators (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.platform_operators OWNER TO postgres;

--
-- Name: rating_scheme_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rating_scheme_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    rated_person_id uuid NOT NULL,
    eval_type text NOT NULL,
    rater_person_id uuid,
    rater_name text,
    senior_rater_person_id uuid,
    senior_rater_name text,
    intermediate_rater_person_id uuid,
    intermediate_rater_name text,
    reviewer_person_id uuid,
    reviewer_name text,
    rating_period_start date NOT NULL,
    rating_period_end date NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    report_type text,
    workflow_status text,
    CONSTRAINT rating_scheme_entries_eval_type_check CHECK ((eval_type = ANY (ARRAY['OER'::text, 'NCOER'::text, 'WOER'::text]))),
    CONSTRAINT rating_scheme_entries_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'change-of-rater'::text]))),
    CONSTRAINT rating_scheme_entries_workflow_status_check CHECK (((workflow_status IS NULL) OR (workflow_status = ANY (ARRAY['drafting'::text, 'with-rater'::text, 'rater-signed'::text, 'with-senior-rater'::text, 'sr-signed'::text, 'with-intermediate-rater'::text, 'ir-signed'::text, 'with-reviewer'::text, 'reviewer-signed'::text, 'with-rated-soldier'::text, 'sm-signed'::text, 'submitted-to-s1'::text, 'completed'::text]))))
);


ALTER TABLE public.rating_scheme_entries OWNER TO postgres;

--
-- Name: roster_excusals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roster_excusals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    assignment_type_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    reason text NOT NULL,
    starts_on date NOT NULL,
    ends_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roster_excusals_dates_check CHECK ((ends_on >= starts_on)),
    CONSTRAINT roster_excusals_reason_check CHECK (((btrim(reason) <> ''::text) AND (char_length(reason) <= 120)))
);


ALTER TABLE public.roster_excusals OWNER TO postgres;

--
-- Name: roster_starting_numbers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roster_starting_numbers (
    organization_id uuid NOT NULL,
    form_id uuid NOT NULL,
    personnel_id uuid NOT NULL,
    track text NOT NULL,
    count integer NOT NULL,
    origin text NOT NULL,
    CONSTRAINT roster_starting_numbers_count_check CHECK ((count >= 0)),
    CONSTRAINT roster_starting_numbers_origin_check CHECK ((origin = ANY (ARRAY['typed'::text, 'carried'::text]))),
    CONSTRAINT roster_starting_numbers_track_check CHECK ((track = ANY (ARRAY['all'::text, 'weekday'::text, 'weekend'::text])))
);


ALTER TABLE public.roster_starting_numbers OWNER TO postgres;

--
-- Name: roster_swaps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roster_swaps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    assignment_type_id uuid NOT NULL,
    first_date date NOT NULL,
    first_held_by text NOT NULL,
    first_source text NOT NULL,
    second_date date NOT NULL,
    second_held_by text NOT NULL,
    second_source text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roster_swaps_dates_check CHECK ((first_date < second_date)),
    CONSTRAINT roster_swaps_first_source_check CHECK ((first_source = ANY (ARRAY['manual'::text, 'roster'::text]))),
    CONSTRAINT roster_swaps_holders_check CHECK (((first_held_by <> second_held_by) AND (btrim(first_held_by) <> ''::text) AND (btrim(second_held_by) <> ''::text))),
    CONSTRAINT roster_swaps_second_source_check CHECK ((second_source = ANY (ARRAY['manual'::text, 'roster'::text])))
);


ALTER TABLE public.roster_swaps OWNER TO postgres;

--
-- Name: status_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.status_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6b7280'::text NOT NULL,
    text_color text DEFAULT '#ffffff'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    short_label text,
    roster_effect text DEFAULT 'A'::text NOT NULL,
    CONSTRAINT status_types_roster_effect_check CHECK ((roster_effect = ANY (ARRAY['available'::text, 'A'::text, 'D'::text, 'U'::text]))),
    CONSTRAINT status_types_short_label_length CHECK (((char_length(short_label) >= 1) AND (char_length(short_label) <= 3)))
);


ALTER TABLE public.status_types OWNER TO postgres;

--
-- Name: training_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.training_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    expiration_months integer,
    warning_days_yellow integer DEFAULT 60 NOT NULL,
    warning_days_orange integer DEFAULT 30 NOT NULL,
    applies_to_roles text[] DEFAULT '{}'::text[] NOT NULL,
    color text DEFAULT '#6b7280'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expiration_date_only boolean DEFAULT false NOT NULL,
    can_be_exempted boolean DEFAULT false NOT NULL,
    exempt_personnel_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    applies_to_mos text[] DEFAULT '{}'::text[] NOT NULL,
    applies_to_ranks text[] DEFAULT '{}'::text[] NOT NULL,
    excluded_roles text[] DEFAULT '{}'::text[] NOT NULL,
    excluded_mos text[] DEFAULT '{}'::text[] NOT NULL,
    excluded_ranks text[] DEFAULT '{}'::text[] NOT NULL,
    is_optional boolean DEFAULT false NOT NULL
);


ALTER TABLE public.training_types OWNER TO postgres;

--
-- Name: training_views; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.training_views (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    column_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.training_views OWNER TO postgres;

--
-- Name: user_email_identities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_email_identities (
    user_id uuid NOT NULL,
    normalized_email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_email_identities_normalized_email_check CHECK (((normalized_email = lower(btrim(normalized_email))) AND (normalized_email <> ''::text)))
);


ALTER TABLE public.user_email_identities OWNER TO postgres;

--
-- Name: user_org_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_org_preferences (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_org_preferences OWNER TO postgres;

--
-- Name: user_pinned_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_pinned_groups (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_id uuid NOT NULL
);


ALTER TABLE public.user_pinned_groups OWNER TO postgres;

--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL,
    first_name text,
    last_name text,
    rank text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_profiles_first_name_check CHECK (((first_name IS NULL) OR (length(btrim(first_name)) > 0))),
    CONSTRAINT user_profiles_last_name_check CHECK (((last_name IS NULL) OR (length(btrim(last_name)) > 0))),
    CONSTRAINT user_profiles_rank_check CHECK (((rank IS NULL) OR (rank = ANY (ARRAY['PV1'::text, 'PV2'::text, 'PFC'::text, 'SPC'::text, 'CPL'::text, 'SGT'::text, 'SSG'::text, 'SFC'::text, 'MSG'::text, '1SG'::text, 'SGM'::text, 'CSM'::text, 'WO1'::text, 'CW2'::text, 'CW3'::text, 'CW4'::text, 'CW5'::text, '2LT'::text, '1LT'::text, 'CPT'::text, 'MAJ'::text, 'LTC'::text, 'COL'::text, 'BG'::text, 'MG'::text, 'LTG'::text, 'GEN'::text, 'CIV'::text]))))
);


ALTER TABLE public.user_profiles OWNER TO postgres;

--
-- Name: user_suspensions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_suspensions (
    user_id uuid NOT NULL,
    suspended_at timestamp with time zone DEFAULT now() NOT NULL,
    suspended_by uuid NOT NULL,
    reason text
);


ALTER TABLE public.user_suspensions OWNER TO postgres;

--
-- Name: whats_new_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whats_new_entries (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    title text NOT NULL,
    paragraphs text[] DEFAULT ARRAY[]::text[] NOT NULL,
    published_on date,
    published_seq bigint,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whats_new_entries_id_shape CHECK ((id ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,99}$'::text)),
    CONSTRAINT whats_new_entries_paragraph_count CHECK ((cardinality(paragraphs) <= 30)),
    CONSTRAINT whats_new_entries_paragraphs_not_blank CHECK (((''::text <> ALL (paragraphs)) AND (array_position(paragraphs, NULL::text) IS NULL))),
    CONSTRAINT whats_new_entries_paragraphs_present CHECK (((published_on IS NULL) OR (cardinality(paragraphs) >= 1))),
    CONSTRAINT whats_new_entries_published_pair CHECK (((published_on IS NULL) = (published_seq IS NULL))),
    CONSTRAINT whats_new_entries_title_length CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200)))
);


ALTER TABLE public.whats_new_entries OWNER TO postgres;

--
-- Name: whats_new_publish_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.whats_new_publish_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.whats_new_publish_seq OWNER TO postgres;

--
-- Name: template_duplicate_receipts template_duplicate_receipts_pkey; Type: CONSTRAINT; Schema: onboarding_private; Owner: postgres
--

ALTER TABLE ONLY onboarding_private.template_duplicate_receipts
    ADD CONSTRAINT template_duplicate_receipts_pkey PRIMARY KEY (organization_id, user_id, request_id);


--
-- Name: file_artifact_deletions file_artifact_deletions_pkey; Type: CONSTRAINT; Schema: organization_private; Owner: postgres
--

ALTER TABLE ONLY organization_private.file_artifact_deletions
    ADD CONSTRAINT file_artifact_deletions_pkey PRIMARY KEY (artifact_kind, artifact_id);


--
-- Name: file_retirement_holds file_retirement_holds_pkey; Type: CONSTRAINT; Schema: organization_private; Owner: postgres
--

ALTER TABLE ONLY organization_private.file_retirement_holds
    ADD CONSTRAINT file_retirement_holds_pkey PRIMARY KEY (key_digest);


--
-- Name: file_retirements file_retirements_pkey; Type: CONSTRAINT; Schema: organization_private; Owner: postgres
--

ALTER TABLE ONLY organization_private.file_retirements
    ADD CONSTRAINT file_retirements_pkey PRIMARY KEY (key_digest);


--
-- Name: file_uploads file_uploads_bucket_id_object_name_key; Type: CONSTRAINT; Schema: organization_private; Owner: postgres
--

ALTER TABLE ONLY organization_private.file_uploads
    ADD CONSTRAINT file_uploads_bucket_id_object_name_key UNIQUE (bucket_id, object_name);


--
-- Name: file_uploads file_uploads_pkey; Type: CONSTRAINT; Schema: organization_private; Owner: postgres
--

ALTER TABLE ONLY organization_private.file_uploads
    ADD CONSTRAINT file_uploads_pkey PRIMARY KEY (id);


--
-- Name: access_request_organization_invitation_links access_request_organization_invitation_links_invitation_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_request_organization_invitation_links
    ADD CONSTRAINT access_request_organization_invitation_links_invitation_key UNIQUE (organization_invitation_id);


--
-- Name: access_request_organization_invitation_links access_request_organization_invitation_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_request_organization_invitation_links
    ADD CONSTRAINT access_request_organization_invitation_links_pkey PRIMARY KEY (id);


--
-- Name: access_requests access_requests_first_name_check; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.access_requests
    ADD CONSTRAINT access_requests_first_name_check CHECK (((first_name IS NULL) OR (length(btrim(first_name)) > 0))) NOT VALID;


--
-- Name: access_requests access_requests_heard_about_check; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.access_requests
    ADD CONSTRAINT access_requests_heard_about_check CHECK (((heard_about IS NULL) OR (heard_about = ANY (ARRAY['word_of_mouth'::text, 'unit_peer'::text, 'search_engine'::text, 'social_media'::text, 'reddit'::text, 'army_community'::text, 'other'::text])))) NOT VALID;


--
-- Name: access_requests access_requests_last_name_check; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.access_requests
    ADD CONSTRAINT access_requests_last_name_check CHECK (((last_name IS NULL) OR (length(btrim(last_name)) > 0))) NOT VALID;


--
-- Name: access_requests access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_pkey PRIMARY KEY (id);


--
-- Name: account_setup_attempts account_setup_attempts_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_setup_attempts
    ADD CONSTRAINT account_setup_attempts_id_key UNIQUE (id);


--
-- Name: account_setup_attempts account_setup_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_setup_attempts
    ADD CONSTRAINT account_setup_attempts_pkey PRIMARY KEY (setup_link_id);


--
-- Name: account_setup_links account_setup_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_setup_links
    ADD CONSTRAINT account_setup_links_pkey PRIMARY KEY (id);


--
-- Name: account_setup_rate_limits account_setup_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_setup_rate_limits
    ADD CONSTRAINT account_setup_rate_limits_pkey PRIMARY KEY (bucket_key);


--
-- Name: announcement_dismissals announcement_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_pkey PRIMARY KEY (announcement_id, user_id);


--
-- Name: assignment_types assignment_types_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment_types
    ADD CONSTRAINT assignment_types_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: assignment_types assignment_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment_types
    ADD CONSTRAINT assignment_types_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_email_outbox auth_email_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_email_outbox
    ADD CONSTRAINT auth_email_outbox_pkey PRIMARY KEY (id);


--
-- Name: availability_entries availability_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability_entries
    ADD CONSTRAINT availability_entries_pkey PRIMARY KEY (id);


--
-- Name: beta_feedback beta_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beta_feedback
    ADD CONSTRAINT beta_feedback_pkey PRIMARY KEY (id);


--
-- Name: calendar_event_activity calendar_event_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_event_activity
    ADD CONSTRAINT calendar_event_activity_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_tasking_activity calendar_tasking_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_activity
    ADD CONSTRAINT calendar_tasking_activity_pkey PRIMARY KEY (id);


--
-- Name: calendar_tasking_checklist_items calendar_tasking_checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_checklist_items
    ADD CONSTRAINT calendar_tasking_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: calendar_tasking_equipment calendar_tasking_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_equipment
    ADD CONSTRAINT calendar_tasking_equipment_pkey PRIMARY KEY (id);


--
-- Name: calendar_tasking_participants calendar_tasking_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_participants
    ADD CONSTRAINT calendar_tasking_participants_pkey PRIMARY KEY (tasking_id, personnel_id);


--
-- Name: calendar_taskings calendar_taskings_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_taskings
    ADD CONSTRAINT calendar_taskings_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: calendar_taskings calendar_taskings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_taskings
    ADD CONSTRAINT calendar_taskings_pkey PRIMARY KEY (id);


--
-- Name: organization_invitations clinic_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT clinic_invitations_pkey PRIMARY KEY (id);


--
-- Name: organization_memberships clinic_memberships_clinic_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT clinic_memberships_clinic_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_memberships clinic_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT clinic_memberships_pkey PRIMARY KEY (id);


--
-- Name: organizations clinics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT clinics_pkey PRIMARY KEY (id);


--
-- Name: counseling_records counseling_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.counseling_records
    ADD CONSTRAINT counseling_records_pkey PRIMARY KEY (id);


--
-- Name: daily_assignments daily_assignments_clinic_id_assignment_type_id_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_assignments
    ADD CONSTRAINT daily_assignments_clinic_id_assignment_type_id_date_key UNIQUE (organization_id, assignment_type_id, date);


--
-- Name: daily_assignments daily_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_assignments
    ADD CONSTRAINT daily_assignments_pkey PRIMARY KEY (id);


--
-- Name: dashboard_configs dashboard_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_configs
    ADD CONSTRAINT dashboard_configs_pkey PRIMARY KEY (id);


--
-- Name: dashboard_configs dashboard_configs_user_id_org_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_configs
    ADD CONSTRAINT dashboard_configs_user_id_org_id_key UNIQUE (user_id, org_id);


--
-- Name: data_exports data_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_exports
    ADD CONSTRAINT data_exports_pkey PRIMARY KEY (id);


--
-- Name: deletion_requests deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: durable_rate_limits durable_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.durable_rate_limits
    ADD CONSTRAINT durable_rate_limits_pkey PRIMARY KEY (bucket_key);


--
-- Name: feedback_replies feedback_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback_replies
    ADD CONSTRAINT feedback_replies_pkey PRIMARY KEY (id);


--
-- Name: feedback_staff_notes feedback_staff_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback_staff_notes
    ADD CONSTRAINT feedback_staff_notes_pkey PRIMARY KEY (feedback_id);


--
-- Name: groups groups_name_path_separator; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.groups
    ADD CONSTRAINT groups_name_path_separator CHECK ((name !~~ '% / %'::text)) NOT VALID;


--
-- Name: groups groups_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: groups groups_sibling_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_sibling_name_key UNIQUE NULLS NOT DISTINCT (organization_id, parent_id, name);


--
-- Name: ict_tasks ict_tasks_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ict_tasks
    ADD CONSTRAINT ict_tasks_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: ict_tasks ict_tasks_organization_id_task_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ict_tasks
    ADD CONSTRAINT ict_tasks_organization_id_task_code_key UNIQUE (organization_id, task_code);


--
-- Name: ict_tasks ict_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ict_tasks
    ADD CONSTRAINT ict_tasks_pkey PRIMARY KEY (id);


--
-- Name: leader_notes leader_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leader_notes
    ADD CONSTRAINT leader_notes_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: onboarding_step_progress onboarding_step_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_step_progress
    ADD CONSTRAINT onboarding_step_progress_pkey PRIMARY KEY (id);


--
-- Name: onboarding_template_steps onboarding_template_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_template_steps
    ADD CONSTRAINT onboarding_template_steps_pkey PRIMARY KEY (id);


--
-- Name: onboarding_templates onboarding_templates_org_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_templates
    ADD CONSTRAINT onboarding_templates_org_name_unique UNIQUE (organization_id, name);


--
-- Name: onboarding_templates onboarding_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_templates
    ADD CONSTRAINT onboarding_templates_pkey PRIMARY KEY (id);


--
-- Name: organization_creation_requests organization_creation_requests_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_creation_requests
    ADD CONSTRAINT organization_creation_requests_organization_id_key UNIQUE (organization_id);


--
-- Name: organization_creation_requests organization_creation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_creation_requests
    ADD CONSTRAINT organization_creation_requests_pkey PRIMARY KEY (user_id, request_id);


--
-- Name: organization_invitation_email_outbox organization_invitation_email_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitation_email_outbox
    ADD CONSTRAINT organization_invitation_email_outbox_pkey PRIMARY KEY (id);


--
-- Name: organization_rank_catalog organization_rank_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_rank_catalog
    ADD CONSTRAINT organization_rank_catalog_pkey PRIMARY KEY (id);


--
-- Name: organization_setup organization_setup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_setup
    ADD CONSTRAINT organization_setup_pkey PRIMARY KEY (organization_id);


--
-- Name: organization_suspensions organization_suspensions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_suspensions
    ADD CONSTRAINT organization_suspensions_pkey PRIMARY KEY (organization_id);


--
-- Name: password_change_attempts password_change_attempts_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_change_attempts
    ADD CONSTRAINT password_change_attempts_id_key UNIQUE (id);


--
-- Name: password_change_attempts password_change_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_change_attempts
    ADD CONSTRAINT password_change_attempts_pkey PRIMARY KEY (actor);


--
-- Name: personnel_attribute_history personnel_attribute_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_attribute_history
    ADD CONSTRAINT personnel_attribute_history_pkey PRIMARY KEY (personnel_id, effective_on);


--
-- Name: personnel_documents personnel_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_documents
    ADD CONSTRAINT personnel_documents_pkey PRIMARY KEY (id);


--
-- Name: personnel_extended_info personnel_extended_info_personnel_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_extended_info
    ADD CONSTRAINT personnel_extended_info_personnel_id_key UNIQUE (personnel_id);


--
-- Name: personnel_extended_info personnel_extended_info_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_extended_info
    ADD CONSTRAINT personnel_extended_info_pkey PRIMARY KEY (id);


--
-- Name: personnel_follow_ups personnel_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_follow_ups
    ADD CONSTRAINT personnel_follow_ups_pkey PRIMARY KEY (id);


--
-- Name: personnel_ict_completions personnel_ict_completions_org_person_task_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_ict_completions
    ADD CONSTRAINT personnel_ict_completions_org_person_task_date_key UNIQUE (organization_id, personnel_id, ict_task_id, completed_at);


--
-- Name: personnel_ict_completions personnel_ict_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_ict_completions
    ADD CONSTRAINT personnel_ict_completions_pkey PRIMARY KEY (id);


--
-- Name: personnel_onboardings personnel_onboardings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_onboardings
    ADD CONSTRAINT personnel_onboardings_pkey PRIMARY KEY (id);


--
-- Name: personnel personnel_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: personnel personnel_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_pkey PRIMARY KEY (id);


--
-- Name: personnel_training_history personnel_training_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_training_history
    ADD CONSTRAINT personnel_training_history_pkey PRIMARY KEY (id);


--
-- Name: personnel_trainings personnel_trainings_clinic_id_personnel_id_training_type_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_trainings
    ADD CONSTRAINT personnel_trainings_clinic_id_personnel_id_training_type_id_key UNIQUE (organization_id, personnel_id, training_type_id);


--
-- Name: personnel_trainings personnel_trainings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_trainings
    ADD CONSTRAINT personnel_trainings_pkey PRIMARY KEY (id);


--
-- Name: platform_announcements platform_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_pkey PRIMARY KEY (id);


--
-- Name: platform_operators platform_operators_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_operators
    ADD CONSTRAINT platform_operators_pkey PRIMARY KEY (user_id);


--
-- Name: rating_scheme_entries rating_scheme_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_pkey PRIMARY KEY (id);


--
-- Name: roster_excusals roster_excusals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_excusals
    ADD CONSTRAINT roster_excusals_pkey PRIMARY KEY (id);


--
-- Name: roster_forms roster_forms_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_forms
    ADD CONSTRAINT roster_forms_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: roster_forms roster_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_forms
    ADD CONSTRAINT roster_forms_pkey PRIMARY KEY (id);


--
-- Name: roster_starting_numbers roster_starting_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_starting_numbers
    ADD CONSTRAINT roster_starting_numbers_pkey PRIMARY KEY (form_id, personnel_id, track);


--
-- Name: roster_swaps roster_swaps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_swaps
    ADD CONSTRAINT roster_swaps_pkey PRIMARY KEY (id);


--
-- Name: sign_in_rosters sign_in_rosters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sign_in_rosters
    ADD CONSTRAINT sign_in_rosters_pkey PRIMARY KEY (id);


--
-- Name: special_days special_days_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.special_days
    ADD CONSTRAINT special_days_pkey PRIMARY KEY (id);


--
-- Name: status_types status_types_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status_types
    ADD CONSTRAINT status_types_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: status_types status_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status_types
    ADD CONSTRAINT status_types_pkey PRIMARY KEY (id);


--
-- Name: training_types training_types_clinic_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_clinic_id_name_key UNIQUE (organization_id, name);


--
-- Name: training_types training_types_organization_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_organization_id_id_key UNIQUE (organization_id, id);


--
-- Name: training_types training_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_pkey PRIMARY KEY (id);


--
-- Name: training_views training_views_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_views
    ADD CONSTRAINT training_views_pkey PRIMARY KEY (id);


--
-- Name: user_email_identities user_email_identities_normalized_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_email_identities
    ADD CONSTRAINT user_email_identities_normalized_email_key UNIQUE (normalized_email);


--
-- Name: user_email_identities user_email_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_email_identities
    ADD CONSTRAINT user_email_identities_pkey PRIMARY KEY (user_id);


--
-- Name: user_org_preferences user_org_preferences_org_user_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_org_preferences
    ADD CONSTRAINT user_org_preferences_org_user_key UNIQUE (organization_id, user_id);


--
-- Name: user_org_preferences user_org_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_org_preferences
    ADD CONSTRAINT user_org_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_pinned_groups user_pinned_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_pinned_groups
    ADD CONSTRAINT user_pinned_groups_pkey PRIMARY KEY (id);


--
-- Name: user_pinned_groups user_pinned_groups_user_id_organization_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_pinned_groups
    ADD CONSTRAINT user_pinned_groups_user_id_organization_id_group_id_key UNIQUE (user_id, organization_id, group_id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: user_suspensions user_suspensions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_suspensions
    ADD CONSTRAINT user_suspensions_pkey PRIMARY KEY (user_id);


--
-- Name: whats_new_entries whats_new_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whats_new_entries
    ADD CONSTRAINT whats_new_entries_pkey PRIMARY KEY (id);


--
-- Name: whats_new_entries whats_new_entries_published_seq_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whats_new_entries
    ADD CONSTRAINT whats_new_entries_published_seq_key UNIQUE (published_seq);


--
-- Name: template_duplicate_receipts_user_idx; Type: INDEX; Schema: onboarding_private; Owner: postgres
--

CREATE INDEX template_duplicate_receipts_user_idx ON onboarding_private.template_duplicate_receipts USING btree (user_id);


--
-- Name: file_retirement_holds_pending_idx; Type: INDEX; Schema: organization_private; Owner: postgres
--

CREATE INDEX file_retirement_holds_pending_idx ON organization_private.file_retirement_holds USING btree (attempted_at NULLS FIRST, held_at);


--
-- Name: file_retirements_pending_idx; Type: INDEX; Schema: organization_private; Owner: postgres
--

CREATE INDEX file_retirements_pending_idx ON organization_private.file_retirements USING btree (attempted_at NULLS FIRST, retired_at) WHERE (object_name IS NOT NULL);


--
-- Name: file_uploads_organization_idx; Type: INDEX; Schema: organization_private; Owner: postgres
--

CREATE INDEX file_uploads_organization_idx ON organization_private.file_uploads USING btree (organization_id);


--
-- Name: access_request_organization_invitation_links_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX access_request_organization_invitation_links_org_idx ON public.access_request_organization_invitation_links USING btree (organization_id, created_at DESC);


--
-- Name: access_request_organization_invitation_links_request_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX access_request_organization_invitation_links_request_idx ON public.access_request_organization_invitation_links USING btree (access_request_id, created_at DESC);


--
-- Name: access_requests_heard_about_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX access_requests_heard_about_idx ON public.access_requests USING btree (heard_about) WHERE (heard_about IS NOT NULL);


--
-- Name: access_requests_pending_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX access_requests_pending_email_idx ON public.access_requests USING btree (lower(email)) WHERE (status = 'pending'::text);


--
-- Name: access_requests_setup_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX access_requests_setup_user_id_idx ON public.access_requests USING btree (setup_user_id) WHERE (setup_user_id IS NOT NULL);


--
-- Name: account_setup_links_access_request_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_setup_links_access_request_created_idx ON public.account_setup_links USING btree (access_request_id, created_at DESC);


--
-- Name: account_setup_links_claimed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_setup_links_claimed_idx ON public.account_setup_links USING btree (claimed_at) WHERE (claimed_at IS NOT NULL);


--
-- Name: account_setup_links_cleanup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_setup_links_cleanup_idx ON public.account_setup_links USING btree (expires_at, used_at, revoked_at);


--
-- Name: account_setup_links_failed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_setup_links_failed_idx ON public.account_setup_links USING btree (failed_at) WHERE (failed_at IS NOT NULL);


--
-- Name: account_setup_links_one_active_per_request_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX account_setup_links_one_active_per_request_idx ON public.account_setup_links USING btree (access_request_id) WHERE ((claimed_at IS NULL) AND (failed_at IS NULL) AND (used_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: account_setup_links_resend_email_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX account_setup_links_resend_email_id_idx ON public.account_setup_links USING btree (resend_email_id) WHERE (resend_email_id IS NOT NULL);


--
-- Name: account_setup_links_token_hash_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX account_setup_links_token_hash_key ON public.account_setup_links USING btree (token_hash);


--
-- Name: account_setup_rate_limits_reset_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_setup_rate_limits_reset_at_idx ON public.account_setup_rate_limits USING btree (reset_at);


--
-- Name: auth_email_outbox_access_request_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX auth_email_outbox_access_request_created_idx ON public.auth_email_outbox USING btree (access_request_id, created_at DESC);


--
-- Name: auth_email_outbox_setup_link_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX auth_email_outbox_setup_link_idx ON public.auth_email_outbox USING btree (setup_link_id);


--
-- Name: auth_email_outbox_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX auth_email_outbox_status_idx ON public.auth_email_outbox USING btree (status, updated_at DESC);


--
-- Name: availability_entries_tasking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX availability_entries_tasking_idx ON public.availability_entries USING btree (organization_id, set_for_tasking_id) WHERE (set_for_tasking_id IS NOT NULL);


--
-- Name: calendar_event_activity_event_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_event_activity_event_idx ON public.calendar_event_activity USING btree (event_id, id);


--
-- Name: calendar_event_activity_organization_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_event_activity_organization_idx ON public.calendar_event_activity USING btree (organization_id, id);


--
-- Name: calendar_events_organization_dates_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_events_organization_dates_idx ON public.calendar_events USING btree (organization_id, starts_on, ends_on);


--
-- Name: calendar_tasking_activity_organization_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_tasking_activity_organization_idx ON public.calendar_tasking_activity USING btree (organization_id, id);


--
-- Name: calendar_tasking_activity_tasking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_tasking_activity_tasking_idx ON public.calendar_tasking_activity USING btree (tasking_id, id);


--
-- Name: calendar_tasking_checklist_items_tasking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_tasking_checklist_items_tasking_idx ON public.calendar_tasking_checklist_items USING btree (organization_id, tasking_id, "position");


--
-- Name: calendar_tasking_equipment_tasking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_tasking_equipment_tasking_idx ON public.calendar_tasking_equipment USING btree (organization_id, tasking_id, "position");


--
-- Name: calendar_tasking_participants_personnel_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_tasking_participants_personnel_idx ON public.calendar_tasking_participants USING btree (organization_id, personnel_id);


--
-- Name: calendar_taskings_event_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_taskings_event_idx ON public.calendar_taskings USING btree (organization_id, event_id) WHERE (event_id IS NOT NULL);


--
-- Name: calendar_taskings_group_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_taskings_group_idx ON public.calendar_taskings USING btree (organization_id, responsible_group_id) WHERE (responsible_group_id IS NOT NULL);


--
-- Name: calendar_taskings_organization_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX calendar_taskings_organization_status_idx ON public.calendar_taskings USING btree (organization_id, status, suspense_on);


--
-- Name: counseling_records_file_path_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX counseling_records_file_path_idx ON public.counseling_records USING btree (file_path);


--
-- Name: durable_rate_limits_reset_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX durable_rate_limits_reset_at_idx ON public.durable_rate_limits USING btree (reset_at);


--
-- Name: feedback_replies_thread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX feedback_replies_thread ON public.feedback_replies USING btree (feedback_id, sent_at, id);


--
-- Name: groups_children_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX groups_children_idx ON public.groups USING btree (organization_id, parent_id, sort_order);


--
-- Name: idx_assignment_types_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignment_types_org ON public.assignment_types USING btree (organization_id);


--
-- Name: idx_assignment_types_org_archived_sort; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignment_types_org_archived_sort ON public.assignment_types USING btree (organization_id, archived_at, sort_order);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_org_id_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_org_id_action ON public.audit_logs USING btree (org_id, action);


--
-- Name: idx_audit_logs_org_id_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_org_id_timestamp ON public.audit_logs USING btree (org_id, "timestamp" DESC);


--
-- Name: idx_audit_logs_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_severity ON public.audit_logs USING btree (severity) WHERE (severity <> 'info'::text);


--
-- Name: idx_audit_logs_timestamp_desc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_timestamp_desc ON public.audit_logs USING btree ("timestamp" DESC);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_availability_entries_org_end_start; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_availability_entries_org_end_start ON public.availability_entries USING btree (organization_id, end_date, start_date);


--
-- Name: idx_availability_entries_org_start_end; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_availability_entries_org_start_end ON public.availability_entries USING btree (organization_id, start_date, end_date);


--
-- Name: idx_availability_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_availability_org ON public.availability_entries USING btree (organization_id);


--
-- Name: idx_availability_personnel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_availability_personnel ON public.availability_entries USING btree (personnel_id);


--
-- Name: idx_beta_feedback_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beta_feedback_created_at ON public.beta_feedback USING btree (created_at DESC);


--
-- Name: idx_beta_feedback_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beta_feedback_status ON public.beta_feedback USING btree (status);


--
-- Name: idx_beta_feedback_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beta_feedback_user_id ON public.beta_feedback USING btree (user_id);


--
-- Name: idx_counseling_records_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_counseling_records_date ON public.counseling_records USING btree (date_conducted);


--
-- Name: idx_counseling_records_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_counseling_records_org ON public.counseling_records USING btree (organization_id);


--
-- Name: idx_counseling_records_personnel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_counseling_records_personnel ON public.counseling_records USING btree (personnel_id);


--
-- Name: idx_counseling_records_personnel_archived_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_counseling_records_personnel_archived_created ON public.counseling_records USING btree (personnel_id, archived_at, created_at DESC);


--
-- Name: idx_counseling_records_personnel_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_counseling_records_personnel_created ON public.counseling_records USING btree (personnel_id, created_at DESC);


--
-- Name: idx_daily_assignments_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_daily_assignments_date ON public.daily_assignments USING btree (date);


--
-- Name: idx_daily_assignments_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_daily_assignments_org ON public.daily_assignments USING btree (organization_id);


--
-- Name: idx_daily_assignments_org_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_daily_assignments_org_date ON public.daily_assignments USING btree (organization_id, date);


--
-- Name: idx_data_exports_org_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_data_exports_org_created ON public.data_exports USING btree (org_id, created_at DESC);


--
-- Name: idx_deletion_requests_org_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deletion_requests_org_status ON public.deletion_requests USING btree (organization_id, status);


--
-- Name: idx_deletion_requests_requested_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deletion_requests_requested_by ON public.deletion_requests USING btree (requested_by);


--
-- Name: idx_groups_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_groups_org ON public.groups USING btree (organization_id);


--
-- Name: idx_ict_tasks_archived_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ict_tasks_archived_at ON public.ict_tasks USING btree (archived_at);


--
-- Name: idx_ict_tasks_mos; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ict_tasks_mos ON public.ict_tasks USING gin (mos);


--
-- Name: idx_ict_tasks_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ict_tasks_org ON public.ict_tasks USING btree (organization_id);


--
-- Name: idx_ict_tasks_org_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ict_tasks_org_category ON public.ict_tasks USING btree (organization_id, category);


--
-- Name: idx_ict_tasks_org_sort_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ict_tasks_org_sort_code ON public.ict_tasks USING btree (organization_id, sort_order, task_code);


--
-- Name: idx_leader_notes_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leader_notes_org ON public.leader_notes USING btree (organization_id);


--
-- Name: idx_leader_notes_personnel_archived_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leader_notes_personnel_archived_created ON public.leader_notes USING btree (personnel_id, archived_at, created_at DESC);


--
-- Name: idx_leader_notes_personnel_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leader_notes_personnel_created ON public.leader_notes USING btree (personnel_id, created_at DESC);


--
-- Name: idx_notifications_user_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_org ON public.notifications USING btree (user_id, organization_id);


--
-- Name: idx_notifications_user_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_read ON public.notifications USING btree (user_id, read);


--
-- Name: idx_organization_memberships_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_organization_memberships_org ON public.organization_memberships USING btree (organization_id);


--
-- Name: idx_organization_memberships_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_organization_memberships_user ON public.organization_memberships USING btree (user_id);


--
-- Name: idx_organizations_suspended; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_organizations_suspended ON public.organizations USING btree (suspended_at) WHERE (suspended_at IS NOT NULL);


--
-- Name: idx_personnel_archived; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_archived ON public.personnel USING btree (organization_id, archived_at);


--
-- Name: idx_personnel_documents_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_documents_org ON public.personnel_documents USING btree (organization_id);


--
-- Name: idx_personnel_documents_personnel_archived_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_documents_personnel_archived_created ON public.personnel_documents USING btree (personnel_id, archived_at, created_at DESC);


--
-- Name: idx_personnel_documents_personnel_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_documents_personnel_created ON public.personnel_documents USING btree (personnel_id, created_at DESC);


--
-- Name: idx_personnel_extended_info_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_extended_info_org ON public.personnel_extended_info USING btree (organization_id);


--
-- Name: idx_personnel_extended_info_personnel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_extended_info_personnel ON public.personnel_extended_info USING btree (personnel_id);


--
-- Name: idx_personnel_follow_ups_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_follow_ups_org ON public.personnel_follow_ups USING btree (organization_id);


--
-- Name: idx_personnel_follow_ups_personnel_status_archived; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_follow_ups_personnel_status_archived ON public.personnel_follow_ups USING btree (personnel_id, status, archived_at DESC);


--
-- Name: idx_personnel_follow_ups_personnel_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_follow_ups_personnel_status_created ON public.personnel_follow_ups USING btree (personnel_id, status, created_at DESC);


--
-- Name: idx_personnel_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_group ON public.personnel USING btree (group_id);


--
-- Name: idx_personnel_ict_completions_completed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_ict_completions_completed_at ON public.personnel_ict_completions USING btree (completed_at);


--
-- Name: idx_personnel_ict_completions_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_ict_completions_org ON public.personnel_ict_completions USING btree (organization_id);


--
-- Name: idx_personnel_ict_completions_org_completed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_ict_completions_org_completed_at ON public.personnel_ict_completions USING btree (organization_id, completed_at);


--
-- Name: idx_personnel_ict_completions_org_person_task_recency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_ict_completions_org_person_task_recency ON public.personnel_ict_completions USING btree (organization_id, personnel_id, ict_task_id, completed_at DESC, created_at DESC);


--
-- Name: idx_personnel_ict_completions_personnel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_ict_completions_personnel ON public.personnel_ict_completions USING btree (personnel_id);


--
-- Name: idx_personnel_ict_completions_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_ict_completions_task ON public.personnel_ict_completions USING btree (ict_task_id);


--
-- Name: idx_personnel_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_org ON public.personnel USING btree (organization_id);


--
-- Name: idx_personnel_trainings_expiration; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_trainings_expiration ON public.personnel_trainings USING btree (expiration_date);


--
-- Name: idx_personnel_trainings_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_trainings_org ON public.personnel_trainings USING btree (organization_id);


--
-- Name: idx_personnel_trainings_personnel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_trainings_personnel ON public.personnel_trainings USING btree (personnel_id);


--
-- Name: idx_personnel_trainings_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnel_trainings_type ON public.personnel_trainings USING btree (training_type_id);


--
-- Name: idx_platform_announcements_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_platform_announcements_active ON public.platform_announcements USING btree (is_active, expires_at) WHERE (is_active = true);


--
-- Name: idx_sign_in_rosters_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sign_in_rosters_org ON public.sign_in_rosters USING btree (organization_id, created_at DESC);


--
-- Name: idx_special_days_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_special_days_org ON public.special_days USING btree (organization_id);


--
-- Name: idx_special_days_org_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_special_days_org_date ON public.special_days USING btree (organization_id, date);


--
-- Name: idx_status_types_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_status_types_org ON public.status_types USING btree (organization_id);


--
-- Name: idx_training_types_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_training_types_org ON public.training_types USING btree (organization_id);


--
-- Name: onboarding_step_progress_onboarding_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX onboarding_step_progress_onboarding_idx ON public.onboarding_step_progress USING btree (onboarding_id);


--
-- Name: onboarding_step_progress_training_type_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX onboarding_step_progress_training_type_org_idx ON public.onboarding_step_progress USING btree (training_type_id, organization_id) WHERE (training_type_id IS NOT NULL);


--
-- Name: onboarding_template_steps_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX onboarding_template_steps_org_idx ON public.onboarding_template_steps USING btree (organization_id);


--
-- Name: onboarding_template_steps_training_type_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX onboarding_template_steps_training_type_org_idx ON public.onboarding_template_steps USING btree (training_type_id, organization_id) WHERE (training_type_id IS NOT NULL);


--
-- Name: onboarding_templates_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX onboarding_templates_org_idx ON public.onboarding_templates USING btree (organization_id);


--
-- Name: organization_invitation_email_outbox_invitation_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organization_invitation_email_outbox_invitation_created_idx ON public.organization_invitation_email_outbox USING btree (invitation_id, created_at DESC);


--
-- Name: organization_invitation_email_outbox_org_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organization_invitation_email_outbox_org_created_idx ON public.organization_invitation_email_outbox USING btree (organization_id, created_at DESC);


--
-- Name: organization_invitation_email_outbox_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organization_invitation_email_outbox_status_idx ON public.organization_invitation_email_outbox USING btree (status, updated_at DESC);


--
-- Name: organization_invitations_normalized_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organization_invitations_normalized_email_idx ON public.organization_invitations USING btree (normalized_email);


--
-- Name: organization_invitations_one_pending_per_org_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX organization_invitations_one_pending_per_org_email_idx ON public.organization_invitations USING btree (organization_id, normalized_email) WHERE (status = 'pending'::public.invitation_status);


--
-- Name: organization_invitations_pending_expiry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organization_invitations_pending_expiry_idx ON public.organization_invitations USING btree (expires_at) WHERE (status = 'pending'::public.invitation_status);


--
-- Name: organization_memberships_one_per_org_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX organization_memberships_one_per_org_user_idx ON public.organization_memberships USING btree (organization_id, user_id);


--
-- Name: organization_rank_catalog_org_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX organization_rank_catalog_org_code_key ON public.organization_rank_catalog USING btree (organization_id, code);


--
-- Name: organization_rank_catalog_org_state_sort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organization_rank_catalog_org_state_sort_idx ON public.organization_rank_catalog USING btree (organization_id, state, sort_order, label);


--
-- Name: organization_rank_catalog_org_trimmed_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX organization_rank_catalog_org_trimmed_code_key ON public.organization_rank_catalog USING btree (organization_id, btrim(code));


--
-- Name: organizations_url_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX organizations_url_slug_key ON public.organizations USING btree (url_slug) WHERE (url_slug IS NOT NULL);


--
-- Name: personnel_attribute_history_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX personnel_attribute_history_org_idx ON public.personnel_attribute_history USING btree (organization_id, personnel_id);


--
-- Name: personnel_documents_file_path_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX personnel_documents_file_path_idx ON public.personnel_documents USING btree (file_path);


--
-- Name: personnel_onboardings_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX personnel_onboardings_active_idx ON public.personnel_onboardings USING btree (organization_id, personnel_id) WHERE (status = 'in_progress'::text);


--
-- Name: personnel_onboardings_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX personnel_onboardings_org_idx ON public.personnel_onboardings USING btree (organization_id);


--
-- Name: personnel_org_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX personnel_org_slug_key ON public.personnel USING btree (organization_id, slug);


--
-- Name: personnel_training_history_certificate_url_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX personnel_training_history_certificate_url_idx ON public.personnel_training_history USING btree (certificate_url) WHERE (certificate_url IS NOT NULL);


--
-- Name: personnel_training_history_person_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX personnel_training_history_person_idx ON public.personnel_training_history USING btree (organization_id, personnel_id);


--
-- Name: personnel_training_history_personnel_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX personnel_training_history_personnel_id_idx ON public.personnel_training_history USING btree (personnel_id);


--
-- Name: personnel_training_history_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX personnel_training_history_type_idx ON public.personnel_training_history USING btree (organization_id, training_type_id);


--
-- Name: personnel_trainings_certificate_url_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX personnel_trainings_certificate_url_idx ON public.personnel_trainings USING btree (certificate_url) WHERE (certificate_url IS NOT NULL);


--
-- Name: rating_scheme_entries_intermediate_rater_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rating_scheme_entries_intermediate_rater_idx ON public.rating_scheme_entries USING btree (intermediate_rater_person_id) WHERE (intermediate_rater_person_id IS NOT NULL);


--
-- Name: rating_scheme_entries_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rating_scheme_entries_org_idx ON public.rating_scheme_entries USING btree (organization_id);


--
-- Name: rating_scheme_entries_rated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rating_scheme_entries_rated_idx ON public.rating_scheme_entries USING btree (rated_person_id);


--
-- Name: rating_scheme_entries_rater_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rating_scheme_entries_rater_idx ON public.rating_scheme_entries USING btree (rater_person_id) WHERE (rater_person_id IS NOT NULL);


--
-- Name: rating_scheme_entries_reviewer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rating_scheme_entries_reviewer_idx ON public.rating_scheme_entries USING btree (reviewer_person_id) WHERE (reviewer_person_id IS NOT NULL);


--
-- Name: rating_scheme_entries_senior_rater_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rating_scheme_entries_senior_rater_idx ON public.rating_scheme_entries USING btree (senior_rater_person_id) WHERE (senior_rater_person_id IS NOT NULL);


--
-- Name: roster_excusals_one_open_per_person; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX roster_excusals_one_open_per_person ON public.roster_excusals USING btree (assignment_type_id, personnel_id) WHERE (ends_on IS NULL);


--
-- Name: roster_excusals_personnel_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX roster_excusals_personnel_idx ON public.roster_excusals USING btree (organization_id, personnel_id);


--
-- Name: roster_excusals_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX roster_excusals_type_idx ON public.roster_excusals USING btree (organization_id, assignment_type_id);


--
-- Name: roster_forms_one_open_per_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX roster_forms_one_open_per_type ON public.roster_forms USING btree (assignment_type_id) WHERE (ends_on IS NULL);


--
-- Name: roster_forms_type_starts_on_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX roster_forms_type_starts_on_idx ON public.roster_forms USING btree (organization_id, assignment_type_id, starts_on);


--
-- Name: roster_starting_numbers_personnel_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX roster_starting_numbers_personnel_idx ON public.roster_starting_numbers USING btree (organization_id, personnel_id);


--
-- Name: roster_swaps_first_day_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX roster_swaps_first_day_idx ON public.roster_swaps USING btree (organization_id, assignment_type_id, first_date);


--
-- Name: roster_swaps_second_day_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX roster_swaps_second_day_idx ON public.roster_swaps USING btree (organization_id, assignment_type_id, second_date);


--
-- Name: sign_in_rosters_personnel_ids_gin_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sign_in_rosters_personnel_ids_gin_idx ON public.sign_in_rosters USING gin (personnel_ids);


--
-- Name: sign_in_rosters_scope_group_ids_gin_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sign_in_rosters_scope_group_ids_gin_idx ON public.sign_in_rosters USING gin (scope_group_ids);


--
-- Name: sign_in_rosters_signed_file_path_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sign_in_rosters_signed_file_path_idx ON public.sign_in_rosters USING btree (signed_file_path) WHERE (signed_file_path IS NOT NULL);


--
-- Name: training_views_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX training_views_organization_id_idx ON public.training_views USING btree (organization_id);


--
-- Name: user_org_preferences_user_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_org_preferences_user_org_idx ON public.user_org_preferences USING btree (user_id, organization_id);


--
-- Name: user_pinned_groups_group_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_pinned_groups_group_idx ON public.user_pinned_groups USING btree (organization_id, group_id);


--
-- Name: whats_new_entries_published_seq_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whats_new_entries_published_seq_idx ON public.whats_new_entries USING btree (published_seq DESC) WHERE (published_seq IS NOT NULL);


--
-- Name: access_requests access_request_rescission_stamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER access_request_rescission_stamp BEFORE UPDATE ON public.access_requests FOR EACH ROW EXECUTE FUNCTION public.stamp_access_request_rescission();


--
-- Name: availability_entries check_availability_tasking; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER check_availability_tasking BEFORE INSERT OR UPDATE OF set_for_tasking_id, organization_id ON public.availability_entries FOR EACH ROW EXECUTE FUNCTION calendar_private.check_availability_tasking();


--
-- Name: daily_assignments daily_assignments_source; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER daily_assignments_source BEFORE INSERT OR UPDATE ON public.daily_assignments FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_daily_assignment_source();


--
-- Name: dashboard_configs dashboard_configs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER dashboard_configs_updated_at BEFORE UPDATE ON public.dashboard_configs FOR EACH ROW EXECUTE FUNCTION public.touch_dashboard_config_updated_at();


--
-- Name: daily_assignments end_roster_swap; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER end_roster_swap AFTER DELETE OR UPDATE ON public.daily_assignments FOR EACH ROW EXECUTE FUNCTION calendar_private.end_roster_swap();


--
-- Name: personnel_documents enforce_personnel_document_storage_cap; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER enforce_personnel_document_storage_cap BEFORE INSERT OR UPDATE OF file_size_bytes, personnel_id, organization_id ON public.personnel_documents FOR EACH ROW EXECUTE FUNCTION public.enforce_personnel_document_storage_cap();


--
-- Name: account_setup_links fence_failed_account_setup_attempt; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_failed_account_setup_attempt BEFORE UPDATE OF failed_at ON public.account_setup_links FOR EACH ROW EXECUTE FUNCTION public.fence_failed_account_setup_attempt();


--
-- Name: counseling_records fence_inserted_artifact_files; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_inserted_artifact_files AFTER INSERT ON public.counseling_records REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_inserted_artifact_files();


--
-- Name: personnel_documents fence_inserted_artifact_files; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_inserted_artifact_files AFTER INSERT ON public.personnel_documents REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_inserted_artifact_files();


--
-- Name: sign_in_rosters fence_inserted_roster_scans; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_inserted_roster_scans AFTER INSERT ON public.sign_in_rosters REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_inserted_roster_scans();


--
-- Name: personnel_training_history fence_inserted_training_certificates; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_inserted_training_certificates AFTER INSERT ON public.personnel_training_history REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();


--
-- Name: personnel_trainings fence_inserted_training_certificates; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_inserted_training_certificates AFTER INSERT ON public.personnel_trainings REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();


--
-- Name: counseling_records fence_updated_artifact_files; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_updated_artifact_files AFTER UPDATE ON public.counseling_records REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_updated_artifact_files();


--
-- Name: personnel_documents fence_updated_artifact_files; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_updated_artifact_files AFTER UPDATE ON public.personnel_documents REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_updated_artifact_files();


--
-- Name: sign_in_rosters fence_updated_roster_scans; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_updated_roster_scans AFTER UPDATE ON public.sign_in_rosters REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_updated_roster_scans();


--
-- Name: personnel_training_history fence_updated_training_certificates; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_updated_training_certificates AFTER UPDATE ON public.personnel_training_history REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();


--
-- Name: personnel_trainings fence_updated_training_certificates; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER fence_updated_training_certificates AFTER UPDATE ON public.personnel_trainings REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();


--
-- Name: personnel flag_calendar_tasking_picks; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER flag_calendar_tasking_picks AFTER UPDATE OF group_id, archived_at ON public.personnel FOR EACH ROW WHEN (((old.group_id IS DISTINCT FROM new.group_id) OR ((old.archived_at IS NULL) <> (new.archived_at IS NULL)))) EXECUTE FUNCTION calendar_private.flag_picks_of_changed_person();


--
-- Name: calendar_taskings flag_calendar_tasking_picks_on_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER flag_calendar_tasking_picks_on_change AFTER UPDATE OF responsible_group_id, status ON public.calendar_taskings FOR EACH ROW WHEN (((old.responsible_group_id IS DISTINCT FROM new.responsible_group_id) OR ((old.status = ANY (ARRAY['completed'::text, 'cancelled'::text])) AND (new.status <> ALL (ARRAY['completed'::text, 'cancelled'::text]))))) EXECUTE FUNCTION calendar_private.flag_picks_of_changed_tasking();


--
-- Name: groups groups_cascade_path; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER groups_cascade_path AFTER UPDATE ON public.groups FOR EACH ROW WHEN ((old.path IS DISTINCT FROM new.path)) EXECUTE FUNCTION organization_private.cascade_group_path();


--
-- Name: groups groups_set_path; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER groups_set_path BEFORE INSERT OR UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION organization_private.set_group_path();


--
-- Name: onboarding_step_progress guard_onboarding_step_progress_identity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_onboarding_step_progress_identity BEFORE UPDATE ON public.onboarding_step_progress FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_workflow_identity();


--
-- Name: personnel_onboardings guard_personnel_onboarding_identity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_personnel_onboarding_identity BEFORE UPDATE ON public.personnel_onboardings FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_workflow_identity();


--
-- Name: roster_forms guard_roster_forms; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_roster_forms BEFORE INSERT OR DELETE OR UPDATE ON public.roster_forms FOR EACH ROW EXECUTE FUNCTION calendar_private.guard_roster_forms();


--
-- Name: assignment_types guard_roster_rules; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_roster_rules BEFORE UPDATE OF roster_pool_rules, roster_weekend_mode ON public.assignment_types FOR EACH ROW WHEN (((old.roster_pool_rules IS DISTINCT FROM new.roster_pool_rules) OR (old.roster_weekend_mode IS DISTINCT FROM new.roster_weekend_mode))) EXECUTE FUNCTION calendar_private.guard_roster_rules();


--
-- Name: roster_starting_numbers guard_roster_starting_numbers; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_roster_starting_numbers BEFORE INSERT OR DELETE OR UPDATE ON public.roster_starting_numbers FOR EACH ROW EXECUTE FUNCTION calendar_private.guard_roster_forms();


--
-- Name: sign_in_rosters guard_sign_in_roster; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_sign_in_roster BEFORE INSERT OR UPDATE OF signed_file_path, id, organization_id ON public.sign_in_rosters FOR EACH ROW EXECUTE FUNCTION organization_private.guard_sign_in_roster();


--
-- Name: counseling_records keep_artifact_identity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER keep_artifact_identity BEFORE UPDATE OF id ON public.counseling_records FOR EACH ROW EXECUTE FUNCTION organization_private.keep_artifact_identity();


--
-- Name: personnel_documents keep_artifact_identity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER keep_artifact_identity BEFORE UPDATE OF id ON public.personnel_documents FOR EACH ROW EXECUTE FUNCTION organization_private.keep_artifact_identity();


--
-- Name: personnel_training_history keep_training_certificate_identity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER keep_training_certificate_identity BEFORE UPDATE OF id ON public.personnel_training_history FOR EACH ROW EXECUTE FUNCTION organization_private.keep_artifact_identity();


--
-- Name: personnel_trainings keep_training_certificate_identity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER keep_training_certificate_identity BEFORE UPDATE OF id ON public.personnel_trainings FOR EACH ROW EXECUTE FUNCTION organization_private.keep_artifact_identity();


--
-- Name: assignment_types open_roster_form; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER open_roster_form AFTER INSERT OR UPDATE OF assign_to ON public.assignment_types FOR EACH ROW EXECUTE FUNCTION calendar_private.open_roster_form();


--
-- Name: organization_rank_catalog organization_rank_catalog_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER organization_rank_catalog_updated_at BEFORE UPDATE ON public.organization_rank_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: access_requests prevent_account_setup_email_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER prevent_account_setup_email_change BEFORE UPDATE OF email ON public.access_requests FOR EACH ROW EXECUTE FUNCTION public.prevent_account_setup_email_change();


--
-- Name: organization_rank_catalog prevent_organization_rank_catalog_org_move; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER prevent_organization_rank_catalog_org_move BEFORE UPDATE OF organization_id ON public.organization_rank_catalog FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_rank_catalog_org_move();


--
-- Name: calendar_events record_calendar_event_activity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_calendar_event_activity AFTER INSERT OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION calendar_private.record_calendar_event_activity();


--
-- Name: calendar_taskings record_calendar_tasking_activity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_calendar_tasking_activity AFTER INSERT OR UPDATE ON public.calendar_taskings FOR EACH ROW EXECUTE FUNCTION calendar_private.record_calendar_tasking_activity();


--
-- Name: calendar_tasking_checklist_items record_calendar_tasking_checklist_activity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_calendar_tasking_checklist_activity AFTER INSERT OR DELETE OR UPDATE ON public.calendar_tasking_checklist_items FOR EACH ROW EXECUTE FUNCTION calendar_private.record_calendar_tasking_checklist_activity();


--
-- Name: calendar_tasking_equipment record_calendar_tasking_equipment_activity; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_calendar_tasking_equipment_activity AFTER INSERT OR DELETE OR UPDATE ON public.calendar_tasking_equipment FOR EACH ROW EXECUTE FUNCTION calendar_private.record_calendar_tasking_equipment_activity();


--
-- Name: calendar_events record_deleted_calendar_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_deleted_calendar_event BEFORE DELETE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION calendar_private.record_deleted_calendar_event();


--
-- Name: personnel record_personnel_attributes_on_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_personnel_attributes_on_insert AFTER INSERT ON public.personnel FOR EACH ROW EXECUTE FUNCTION organization_private.record_personnel_attributes();


--
-- Name: personnel record_personnel_attributes_on_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_personnel_attributes_on_update AFTER UPDATE OF rank, mos, clinic_role, group_id, archived_at ON public.personnel FOR EACH ROW WHEN (((old.rank IS DISTINCT FROM new.rank) OR (old.mos IS DISTINCT FROM new.mos) OR (old.clinic_role IS DISTINCT FROM new.clinic_role) OR (old.group_id IS DISTINCT FROM new.group_id) OR ((old.archived_at IS NULL) <> (new.archived_at IS NULL)))) EXECUTE FUNCTION organization_private.record_personnel_attributes();


--
-- Name: personnel_trainings record_superseded_training_completion; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_superseded_training_completion AFTER UPDATE OF completion_date, expiration_date ON public.personnel_trainings FOR EACH ROW WHEN (((old.completion_date IS DISTINCT FROM new.completion_date) OR (old.expiration_date IS DISTINCT FROM new.expiration_date))) EXECUTE FUNCTION public.record_superseded_training_completion();


--
-- Name: calendar_tasking_equipment record_tasking_equipment_return; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER record_tasking_equipment_return AFTER UPDATE ON public.calendar_tasking_equipment FOR EACH ROW EXECUTE FUNCTION calendar_private.record_tasking_equipment_return();


--
-- Name: organization_invitations require_access_scope_groups_in_organization; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_access_scope_groups_in_organization BEFORE INSERT OR UPDATE OF organization_id, access_scope_group_ids ON public.organization_invitations FOR EACH ROW EXECUTE FUNCTION organization_private.require_access_scope_groups_in_organization();


--
-- Name: organization_memberships require_access_scope_groups_in_organization; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_access_scope_groups_in_organization BEFORE INSERT OR UPDATE OF organization_id, access_scope_group_ids ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION organization_private.require_access_scope_groups_in_organization();


--
-- Name: counseling_records require_artifact_file_under_person; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_artifact_file_under_person BEFORE INSERT OR UPDATE OF file_path, personnel_id, organization_id ON public.counseling_records FOR EACH ROW EXECUTE FUNCTION organization_private.require_artifact_file_under_person();


--
-- Name: personnel_documents require_artifact_file_under_person; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_artifact_file_under_person BEFORE INSERT OR UPDATE OF file_path, personnel_id, organization_id ON public.personnel_documents FOR EACH ROW EXECUTE FUNCTION organization_private.require_artifact_file_under_person();


--
-- Name: personnel_extended_info require_award_tracking_enabled; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_award_tracking_enabled BEFORE INSERT OR UPDATE OF award_tracking_acknowledged_at ON public.personnel_extended_info FOR EACH ROW EXECUTE FUNCTION organization_private.require_award_tracking_enabled();


--
-- Name: organizations require_empty_organization_files_before_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_empty_organization_files_before_delete BEFORE DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION organization_private.require_empty_files_before_delete();


--
-- Name: onboarding_step_progress require_onboarding_operation_rules; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_onboarding_operation_rules BEFORE UPDATE ON public.onboarding_step_progress FOR EACH ROW EXECUTE FUNCTION organization_private.require_onboarding_operation_rules();


--
-- Name: personnel_onboardings require_onboarding_operation_rules; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_onboarding_operation_rules BEFORE UPDATE ON public.personnel_onboardings FOR EACH ROW EXECUTE FUNCTION organization_private.require_onboarding_operation_rules();


--
-- Name: personnel require_personnel_lifecycle_authority; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_personnel_lifecycle_authority BEFORE UPDATE OF archived_at ON public.personnel FOR EACH ROW EXECUTE FUNCTION organization_private.require_personnel_lifecycle_authority();


--
-- Name: user_pinned_groups require_top_level_group_pin; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_top_level_group_pin BEFORE INSERT OR UPDATE ON public.user_pinned_groups FOR EACH ROW EXECUTE FUNCTION personnel_private.require_top_level_group_pin();


--
-- Name: personnel_training_history require_training_certificate_under_person; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_training_certificate_under_person BEFORE INSERT OR UPDATE OF certificate_url, personnel_id, organization_id ON public.personnel_training_history FOR EACH ROW EXECUTE FUNCTION organization_private.require_training_certificate_under_person();


--
-- Name: personnel_trainings require_training_certificate_under_person; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER require_training_certificate_under_person BEFORE INSERT OR UPDATE OF certificate_url, personnel_id, organization_id ON public.personnel_trainings FOR EACH ROW EXECUTE FUNCTION organization_private.require_training_certificate_under_person();


--
-- Name: counseling_records retire_deleted_artifact_files; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER retire_deleted_artifact_files AFTER DELETE ON public.counseling_records REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.retire_deleted_artifact_files();


--
-- Name: personnel_documents retire_deleted_artifact_files; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER retire_deleted_artifact_files AFTER DELETE ON public.personnel_documents REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.retire_deleted_artifact_files();


--
-- Name: sign_in_rosters retire_deleted_roster_scans; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER retire_deleted_roster_scans AFTER DELETE ON public.sign_in_rosters REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.retire_deleted_roster_scans();


--
-- Name: personnel_training_history retire_deleted_training_certificates; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER retire_deleted_training_certificates AFTER DELETE ON public.personnel_training_history REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();


--
-- Name: personnel_trainings retire_deleted_training_certificates; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER retire_deleted_training_certificates AFTER DELETE ON public.personnel_trainings REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();


--
-- Name: beta_feedback set_beta_feedback_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_beta_feedback_updated_at BEFORE UPDATE ON public.beta_feedback FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: training_views set_training_views_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_training_views_updated_at BEFORE UPDATE ON public.training_views FOR EACH ROW EXECUTE FUNCTION public.training_views_set_updated_at();


--
-- Name: user_org_preferences set_user_org_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_user_org_preferences_updated_at BEFORE UPDATE ON public.user_org_preferences FOR EACH ROW EXECUTE FUNCTION public.user_org_preferences_set_updated_at();


--
-- Name: counseling_records stamp_archived_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.counseling_records FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();


--
-- Name: leader_notes stamp_archived_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.leader_notes FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();


--
-- Name: personnel_documents stamp_archived_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.personnel_documents FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();


--
-- Name: personnel_follow_ups stamp_archived_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.personnel_follow_ups FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();


--
-- Name: calendar_events stamp_calendar_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_calendar_event BEFORE INSERT OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_calendar_event();


--
-- Name: calendar_taskings stamp_calendar_tasking; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_calendar_tasking BEFORE INSERT OR UPDATE ON public.calendar_taskings FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_calendar_tasking();


--
-- Name: calendar_tasking_checklist_items stamp_calendar_tasking_checklist_item; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_calendar_tasking_checklist_item BEFORE INSERT OR UPDATE ON public.calendar_tasking_checklist_items FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_calendar_tasking_checklist_item();


--
-- Name: calendar_tasking_equipment stamp_calendar_tasking_equipment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_calendar_tasking_equipment BEFORE INSERT OR UPDATE ON public.calendar_tasking_equipment FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_calendar_tasking_equipment();


--
-- Name: personnel_follow_ups stamp_completed_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_completed_by BEFORE INSERT OR UPDATE ON public.personnel_follow_ups FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_follow_up_completed_by();


--
-- Name: personnel_extended_info stamp_personnel_extended_info_saver; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER stamp_personnel_extended_info_saver BEFORE INSERT OR UPDATE ON public.personnel_extended_info FOR EACH ROW EXECUTE FUNCTION public.stamp_personnel_extended_info_saver();


--
-- Name: account_setup_links start_account_setup_attempt; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER start_account_setup_attempt AFTER UPDATE OF claimed_at ON public.account_setup_links FOR EACH ROW EXECUTE FUNCTION public.start_account_setup_attempt();


--
-- Name: onboarding_step_progress touch_step_progress_changed_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER touch_step_progress_changed_at BEFORE UPDATE ON public.onboarding_step_progress FOR EACH ROW EXECUTE FUNCTION onboarding_private.touch_step_progress_changed_at();


--
-- Name: counseling_records update_counseling_records_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_counseling_records_updated_at BEFORE UPDATE ON public.counseling_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ict_tasks update_ict_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_ict_tasks_updated_at BEFORE UPDATE ON public.ict_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leader_notes update_leader_notes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_leader_notes_updated_at BEFORE UPDATE ON public.leader_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: personnel_documents update_personnel_documents_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_personnel_documents_updated_at BEFORE UPDATE ON public.personnel_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: personnel_extended_info update_personnel_extended_info_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_personnel_extended_info_updated_at BEFORE UPDATE ON public.personnel_extended_info FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: personnel_follow_ups update_personnel_follow_ups_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_personnel_follow_ups_updated_at BEFORE UPDATE ON public.personnel_follow_ups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: personnel_ict_completions update_personnel_ict_completions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_personnel_ict_completions_updated_at BEFORE UPDATE ON public.personnel_ict_completions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rating_scheme_entries update_rating_scheme_entries_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_rating_scheme_entries_updated_at BEFORE UPDATE ON public.rating_scheme_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_email_identities update_user_email_identities_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_user_email_identities_updated_at BEFORE UPDATE ON public.user_email_identities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_profiles update_user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whats_new_entries whats_new_entries_stamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER whats_new_entries_stamp BEFORE INSERT OR UPDATE ON public.whats_new_entries FOR EACH ROW EXECUTE FUNCTION public.whats_new_entries_stamp();


--
-- Name: template_duplicate_receipts template_duplicate_receipts_organization_id_fkey; Type: FK CONSTRAINT; Schema: onboarding_private; Owner: postgres
--

ALTER TABLE ONLY onboarding_private.template_duplicate_receipts
    ADD CONSTRAINT template_duplicate_receipts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: template_duplicate_receipts template_duplicate_receipts_user_id_fkey; Type: FK CONSTRAINT; Schema: onboarding_private; Owner: postgres
--

ALTER TABLE ONLY onboarding_private.template_duplicate_receipts
    ADD CONSTRAINT template_duplicate_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: file_uploads file_uploads_organization_id_fkey; Type: FK CONSTRAINT; Schema: organization_private; Owner: postgres
--

ALTER TABLE ONLY organization_private.file_uploads
    ADD CONSTRAINT file_uploads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: access_request_organization_invitation_links access_request_organization_invitation_links_access_request_fke; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_request_organization_invitation_links
    ADD CONSTRAINT access_request_organization_invitation_links_access_request_fke FOREIGN KEY (access_request_id) REFERENCES public.access_requests(id) ON DELETE CASCADE;


--
-- Name: access_request_organization_invitation_links access_request_organization_invitation_links_invitation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_request_organization_invitation_links
    ADD CONSTRAINT access_request_organization_invitation_links_invitation_fkey FOREIGN KEY (organization_invitation_id) REFERENCES public.organization_invitations(id) ON DELETE CASCADE;


--
-- Name: access_request_organization_invitation_links access_request_organization_invitation_links_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_request_organization_invitation_links
    ADD CONSTRAINT access_request_organization_invitation_links_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: access_request_organization_invitation_links access_request_organization_invitation_links_organization_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_request_organization_invitation_links
    ADD CONSTRAINT access_request_organization_invitation_links_organization_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: access_requests access_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: account_setup_attempts account_setup_attempts_setup_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_setup_attempts
    ADD CONSTRAINT account_setup_attempts_setup_link_id_fkey FOREIGN KEY (setup_link_id) REFERENCES public.account_setup_links(id) ON DELETE CASCADE;


--
-- Name: account_setup_links account_setup_links_access_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_setup_links
    ADD CONSTRAINT account_setup_links_access_request_id_fkey FOREIGN KEY (access_request_id) REFERENCES public.access_requests(id) ON DELETE CASCADE;


--
-- Name: announcement_dismissals announcement_dismissals_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.platform_announcements(id) ON DELETE CASCADE;


--
-- Name: announcement_dismissals announcement_dismissals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assignment_types assignment_types_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assignment_types
    ADD CONSTRAINT assignment_types_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: auth_email_outbox auth_email_outbox_access_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_email_outbox
    ADD CONSTRAINT auth_email_outbox_access_request_id_fkey FOREIGN KEY (access_request_id) REFERENCES public.access_requests(id) ON DELETE CASCADE;


--
-- Name: auth_email_outbox auth_email_outbox_setup_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_email_outbox
    ADD CONSTRAINT auth_email_outbox_setup_link_id_fkey FOREIGN KEY (setup_link_id) REFERENCES public.account_setup_links(id) ON DELETE CASCADE;


--
-- Name: availability_entries availability_entries_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability_entries
    ADD CONSTRAINT availability_entries_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: availability_entries availability_entries_org_status_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability_entries
    ADD CONSTRAINT availability_entries_org_status_type_fkey FOREIGN KEY (organization_id, status_type_id) REFERENCES public.status_types(organization_id, id) ON DELETE CASCADE NOT VALID;


--
-- Name: availability_entries availability_entries_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability_entries
    ADD CONSTRAINT availability_entries_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: availability_entries availability_entries_status_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability_entries
    ADD CONSTRAINT availability_entries_status_type_id_fkey FOREIGN KEY (status_type_id) REFERENCES public.status_types(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: availability_entries availability_entries_tasking_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability_entries
    ADD CONSTRAINT availability_entries_tasking_fkey FOREIGN KEY (organization_id, set_for_tasking_id) REFERENCES public.calendar_taskings(organization_id, id) ON DELETE SET NULL (set_for_tasking_id);


--
-- Name: beta_feedback beta_feedback_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beta_feedback
    ADD CONSTRAINT beta_feedback_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: beta_feedback beta_feedback_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beta_feedback
    ADD CONSTRAINT beta_feedback_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: beta_feedback beta_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beta_feedback
    ADD CONSTRAINT beta_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calendar_event_activity calendar_event_activity_organization_id_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_event_activity
    ADD CONSTRAINT calendar_event_activity_organization_id_event_id_fkey FOREIGN KEY (organization_id, event_id) REFERENCES public.calendar_events(organization_id, id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: calendar_tasking_activity calendar_tasking_activity_organization_id_tasking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_activity
    ADD CONSTRAINT calendar_tasking_activity_organization_id_tasking_id_fkey FOREIGN KEY (organization_id, tasking_id) REFERENCES public.calendar_taskings(organization_id, id) ON DELETE CASCADE;


--
-- Name: calendar_tasking_checklist_items calendar_tasking_checklist_item_organization_id_tasking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_checklist_items
    ADD CONSTRAINT calendar_tasking_checklist_item_organization_id_tasking_id_fkey FOREIGN KEY (organization_id, tasking_id) REFERENCES public.calendar_taskings(organization_id, id) ON DELETE CASCADE;


--
-- Name: calendar_tasking_equipment calendar_tasking_equipment_organization_id_tasking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_equipment
    ADD CONSTRAINT calendar_tasking_equipment_organization_id_tasking_id_fkey FOREIGN KEY (organization_id, tasking_id) REFERENCES public.calendar_taskings(organization_id, id) ON DELETE CASCADE;


--
-- Name: calendar_tasking_participants calendar_tasking_participants_personnel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_participants
    ADD CONSTRAINT calendar_tasking_participants_personnel_fkey FOREIGN KEY (organization_id, personnel_id) REFERENCES public.personnel(organization_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_tasking_participants calendar_tasking_participants_tasking_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_tasking_participants
    ADD CONSTRAINT calendar_tasking_participants_tasking_fkey FOREIGN KEY (organization_id, tasking_id) REFERENCES public.calendar_taskings(organization_id, id) ON DELETE CASCADE;


--
-- Name: calendar_taskings calendar_taskings_event_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_taskings
    ADD CONSTRAINT calendar_taskings_event_fkey FOREIGN KEY (organization_id, event_id) REFERENCES public.calendar_events(organization_id, id) ON DELETE SET NULL (event_id);


--
-- Name: calendar_taskings calendar_taskings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_taskings
    ADD CONSTRAINT calendar_taskings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: calendar_taskings calendar_taskings_responsible_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calendar_taskings
    ADD CONSTRAINT calendar_taskings_responsible_group_fkey FOREIGN KEY (organization_id, responsible_group_id) REFERENCES public.groups(organization_id, id);


--
-- Name: organization_invitations clinic_invitations_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT clinic_invitations_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_invitations clinic_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT clinic_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: organization_memberships clinic_memberships_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT clinic_memberships_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships clinic_memberships_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT clinic_memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: organization_memberships clinic_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT clinic_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizations clinics_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT clinics_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: counseling_records counseling_records_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.counseling_records
    ADD CONSTRAINT counseling_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: counseling_records counseling_records_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.counseling_records
    ADD CONSTRAINT counseling_records_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: daily_assignments daily_assignments_assignment_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_assignments
    ADD CONSTRAINT daily_assignments_assignment_type_id_fkey FOREIGN KEY (assignment_type_id) REFERENCES public.assignment_types(id) ON DELETE CASCADE;


--
-- Name: daily_assignments daily_assignments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_assignments
    ADD CONSTRAINT daily_assignments_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: dashboard_configs dashboard_configs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_configs
    ADD CONSTRAINT dashboard_configs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: dashboard_configs dashboard_configs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dashboard_configs
    ADD CONSTRAINT dashboard_configs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: data_exports data_exports_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_exports
    ADD CONSTRAINT data_exports_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: data_exports data_exports_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_exports
    ADD CONSTRAINT data_exports_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);


--
-- Name: deletion_requests deletion_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: deletion_requests deletion_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);


--
-- Name: deletion_requests deletion_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deletion_requests
    ADD CONSTRAINT deletion_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: feedback_replies feedback_replies_feedback_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback_replies
    ADD CONSTRAINT feedback_replies_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.beta_feedback(id) ON DELETE CASCADE;


--
-- Name: feedback_replies feedback_replies_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback_replies
    ADD CONSTRAINT feedback_replies_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id);


--
-- Name: feedback_staff_notes feedback_staff_notes_feedback_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback_staff_notes
    ADD CONSTRAINT feedback_staff_notes_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.beta_feedback(id) ON DELETE CASCADE;


--
-- Name: feedback_staff_notes feedback_staff_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback_staff_notes
    ADD CONSTRAINT feedback_staff_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: groups groups_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: groups groups_parent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_parent_fkey FOREIGN KEY (organization_id, parent_id) REFERENCES public.groups(organization_id, id) ON DELETE RESTRICT;


--
-- Name: ict_tasks ict_tasks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ict_tasks
    ADD CONSTRAINT ict_tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: leader_notes leader_notes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leader_notes
    ADD CONSTRAINT leader_notes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: leader_notes leader_notes_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leader_notes
    ADD CONSTRAINT leader_notes_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: onboarding_step_progress onboarding_step_progress_onboarding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_step_progress
    ADD CONSTRAINT onboarding_step_progress_onboarding_id_fkey FOREIGN KEY (onboarding_id) REFERENCES public.personnel_onboardings(id) ON DELETE CASCADE;


--
-- Name: onboarding_step_progress onboarding_step_progress_org_training_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_step_progress
    ADD CONSTRAINT onboarding_step_progress_org_training_type_fkey FOREIGN KEY (organization_id, training_type_id) REFERENCES public.training_types(organization_id, id) ON DELETE SET NULL (training_type_id) NOT VALID;


--
-- Name: onboarding_step_progress onboarding_step_progress_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_step_progress
    ADD CONSTRAINT onboarding_step_progress_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: onboarding_step_progress onboarding_step_progress_template_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_step_progress
    ADD CONSTRAINT onboarding_step_progress_template_step_id_fkey FOREIGN KEY (template_step_id) REFERENCES public.onboarding_template_steps(id) ON DELETE SET NULL;


--
-- Name: onboarding_step_progress onboarding_step_progress_training_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_step_progress
    ADD CONSTRAINT onboarding_step_progress_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: onboarding_template_steps onboarding_template_steps_org_training_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_template_steps
    ADD CONSTRAINT onboarding_template_steps_org_training_type_fkey FOREIGN KEY (organization_id, training_type_id) REFERENCES public.training_types(organization_id, id) ON DELETE SET NULL (training_type_id) NOT VALID;


--
-- Name: onboarding_template_steps onboarding_template_steps_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_template_steps
    ADD CONSTRAINT onboarding_template_steps_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: onboarding_template_steps onboarding_template_steps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_template_steps
    ADD CONSTRAINT onboarding_template_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.onboarding_templates(id) ON DELETE CASCADE;


--
-- Name: onboarding_template_steps onboarding_template_steps_training_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_template_steps
    ADD CONSTRAINT onboarding_template_steps_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: onboarding_templates onboarding_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.onboarding_templates
    ADD CONSTRAINT onboarding_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_creation_requests organization_creation_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_creation_requests
    ADD CONSTRAINT organization_creation_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: organization_creation_requests organization_creation_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_creation_requests
    ADD CONSTRAINT organization_creation_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organization_invitation_email_outbox organization_invitation_email_outbox_invitation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitation_email_outbox
    ADD CONSTRAINT organization_invitation_email_outbox_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.organization_invitations(id) ON DELETE CASCADE;


--
-- Name: organization_invitation_email_outbox organization_invitation_email_outbox_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitation_email_outbox
    ADD CONSTRAINT organization_invitation_email_outbox_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_invitations organization_invitations_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id);


--
-- Name: organization_invitations organization_invitations_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id);


--
-- Name: organization_invitations organization_invitations_declined_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_declined_by_fkey FOREIGN KEY (declined_by) REFERENCES auth.users(id);


--
-- Name: organization_invitations organization_invitations_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_invitations
    ADD CONSTRAINT organization_invitations_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id);


--
-- Name: organization_rank_catalog organization_rank_catalog_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_rank_catalog
    ADD CONSTRAINT organization_rank_catalog_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_setup organization_setup_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_setup
    ADD CONSTRAINT organization_setup_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_suspensions organization_suspensions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_suspensions
    ADD CONSTRAINT organization_suspensions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_suspensions organization_suspensions_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_suspensions
    ADD CONSTRAINT organization_suspensions_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: password_change_attempts password_change_attempts_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_change_attempts
    ADD CONSTRAINT password_change_attempts_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: personnel_attribute_history personnel_attribute_history_personnel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_attribute_history
    ADD CONSTRAINT personnel_attribute_history_personnel_fkey FOREIGN KEY (organization_id, personnel_id) REFERENCES public.personnel(organization_id, id) ON DELETE CASCADE;


--
-- Name: personnel personnel_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personnel_documents personnel_documents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_documents
    ADD CONSTRAINT personnel_documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personnel_documents personnel_documents_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_documents
    ADD CONSTRAINT personnel_documents_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: personnel_extended_info personnel_extended_info_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_extended_info
    ADD CONSTRAINT personnel_extended_info_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personnel_extended_info personnel_extended_info_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_extended_info
    ADD CONSTRAINT personnel_extended_info_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: personnel_follow_ups personnel_follow_ups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_follow_ups
    ADD CONSTRAINT personnel_follow_ups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personnel_follow_ups personnel_follow_ups_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_follow_ups
    ADD CONSTRAINT personnel_follow_ups_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: personnel personnel_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: personnel_ict_completions personnel_ict_completions_ict_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_ict_completions
    ADD CONSTRAINT personnel_ict_completions_ict_task_id_fkey FOREIGN KEY (ict_task_id) REFERENCES public.ict_tasks(id) ON DELETE CASCADE;


--
-- Name: personnel_ict_completions personnel_ict_completions_logged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_ict_completions
    ADD CONSTRAINT personnel_ict_completions_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: personnel_ict_completions personnel_ict_completions_org_task_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_ict_completions
    ADD CONSTRAINT personnel_ict_completions_org_task_fkey FOREIGN KEY (organization_id, ict_task_id) REFERENCES public.ict_tasks(organization_id, id) ON DELETE CASCADE NOT VALID;


--
-- Name: personnel_ict_completions personnel_ict_completions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_ict_completions
    ADD CONSTRAINT personnel_ict_completions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personnel_ict_completions personnel_ict_completions_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_ict_completions
    ADD CONSTRAINT personnel_ict_completions_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: personnel_onboardings personnel_onboardings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_onboardings
    ADD CONSTRAINT personnel_onboardings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personnel_onboardings personnel_onboardings_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_onboardings
    ADD CONSTRAINT personnel_onboardings_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: personnel_onboardings personnel_onboardings_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_onboardings
    ADD CONSTRAINT personnel_onboardings_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.onboarding_templates(id) ON DELETE SET NULL;


--
-- Name: personnel personnel_organization_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel
    ADD CONSTRAINT personnel_organization_group_fkey FOREIGN KEY (organization_id, group_id) REFERENCES public.groups(organization_id, id) ON DELETE SET NULL (group_id) NOT VALID;


--
-- Name: personnel_training_history personnel_training_history_org_training_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_training_history
    ADD CONSTRAINT personnel_training_history_org_training_type_fkey FOREIGN KEY (organization_id, training_type_id) REFERENCES public.training_types(organization_id, id) ON DELETE CASCADE;


--
-- Name: personnel_training_history personnel_training_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_training_history
    ADD CONSTRAINT personnel_training_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personnel_training_history personnel_training_history_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_training_history
    ADD CONSTRAINT personnel_training_history_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: personnel_trainings personnel_trainings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_trainings
    ADD CONSTRAINT personnel_trainings_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: personnel_trainings personnel_trainings_org_training_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_trainings
    ADD CONSTRAINT personnel_trainings_org_training_type_fkey FOREIGN KEY (organization_id, training_type_id) REFERENCES public.training_types(organization_id, id) ON DELETE CASCADE NOT VALID;


--
-- Name: personnel_trainings personnel_trainings_personnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_trainings
    ADD CONSTRAINT personnel_trainings_personnel_id_fkey FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: personnel_trainings personnel_trainings_training_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personnel_trainings
    ADD CONSTRAINT personnel_trainings_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: platform_announcements platform_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: platform_announcements platform_announcements_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: platform_operators platform_operators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_operators
    ADD CONSTRAINT platform_operators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rating_scheme_entries rating_scheme_entries_intermediate_rater_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_intermediate_rater_person_id_fkey FOREIGN KEY (intermediate_rater_person_id) REFERENCES public.personnel(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: rating_scheme_entries rating_scheme_entries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: rating_scheme_entries rating_scheme_entries_organization_intermediate_rater_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_organization_intermediate_rater_fkey FOREIGN KEY (organization_id, intermediate_rater_person_id) REFERENCES public.personnel(organization_id, id) ON DELETE SET NULL (intermediate_rater_person_id) NOT VALID;


--
-- Name: rating_scheme_entries rating_scheme_entries_organization_rater_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_organization_rater_fkey FOREIGN KEY (organization_id, rater_person_id) REFERENCES public.personnel(organization_id, id) ON DELETE SET NULL (rater_person_id) NOT VALID;


--
-- Name: rating_scheme_entries rating_scheme_entries_organization_reviewer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_organization_reviewer_fkey FOREIGN KEY (organization_id, reviewer_person_id) REFERENCES public.personnel(organization_id, id) ON DELETE SET NULL (reviewer_person_id) NOT VALID;


--
-- Name: rating_scheme_entries rating_scheme_entries_organization_senior_rater_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_organization_senior_rater_fkey FOREIGN KEY (organization_id, senior_rater_person_id) REFERENCES public.personnel(organization_id, id) ON DELETE SET NULL (senior_rater_person_id) NOT VALID;


--
-- Name: rating_scheme_entries rating_scheme_entries_rated_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_rated_person_id_fkey FOREIGN KEY (rated_person_id) REFERENCES public.personnel(id) ON DELETE CASCADE;


--
-- Name: rating_scheme_entries rating_scheme_entries_rater_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_rater_person_id_fkey FOREIGN KEY (rater_person_id) REFERENCES public.personnel(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: rating_scheme_entries rating_scheme_entries_reviewer_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_reviewer_person_id_fkey FOREIGN KEY (reviewer_person_id) REFERENCES public.personnel(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: rating_scheme_entries rating_scheme_entries_senior_rater_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rating_scheme_entries
    ADD CONSTRAINT rating_scheme_entries_senior_rater_person_id_fkey FOREIGN KEY (senior_rater_person_id) REFERENCES public.personnel(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: roster_excusals roster_excusals_assignment_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_excusals
    ADD CONSTRAINT roster_excusals_assignment_type_fkey FOREIGN KEY (organization_id, assignment_type_id) REFERENCES public.assignment_types(organization_id, id) ON DELETE CASCADE;


--
-- Name: roster_excusals roster_excusals_personnel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_excusals
    ADD CONSTRAINT roster_excusals_personnel_fkey FOREIGN KEY (organization_id, personnel_id) REFERENCES public.personnel(organization_id, id) ON DELETE CASCADE;


--
-- Name: roster_forms roster_forms_assignment_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_forms
    ADD CONSTRAINT roster_forms_assignment_type_fkey FOREIGN KEY (organization_id, assignment_type_id) REFERENCES public.assignment_types(organization_id, id) ON DELETE CASCADE;


--
-- Name: roster_starting_numbers roster_starting_numbers_form_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_starting_numbers
    ADD CONSTRAINT roster_starting_numbers_form_fkey FOREIGN KEY (organization_id, form_id) REFERENCES public.roster_forms(organization_id, id) ON DELETE CASCADE;


--
-- Name: roster_starting_numbers roster_starting_numbers_personnel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_starting_numbers
    ADD CONSTRAINT roster_starting_numbers_personnel_fkey FOREIGN KEY (organization_id, personnel_id) REFERENCES public.personnel(organization_id, id) ON DELETE CASCADE;


--
-- Name: roster_swaps roster_swaps_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_swaps
    ADD CONSTRAINT roster_swaps_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: roster_swaps roster_swaps_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_swaps
    ADD CONSTRAINT roster_swaps_type_fkey FOREIGN KEY (organization_id, assignment_type_id) REFERENCES public.assignment_types(organization_id, id) ON DELETE CASCADE;


--
-- Name: sign_in_rosters sign_in_rosters_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sign_in_rosters
    ADD CONSTRAINT sign_in_rosters_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: sign_in_rosters sign_in_rosters_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sign_in_rosters
    ADD CONSTRAINT sign_in_rosters_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: special_days special_days_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.special_days
    ADD CONSTRAINT special_days_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: status_types status_types_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status_types
    ADD CONSTRAINT status_types_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: training_types training_types_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: training_views training_views_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_views
    ADD CONSTRAINT training_views_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: training_views training_views_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_views
    ADD CONSTRAINT training_views_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_email_identities user_email_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_email_identities
    ADD CONSTRAINT user_email_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_org_preferences user_org_preferences_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_org_preferences
    ADD CONSTRAINT user_org_preferences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_org_preferences user_org_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_org_preferences
    ADD CONSTRAINT user_org_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_pinned_groups user_pinned_groups_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_pinned_groups
    ADD CONSTRAINT user_pinned_groups_clinic_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_pinned_groups user_pinned_groups_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_pinned_groups
    ADD CONSTRAINT user_pinned_groups_group_fkey FOREIGN KEY (organization_id, group_id) REFERENCES public.groups(organization_id, id) ON DELETE CASCADE;


--
-- Name: user_pinned_groups user_pinned_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_pinned_groups
    ADD CONSTRAINT user_pinned_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_suspensions user_suspensions_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_suspensions
    ADD CONSTRAINT user_suspensions_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES auth.users(id);


--
-- Name: user_suspensions user_suspensions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_suspensions
    ADD CONSTRAINT user_suspensions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whats_new_entries whats_new_entries_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whats_new_entries
    ADD CONSTRAINT whats_new_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: template_duplicate_receipts; Type: ROW SECURITY; Schema: onboarding_private; Owner: postgres
--

ALTER TABLE onboarding_private.template_duplicate_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: file_artifact_deletions; Type: ROW SECURITY; Schema: organization_private; Owner: postgres
--

ALTER TABLE organization_private.file_artifact_deletions ENABLE ROW LEVEL SECURITY;

--
-- Name: file_retirement_holds; Type: ROW SECURITY; Schema: organization_private; Owner: postgres
--

ALTER TABLE organization_private.file_retirement_holds ENABLE ROW LEVEL SECURITY;

--
-- Name: file_retirements; Type: ROW SECURITY; Schema: organization_private; Owner: postgres
--

ALTER TABLE organization_private.file_retirements ENABLE ROW LEVEL SECURITY;

--
-- Name: file_uploads; Type: ROW SECURITY; Schema: organization_private; Owner: postgres
--

ALTER TABLE organization_private.file_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_announcements Authenticated users can read announcements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read announcements" ON public.platform_announcements FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: data_exports Authorized members can create exports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authorized members can create exports" ON public.data_exports FOR INSERT TO authenticated WITH CHECK ((public.can_manage_org_members(org_id) AND (requested_by = ( SELECT auth.uid() AS uid))));


--
-- Name: roster_forms Calendar configurators can manage DA 6 forms; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar configurators can manage DA 6 forms" ON public.roster_forms USING (public.can_manage_calendar_configuration(organization_id)) WITH CHECK (public.can_manage_calendar_configuration(organization_id));


--
-- Name: roster_excusals Calendar configurators can manage roster excusals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar configurators can manage roster excusals" ON public.roster_excusals USING (public.can_manage_calendar_configuration(organization_id)) WITH CHECK (public.can_manage_calendar_configuration(organization_id));


--
-- Name: roster_starting_numbers Calendar configurators can manage roster starting numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar configurators can manage roster starting numbers" ON public.roster_starting_numbers USING (public.can_manage_calendar_configuration(organization_id)) WITH CHECK (public.can_manage_calendar_configuration(organization_id));


--
-- Name: special_days Calendar configurators can manage special days; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar configurators can manage special days" ON public.special_days USING (public.can_manage_calendar_configuration(organization_id)) WITH CHECK (public.can_manage_calendar_configuration(organization_id));


--
-- Name: calendar_tasking_checklist_items Calendar operators add checklist items to active taskings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators add checklist items to active taskings" ON public.calendar_tasking_checklist_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_checklist_items.organization_id) AND (t.id = calendar_tasking_checklist_items.tasking_id) AND (t.status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text])) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)))));


--
-- Name: calendar_tasking_equipment Calendar operators add equipment to active taskings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators add equipment to active taskings" ON public.calendar_tasking_equipment FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_equipment.organization_id) AND (t.id = calendar_tasking_equipment.tasking_id) AND (t.status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text])) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)))));


--
-- Name: calendar_taskings Calendar operators create taskings their scope covers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators create taskings their scope covers" ON public.calendar_taskings FOR INSERT TO authenticated WITH CHECK (calendar_private.can_manage_calendar_tasking(organization_id, responsible_group_id));


--
-- Name: calendar_tasking_checklist_items Calendar operators edit checklist items of active taskings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators edit checklist items of active taskings" ON public.calendar_tasking_checklist_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_checklist_items.organization_id) AND (t.id = calendar_tasking_checklist_items.tasking_id) AND (t.status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text])) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_checklist_items.organization_id) AND (t.id = calendar_tasking_checklist_items.tasking_id) AND (t.status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text])) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)))));


--
-- Name: calendar_tasking_equipment Calendar operators edit equipment of active taskings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators edit equipment of active taskings" ON public.calendar_tasking_equipment FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_equipment.organization_id) AND (t.id = calendar_tasking_equipment.tasking_id) AND (t.status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text])) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_equipment.organization_id) AND (t.id = calendar_tasking_equipment.tasking_id) AND (t.status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text])) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)))));


--
-- Name: calendar_taskings Calendar operators edit taskings their scope covers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators edit taskings their scope covers" ON public.calendar_taskings FOR UPDATE TO authenticated USING (calendar_private.can_manage_calendar_tasking(organization_id, responsible_group_id)) WITH CHECK (calendar_private.can_manage_calendar_tasking(organization_id, responsible_group_id));


--
-- Name: calendar_tasking_equipment Calendar operators record returns on completed taskings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators record returns on completed taskings" ON public.calendar_tasking_equipment FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_equipment.organization_id) AND (t.id = calendar_tasking_equipment.tasking_id) AND (t.status = 'completed'::text) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_equipment.organization_id) AND (t.id = calendar_tasking_equipment.tasking_id) AND (t.status = 'completed'::text) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)))));


--
-- Name: calendar_tasking_checklist_items Calendar operators remove checklist items from active taskings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators remove checklist items from active taskings" ON public.calendar_tasking_checklist_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_checklist_items.organization_id) AND (t.id = calendar_tasking_checklist_items.tasking_id) AND (t.status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text])) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)))));


--
-- Name: calendar_tasking_equipment Calendar operators remove equipment from active taskings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar operators remove equipment from active taskings" ON public.calendar_tasking_equipment FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_equipment.organization_id) AND (t.id = calendar_tasking_equipment.tasking_id) AND (t.status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text])) AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)))));


--
-- Name: calendar_event_activity Calendar readers can view event activity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar readers can view event activity" ON public.calendar_event_activity FOR SELECT TO authenticated USING (calendar_private.can_view_calendar_events(organization_id));


--
-- Name: calendar_events Calendar readers can view events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar readers can view events" ON public.calendar_events FOR SELECT TO authenticated USING (calendar_private.can_view_calendar_events(organization_id));


--
-- Name: calendar_tasking_activity Calendar readers view activity of taskings they can see; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar readers view activity of taskings they can see" ON public.calendar_tasking_activity FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_activity.organization_id) AND (t.id = calendar_tasking_activity.tasking_id)))));


--
-- Name: calendar_tasking_checklist_items Calendar readers view checklists of taskings they can see; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar readers view checklists of taskings they can see" ON public.calendar_tasking_checklist_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_checklist_items.organization_id) AND (t.id = calendar_tasking_checklist_items.tasking_id)))));


--
-- Name: calendar_tasking_equipment Calendar readers view equipment of taskings they can see; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar readers view equipment of taskings they can see" ON public.calendar_tasking_equipment FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_equipment.organization_id) AND (t.id = calendar_tasking_equipment.tasking_id)))));


--
-- Name: calendar_tasking_participants Calendar readers view picks of people in their scope; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar readers view picks of people in their scope" ON public.calendar_tasking_participants FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.calendar_taskings t
  WHERE ((t.organization_id = calendar_tasking_participants.organization_id) AND (t.id = calendar_tasking_participants.tasking_id)))) AND calendar_private.calendar_person_in_scope(organization_id, personnel_id)));


--
-- Name: calendar_taskings Calendar readers view the taskings their scope covers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar readers view the taskings their scope covers" ON public.calendar_taskings FOR SELECT TO authenticated USING (calendar_private.can_view_calendar_tasking(organization_id, responsible_group_id));


--
-- Name: roster_forms Calendar viewers can read DA 6 forms; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar viewers can read DA 6 forms" ON public.roster_forms FOR SELECT TO authenticated USING ((organization_id IN ( SELECT v.organization_id
   FROM calendar_private.organization_wide_viewer_organizations() v(organization_id))));


--
-- Name: personnel_attribute_history Calendar viewers can read attribute history of people they see; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar viewers can read attribute history of people they see" ON public.personnel_attribute_history FOR SELECT TO authenticated USING (((organization_id, personnel_id) IN ( SELECT v.organization_id,
    v.personnel_id
   FROM member_access_private.viewable_personnel('calendar'::text) v(organization_id, personnel_id))));


--
-- Name: roster_excusals Calendar viewers can read roster excusals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar viewers can read roster excusals" ON public.roster_excusals FOR SELECT TO authenticated USING (((organization_id, personnel_id) IN ( SELECT v.organization_id,
    v.personnel_id
   FROM member_access_private.viewable_personnel('calendar'::text) v(organization_id, personnel_id))));


--
-- Name: roster_starting_numbers Calendar viewers can read roster starting numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Calendar viewers can read roster starting numbers" ON public.roster_starting_numbers FOR SELECT TO authenticated USING (((organization_id, personnel_id) IN ( SELECT v.organization_id,
    v.personnel_id
   FROM member_access_private.viewable_personnel('calendar'::text) v(organization_id, personnel_id))));


--
-- Name: counseling_records Configurators can read scoped counseling records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Configurators can read scoped counseling records" ON public.counseling_records FOR SELECT TO authenticated USING (public.personnel_sensitive_artifact_is_readable(organization_id, personnel_id));


--
-- Name: leader_notes Configurators can read scoped leader notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Configurators can read scoped leader notes" ON public.leader_notes FOR SELECT TO authenticated USING (public.personnel_sensitive_artifact_is_readable(organization_id, personnel_id));


--
-- Name: personnel_documents Configurators can read scoped personnel documents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Configurators can read scoped personnel documents" ON public.personnel_documents FOR SELECT TO authenticated USING (public.personnel_sensitive_artifact_is_readable(organization_id, personnel_id));


--
-- Name: personnel_follow_ups Configurators can read scoped personnel follow ups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Configurators can read scoped personnel follow ups" ON public.personnel_follow_ups FOR SELECT TO authenticated USING (public.personnel_sensitive_artifact_is_readable(organization_id, personnel_id));


--
-- Name: ict_tasks Critical Tasks configurators can insert library records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Critical Tasks configurators can insert library records" ON public.ict_tasks FOR INSERT TO authenticated WITH CHECK (public.can_manage_ict_task_library(organization_id));


--
-- Name: ict_tasks Critical Tasks configurators can update library records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Critical Tasks configurators can update library records" ON public.ict_tasks FOR UPDATE TO authenticated USING (public.can_manage_ict_task_library(organization_id)) WITH CHECK (public.can_manage_ict_task_library(organization_id));


--
-- Name: organization_invitations Governors can create invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Governors can create invitations" ON public.organization_invitations FOR INSERT TO authenticated WITH CHECK (((invited_by = ( SELECT auth.uid() AS uid)) AND (((role = 'member'::public.organization_role) AND public.can_manage_org_members(organization_id)) OR ((role = 'admin'::public.organization_role) AND public.is_org_owner(organization_id) AND public.current_session_sensitive_action_assured()))));


--
-- Name: organization_invitations Governors can revoke pending invitations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Governors can revoke pending invitations" ON public.organization_invitations FOR UPDATE USING ((public.can_manage_org_members(organization_id) AND (status = 'pending'::public.invitation_status))) WITH CHECK ((public.can_manage_org_members(organization_id) AND (status = ANY (ARRAY['revoked'::public.invitation_status, 'expired'::public.invitation_status])) AND (accepted_at IS NULL) AND (declined_at IS NULL) AND ((revoked_by IS NULL) OR (revoked_by = auth.uid()))));


--
-- Name: organization_memberships Governors can update member access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Governors can update member access" ON public.organization_memberships FOR UPDATE TO authenticated USING ((((role = 'member'::public.organization_role) AND public.can_manage_org_members(organization_id)) OR ((role = 'admin'::public.organization_role) AND public.is_org_owner(organization_id) AND public.current_session_sensitive_action_assured()))) WITH CHECK ((((role = 'member'::public.organization_role) AND public.can_manage_org_members(organization_id)) OR ((role = 'admin'::public.organization_role) AND public.is_org_owner(organization_id) AND public.current_session_sensitive_action_assured())));


--
-- Name: organization_invitations Governors can view invitations for their organizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Governors can view invitations for their organizations" ON public.organization_invitations FOR SELECT USING (public.can_manage_org_members(organization_id));


--
-- Name: groups Members can view Groups in their scope; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view Groups in their scope" ON public.groups FOR SELECT USING ((public.can_view_groups(organization_id) AND public.member_access_group_scope_matches(organization_id, id)));


--
-- Name: organization_memberships Members can view memberships of their organizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view memberships of their organizations" ON public.organization_memberships FOR SELECT USING (((user_id = ( SELECT auth.uid() AS uid)) OR public.is_org_member(organization_id)));


--
-- Name: organization_invitation_email_outbox Members can view organization invitation email outbox; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Members can view organization invitation email outbox" ON public.organization_invitation_email_outbox FOR SELECT USING (public.can_manage_org_members(organization_id));


--
-- Name: onboarding_template_steps Onboarding configurators can manage template steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding configurators can manage template steps" ON public.onboarding_template_steps TO authenticated USING ((public.can_manage_onboarding_configuration(organization_id) AND (EXISTS ( SELECT 1
   FROM public.onboarding_templates t
  WHERE ((t.id = onboarding_template_steps.template_id) AND (t.organization_id = onboarding_template_steps.organization_id)))))) WITH CHECK ((public.can_manage_onboarding_configuration(organization_id) AND (EXISTS ( SELECT 1
   FROM public.onboarding_templates t
  WHERE ((t.id = onboarding_template_steps.template_id) AND (t.organization_id = onboarding_template_steps.organization_id)))) AND public.onboarding_template_training_type_matches(organization_id, training_type_id)));


--
-- Name: onboarding_templates Onboarding configurators can manage templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding configurators can manage templates" ON public.onboarding_templates TO authenticated USING (public.can_manage_onboarding_configuration(organization_id)) WITH CHECK (public.can_manage_onboarding_configuration(organization_id));


--
-- Name: onboarding_step_progress Onboarding operators can remove inactive scoped progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding operators can remove inactive scoped progress" ON public.onboarding_step_progress FOR DELETE TO authenticated USING (((NOT active) AND public.can_edit_onboarding(organization_id) AND onboarding_private.onboarding_parent_scope_matches(organization_id, onboarding_id)));


--
-- Name: onboarding_step_progress Onboarding operators can update scoped progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding operators can update scoped progress" ON public.onboarding_step_progress FOR UPDATE TO authenticated USING ((public.can_edit_onboarding(organization_id) AND onboarding_private.onboarding_parent_scope_matches(organization_id, onboarding_id))) WITH CHECK ((public.can_edit_onboarding(organization_id) AND onboarding_private.onboarding_parent_scope_matches(organization_id, onboarding_id) AND onboarding_private.onboarding_step_references_match(organization_id, template_step_id, training_type_id)));


--
-- Name: personnel_onboardings Onboarding operators can update scoped workflows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding operators can update scoped workflows" ON public.personnel_onboardings FOR UPDATE TO authenticated USING ((public.can_edit_onboarding(organization_id) AND onboarding_private.onboarding_personnel_scope_matches(organization_id, personnel_id))) WITH CHECK ((public.can_edit_onboarding(organization_id) AND onboarding_private.onboarding_personnel_scope_matches(organization_id, personnel_id) AND onboarding_private.onboarding_template_reference_matches(organization_id, template_id)));


--
-- Name: onboarding_step_progress Onboarding or Personnel readers can view scoped progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding or Personnel readers can view scoped progress" ON public.onboarding_step_progress FOR SELECT TO authenticated USING (((public.can_view_onboarding(organization_id) OR (public.can_view_personnel(organization_id) AND public.organization_feature_enabled(organization_id, 'onboarding'::text))) AND onboarding_private.onboarding_parent_scope_matches(organization_id, onboarding_id)));


--
-- Name: personnel_onboardings Onboarding or Personnel readers can view scoped workflows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding or Personnel readers can view scoped workflows" ON public.personnel_onboardings FOR SELECT TO authenticated USING (((public.can_view_onboarding(organization_id) OR (public.can_view_personnel(organization_id) AND public.organization_feature_enabled(organization_id, 'onboarding'::text))) AND onboarding_private.onboarding_personnel_scope_matches(organization_id, personnel_id)));


--
-- Name: onboarding_template_steps Onboarding readers can view template steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding readers can view template steps" ON public.onboarding_template_steps FOR SELECT TO authenticated USING ((public.can_view_onboarding(organization_id) AND (EXISTS ( SELECT 1
   FROM public.onboarding_templates t
  WHERE ((t.id = onboarding_template_steps.template_id) AND (t.organization_id = onboarding_template_steps.organization_id))))));


--
-- Name: onboarding_templates Onboarding readers can view templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Onboarding readers can view templates" ON public.onboarding_templates FOR SELECT TO authenticated USING (public.can_view_onboarding(organization_id));


--
-- Name: counseling_records Operators can delete counseling records through scoped personne; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can delete counseling records through scoped personne" ON public.counseling_records FOR DELETE USING (((archived_at IS NOT NULL) AND public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = counseling_records.personnel_id) AND (personnel.organization_id = counseling_records.organization_id) AND public.member_access_group_scope_matches(counseling_records.organization_id, personnel.group_id))))));


--
-- Name: leader_notes Operators can delete leader notes through scoped personnel acce; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can delete leader notes through scoped personnel acce" ON public.leader_notes FOR DELETE USING (((archived_at IS NOT NULL) AND public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = leader_notes.personnel_id) AND (personnel.organization_id = leader_notes.organization_id) AND public.member_access_group_scope_matches(leader_notes.organization_id, personnel.group_id))))));


--
-- Name: personnel_documents Operators can delete personnel documents through scoped personn; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can delete personnel documents through scoped personn" ON public.personnel_documents FOR DELETE USING (((archived_at IS NOT NULL) AND public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = personnel_documents.personnel_id) AND (personnel.organization_id = personnel_documents.organization_id) AND public.member_access_group_scope_matches(personnel_documents.organization_id, personnel.group_id))))));


--
-- Name: personnel_follow_ups Operators can delete personnel follow ups through scoped person; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can delete personnel follow ups through scoped person" ON public.personnel_follow_ups FOR DELETE USING (((status = 'archived'::text) AND public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = personnel_follow_ups.personnel_id) AND (personnel.organization_id = personnel_follow_ups.organization_id) AND (((personnel.group_id IS NOT NULL) AND public.member_access_group_scope_matches(personnel_follow_ups.organization_id, personnel.group_id)) OR ((personnel.group_id IS NULL) AND (EXISTS ( SELECT 1
           FROM public.organization_memberships
          WHERE ((organization_memberships.organization_id = personnel_follow_ups.organization_id) AND (organization_memberships.user_id = auth.uid()) AND ((organization_memberships.role = ANY (ARRAY['owner'::public.organization_role, 'admin'::public.organization_role])) OR (organization_memberships.access_scope_kind = 'organization'::text))))))))))));


--
-- Name: personnel_extended_info Operators can delete scoped personnel extended info; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can delete scoped personnel extended info" ON public.personnel_extended_info FOR DELETE TO authenticated USING (public.personnel_extended_info_scope_matches(organization_id, personnel_id));


--
-- Name: counseling_records Operators can insert counseling records through scoped personne; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can insert counseling records through scoped personne" ON public.counseling_records FOR INSERT WITH CHECK ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = counseling_records.personnel_id) AND (personnel.organization_id = counseling_records.organization_id) AND public.member_access_group_scope_matches(counseling_records.organization_id, personnel.group_id))))));


--
-- Name: leader_notes Operators can insert leader notes through scoped personnel acce; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can insert leader notes through scoped personnel acce" ON public.leader_notes FOR INSERT WITH CHECK ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = leader_notes.personnel_id) AND (personnel.organization_id = leader_notes.organization_id) AND public.member_access_group_scope_matches(leader_notes.organization_id, personnel.group_id))))));


--
-- Name: personnel_documents Operators can insert personnel documents through scoped personn; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can insert personnel documents through scoped personn" ON public.personnel_documents FOR INSERT WITH CHECK ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = personnel_documents.personnel_id) AND (personnel.organization_id = personnel_documents.organization_id) AND public.member_access_group_scope_matches(personnel_documents.organization_id, personnel.group_id))))));


--
-- Name: personnel_follow_ups Operators can insert personnel follow ups through scoped person; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can insert personnel follow ups through scoped person" ON public.personnel_follow_ups FOR INSERT WITH CHECK ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = personnel_follow_ups.personnel_id) AND (personnel.organization_id = personnel_follow_ups.organization_id) AND (((personnel.group_id IS NOT NULL) AND public.member_access_group_scope_matches(personnel_follow_ups.organization_id, personnel.group_id)) OR ((personnel.group_id IS NULL) AND (EXISTS ( SELECT 1
           FROM public.organization_memberships
          WHERE ((organization_memberships.organization_id = personnel_follow_ups.organization_id) AND (organization_memberships.user_id = auth.uid()) AND ((organization_memberships.role = ANY (ARRAY['owner'::public.organization_role, 'admin'::public.organization_role])) OR (organization_memberships.access_scope_kind = 'organization'::text))))))))))));


--
-- Name: personnel_extended_info Operators can insert scoped personnel extended info; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can insert scoped personnel extended info" ON public.personnel_extended_info FOR INSERT TO authenticated WITH CHECK (public.personnel_extended_info_scope_matches(organization_id, personnel_id));


--
-- Name: access_requests Operators can read access requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can read access requests" ON public.access_requests FOR SELECT TO authenticated USING (public.is_platform_operator());


--
-- Name: platform_operators Operators can read operator membership; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can read operator membership" ON public.platform_operators FOR SELECT TO authenticated USING (public.is_platform_operator());


--
-- Name: personnel_extended_info Operators can read scoped personnel extended info; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can read scoped personnel extended info" ON public.personnel_extended_info FOR SELECT TO authenticated USING (public.personnel_extended_info_scope_matches(organization_id, personnel_id));


--
-- Name: user_suspensions Operators can read suspensions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can read suspensions" ON public.user_suspensions FOR SELECT TO authenticated USING (public.is_platform_operator());


--
-- Name: counseling_records Operators can update counseling records through scoped personne; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can update counseling records through scoped personne" ON public.counseling_records FOR UPDATE USING ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = counseling_records.personnel_id) AND (personnel.organization_id = counseling_records.organization_id) AND public.member_access_group_scope_matches(counseling_records.organization_id, personnel.group_id)))))) WITH CHECK ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = counseling_records.personnel_id) AND (personnel.organization_id = counseling_records.organization_id) AND public.member_access_group_scope_matches(counseling_records.organization_id, personnel.group_id))))));


--
-- Name: leader_notes Operators can update leader notes through scoped personnel acce; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can update leader notes through scoped personnel acce" ON public.leader_notes FOR UPDATE USING ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = leader_notes.personnel_id) AND (personnel.organization_id = leader_notes.organization_id) AND public.member_access_group_scope_matches(leader_notes.organization_id, personnel.group_id)))))) WITH CHECK ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = leader_notes.personnel_id) AND (personnel.organization_id = leader_notes.organization_id) AND public.member_access_group_scope_matches(leader_notes.organization_id, personnel.group_id))))));


--
-- Name: personnel_documents Operators can update personnel documents through scoped personn; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can update personnel documents through scoped personn" ON public.personnel_documents FOR UPDATE USING ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = personnel_documents.personnel_id) AND (personnel.organization_id = personnel_documents.organization_id) AND public.member_access_group_scope_matches(personnel_documents.organization_id, personnel.group_id)))))) WITH CHECK ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = personnel_documents.personnel_id) AND (personnel.organization_id = personnel_documents.organization_id) AND public.member_access_group_scope_matches(personnel_documents.organization_id, personnel.group_id))))));


--
-- Name: personnel_follow_ups Operators can update personnel follow ups through scoped person; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can update personnel follow ups through scoped person" ON public.personnel_follow_ups FOR UPDATE USING ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = personnel_follow_ups.personnel_id) AND (personnel.organization_id = personnel_follow_ups.organization_id) AND (((personnel.group_id IS NOT NULL) AND public.member_access_group_scope_matches(personnel_follow_ups.organization_id, personnel.group_id)) OR ((personnel.group_id IS NULL) AND (EXISTS ( SELECT 1
           FROM public.organization_memberships
          WHERE ((organization_memberships.organization_id = personnel_follow_ups.organization_id) AND (organization_memberships.user_id = auth.uid()) AND ((organization_memberships.role = ANY (ARRAY['owner'::public.organization_role, 'admin'::public.organization_role])) OR (organization_memberships.access_scope_kind = 'organization'::text)))))))))))) WITH CHECK ((public.member_access_has_capability(organization_id, 'personnel'::text, 'operate'::text) AND (EXISTS ( SELECT 1
   FROM public.personnel
  WHERE ((personnel.id = personnel_follow_ups.personnel_id) AND (personnel.organization_id = personnel_follow_ups.organization_id) AND (((personnel.group_id IS NOT NULL) AND public.member_access_group_scope_matches(personnel_follow_ups.organization_id, personnel.group_id)) OR ((personnel.group_id IS NULL) AND (EXISTS ( SELECT 1
           FROM public.organization_memberships
          WHERE ((organization_memberships.organization_id = personnel_follow_ups.organization_id) AND (organization_memberships.user_id = auth.uid()) AND ((organization_memberships.role = ANY (ARRAY['owner'::public.organization_role, 'admin'::public.organization_role])) OR (organization_memberships.access_scope_kind = 'organization'::text))))))))))));


--
-- Name: personnel_extended_info Operators can update scoped personnel extended info; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Operators can update scoped personnel extended info" ON public.personnel_extended_info FOR UPDATE TO authenticated USING (public.personnel_extended_info_scope_matches(organization_id, personnel_id)) WITH CHECK (public.personnel_extended_info_scope_matches(organization_id, personnel_id));


--
-- Name: data_exports Org managers can update export lifecycle; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Org managers can update export lifecycle" ON public.data_exports FOR UPDATE USING (public.can_manage_org_members(org_id)) WITH CHECK (public.can_manage_org_members(org_id));


--
-- Name: data_exports Org members can read exports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Org members can read exports" ON public.data_exports FOR SELECT USING (public.is_org_member(org_id));


--
-- Name: audit_logs Org owners can read own audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Org owners can read own audit logs" ON public.audit_logs FOR SELECT USING ((public.is_org_owner(org_id) OR public.is_platform_operator()));


--
-- Name: organization_rank_catalog Organization governors can insert organization rank catalog; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization governors can insert organization rank catalog" ON public.organization_rank_catalog FOR INSERT WITH CHECK (public.can_update_organization_settings(organization_id));


--
-- Name: organization_rank_catalog Organization governors can update organization rank catalog; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization governors can update organization rank catalog" ON public.organization_rank_catalog FOR UPDATE USING (public.can_update_organization_settings(organization_id)) WITH CHECK (public.can_update_organization_settings(organization_id));


--
-- Name: organizations Organization owners can delete their organizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization owners can delete their organizations" ON public.organizations FOR DELETE TO authenticated USING ((public.is_org_owner(id) AND public.current_session_sensitive_action_assured()));


--
-- Name: calendar_events Organization-wide Calendar operators can create events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization-wide Calendar operators can create events" ON public.calendar_events FOR INSERT TO authenticated WITH CHECK (calendar_private.can_manage_calendar_events(organization_id));


--
-- Name: calendar_events Organization-wide Calendar operators can edit events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization-wide Calendar operators can edit events" ON public.calendar_events FOR UPDATE TO authenticated USING (calendar_private.can_manage_calendar_events(organization_id)) WITH CHECK (calendar_private.can_manage_calendar_events(organization_id));


--
-- Name: roster_swaps Organization-wide Calendar viewers can read duty swaps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization-wide Calendar viewers can read duty swaps" ON public.roster_swaps FOR SELECT TO authenticated USING ((organization_id IN ( SELECT v.organization_id
   FROM calendar_private.organization_wide_viewer_organizations() v(organization_id))));


--
-- Name: groups Organization-wide Personnel configurers can create Groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization-wide Personnel configurers can create Groups" ON public.groups FOR INSERT WITH CHECK (public.can_manage_groups(organization_id));


--
-- Name: groups Organization-wide Personnel configurers can delete Groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization-wide Personnel configurers can delete Groups" ON public.groups FOR DELETE USING (public.can_manage_groups(organization_id));


--
-- Name: groups Organization-wide Personnel configurers can update Groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization-wide Personnel configurers can update Groups" ON public.groups FOR UPDATE USING (public.can_manage_groups(organization_id)) WITH CHECK (public.can_manage_groups(organization_id));


--
-- Name: user_pinned_groups Organization-wide readers manage their own pinned groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Organization-wide readers manage their own pinned groups" ON public.user_pinned_groups TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) AND personnel_private.can_use_group_pins(organization_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND personnel_private.can_use_group_pins(organization_id)));


--
-- Name: account_setup_links Platform admins can manage account setup links; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Platform admins can manage account setup links" ON public.account_setup_links USING (public.is_platform_operator());


--
-- Name: access_request_organization_invitation_links Platform admins can view access request organization invitation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Platform admins can view access request organization invitation" ON public.access_request_organization_invitation_links FOR SELECT TO authenticated USING (public.is_platform_operator());


--
-- Name: organizations Privileged members can update their organizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Privileged members can update their organizations" ON public.organizations FOR UPDATE TO authenticated USING (public.is_org_privileged(id)) WITH CHECK (public.is_org_privileged(id));


--
-- Name: access_request_organization_invitation_links Service role can manage access request organization invitation ; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage access request organization invitation " ON public.access_request_organization_invitation_links TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_email_identities Service role can manage user email identities; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage user email identities" ON public.user_email_identities TO service_role USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: auth_email_outbox Service role manages auth email outbox; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role manages auth email outbox" ON public.auth_email_outbox USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: organization_invitation_email_outbox Service role manages organization invitation email outbox; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role manages organization invitation email outbox" ON public.organization_invitation_email_outbox USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: whats_new_entries Signed-in accounts read published entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Signed-in accounts read published entries" ON public.whats_new_entries FOR SELECT TO authenticated USING ((published_on IS NOT NULL));


--
-- Name: training_views Training configurators can create views; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Training configurators can create views" ON public.training_views FOR INSERT WITH CHECK (public.can_manage_training_configuration(organization_id));


--
-- Name: training_views Training configurators can delete views; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Training configurators can delete views" ON public.training_views FOR DELETE USING (public.can_manage_training_configuration(organization_id));


--
-- Name: training_views Training configurators can update views; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Training configurators can update views" ON public.training_views FOR UPDATE USING (public.can_manage_training_configuration(organization_id)) WITH CHECK (public.can_manage_training_configuration(organization_id));


--
-- Name: training_views Training viewers can read views; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Training viewers can read views" ON public.training_views FOR SELECT USING (public.can_view_training(organization_id));


--
-- Name: organization_invitations Users can decline invitations addressed to them; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can decline invitations addressed to them" ON public.organization_invitations FOR UPDATE USING (((normalized_email = lower(btrim((auth.jwt() ->> 'email'::text)))) AND (status = 'pending'::public.invitation_status))) WITH CHECK (((normalized_email = lower(btrim((auth.jwt() ->> 'email'::text)))) AND (status = ANY (ARRAY['declined'::public.invitation_status, 'expired'::public.invitation_status])) AND (accepted_at IS NULL) AND (revoked_at IS NULL) AND ((declined_by IS NULL) OR (declined_by = auth.uid()))));


--
-- Name: availability_entries Users can delete availability if allowed by scoped calendar acc; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete availability if allowed by scoped calendar acc" ON public.availability_entries FOR DELETE USING (public.can_edit_availability_record(organization_id, personnel_id));


--
-- Name: daily_assignments Users can delete daily assignments if allowed by scoped calenda; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete daily assignments if allowed by scoped calenda" ON public.daily_assignments FOR DELETE USING (public.can_edit_daily_assignment_record(organization_id, assignment_type_id, assignee_id));


--
-- Name: personnel_ict_completions Users can delete personnel ICT completions if allowed by scoped; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete personnel ICT completions if allowed by scoped" ON public.personnel_ict_completions FOR DELETE USING (public.can_edit_personnel_ict_completion_record(organization_id, personnel_id));


--
-- Name: personnel Users can delete personnel if allowed by scoped personnel acces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete personnel if allowed by scoped personnel acces" ON public.personnel FOR DELETE USING ((public.can_configure_personnel_record(organization_id, group_id) AND (archived_at IS NOT NULL)));


--
-- Name: personnel_training_history Users can delete personnel training history if allowed by scope; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete personnel training history if allowed by scope" ON public.personnel_training_history FOR DELETE USING (public.can_configure_personnel_training_record(organization_id, personnel_id));


--
-- Name: personnel_trainings Users can delete personnel trainings if allowed by scoped train; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete personnel trainings if allowed by scoped train" ON public.personnel_trainings FOR DELETE USING (public.can_configure_personnel_training_record(organization_id, personnel_id));


--
-- Name: rating_scheme_entries Users can delete rating scheme entries if allowed by scoped rat; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete rating scheme entries if allowed by scoped rat" ON public.rating_scheme_entries FOR DELETE USING ((public.can_edit_rating_scheme_record(organization_id, rated_person_id) AND public.is_org_privileged(organization_id)));


--
-- Name: user_org_preferences Users can delete their own org preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own org preferences" ON public.user_org_preferences FOR DELETE USING (((( SELECT auth.uid() AS uid) = user_id) AND public.is_org_member(organization_id)));


--
-- Name: availability_entries Users can insert availability if allowed by scoped calendar acc; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert availability if allowed by scoped calendar acc" ON public.availability_entries FOR INSERT WITH CHECK (public.can_edit_availability_record(organization_id, personnel_id));


--
-- Name: daily_assignments Users can insert daily assignments if allowed by scoped calenda; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert daily assignments if allowed by scoped calenda" ON public.daily_assignments FOR INSERT WITH CHECK (public.can_edit_daily_assignment_record(organization_id, assignment_type_id, assignee_id));


--
-- Name: personnel_ict_completions Users can insert personnel ICT completions if allowed by scoped; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert personnel ICT completions if allowed by scoped" ON public.personnel_ict_completions FOR INSERT WITH CHECK (public.can_edit_personnel_ict_completion_record(organization_id, personnel_id));


--
-- Name: personnel Users can insert personnel if allowed by scoped personnel acces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert personnel if allowed by scoped personnel acces" ON public.personnel FOR INSERT WITH CHECK ((public.can_edit_personnel_record(organization_id, group_id) AND ((archived_at IS NULL) OR public.can_configure_personnel_record(organization_id, group_id))));


--
-- Name: personnel_training_history Users can insert personnel training history if allowed by scope; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert personnel training history if allowed by scope" ON public.personnel_training_history FOR INSERT WITH CHECK (public.can_edit_personnel_training_record_with_type(organization_id, personnel_id, training_type_id));


--
-- Name: personnel_trainings Users can insert personnel trainings if allowed by scoped train; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert personnel trainings if allowed by scoped train" ON public.personnel_trainings FOR INSERT WITH CHECK (public.can_edit_personnel_training_record_with_type(organization_id, personnel_id, training_type_id));


--
-- Name: rating_scheme_entries Users can insert rating scheme entries if allowed by scoped rat; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert rating scheme entries if allowed by scoped rat" ON public.rating_scheme_entries FOR INSERT WITH CHECK (public.can_edit_rating_scheme_record(organization_id, rated_person_id));


--
-- Name: dashboard_configs Users can insert their own dashboard config; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own dashboard config" ON public.dashboard_configs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_org_preferences Users can insert their own org preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own org preferences" ON public.user_org_preferences FOR INSERT WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND public.is_org_member(organization_id)));


--
-- Name: user_profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own profile" ON public.user_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: assignment_types Users can manage assignment types if they are full editors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage assignment types if they are full editors" ON public.assignment_types USING (public.can_manage_calendar_configuration(organization_id)) WITH CHECK (public.can_manage_calendar_configuration(organization_id));


--
-- Name: announcement_dismissals Users can manage own dismissals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage own dismissals" ON public.announcement_dismissals USING ((auth.uid() = user_id));


--
-- Name: status_types Users can manage status types if they are full editors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage status types if they are full editors" ON public.status_types USING (public.can_manage_calendar_configuration(organization_id)) WITH CHECK (public.can_manage_calendar_configuration(organization_id));


--
-- Name: training_types Users can manage training types if they are full editors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage training types if they are full editors" ON public.training_types USING (public.can_manage_training_configuration(organization_id)) WITH CHECK (public.can_manage_training_configuration(organization_id));


--
-- Name: dashboard_configs Users can read their own dashboard config; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read their own dashboard config" ON public.dashboard_configs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: availability_entries Users can update availability if allowed by scoped calendar acc; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update availability if allowed by scoped calendar acc" ON public.availability_entries FOR UPDATE USING (public.can_edit_availability_record(organization_id, personnel_id)) WITH CHECK (public.can_edit_availability_record(organization_id, personnel_id));


--
-- Name: daily_assignments Users can update daily assignments if allowed by scoped calenda; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update daily assignments if allowed by scoped calenda" ON public.daily_assignments FOR UPDATE USING (public.can_edit_daily_assignment_record(organization_id, assignment_type_id, assignee_id)) WITH CHECK (public.can_edit_daily_assignment_record(organization_id, assignment_type_id, assignee_id));


--
-- Name: personnel_ict_completions Users can update personnel ICT completions if allowed by scoped; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update personnel ICT completions if allowed by scoped" ON public.personnel_ict_completions FOR UPDATE USING (public.can_edit_personnel_ict_completion_record(organization_id, personnel_id)) WITH CHECK (public.can_edit_personnel_ict_completion_record(organization_id, personnel_id));


--
-- Name: personnel Users can update personnel if allowed by scoped personnel acces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update personnel if allowed by scoped personnel acces" ON public.personnel FOR UPDATE USING (public.can_edit_personnel_record(organization_id, group_id)) WITH CHECK (public.can_edit_personnel_record(organization_id, group_id));


--
-- Name: personnel_training_history Users can update personnel training history if allowed by scope; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update personnel training history if allowed by scope" ON public.personnel_training_history FOR UPDATE USING (public.can_edit_personnel_training_record(organization_id, personnel_id)) WITH CHECK (public.can_edit_personnel_training_record_with_type(organization_id, personnel_id, training_type_id));


--
-- Name: personnel_trainings Users can update personnel trainings if allowed by scoped train; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update personnel trainings if allowed by scoped train" ON public.personnel_trainings FOR UPDATE USING (public.can_edit_personnel_training_record(organization_id, personnel_id)) WITH CHECK (public.can_edit_personnel_training_record_with_type(organization_id, personnel_id, training_type_id));


--
-- Name: rating_scheme_entries Users can update rating scheme entries if allowed by scoped rat; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update rating scheme entries if allowed by scoped rat" ON public.rating_scheme_entries FOR UPDATE USING (public.can_edit_rating_scheme_record(organization_id, rated_person_id)) WITH CHECK (public.can_edit_rating_scheme_record(organization_id, rated_person_id));


--
-- Name: dashboard_configs Users can update their own dashboard config; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own dashboard config" ON public.dashboard_configs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_org_preferences Users can update their own org preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own org preferences" ON public.user_org_preferences FOR UPDATE USING (((( SELECT auth.uid() AS uid) = user_id) AND public.is_org_member(organization_id)));


--
-- Name: user_profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own profile" ON public.user_profiles FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: ict_tasks Users can view ICT tasks if they can view critical tasks data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view ICT tasks if they can view critical tasks data" ON public.ict_tasks FOR SELECT USING (public.can_view_critical_tasks(organization_id));


--
-- Name: assignment_types Users can view assignment types if they can view calendar data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view assignment types if they can view calendar data" ON public.assignment_types FOR SELECT USING (public.can_view_calendar(organization_id));


--
-- Name: availability_entries Users can view availability if allowed by scoped calendar acces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view availability if allowed by scoped calendar acces" ON public.availability_entries FOR SELECT TO authenticated USING (((organization_id, personnel_id) IN ( SELECT v.organization_id,
    v.personnel_id
   FROM member_access_private.viewable_personnel('calendar'::text) v(organization_id, personnel_id))));


--
-- Name: daily_assignments Users can view daily assignments if allowed by scoped calendar ; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view daily assignments if allowed by scoped calendar " ON public.daily_assignments FOR SELECT TO authenticated USING (((organization_id, assignment_type_id, assignee_id) IN ( SELECT v.organization_id,
    v.assignment_type_id,
    v.assignee_id
   FROM calendar_private.viewable_assignees() v(organization_id, assignment_type_id, assignee_id))));


--
-- Name: organization_invitations Users can view invitations addressed to them; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view invitations addressed to them" ON public.organization_invitations FOR SELECT USING ((normalized_email = lower(btrim((( SELECT auth.jwt() AS jwt) ->> 'email'::text)))));


--
-- Name: organization_rank_catalog Users can view organization rank catalog for rank-aware workspa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view organization rank catalog for rank-aware workspa" ON public.organization_rank_catalog FOR SELECT USING ((public.can_view_personnel(organization_id) OR public.can_view_calendar(organization_id) OR public.can_view_training(organization_id) OR public.can_view_critical_tasks(organization_id) OR public.can_export_organization_data(organization_id) OR public.can_update_organization_settings(organization_id)));


--
-- Name: organizations Users can view organizations they are invited to; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view organizations they are invited to" ON public.organizations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_invitations
  WHERE ((organization_invitations.organization_id = organizations.id) AND (organization_invitations.normalized_email = lower(btrim((( SELECT auth.jwt() AS jwt) ->> 'email'::text)))) AND (organization_invitations.status = 'pending'::public.invitation_status)))));


--
-- Name: organizations Users can view organizations they are members of; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view organizations they are members of" ON public.organizations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships
  WHERE ((organization_memberships.organization_id = organizations.id) AND (organization_memberships.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: beta_feedback Users can view own feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own feedback" ON public.beta_feedback FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: personnel_ict_completions Users can view personnel ICT completions if allowed by scoped c; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view personnel ICT completions if allowed by scoped c" ON public.personnel_ict_completions FOR SELECT TO authenticated USING (((organization_id, personnel_id) IN ( SELECT v.organization_id,
    v.personnel_id
   FROM member_access_private.viewable_personnel('criticalTasks'::text) v(organization_id, personnel_id))));


--
-- Name: personnel Users can view personnel if allowed by scoped personnel access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view personnel if allowed by scoped personnel access" ON public.personnel FOR SELECT USING (public.can_view_personnel_record(organization_id, group_id));


--
-- Name: personnel_training_history Users can view personnel training history if allowed by scoped ; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view personnel training history if allowed by scoped " ON public.personnel_training_history FOR SELECT TO authenticated USING (((organization_id, personnel_id) IN ( SELECT v.organization_id,
    v.personnel_id
   FROM member_access_private.viewable_personnel('training'::text) v(organization_id, personnel_id))));


--
-- Name: personnel_trainings Users can view personnel trainings if allowed by scoped trainin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view personnel trainings if allowed by scoped trainin" ON public.personnel_trainings FOR SELECT TO authenticated USING (((organization_id, personnel_id) IN ( SELECT v.organization_id,
    v.personnel_id
   FROM member_access_private.viewable_personnel('training'::text) v(organization_id, personnel_id))));


--
-- Name: rating_scheme_entries Users can view rating scheme entries if allowed by scoped ratin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view rating scheme entries if allowed by scoped ratin" ON public.rating_scheme_entries FOR SELECT USING (public.can_view_rating_scheme_record(organization_id, rated_person_id));


--
-- Name: special_days Users can view special days if they can view calendar data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view special days if they can view calendar data" ON public.special_days FOR SELECT USING (public.can_view_calendar(organization_id));


--
-- Name: status_types Users can view status types if they can view calendar data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view status types if they can view calendar data" ON public.status_types FOR SELECT USING (public.can_view_calendar(organization_id));


--
-- Name: user_org_preferences Users can view their own org preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own org preferences" ON public.user_org_preferences FOR SELECT USING (((( SELECT auth.uid() AS uid) = user_id) AND public.is_org_member(organization_id)));


--
-- Name: user_profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own profile" ON public.user_profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: training_types Users can view training types if they can view training data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view training types if they can view training data" ON public.training_types FOR SELECT USING (public.can_view_training(organization_id));


--
-- Name: access_request_organization_invitation_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.access_request_organization_invitation_links ENABLE ROW LEVEL SECURITY;

--
-- Name: access_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: account_setup_attempts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.account_setup_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: account_setup_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.account_setup_links ENABLE ROW LEVEL SECURITY;

--
-- Name: account_setup_rate_limits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.account_setup_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: announcement_dismissals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

--
-- Name: assignment_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.assignment_types ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_email_outbox; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.auth_email_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: availability_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.availability_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: beta_feedback; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_event_activity; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_event_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_tasking_activity; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_tasking_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_tasking_checklist_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_tasking_checklist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_tasking_equipment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_tasking_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_tasking_participants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_tasking_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_taskings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.calendar_taskings ENABLE ROW LEVEL SECURITY;

--
-- Name: counseling_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.counseling_records ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.daily_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_configs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.dashboard_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: data_exports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;

--
-- Name: deletion_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: deletion_requests deletion_requests_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deletion_requests_select_admin ON public.deletion_requests FOR SELECT USING (public.can_manage_org_members(organization_id));


--
-- Name: deletion_requests deletion_requests_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deletion_requests_select_own ON public.deletion_requests FOR SELECT USING ((requested_by = ( SELECT auth.uid() AS uid)));


--
-- Name: deletion_requests deletion_requests_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deletion_requests_update_admin ON public.deletion_requests FOR UPDATE USING (public.can_manage_org_members(organization_id));


--
-- Name: durable_rate_limits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.durable_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: beta_feedback feedback_operator_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feedback_operator_read ON public.beta_feedback FOR SELECT TO authenticated USING (public.is_platform_operator());


--
-- Name: feedback_replies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feedback_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_replies feedback_replies_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feedback_replies_read ON public.feedback_replies FOR SELECT TO authenticated USING ((public.is_platform_operator() OR (EXISTS ( SELECT 1
   FROM public.beta_feedback f
  WHERE ((f.id = feedback_replies.feedback_id) AND (f.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: feedback_staff_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feedback_staff_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_staff_notes feedback_staff_notes_operator_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feedback_staff_notes_operator_read ON public.feedback_staff_notes FOR SELECT TO authenticated USING (public.is_platform_operator());


--
-- Name: beta_feedback feedback_submit_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feedback_submit_own ON public.beta_feedback FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: ict_tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ict_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: leader_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.leader_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: onboarding_step_progress; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.onboarding_step_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_template_steps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.onboarding_template_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_creation_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organization_creation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_invitation_email_outbox; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organization_invitation_email_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_invitations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_memberships; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_rank_catalog; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organization_rank_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_setup; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organization_setup ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_suspensions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organization_suspensions ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: password_change_attempts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.password_change_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_attribute_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel_attribute_history ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_extended_info; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel_extended_info ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_follow_ups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel_follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_ict_completions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel_ict_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_onboardings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel_onboardings ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_training_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel_training_history ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_trainings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.personnel_trainings ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_announcements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_operators; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.platform_operators ENABLE ROW LEVEL SECURITY;

--
-- Name: rating_scheme_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rating_scheme_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: roster_excusals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.roster_excusals ENABLE ROW LEVEL SECURITY;

--
-- Name: roster_forms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.roster_forms ENABLE ROW LEVEL SECURITY;

--
-- Name: roster_starting_numbers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.roster_starting_numbers ENABLE ROW LEVEL SECURITY;

--
-- Name: roster_swaps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.roster_swaps ENABLE ROW LEVEL SECURITY;

--
-- Name: sign_in_rosters; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sign_in_rosters ENABLE ROW LEVEL SECURITY;

--
-- Name: sign_in_rosters sign_in_rosters_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY sign_in_rosters_delete ON public.sign_in_rosters FOR DELETE USING (public.can_access_sign_in_roster_scope(organization_id, scope_group_ids, 'operate'::text));


--
-- Name: sign_in_rosters sign_in_rosters_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY sign_in_rosters_insert ON public.sign_in_rosters FOR INSERT WITH CHECK (public.can_access_sign_in_roster(organization_id, personnel_ids, scope_group_ids, personnel_snapshot, 'operate'::text));


--
-- Name: sign_in_rosters sign_in_rosters_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY sign_in_rosters_select ON public.sign_in_rosters FOR SELECT USING (public.can_access_sign_in_roster_scope(organization_id, scope_group_ids, 'view'::text));


--
-- Name: sign_in_rosters sign_in_rosters_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY sign_in_rosters_update ON public.sign_in_rosters FOR UPDATE USING (public.can_access_sign_in_roster_scope(organization_id, scope_group_ids, 'operate'::text)) WITH CHECK (public.can_access_sign_in_roster(organization_id, personnel_ids, scope_group_ids, personnel_snapshot, 'operate'::text));


--
-- Name: special_days; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.special_days ENABLE ROW LEVEL SECURITY;

--
-- Name: status_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.status_types ENABLE ROW LEVEL SECURITY;

--
-- Name: training_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.training_types ENABLE ROW LEVEL SECURITY;

--
-- Name: training_views; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.training_views ENABLE ROW LEVEL SECURITY;

--
-- Name: user_email_identities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_email_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: user_org_preferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_org_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pinned_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_pinned_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_suspensions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;

--
-- Name: whats_new_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.whats_new_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA calendar_private; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA calendar_private TO authenticated;


--
-- Name: SCHEMA member_access_private; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA member_access_private TO authenticated;


--
-- Name: SCHEMA onboarding_private; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA onboarding_private TO authenticated;


--
-- Name: SCHEMA personnel_private; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA personnel_private TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION calendar_person_in_scope(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.calendar_person_in_scope(p_organization_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION calendar_private.calendar_person_in_scope(p_organization_id uuid, p_personnel_id uuid) TO authenticated;


--
-- Name: FUNCTION can_manage_calendar_events(p_organization_id uuid); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.can_manage_calendar_events(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION calendar_private.can_manage_calendar_events(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION can_manage_calendar_tasking(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.can_manage_calendar_tasking(p_organization_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION calendar_private.can_manage_calendar_tasking(p_organization_id uuid, p_group_id uuid) TO authenticated;


--
-- Name: FUNCTION can_replace_daily_assignment_rows(p_organization_id uuid, p_replace_days date[], p_slots jsonb); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.can_replace_daily_assignment_rows(p_organization_id uuid, p_replace_days date[], p_slots jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION calendar_private.can_replace_daily_assignment_rows(p_organization_id uuid, p_replace_days date[], p_slots jsonb) TO authenticated;


--
-- Name: FUNCTION can_view_calendar_events(p_organization_id uuid); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.can_view_calendar_events(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION calendar_private.can_view_calendar_events(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION can_view_calendar_tasking(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.can_view_calendar_tasking(p_organization_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION calendar_private.can_view_calendar_tasking(p_organization_id uuid, p_group_id uuid) TO authenticated;


--
-- Name: FUNCTION check_availability_tasking(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.check_availability_tasking() FROM PUBLIC;


--
-- Name: FUNCTION end_roster_swap(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.end_roster_swap() FROM PUBLIC;


--
-- Name: FUNCTION flag_picks_of_changed_person(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.flag_picks_of_changed_person() FROM PUBLIC;


--
-- Name: FUNCTION flag_picks_of_changed_tasking(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.flag_picks_of_changed_tasking() FROM PUBLIC;


--
-- Name: FUNCTION guard_roster_forms(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.guard_roster_forms() FROM PUBLIC;


--
-- Name: FUNCTION guard_roster_rules(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.guard_roster_rules() FROM PUBLIC;


--
-- Name: FUNCTION lock_calendar_tasking_for_list_write(p_organization_id uuid, p_tasking_id uuid, p_adding boolean); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.lock_calendar_tasking_for_list_write(p_organization_id uuid, p_tasking_id uuid, p_adding boolean) FROM PUBLIC;


--
-- Name: FUNCTION open_roster_form(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.open_roster_form() FROM PUBLIC;


--
-- Name: FUNCTION organization_wide_viewer_organizations(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.organization_wide_viewer_organizations() FROM PUBLIC;
GRANT ALL ON FUNCTION calendar_private.organization_wide_viewer_organizations() TO authenticated;


--
-- Name: FUNCTION record_calendar_event_activity(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.record_calendar_event_activity() FROM PUBLIC;


--
-- Name: FUNCTION record_calendar_tasking_activity(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.record_calendar_tasking_activity() FROM PUBLIC;


--
-- Name: FUNCTION record_calendar_tasking_checklist_activity(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.record_calendar_tasking_checklist_activity() FROM PUBLIC;


--
-- Name: FUNCTION record_calendar_tasking_equipment_activity(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.record_calendar_tasking_equipment_activity() FROM PUBLIC;


--
-- Name: FUNCTION record_deleted_calendar_event(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.record_deleted_calendar_event() FROM PUBLIC;


--
-- Name: FUNCTION record_tasking_equipment_return(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.record_tasking_equipment_return() FROM PUBLIC;


--
-- Name: FUNCTION require_roster_swap_access(p_organization_id uuid, p_today date); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.require_roster_swap_access(p_organization_id uuid, p_today date) FROM PUBLIC;


--
-- Name: FUNCTION review_picks_after_group_move(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.review_picks_after_group_move(p_organization_id uuid, p_group_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION stamp_calendar_event(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_event() FROM PUBLIC;


--
-- Name: FUNCTION stamp_calendar_tasking(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_tasking() FROM PUBLIC;


--
-- Name: FUNCTION stamp_calendar_tasking_checklist_item(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_tasking_checklist_item() FROM PUBLIC;


--
-- Name: FUNCTION stamp_calendar_tasking_equipment(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_tasking_equipment() FROM PUBLIC;


--
-- Name: FUNCTION stamp_daily_assignment_source(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.stamp_daily_assignment_source() FROM PUBLIC;


--
-- Name: FUNCTION tasking_conflicts(p_organization_id uuid); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.tasking_conflicts(p_organization_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION viewable_assignees(); Type: ACL; Schema: calendar_private; Owner: postgres
--

REVOKE ALL ON FUNCTION calendar_private.viewable_assignees() FROM PUBLIC;
GRANT ALL ON FUNCTION calendar_private.viewable_assignees() TO authenticated;


--
-- Name: FUNCTION viewable_personnel(p_lane text); Type: ACL; Schema: member_access_private; Owner: postgres
--

REVOKE ALL ON FUNCTION member_access_private.viewable_personnel(p_lane text) FROM PUBLIC;
GRANT ALL ON FUNCTION member_access_private.viewable_personnel(p_lane text) TO authenticated;


--
-- Name: FUNCTION admit_template_command(p_organization_id uuid); Type: ACL; Schema: onboarding_private; Owner: postgres
--

REVOKE ALL ON FUNCTION onboarding_private.admit_template_command(p_organization_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION admitted_member_training_is_off(p_organization_id uuid); Type: ACL; Schema: onboarding_private; Owner: postgres
--

REVOKE ALL ON FUNCTION onboarding_private.admitted_member_training_is_off(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_private.admitted_member_training_is_off(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION onboarding_parent_scope_matches(p_organization_id uuid, p_onboarding_id uuid); Type: ACL; Schema: onboarding_private; Owner: postgres
--

REVOKE ALL ON FUNCTION onboarding_private.onboarding_parent_scope_matches(p_organization_id uuid, p_onboarding_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_private.onboarding_parent_scope_matches(p_organization_id uuid, p_onboarding_id uuid) TO authenticated;
GRANT ALL ON FUNCTION onboarding_private.onboarding_parent_scope_matches(p_organization_id uuid, p_onboarding_id uuid) TO service_role;


--
-- Name: FUNCTION onboarding_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: onboarding_private; Owner: postgres
--

REVOKE ALL ON FUNCTION onboarding_private.onboarding_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_private.onboarding_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION onboarding_private.onboarding_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) TO service_role;


--
-- Name: FUNCTION onboarding_step_references_match(p_organization_id uuid, p_template_step_id uuid, p_training_type_id uuid); Type: ACL; Schema: onboarding_private; Owner: postgres
--

REVOKE ALL ON FUNCTION onboarding_private.onboarding_step_references_match(p_organization_id uuid, p_template_step_id uuid, p_training_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_private.onboarding_step_references_match(p_organization_id uuid, p_template_step_id uuid, p_training_type_id uuid) TO authenticated;
GRANT ALL ON FUNCTION onboarding_private.onboarding_step_references_match(p_organization_id uuid, p_template_step_id uuid, p_training_type_id uuid) TO service_role;


--
-- Name: FUNCTION onboarding_template_reference_matches(p_organization_id uuid, p_template_id uuid); Type: ACL; Schema: onboarding_private; Owner: postgres
--

REVOKE ALL ON FUNCTION onboarding_private.onboarding_template_reference_matches(p_organization_id uuid, p_template_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_private.onboarding_template_reference_matches(p_organization_id uuid, p_template_id uuid) TO authenticated;
GRANT ALL ON FUNCTION onboarding_private.onboarding_template_reference_matches(p_organization_id uuid, p_template_id uuid) TO service_role;


--
-- Name: FUNCTION require_template_configuration(p_organization_id uuid); Type: ACL; Schema: onboarding_private; Owner: postgres
--

REVOKE ALL ON FUNCTION onboarding_private.require_template_configuration(p_organization_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION touch_step_progress_changed_at(); Type: ACL; Schema: onboarding_private; Owner: postgres
--

REVOKE ALL ON FUNCTION onboarding_private.touch_step_progress_changed_at() FROM PUBLIC;


--
-- Name: FUNCTION apply_artifact_file_changes(p_kind text, p_attached text[], p_detached text[]); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.apply_artifact_file_changes(p_kind text, p_attached text[], p_detached text[]) FROM PUBLIC;


--
-- Name: FUNCTION archive_locked_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.archive_locked_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION artifact_bucket(p_kind text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.artifact_bucket(p_kind text) FROM PUBLIC;


--
-- Name: FUNCTION artifact_file_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.artifact_file_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION artifact_file_owned(p_kind text, p_organization_id uuid, p_personnel_id uuid, p_path text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.artifact_file_owned(p_kind text, p_organization_id uuid, p_personnel_id uuid, p_path text) FROM PUBLIC;


--
-- Name: FUNCTION artifact_file_referenced(p_kind text, p_path text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.artifact_file_referenced(p_kind text, p_path text) FROM PUBLIC;


--
-- Name: FUNCTION cascade_group_path(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.cascade_group_path() FROM PUBLIC;


--
-- Name: FUNCTION fence_inserted_artifact_files(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.fence_inserted_artifact_files() FROM PUBLIC;


--
-- Name: FUNCTION fence_inserted_roster_scans(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.fence_inserted_roster_scans() FROM PUBLIC;


--
-- Name: FUNCTION fence_training_certificates(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.fence_training_certificates() FROM PUBLIC;


--
-- Name: FUNCTION fence_updated_artifact_files(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.fence_updated_artifact_files() FROM PUBLIC;


--
-- Name: FUNCTION fence_updated_roster_scans(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.fence_updated_roster_scans() FROM PUBLIC;


--
-- Name: FUNCTION file_key_digest(p_bucket_id text, p_object_name text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.file_key_digest(p_bucket_id text, p_object_name text) FROM PUBLIC;


--
-- Name: FUNCTION file_key_lock(p_bucket_id text, p_object_name text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.file_key_lock(p_bucket_id text, p_object_name text) FROM PUBLIC;


--
-- Name: FUNCTION file_key_retired(p_bucket_id text, p_object_name text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.file_key_retired(p_bucket_id text, p_object_name text) FROM PUBLIC;


--
-- Name: FUNCTION group_within(p_organization_id uuid, p_group_id uuid, p_ancestor_id uuid); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.group_within(p_organization_id uuid, p_group_id uuid, p_ancestor_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION organization_private.group_within(p_organization_id uuid, p_group_id uuid, p_ancestor_id uuid) TO authenticated;


--
-- Name: FUNCTION guard_sign_in_roster(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.guard_sign_in_roster() FROM PUBLIC;


--
-- Name: FUNCTION keep_artifact_identity(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.keep_artifact_identity() FROM PUBLIC;


--
-- Name: FUNCTION lane_feature(p_lane text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.lane_feature(p_lane text) FROM PUBLIC;


--
-- Name: FUNCTION lock_file_key(p_bucket_id text, p_object_name text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.lock_file_key(p_bucket_id text, p_object_name text) FROM PUBLIC;


--
-- Name: TABLE sign_in_rosters; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sign_in_rosters TO anon;
GRANT ALL ON TABLE public.sign_in_rosters TO authenticated;
GRANT ALL ON TABLE public.sign_in_rosters TO service_role;


--
-- Name: FUNCTION lock_managed_sign_in_roster(p_organization_id uuid, p_roster_id uuid); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.lock_managed_sign_in_roster(p_organization_id uuid, p_roster_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION pending_roster_file_retirement(p_object_name text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.pending_roster_file_retirement(p_object_name text) FROM PUBLIC;


--
-- Name: FUNCTION promote_file_retirement_holds(p_limit integer); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.promote_file_retirement_holds(p_limit integer) FROM PUBLIC;


--
-- Name: FUNCTION record_personnel_attributes(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.record_personnel_attributes() FROM PUBLIC;


--
-- Name: FUNCTION require_access_scope_groups_in_organization(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_access_scope_groups_in_organization() FROM PUBLIC;


--
-- Name: FUNCTION require_artifact_file_under_person(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_artifact_file_under_person() FROM PUBLIC;


--
-- Name: FUNCTION require_award_tracking_enabled(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_award_tracking_enabled() FROM PUBLIC;


--
-- Name: FUNCTION require_configurable_personnel(p_organization_id uuid, p_personnel_ids uuid[]); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_configurable_personnel(p_organization_id uuid, p_personnel_ids uuid[]) FROM PUBLIC;


--
-- Name: FUNCTION require_configure_and_lock_personnel(p_organization_id uuid, p_personnel_ids uuid[]); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_configure_and_lock_personnel(p_organization_id uuid, p_personnel_ids uuid[]) FROM PUBLIC;


--
-- Name: FUNCTION require_empty_files_before_delete(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_empty_files_before_delete() FROM PUBLIC;


--
-- Name: FUNCTION require_managed_sign_in_roster(p_organization_id uuid, p_scope_group_ids uuid[]); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_managed_sign_in_roster(p_organization_id uuid, p_scope_group_ids uuid[]) FROM PUBLIC;


--
-- Name: FUNCTION require_onboarding_operation_rules(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_onboarding_operation_rules() FROM PUBLIC;


--
-- Name: FUNCTION require_personnel_lifecycle_authority(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_personnel_lifecycle_authority() FROM PUBLIC;


--
-- Name: FUNCTION require_registered_file_upload(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_registered_file_upload() FROM PUBLIC;


--
-- Name: FUNCTION require_training_certificate_under_person(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.require_training_certificate_under_person() FROM PUBLIC;


--
-- Name: FUNCTION restore_locked_personnel(p_organization_id uuid, p_personnel_id uuid, p_archived_at timestamp with time zone); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.restore_locked_personnel(p_organization_id uuid, p_personnel_id uuid, p_archived_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION retire_deleted_artifact_files(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.retire_deleted_artifact_files() FROM PUBLIC;


--
-- Name: FUNCTION retire_deleted_roster_scans(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.retire_deleted_roster_scans() FROM PUBLIC;


--
-- Name: FUNCTION retire_unreferenced_file(p_kind text, p_path text); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.retire_unreferenced_file(p_kind text, p_path text) FROM PUBLIC;


--
-- Name: FUNCTION set_group_path(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.set_group_path() FROM PUBLIC;


--
-- Name: FUNCTION stamp_archived_by(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.stamp_archived_by() FROM PUBLIC;


--
-- Name: FUNCTION stamp_follow_up_completed_by(); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.stamp_follow_up_completed_by() FROM PUBLIC;


--
-- Name: FUNCTION valid_setup_answers(p_answers jsonb); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.valid_setup_answers(p_answers jsonb) FROM PUBLIC;


--
-- Name: FUNCTION valid_setup_prompt(p_state jsonb); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.valid_setup_prompt(p_state jsonb) FROM PUBLIC;


--
-- Name: FUNCTION valid_setup_prompts(p_prompts jsonb); Type: ACL; Schema: organization_private; Owner: postgres
--

REVOKE ALL ON FUNCTION organization_private.valid_setup_prompts(p_prompts jsonb) FROM PUBLIC;


--
-- Name: FUNCTION can_use_group_pins(p_organization_id uuid); Type: ACL; Schema: personnel_private; Owner: postgres
--

REVOKE ALL ON FUNCTION personnel_private.can_use_group_pins(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION personnel_private.can_use_group_pins(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION lock_group_catalog(p_organization_id uuid); Type: ACL; Schema: personnel_private; Owner: postgres
--

REVOKE ALL ON FUNCTION personnel_private.lock_group_catalog(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION personnel_private.lock_group_catalog(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION require_group_manager(p_organization_id uuid); Type: ACL; Schema: personnel_private; Owner: postgres
--

REVOKE ALL ON FUNCTION personnel_private.require_group_manager(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION personnel_private.require_group_manager(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION require_top_level_group_pin(); Type: ACL; Schema: personnel_private; Owner: postgres
--

REVOKE ALL ON FUNCTION personnel_private.require_top_level_group_pin() FROM PUBLIC;


--
-- Name: FUNCTION accept_organization_invitation(p_invitation_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.accept_organization_invitation(p_invitation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_organization_invitation(p_invitation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.accept_organization_invitation(p_invitation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_organization_invitation(p_invitation_id uuid) TO service_role;


--
-- Name: FUNCTION access_request_setup_grant_is_live(p_access_request_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.access_request_setup_grant_is_live(p_access_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.access_request_setup_grant_is_live(p_access_request_id uuid) TO service_role;


--
-- Name: FUNCTION active_onboarding_calendar_personnel_ids(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.active_onboarding_calendar_personnel_ids(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.active_onboarding_calendar_personnel_ids(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.active_onboarding_calendar_personnel_ids(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION active_personnel_ict_completion_trend(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.active_personnel_ict_completion_trend(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.active_personnel_ict_completion_trend(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.active_personnel_ict_completion_trend(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.active_personnel_ict_completion_trend(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) TO service_role;


--
-- Name: TABLE special_days; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.special_days TO anon;
GRANT ALL ON TABLE public.special_days TO authenticated;
GRANT ALL ON TABLE public.special_days TO service_role;


--
-- Name: FUNCTION add_closure_days(p_organization_id uuid, p_name text, p_dates date[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.add_closure_days(p_organization_id uuid, p_name text, p_dates date[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_closure_days(p_organization_id uuid, p_name text, p_dates date[]) TO authenticated;


--
-- Name: FUNCTION append_onboarding_step_note(p_organization_id uuid, p_step_id uuid, p_text text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.append_onboarding_step_note(p_organization_id uuid, p_step_id uuid, p_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.append_onboarding_step_note(p_organization_id uuid, p_step_id uuid, p_text text) TO authenticated;


--
-- Name: FUNCTION approve_counseling_deletion_request(p_organization_id uuid, p_request_id uuid, p_record_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone, p_expected_file_path text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.approve_counseling_deletion_request(p_organization_id uuid, p_request_id uuid, p_record_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone, p_expected_file_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_counseling_deletion_request(p_organization_id uuid, p_request_id uuid, p_record_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone, p_expected_file_path text) TO service_role;


--
-- Name: FUNCTION approve_personnel_archive_request(p_organization_id uuid, p_request_id uuid, p_personnel_id uuid, p_reviewed_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.approve_personnel_archive_request(p_organization_id uuid, p_request_id uuid, p_personnel_id uuid, p_reviewed_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_personnel_archive_request(p_organization_id uuid, p_request_id uuid, p_personnel_id uuid, p_reviewed_at timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION approve_record_deletion_request(p_organization_id uuid, p_request_id uuid, p_resource_type text, p_resource_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.approve_record_deletion_request(p_organization_id uuid, p_request_id uuid, p_resource_type text, p_resource_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_record_deletion_request(p_organization_id uuid, p_request_id uuid, p_resource_type text, p_resource_id uuid, p_reviewer_id uuid, p_reviewed_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION archive_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.archive_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.archive_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION attach_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.attach_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.attach_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_object_name text) TO authenticated;


--
-- Name: FUNCTION calendar_deletion_references(p_organization_id uuid, p_personnel_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_deletion_references(p_organization_id uuid, p_personnel_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_deletion_references(p_organization_id uuid, p_personnel_id uuid, p_group_id uuid) TO authenticated;


--
-- Name: FUNCTION calendar_person_labels(p_organization_id uuid, p_personnel_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_person_labels(p_organization_id uuid, p_personnel_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_person_labels(p_organization_id uuid, p_personnel_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION calendar_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION calendar_range_projection(p_organization_id uuid, p_range_start date, p_range_end date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_range_projection(p_organization_id uuid, p_range_start date, p_range_end date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_range_projection(p_organization_id uuid, p_range_start date, p_range_end date) TO authenticated;


--
-- Name: FUNCTION calendar_roster_attribute_timelines(p_organization_id uuid, p_from date, p_through date, p_group_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_roster_attribute_timelines(p_organization_id uuid, p_from date, p_through date, p_group_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_roster_attribute_timelines(p_organization_id uuid, p_from date, p_through date, p_group_ids uuid[]) TO service_role;


--
-- Name: FUNCTION calendar_tasking_advisories(p_organization_id uuid, p_tasking_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_tasking_advisories(p_organization_id uuid, p_tasking_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_tasking_advisories(p_organization_id uuid, p_tasking_id uuid) TO authenticated;


--
-- Name: FUNCTION calendar_tasking_attention(p_organization_id uuid, p_today date, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_tasking_attention(p_organization_id uuid, p_today date, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_tasking_attention(p_organization_id uuid, p_today date, p_limit integer) TO authenticated;


--
-- Name: FUNCTION calendar_tasking_availability_gaps(p_organization_id uuid, p_tasking_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_tasking_availability_gaps(p_organization_id uuid, p_tasking_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_tasking_availability_gaps(p_organization_id uuid, p_tasking_id uuid) TO authenticated;


--
-- Name: FUNCTION calendar_tasking_conflict_people(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_tasking_conflict_people(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_tasking_conflict_people(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION calendar_tasking_dashboard(p_organization_id uuid, p_today date, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_tasking_dashboard(p_organization_id uuid, p_today date, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_tasking_dashboard(p_organization_id uuid, p_today date, p_limit integer) TO authenticated;


--
-- Name: FUNCTION calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid) TO authenticated;


--
-- Name: FUNCTION calendar_tasking_staffing(p_organization_id uuid, p_tasking_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_tasking_staffing(p_organization_id uuid, p_tasking_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_tasking_staffing(p_organization_id uuid, p_tasking_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION calendar_tasking_workspace(p_organization_id uuid, p_today date, p_event_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.calendar_tasking_workspace(p_organization_id uuid, p_today date, p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_tasking_workspace(p_organization_id uuid, p_today date, p_event_id uuid) TO authenticated;


--
-- Name: FUNCTION can_access_sign_in_roster(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb, p_required_capability text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_access_sign_in_roster(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb, p_required_capability text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_sign_in_roster(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb, p_required_capability text) TO anon;
GRANT ALL ON FUNCTION public.can_access_sign_in_roster(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb, p_required_capability text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_sign_in_roster(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb, p_required_capability text) TO service_role;


--
-- Name: FUNCTION can_access_sign_in_roster_scope(p_organization_id uuid, p_scope_group_ids uuid[], p_required_capability text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_access_sign_in_roster_scope(p_organization_id uuid, p_scope_group_ids uuid[], p_required_capability text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_sign_in_roster_scope(p_organization_id uuid, p_scope_group_ids uuid[], p_required_capability text) TO anon;
GRANT ALL ON FUNCTION public.can_access_sign_in_roster_scope(p_organization_id uuid, p_scope_group_ids uuid[], p_required_capability text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_sign_in_roster_scope(p_organization_id uuid, p_scope_group_ids uuid[], p_required_capability text) TO service_role;


--
-- Name: FUNCTION can_configure_personnel_record(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_configure_personnel_record(p_organization_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_configure_personnel_record(p_organization_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_configure_personnel_record(p_organization_id uuid, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION can_configure_personnel_training_record(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_configure_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_configure_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_configure_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_availability_record(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_availability_record(p_organization_id uuid, p_personnel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_availability_record(p_organization_id uuid, p_personnel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_availability_record(p_organization_id uuid, p_personnel_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_calendar(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_calendar(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_calendar(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_calendar(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_critical_tasks(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_critical_tasks(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_critical_tasks(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_critical_tasks(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_daily_assignment_record(p_organization_id uuid, p_assignment_type_id uuid, p_assignee_id text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_daily_assignment_record(p_organization_id uuid, p_assignment_type_id uuid, p_assignee_id text) TO anon;
GRANT ALL ON FUNCTION public.can_edit_daily_assignment_record(p_organization_id uuid, p_assignment_type_id uuid, p_assignee_id text) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_daily_assignment_record(p_organization_id uuid, p_assignment_type_id uuid, p_assignee_id text) TO service_role;


--
-- Name: FUNCTION can_edit_onboarding(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_onboarding(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_onboarding(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_onboarding(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_personnel(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_personnel(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_personnel(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_personnel(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_personnel_ict_completion_record(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_personnel_ict_completion_record(p_organization_id uuid, p_personnel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_personnel_ict_completion_record(p_organization_id uuid, p_personnel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_personnel_ict_completion_record(p_organization_id uuid, p_personnel_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_personnel_record(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_personnel_record(p_organization_id uuid, p_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_personnel_record(p_organization_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_personnel_record(p_organization_id uuid, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_personnel_training_record(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_personnel_training_record(p_organization_id uuid, p_personnel_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_personnel_training_record_with_type(p_organization_id uuid, p_personnel_id uuid, p_training_type_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_edit_personnel_training_record_with_type(p_organization_id uuid, p_personnel_id uuid, p_training_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_edit_personnel_training_record_with_type(p_organization_id uuid, p_personnel_id uuid, p_training_type_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_personnel_training_record_with_type(p_organization_id uuid, p_personnel_id uuid, p_training_type_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_rating_scheme(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_rating_scheme(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_rating_scheme(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_rating_scheme(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) TO service_role;


--
-- Name: FUNCTION can_edit_training(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_training(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_edit_training(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_training(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_export_organization_data(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_export_organization_data(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_export_organization_data(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_export_organization_data(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_manage_calendar_configuration(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_manage_calendar_configuration(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_manage_calendar_configuration(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_calendar_configuration(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_manage_groups(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_manage_groups(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_manage_groups(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_groups(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_manage_ict_task_library(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_manage_ict_task_library(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_manage_ict_task_library(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_ict_task_library(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_manage_onboarding_configuration(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_manage_onboarding_configuration(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_manage_onboarding_configuration(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_onboarding_configuration(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_manage_org_members(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_manage_org_members(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_manage_org_members(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_org_members(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_manage_training_configuration(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_manage_training_configuration(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_manage_training_configuration(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_training_configuration(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_update_organization_settings(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_update_organization_settings(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_update_organization_settings(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_update_organization_settings(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_calendar(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_calendar(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_calendar(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_calendar(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_critical_tasks(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_critical_tasks(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_critical_tasks(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_critical_tasks(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_groups(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_groups(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_groups(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_groups(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_onboarding(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_onboarding(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_onboarding(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_onboarding(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_personnel(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_personnel(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_personnel(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_personnel(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_personnel_record(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_personnel_record(p_organization_id uuid, p_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_personnel_record(p_organization_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_personnel_record(p_organization_id uuid, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_rating_scheme(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_rating_scheme(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_rating_scheme(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_rating_scheme(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_rating_scheme_record(p_organization_id uuid, p_rated_person_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_training(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_training(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_training(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_training(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION cancel_calendar_event(p_organization_id uuid, p_event_id uuid, p_reason text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.cancel_calendar_event(p_organization_id uuid, p_event_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_calendar_event(p_organization_id uuid, p_event_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION cancel_own_deletion_request(p_organization_id uuid, p_request_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.cancel_own_deletion_request(p_organization_id uuid, p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_own_deletion_request(p_organization_id uuid, p_request_id uuid) TO authenticated;


--
-- Name: FUNCTION check_account_setup_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.check_account_setup_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_account_setup_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION check_durable_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.check_durable_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_durable_rate_limit(p_bucket_key text, p_window_seconds integer, p_max_requests integer, p_checked_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION claim_account_setup_link_for_session(p_setup_link_id uuid, p_access_request_id uuid, p_claimed_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.claim_account_setup_link_for_session(p_setup_link_id uuid, p_access_request_id uuid, p_claimed_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_account_setup_link_for_session(p_setup_link_id uuid, p_access_request_id uuid, p_claimed_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION cleanup_old_audit_logs(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_old_audit_logs() TO service_role;


--
-- Name: FUNCTION close_roster_form(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_pool_rules jsonb, p_weekend_mode text, p_record jsonb, p_carry jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.close_roster_form(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_pool_rules jsonb, p_weekend_mode text, p_record jsonb, p_carry jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.close_roster_form(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_pool_rules jsonb, p_weekend_mode text, p_record jsonb, p_carry jsonb) TO service_role;


--
-- Name: FUNCTION complete_account_setup_recovery(p_source_setup_link_id uuid, p_target_setup_link_id uuid, p_target_access_request_id uuid, p_first_name text, p_last_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.complete_account_setup_recovery(p_source_setup_link_id uuid, p_target_setup_link_id uuid, p_target_access_request_id uuid, p_first_name text, p_last_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_account_setup_recovery(p_source_setup_link_id uuid, p_target_setup_link_id uuid, p_target_access_request_id uuid, p_first_name text, p_last_name text) TO service_role;


--
-- Name: FUNCTION complete_organization_file_retirements(p_bucket_id text, p_object_names text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.complete_organization_file_retirements(p_bucket_id text, p_object_names text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_organization_file_retirements(p_bucket_id text, p_object_names text[]) TO service_role;


--
-- Name: FUNCTION confirm_account_setup_create(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.confirm_account_setup_create() FROM PUBLIC;


--
-- Name: FUNCTION confirm_password_change_attempt(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.confirm_password_change_attempt() FROM PUBLIC;


--
-- Name: FUNCTION correct_training_completion(p_organization_id uuid, p_kind text, p_id uuid, p_completion_date date, p_expiration_date date, p_notes text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.correct_training_completion(p_organization_id uuid, p_kind text, p_id uuid, p_completion_date date, p_expiration_date date, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.correct_training_completion(p_organization_id uuid, p_kind text, p_id uuid, p_completion_date date, p_expiration_date date, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.correct_training_completion(p_organization_id uuid, p_kind text, p_id uuid, p_completion_date date, p_expiration_date date, p_notes text) TO service_role;


--
-- Name: FUNCTION count_memberships_by_organization(p_org_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.count_memberships_by_organization(p_org_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_memberships_by_organization(p_org_ids uuid[]) TO service_role;


--
-- Name: FUNCTION count_org_personnel(p_org_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.count_org_personnel(p_org_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_org_personnel(p_org_id uuid) TO service_role;


--
-- Name: FUNCTION count_personnel_by_organization(p_org_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.count_personnel_by_organization(p_org_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_personnel_by_organization(p_org_ids uuid[]) TO service_role;


--
-- Name: FUNCTION count_platform_users(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.count_platform_users() FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_platform_users() TO service_role;


--
-- Name: FUNCTION create_organization(p_name text, p_request_id uuid, p_defaults jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_organization(p_name text, p_request_id uuid, p_defaults jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_organization(p_name text, p_request_id uuid, p_defaults jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_organization(p_name text, p_request_id uuid, p_defaults jsonb) TO service_role;


--
-- Name: FUNCTION critical_tasks_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.critical_tasks_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.critical_tasks_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) TO service_role;


--
-- Name: FUNCTION current_session_sensitive_action_assured(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.current_session_sensitive_action_assured() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_session_sensitive_action_assured() TO authenticated;
GRANT ALL ON FUNCTION public.current_session_sensitive_action_assured() TO service_role;


--
-- Name: FUNCTION daily_signups_last_30_days(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.daily_signups_last_30_days() FROM PUBLIC;
GRANT ALL ON FUNCTION public.daily_signups_last_30_days() TO service_role;


--
-- Name: FUNCTION decline_organization_invitation(p_invitation_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.decline_organization_invitation(p_invitation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decline_organization_invitation(p_invitation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.decline_organization_invitation(p_invitation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.decline_organization_invitation(p_invitation_id uuid) TO service_role;


--
-- Name: FUNCTION delete_archived_personnel_artifact(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid, p_archived_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_archived_personnel_artifact(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid, p_archived_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_archived_personnel_artifact(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid, p_archived_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION delete_availability_entries(p_organization_id uuid, p_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_availability_entries(p_organization_id uuid, p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_availability_entries(p_organization_id uuid, p_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION delete_calendar_event(p_organization_id uuid, p_event_id uuid, p_taskings text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_calendar_event(p_organization_id uuid, p_event_id uuid, p_taskings text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_calendar_event(p_organization_id uuid, p_event_id uuid, p_taskings text) TO authenticated;


--
-- Name: FUNCTION delete_expired_personnel(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_expired_personnel(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_expired_personnel(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) TO service_role;


--
-- Name: FUNCTION delete_expired_unreferenced_assignment_types(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_expired_unreferenced_assignment_types(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_expired_unreferenced_assignment_types(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) TO service_role;


--
-- Name: FUNCTION delete_expired_unreferenced_critical_tasks(p_org_id uuid, p_cutoff timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_expired_unreferenced_critical_tasks(p_org_id uuid, p_cutoff timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_expired_unreferenced_critical_tasks(p_org_id uuid, p_cutoff timestamp with time zone) TO service_role;


--
-- Name: FUNCTION delete_group_with_reassignment(p_organization_id uuid, p_group_id uuid, p_target_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_group_with_reassignment(p_organization_id uuid, p_group_id uuid, p_target_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_group_with_reassignment(p_organization_id uuid, p_group_id uuid, p_target_group_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_onboarding_template(p_organization_id uuid, p_template_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_onboarding_template(p_organization_id uuid, p_template_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_onboarding_template(p_organization_id uuid, p_template_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_sign_in_roster(p_organization_id uuid, p_roster_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_sign_in_roster(p_organization_id uuid, p_roster_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_sign_in_roster(p_organization_id uuid, p_roster_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_unused_organization_rank_catalog_entry(p_organization_id uuid, p_entry_id uuid, p_code text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_unused_organization_rank_catalog_entry(p_organization_id uuid, p_entry_id uuid, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_unused_organization_rank_catalog_entry(p_organization_id uuid, p_entry_id uuid, p_code text) TO service_role;


--
-- Name: FUNCTION duplicate_onboarding_template(p_organization_id uuid, p_source_template_id uuid, p_request_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.duplicate_onboarding_template(p_organization_id uuid, p_source_template_id uuid, p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.duplicate_onboarding_template(p_organization_id uuid, p_source_template_id uuid, p_request_id uuid) TO authenticated;


--
-- Name: FUNCTION enforce_personnel_document_storage_cap(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.enforce_personnel_document_storage_cap() TO anon;
GRANT ALL ON FUNCTION public.enforce_personnel_document_storage_cap() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_personnel_document_storage_cap() TO service_role;


--
-- Name: TABLE organization_setup; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.organization_setup TO service_role;


--
-- Name: FUNCTION export_organization_setup(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.export_organization_setup(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.export_organization_setup(p_organization_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.export_organization_setup(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION feature_is_off(p_organization_id uuid, p_feature text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.feature_is_off(p_organization_id uuid, p_feature text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.feature_is_off(p_organization_id uuid, p_feature text) TO service_role;


--
-- Name: FUNCTION fence_failed_account_setup_attempt(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.fence_failed_account_setup_attempt() FROM PUBLIC;


--
-- Name: FUNCTION finish_organization_setup(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finish_organization_setup(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_organization_setup(p_organization_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.finish_organization_setup(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION get_current_session_started_at(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_current_session_started_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_current_session_started_at() TO authenticated;


--
-- Name: FUNCTION guard_onboarding_workflow_identity(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.guard_onboarding_workflow_identity() TO anon;
GRANT ALL ON FUNCTION public.guard_onboarding_workflow_identity() TO authenticated;
GRANT ALL ON FUNCTION public.guard_onboarding_workflow_identity() TO service_role;


--
-- Name: FUNCTION import_availability_entries(p_organization_id uuid, p_entries jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.import_availability_entries(p_organization_id uuid, p_entries jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_availability_entries(p_organization_id uuid, p_entries jsonb) TO authenticated;


--
-- Name: FUNCTION is_org_member(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_org_member(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_org_member(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_org_member(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION is_org_owner(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_org_owner(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_org_owner(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_org_owner(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION is_org_privileged(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_org_privileged(p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_org_privileged(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_org_privileged(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION is_platform_operator(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_platform_operator() TO anon;
GRANT ALL ON FUNCTION public.is_platform_operator() TO authenticated;
GRANT ALL ON FUNCTION public.is_platform_operator() TO service_role;


--
-- Name: FUNCTION is_roster_form_rules(p_rules jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_roster_form_rules(p_rules jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_roster_form_rules(p_rules jsonb) TO anon;
GRANT ALL ON FUNCTION public.is_roster_form_rules(p_rules jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.is_roster_form_rules(p_rules jsonb) TO service_role;


--
-- Name: FUNCTION is_roster_pool_rules(p_rules jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_roster_pool_rules(p_rules jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_roster_pool_rules(p_rules jsonb) TO anon;
GRANT ALL ON FUNCTION public.is_roster_pool_rules(p_rules jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.is_roster_pool_rules(p_rules jsonb) TO service_role;


--
-- Name: FUNCTION is_user_suspended(check_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_user_suspended(check_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_user_suspended(check_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_user_suspended(check_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_valid_sensitive_file_path(bucket_name text, object_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_valid_sensitive_file_path(bucket_name text, object_name text) TO anon;
GRANT ALL ON FUNCTION public.is_valid_sensitive_file_path(bucket_name text, object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.is_valid_sensitive_file_path(bucket_name text, object_name text) TO service_role;


--
-- Name: FUNCTION issue_account_setup_link(p_access_request_id uuid, p_token_hash text, p_expires_at timestamp with time zone, p_created_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.issue_account_setup_link(p_access_request_id uuid, p_token_hash text, p_expires_at timestamp with time zone, p_created_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.issue_account_setup_link(p_access_request_id uuid, p_token_hash text, p_expires_at timestamp with time zone, p_created_at timestamp with time zone) TO service_role;


--
-- Name: TABLE personnel_ict_completions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.personnel_ict_completions TO anon;
GRANT ALL ON TABLE public.personnel_ict_completions TO authenticated;
GRANT ALL ON TABLE public.personnel_ict_completions TO service_role;


--
-- Name: FUNCTION latest_active_personnel_ict_completions(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.latest_active_personnel_ict_completions(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.latest_active_personnel_ict_completions(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.latest_active_personnel_ict_completions(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.latest_active_personnel_ict_completions(p_organization_id uuid, p_personnel_ids uuid[], p_ict_task_ids uuid[]) TO service_role;


--
-- Name: FUNCTION link_organization_invitation_access_request(p_invitation_id uuid, p_organization_id uuid, p_email text, p_invited_by uuid, p_invited_at timestamp with time zone, p_role text, p_member_preset text, p_capability_overrides jsonb, p_access_scope_kind text, p_access_scope_group_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.link_organization_invitation_access_request(p_invitation_id uuid, p_organization_id uuid, p_email text, p_invited_by uuid, p_invited_at timestamp with time zone, p_role text, p_member_preset text, p_capability_overrides jsonb, p_access_scope_kind text, p_access_scope_group_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_organization_invitation_access_request(p_invitation_id uuid, p_organization_id uuid, p_email text, p_invited_by uuid, p_invited_at timestamp with time zone, p_role text, p_member_preset text, p_capability_overrides jsonb, p_access_scope_kind text, p_access_scope_group_ids uuid[]) TO service_role;


--
-- Name: FUNCTION list_audit_log_actions(p_org_id uuid, p_excluded_actions text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.list_audit_log_actions(p_org_id uuid, p_excluded_actions text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_audit_log_actions(p_org_id uuid, p_excluded_actions text[]) TO service_role;


--
-- Name: FUNCTION list_calendar_event_tasking_summaries(p_organization_id uuid, p_event_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.list_calendar_event_tasking_summaries(p_organization_id uuid, p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_calendar_event_tasking_summaries(p_organization_id uuid, p_event_id uuid) TO authenticated;


--
-- Name: FUNCTION list_pending_organization_file_retirements(p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.list_pending_organization_file_retirements(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_pending_organization_file_retirements(p_limit integer) TO service_role;


--
-- Name: FUNCTION list_personnel_award_tracking_acknowledged(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.list_personnel_award_tracking_acknowledged(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_personnel_award_tracking_acknowledged(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_personnel_award_tracking_acknowledged(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION list_platform_activity(p_actions text[], p_prefixes text[], p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.list_platform_activity(p_actions text[], p_prefixes text[], p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_platform_activity(p_actions text[], p_prefixes text[], p_search text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION list_platform_owner_membership_metrics(p_org_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.list_platform_owner_membership_metrics(p_org_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_platform_owner_membership_metrics(p_org_ids uuid[]) TO service_role;


--
-- Name: FUNCTION list_rating_scheme_personnel_lookup(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.list_rating_scheme_personnel_lookup(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_rating_scheme_personnel_lookup(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_rating_scheme_personnel_lookup(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION list_roster_detail_days(p_organization_id uuid, p_assignment_type_id uuid, p_from date, p_through date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.list_roster_detail_days(p_organization_id uuid, p_assignment_type_id uuid, p_from date, p_through date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_roster_detail_days(p_organization_id uuid, p_assignment_type_id uuid, p_from date, p_through date) TO authenticated;


--
-- Name: TABLE organization_invitation_email_outbox; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.organization_invitation_email_outbox TO service_role;
GRANT SELECT ON TABLE public.organization_invitation_email_outbox TO authenticated;


--
-- Name: FUNCTION mark_organization_invitation_email_outbox_delivery(p_outbox_id uuid, p_status text, p_marked_at timestamp with time zone, p_last_error text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_organization_invitation_email_outbox_delivery(p_outbox_id uuid, p_status text, p_marked_at timestamp with time zone, p_last_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_organization_invitation_email_outbox_delivery(p_outbox_id uuid, p_status text, p_marked_at timestamp with time zone, p_last_error text) TO service_role;


--
-- Name: FUNCTION member_access_capability_level(p_can_view boolean, p_can_edit boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.member_access_capability_level(p_can_view boolean, p_can_edit boolean) TO anon;
GRANT ALL ON FUNCTION public.member_access_capability_level(p_can_view boolean, p_can_edit boolean) TO authenticated;
GRANT ALL ON FUNCTION public.member_access_capability_level(p_can_view boolean, p_can_edit boolean) TO service_role;


--
-- Name: FUNCTION member_access_capability_override(p_base_level text, p_can_view boolean, p_can_edit boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.member_access_capability_override(p_base_level text, p_can_view boolean, p_can_edit boolean) TO anon;
GRANT ALL ON FUNCTION public.member_access_capability_override(p_base_level text, p_can_view boolean, p_can_edit boolean) TO authenticated;
GRANT ALL ON FUNCTION public.member_access_capability_override(p_base_level text, p_can_view boolean, p_can_edit boolean) TO service_role;


--
-- Name: FUNCTION member_access_group_scope_matches(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.member_access_group_scope_matches(p_organization_id uuid, p_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.member_access_group_scope_matches(p_organization_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.member_access_group_scope_matches(p_organization_id uuid, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION member_access_has_capability(p_organization_id uuid, p_lane text, p_required_capability text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.member_access_has_capability(p_organization_id uuid, p_lane text, p_required_capability text) TO anon;
GRANT ALL ON FUNCTION public.member_access_has_capability(p_organization_id uuid, p_lane text, p_required_capability text) TO authenticated;
GRANT ALL ON FUNCTION public.member_access_has_capability(p_organization_id uuid, p_lane text, p_required_capability text) TO service_role;


--
-- Name: FUNCTION member_access_lane_capability(p_member_preset text, p_capability_overrides jsonb, p_lane text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.member_access_lane_capability(p_member_preset text, p_capability_overrides jsonb, p_lane text) TO anon;
GRANT ALL ON FUNCTION public.member_access_lane_capability(p_member_preset text, p_capability_overrides jsonb, p_lane text) TO authenticated;
GRANT ALL ON FUNCTION public.member_access_lane_capability(p_member_preset text, p_capability_overrides jsonb, p_lane text) TO service_role;


--
-- Name: FUNCTION member_access_required_capability_rank(p_capability text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.member_access_required_capability_rank(p_capability text) TO anon;
GRANT ALL ON FUNCTION public.member_access_required_capability_rank(p_capability text) TO authenticated;
GRANT ALL ON FUNCTION public.member_access_required_capability_rank(p_capability text) TO service_role;


--
-- Name: FUNCTION onboarding_template_training_type_matches(p_organization_id uuid, p_training_type_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.onboarding_template_training_type_matches(p_organization_id uuid, p_training_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.onboarding_template_training_type_matches(p_organization_id uuid, p_training_type_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.onboarding_template_training_type_matches(p_organization_id uuid, p_training_type_id uuid) TO service_role;


--
-- Name: FUNCTION organization_access_admitted(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.organization_access_admitted(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.organization_access_admitted(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION organization_access_admitted(p_organization_id uuid, p_feature text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.organization_access_admitted(p_organization_id uuid, p_feature text) FROM PUBLIC;


--
-- Name: FUNCTION organization_feature_enabled(p_organization_id uuid, p_feature text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.organization_feature_enabled(p_organization_id uuid, p_feature text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.organization_feature_enabled(p_organization_id uuid, p_feature text) TO authenticated;


--
-- Name: FUNCTION organization_member_labels(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.organization_member_labels(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.organization_member_labels(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION organization_rank_catalog_reference_matches(p_value text, p_code text, p_allow_normalized boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.organization_rank_catalog_reference_matches(p_value text, p_code text, p_allow_normalized boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.organization_rank_catalog_reference_matches(p_value text, p_code text, p_allow_normalized boolean) TO anon;
GRANT ALL ON FUNCTION public.organization_rank_catalog_reference_matches(p_value text, p_code text, p_allow_normalized boolean) TO authenticated;
GRANT ALL ON FUNCTION public.organization_rank_catalog_reference_matches(p_value text, p_code text, p_allow_normalized boolean) TO service_role;


--
-- Name: FUNCTION organization_storage_object_is_owner_removable(bucket_name text, object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.organization_storage_object_is_owner_removable(bucket_name text, object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.organization_storage_object_is_owner_removable(bucket_name text, object_name text) TO service_role;
GRANT ALL ON FUNCTION public.organization_storage_object_is_owner_removable(bucket_name text, object_name text) TO authenticated;


--
-- Name: FUNCTION password_change_attempt(p_actor uuid, p_session uuid, p_action text, p_flow text, p_expires_at timestamp with time zone, p_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.password_change_attempt(p_actor uuid, p_session uuid, p_action text, p_flow text, p_expires_at timestamp with time zone, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.password_change_attempt(p_actor uuid, p_session uuid, p_action text, p_flow text, p_expires_at timestamp with time zone, p_id uuid) TO service_role;


--
-- Name: FUNCTION personnel_extended_info_scope_matches(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.personnel_extended_info_scope_matches(p_organization_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.personnel_extended_info_scope_matches(p_organization_id uuid, p_personnel_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.personnel_extended_info_scope_matches(p_organization_id uuid, p_personnel_id uuid) TO authenticated;


--
-- Name: FUNCTION personnel_file_artifact_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.personnel_file_artifact_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.personnel_file_artifact_deletion(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid) TO service_role;


--
-- Name: FUNCTION personnel_sensitive_artifact_is_readable(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.personnel_sensitive_artifact_is_readable(p_organization_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.personnel_sensitive_artifact_is_readable(p_organization_id uuid, p_personnel_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.personnel_sensitive_artifact_is_readable(p_organization_id uuid, p_personnel_id uuid) TO authenticated;


--
-- Name: FUNCTION platform_account_directory(p_search text, p_filter text, p_page integer, p_limit integer, p_sort text, p_dir text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_account_directory(p_search text, p_filter text, p_page integer, p_limit integer, p_sort text, p_dir text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_account_directory(p_search text, p_filter text, p_page integer, p_limit integer, p_sort text, p_dir text) TO service_role;


--
-- Name: FUNCTION platform_announcement_dismissal_counts(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_announcement_dismissal_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_announcement_dismissal_counts() TO service_role;


--
-- Name: FUNCTION platform_inbox_stats(p_since timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_inbox_stats(p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_inbox_stats(p_since timestamp with time zone) TO service_role;


--
-- Name: FUNCTION platform_list_organizations(p_search text, p_filter text, p_page integer, p_page_size integer, p_sort text, p_dir text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_list_organizations(p_search text, p_filter text, p_page integer, p_page_size integer, p_sort text, p_dir text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_list_organizations(p_search text, p_filter text, p_page integer, p_page_size integer, p_sort text, p_dir text) TO service_role;


--
-- Name: FUNCTION platform_organization_detail(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_organization_detail(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_organization_detail(p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION platform_organization_status(p_suspended_at timestamp with time zone, p_last_active_at timestamp with time zone, p_created_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_organization_status(p_suspended_at timestamp with time zone, p_last_active_at timestamp with time zone, p_created_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_organization_status(p_suspended_at timestamp with time zone, p_last_active_at timestamp with time zone, p_created_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION platform_setup_email_inbox(p_tab text, p_limit integer, p_now timestamp with time zone, p_link_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_setup_email_inbox(p_tab text, p_limit integer, p_now timestamp with time zone, p_link_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_setup_email_inbox(p_tab text, p_limit integer, p_now timestamp with time zone, p_link_id uuid) TO service_role;


--
-- Name: FUNCTION platform_suspend_organization(p_actor_user_id uuid, p_organization_id uuid, p_reason text, p_suspended_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_suspend_organization(p_actor_user_id uuid, p_organization_id uuid, p_reason text, p_suspended_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_suspend_organization(p_actor_user_id uuid, p_organization_id uuid, p_reason text, p_suspended_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION platform_transfer_org_ownership(p_actor_user_id uuid, p_organization_id uuid, p_target_user_id uuid, p_confirm_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_transfer_org_ownership(p_actor_user_id uuid, p_organization_id uuid, p_target_user_id uuid, p_confirm_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_transfer_org_ownership(p_actor_user_id uuid, p_organization_id uuid, p_target_user_id uuid, p_confirm_name text) TO service_role;


--
-- Name: FUNCTION platform_unsuspend_organization(p_actor_user_id uuid, p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.platform_unsuspend_organization(p_actor_user_id uuid, p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_unsuspend_organization(p_actor_user_id uuid, p_organization_id uuid) TO service_role;


--
-- Name: FUNCTION prevent_account_setup_email_change(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.prevent_account_setup_email_change() FROM PUBLIC;


--
-- Name: FUNCTION prevent_organization_rank_catalog_org_move(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prevent_organization_rank_catalog_org_move() TO anon;
GRANT ALL ON FUNCTION public.prevent_organization_rank_catalog_org_move() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_organization_rank_catalog_org_move() TO service_role;


--
-- Name: FUNCTION rating_scheme_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rating_scheme_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rating_scheme_personnel_group_scope_matches(p_organization_id uuid, p_group_id uuid) TO service_role;


--
-- Name: FUNCTION read_calendar_tasking_activity(p_organization_id uuid, p_tasking_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.read_calendar_tasking_activity(p_organization_id uuid, p_tasking_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.read_calendar_tasking_activity(p_organization_id uuid, p_tasking_id uuid) TO authenticated;


--
-- Name: FUNCTION read_organization_setup(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.read_organization_setup(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.read_organization_setup(p_organization_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.read_organization_setup(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION read_request_member_access(p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.read_request_member_access(p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.read_request_member_access(p_organization_id uuid) TO authenticated;


--
-- Name: FUNCTION reconcile_account_setup_claim(p_target_setup_link_id uuid, p_target_access_request_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reconcile_account_setup_claim(p_target_setup_link_id uuid, p_target_access_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reconcile_account_setup_claim(p_target_setup_link_id uuid, p_target_access_request_id uuid) TO service_role;


--
-- Name: FUNCTION reconcile_onboarding_packet(p_organization_id uuid, p_onboarding_id uuid, p_new_template_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reconcile_onboarding_packet(p_organization_id uuid, p_onboarding_id uuid, p_new_template_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reconcile_onboarding_packet(p_organization_id uuid, p_onboarding_id uuid, p_new_template_id uuid) TO authenticated;


--
-- Name: FUNCTION reconcile_personnel_file_attachment(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reconcile_personnel_file_attachment(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reconcile_personnel_file_attachment(p_organization_id uuid, p_personnel_id uuid, p_kind text, p_object_name text) TO service_role;


--
-- Name: FUNCTION record_superseded_training_completion(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.record_superseded_training_completion() FROM PUBLIC;


--
-- Name: FUNCTION register_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.register_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text) TO service_role;


--
-- Name: FUNCTION reject_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reject_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reject_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid) TO service_role;


--
-- Name: FUNCTION release_account_setup_claim_for_staff(p_setup_link_id uuid, p_access_request_id uuid, p_operator_user_id uuid, p_release_reason text, p_evidence_reference text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.release_account_setup_claim_for_staff(p_setup_link_id uuid, p_access_request_id uuid, p_operator_user_id uuid, p_release_reason text, p_evidence_reference text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_account_setup_claim_for_staff(p_setup_link_id uuid, p_access_request_id uuid, p_operator_user_id uuid, p_release_reason text, p_evidence_reference text) TO service_role;


--
-- Name: FUNCTION remove_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_expected_object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.remove_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_expected_object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_expected_object_name text) TO authenticated;


--
-- Name: FUNCTION rename_group(p_organization_id uuid, p_group_id uuid, p_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rename_group(p_organization_id uuid, p_group_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rename_group(p_organization_id uuid, p_group_id uuid, p_name text) TO authenticated;


--
-- Name: FUNCTION reorder_calendar_tasking_list(p_organization_id uuid, p_tasking_id uuid, p_list text, p_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reorder_calendar_tasking_list(p_organization_id uuid, p_tasking_id uuid, p_list text, p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_calendar_tasking_list(p_organization_id uuid, p_tasking_id uuid, p_list text, p_ids uuid[]) TO authenticated;


--
-- Name: TABLE ict_tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ict_tasks TO anon;
GRANT ALL ON TABLE public.ict_tasks TO authenticated;
GRANT ALL ON TABLE public.ict_tasks TO service_role;


--
-- Name: FUNCTION reorder_ict_tasks(p_organization_id uuid, p_changes jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reorder_ict_tasks(p_organization_id uuid, p_changes jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_ict_tasks(p_organization_id uuid, p_changes jsonb) TO authenticated;


--
-- Name: FUNCTION reorder_onboarding_template_steps(p_organization_id uuid, p_template_id uuid, p_step_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reorder_onboarding_template_steps(p_organization_id uuid, p_template_id uuid, p_step_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_onboarding_template_steps(p_organization_id uuid, p_template_id uuid, p_step_ids uuid[]) TO authenticated;


--
-- Name: TABLE daily_assignments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.daily_assignments TO anon;
GRANT ALL ON TABLE public.daily_assignments TO authenticated;
GRANT ALL ON TABLE public.daily_assignments TO service_role;


--
-- Name: FUNCTION replace_daily_assignment_slots(p_organization_id uuid, p_replace_days date[], p_slots jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.replace_daily_assignment_slots(p_organization_id uuid, p_replace_days date[], p_slots jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_daily_assignment_slots(p_organization_id uuid, p_replace_days date[], p_slots jsonb) TO authenticated;


--
-- Name: FUNCTION reply_to_feedback(p_feedback_id uuid, p_body text, p_close boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reply_to_feedback(p_feedback_id uuid, p_body text, p_close boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reply_to_feedback(p_feedback_id uuid, p_body text, p_close boolean) TO authenticated;
GRANT ALL ON FUNCTION public.reply_to_feedback(p_feedback_id uuid, p_body text, p_close boolean) TO service_role;


--
-- Name: FUNCTION reply_to_own_feedback(p_feedback_id uuid, p_body text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reply_to_own_feedback(p_feedback_id uuid, p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reply_to_own_feedback(p_feedback_id uuid, p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.reply_to_own_feedback(p_feedback_id uuid, p_body text) TO service_role;


--
-- Name: FUNCTION rescind_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rescind_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rescind_access_request_and_block_linked_invitations(p_access_request_id uuid, p_reviewer_id uuid) TO service_role;


--
-- Name: FUNCTION reset_federal_holidays(p_organization_id uuid, p_holidays jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reset_federal_holidays(p_organization_id uuid, p_holidays jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_federal_holidays(p_organization_id uuid, p_holidays jsonb) TO authenticated;


--
-- Name: FUNCTION restore_personnel(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.restore_personnel(p_organization_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.restore_personnel(p_organization_id uuid, p_personnel_id uuid) TO authenticated;


--
-- Name: FUNCTION revoke_organization_invitation(p_invitation_id uuid, p_organization_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revoke_organization_invitation(p_invitation_id uuid, p_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_organization_invitation(p_invitation_id uuid, p_organization_id uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_organization_invitation(p_invitation_id uuid, p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_organization_invitation(p_invitation_id uuid, p_organization_id uuid) TO service_role;


--
-- Name: TABLE roster_forms; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.roster_forms TO anon;
GRANT ALL ON TABLE public.roster_forms TO authenticated;
GRANT ALL ON TABLE public.roster_forms TO service_role;


--
-- Name: FUNCTION roster_form_effective_start(p_form public.roster_forms); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.roster_form_effective_start(p_form public.roster_forms) FROM PUBLIC;
GRANT ALL ON FUNCTION public.roster_form_effective_start(p_form public.roster_forms) TO authenticated;
GRANT ALL ON FUNCTION public.roster_form_effective_start(p_form public.roster_forms) TO service_role;


--
-- Name: FUNCTION roster_signals(p_organization_id uuid, p_as_of date, p_since date, p_sources text[], p_personnel_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.roster_signals(p_organization_id uuid, p_as_of date, p_since date, p_sources text[], p_personnel_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.roster_signals(p_organization_id uuid, p_as_of date, p_since date, p_sources text[], p_personnel_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION save_calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid, p_personnel_ids uuid[], p_kept_ids uuid[], p_remove_outside_scope boolean, p_expected_revision integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid, p_personnel_ids uuid[], p_kept_ids uuid[], p_remove_outside_scope boolean, p_expected_revision integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid, p_personnel_ids uuid[], p_kept_ids uuid[], p_remove_outside_scope boolean, p_expected_revision integer) TO authenticated;


--
-- Name: FUNCTION save_feedback_github_issue(p_feedback_id uuid, p_issue_number integer, p_issue_url text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_feedback_github_issue(p_feedback_id uuid, p_issue_number integer, p_issue_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_feedback_github_issue(p_feedback_id uuid, p_issue_number integer, p_issue_url text) TO authenticated;
GRANT ALL ON FUNCTION public.save_feedback_github_issue(p_feedback_id uuid, p_issue_number integer, p_issue_url text) TO service_role;


--
-- Name: FUNCTION save_feedback_staff_note(p_feedback_id uuid, p_body text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_feedback_staff_note(p_feedback_id uuid, p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_feedback_staff_note(p_feedback_id uuid, p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.save_feedback_staff_note(p_feedback_id uuid, p_body text) TO service_role;


--
-- Name: FUNCTION save_organization_setup_answer(p_organization_id uuid, p_step text, p_answer text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_organization_setup_answer(p_organization_id uuid, p_step text, p_answer text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_organization_setup_answer(p_organization_id uuid, p_step text, p_answer text) TO service_role;
GRANT ALL ON FUNCTION public.save_organization_setup_answer(p_organization_id uuid, p_step text, p_answer text) TO authenticated;


--
-- Name: FUNCTION save_organization_setup_branch(p_organization_id uuid, p_branch text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_organization_setup_branch(p_organization_id uuid, p_branch text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_organization_setup_branch(p_organization_id uuid, p_branch text) TO service_role;
GRANT ALL ON FUNCTION public.save_organization_setup_branch(p_organization_id uuid, p_branch text) TO authenticated;


--
-- Name: FUNCTION save_organization_setup_prompt(p_organization_id uuid, p_key text, p_state jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_organization_setup_prompt(p_organization_id uuid, p_key text, p_state jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_organization_setup_prompt(p_organization_id uuid, p_key text, p_state jsonb) TO service_role;
GRANT ALL ON FUNCTION public.save_organization_setup_prompt(p_organization_id uuid, p_key text, p_state jsonb) TO authenticated;


--
-- Name: FUNCTION search_users_by_email(search_query text, max_results integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.search_users_by_email(search_query text, max_results integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_users_by_email(search_query text, max_results integer) TO service_role;


--
-- Name: FUNCTION sensitive_file_object_is_readable(bucket_name text, object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sensitive_file_object_is_readable(bucket_name text, object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sensitive_file_object_is_readable(bucket_name text, object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.sensitive_file_object_is_readable(bucket_name text, object_name text) TO service_role;


--
-- Name: FUNCTION sensitive_file_object_is_writable(bucket_name text, object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sensitive_file_object_is_writable(bucket_name text, object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sensitive_file_object_is_writable(bucket_name text, object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.sensitive_file_object_is_writable(bucket_name text, object_name text) TO service_role;


--
-- Name: FUNCTION set_calendar_lanes(p_organization_id uuid, p_lane_type_ids uuid[], p_expected_lane_type_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_calendar_lanes(p_organization_id uuid, p_lane_type_ids uuid[], p_expected_lane_type_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_calendar_lanes(p_organization_id uuid, p_lane_type_ids uuid[], p_expected_lane_type_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION set_critical_tasks_defaults(p_organization_id uuid, p_default_expiration_months integer, p_expiring_soon_warning_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_critical_tasks_defaults(p_organization_id uuid, p_default_expiration_months integer, p_expiring_soon_warning_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_critical_tasks_defaults(p_organization_id uuid, p_default_expiration_months integer, p_expiring_soon_warning_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.set_critical_tasks_defaults(p_organization_id uuid, p_default_expiration_months integer, p_expiring_soon_warning_days integer) TO service_role;


--
-- Name: FUNCTION set_group_order(p_organization_id uuid, p_group_ids uuid[], p_expected_group_ids uuid[], p_parent_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_group_order(p_organization_id uuid, p_group_ids uuid[], p_expected_group_ids uuid[], p_parent_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_group_order(p_organization_id uuid, p_group_ids uuid[], p_expected_group_ids uuid[], p_parent_id uuid) TO authenticated;


--
-- Name: FUNCTION set_roster_excusals(p_organization_id uuid, p_assignment_type_id uuid, p_today date, p_excusals jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_roster_excusals(p_organization_id uuid, p_assignment_type_id uuid, p_today date, p_excusals jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_roster_excusals(p_organization_id uuid, p_assignment_type_id uuid, p_today date, p_excusals jsonb) TO authenticated;


--
-- Name: FUNCTION set_roster_starting_numbers(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_numbers jsonb, p_repicks jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_roster_starting_numbers(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_numbers jsonb, p_repicks jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_roster_starting_numbers(p_actor uuid, p_organization_id uuid, p_assignment_type_id uuid, p_form_id uuid, p_today date, p_numbers jsonb, p_repicks jsonb) TO service_role;


--
-- Name: FUNCTION set_status_type_order(p_organization_id uuid, p_status_type_ids uuid[], p_expected_status_type_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_status_type_order(p_organization_id uuid, p_status_type_ids uuid[], p_expected_status_type_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_status_type_order(p_organization_id uuid, p_status_type_ids uuid[], p_expected_status_type_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION set_training_exemption(p_organization_id uuid, p_training_type_id uuid, p_personnel_id uuid, p_exempt boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.set_training_exemption(p_organization_id uuid, p_training_type_id uuid, p_personnel_id uuid, p_exempt boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_training_exemption(p_organization_id uuid, p_training_type_id uuid, p_personnel_id uuid, p_exempt boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_training_exemption(p_organization_id uuid, p_training_type_id uuid, p_personnel_id uuid, p_exempt boolean) TO service_role;


--
-- Name: FUNCTION settle_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.settle_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.settle_organization_file_upload(p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text) TO service_role;


--
-- Name: FUNCTION settle_sign_in_roster_scan_upload(p_organization_id uuid, p_roster_id uuid, p_object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.settle_sign_in_roster_scan_upload(p_organization_id uuid, p_roster_id uuid, p_object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.settle_sign_in_roster_scan_upload(p_organization_id uuid, p_roster_id uuid, p_object_name text) TO service_role;


--
-- Name: TABLE access_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.access_requests TO service_role;
GRANT SELECT ON TABLE public.access_requests TO authenticated;


--
-- Name: FUNCTION setup_grant_live(request public.access_requests); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.setup_grant_live(request public.access_requests) FROM PUBLIC;
GRANT ALL ON FUNCTION public.setup_grant_live(request public.access_requests) TO service_role;


--
-- Name: FUNCTION sign_in_roster_scope_matches_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sign_in_roster_scope_matches_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sign_in_roster_scope_matches_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_scope_group_ids uuid[], p_personnel_snapshot jsonb) TO service_role;


--
-- Name: FUNCTION stamp_access_request_rescission(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.stamp_access_request_rescission() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_access_request_rescission() TO service_role;


--
-- Name: FUNCTION stamp_personnel_extended_info_saver(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.stamp_personnel_extended_info_saver() FROM PUBLIC;


--
-- Name: FUNCTION start_account_setup_attempt(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.start_account_setup_attempt() FROM PUBLIC;


--
-- Name: FUNCTION start_onboarding_packet(p_organization_id uuid, p_personnel_id uuid, p_template_id uuid, p_started_at date, p_steps jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.start_onboarding_packet(p_organization_id uuid, p_personnel_id uuid, p_template_id uuid, p_started_at date, p_steps jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.start_onboarding_packet(p_organization_id uuid, p_personnel_id uuid, p_template_id uuid, p_started_at date, p_steps jsonb) TO authenticated;


--
-- Name: FUNCTION storage_object_org_id(object_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.storage_object_org_id(object_name text) TO anon;
GRANT ALL ON FUNCTION public.storage_object_org_id(object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.storage_object_org_id(object_name text) TO service_role;


--
-- Name: FUNCTION storage_object_scope(object_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.storage_object_scope(object_name text) TO anon;
GRANT ALL ON FUNCTION public.storage_object_scope(object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.storage_object_scope(object_name text) TO service_role;


--
-- Name: FUNCTION submit_deletion_request(p_organization_id uuid, p_requested_by uuid, p_requester_email text, p_resource_type text, p_resource_id uuid, p_description text, p_resource_url text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.submit_deletion_request(p_organization_id uuid, p_requested_by uuid, p_requester_email text, p_resource_type text, p_resource_id uuid, p_description text, p_resource_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_deletion_request(p_organization_id uuid, p_requested_by uuid, p_requester_email text, p_resource_type text, p_resource_id uuid, p_description text, p_resource_url text) TO service_role;


--
-- Name: FUNCTION swap_roster_days(p_organization_id uuid, p_assignment_type_id uuid, p_first_date date, p_first_was text, p_second_date date, p_second_was text, p_today date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.swap_roster_days(p_organization_id uuid, p_assignment_type_id uuid, p_first_date date, p_first_was text, p_second_date date, p_second_was text, p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.swap_roster_days(p_organization_id uuid, p_assignment_type_id uuid, p_first_date date, p_first_was text, p_second_date date, p_second_was text, p_today date) TO authenticated;


--
-- Name: FUNCTION sync_user_email_identity_from_auth_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_user_email_identity_from_auth_user() TO anon;
GRANT ALL ON FUNCTION public.sync_user_email_identity_from_auth_user() TO authenticated;
GRANT ALL ON FUNCTION public.sync_user_email_identity_from_auth_user() TO service_role;


--
-- Name: FUNCTION touch_dashboard_config_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.touch_dashboard_config_updated_at() TO anon;
GRANT ALL ON FUNCTION public.touch_dashboard_config_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_dashboard_config_updated_at() TO service_role;


--
-- Name: FUNCTION training_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.training_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_personnel_scope_matches(p_organization_id uuid, p_personnel_id uuid) TO service_role;


--
-- Name: FUNCTION training_record_type_matches(p_organization_id uuid, p_training_type_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.training_record_type_matches(p_organization_id uuid, p_training_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_record_type_matches(p_organization_id uuid, p_training_type_id uuid) TO service_role;


--
-- Name: FUNCTION training_views_set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.training_views_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.training_views_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.training_views_set_updated_at() TO service_role;


--
-- Name: FUNCTION transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid) TO anon;
GRANT ALL ON FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid) TO service_role;


--
-- Name: FUNCTION transition_calendar_tasking(p_organization_id uuid, p_tasking_id uuid, p_action text, p_note text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.transition_calendar_tasking(p_organization_id uuid, p_tasking_id uuid, p_action text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.transition_calendar_tasking(p_organization_id uuid, p_tasking_id uuid, p_action text, p_note text) TO authenticated;


--
-- Name: FUNCTION undo_roster_swap(p_organization_id uuid, p_swap_id uuid, p_today date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.undo_roster_swap(p_organization_id uuid, p_swap_id uuid, p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.undo_roster_swap(p_organization_id uuid, p_swap_id uuid, p_today date) TO authenticated;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION user_org_preferences_set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_org_preferences_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.user_org_preferences_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.user_org_preferences_set_updated_at() TO service_role;


--
-- Name: FUNCTION whats_new_entries_stamp(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.whats_new_entries_stamp() TO anon;
GRANT ALL ON FUNCTION public.whats_new_entries_stamp() TO authenticated;
GRANT ALL ON FUNCTION public.whats_new_entries_stamp() TO service_role;


--
-- Name: FUNCTION write_roster_assignment_slots(p_actor uuid, p_organization_id uuid, p_slots jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.write_roster_assignment_slots(p_actor uuid, p_organization_id uuid, p_slots jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.write_roster_assignment_slots(p_actor uuid, p_organization_id uuid, p_slots jsonb) TO service_role;


--
-- Name: TABLE access_request_organization_invitation_links; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.access_request_organization_invitation_links TO service_role;
GRANT SELECT ON TABLE public.access_request_organization_invitation_links TO authenticated;


--
-- Name: TABLE account_setup_attempts; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.account_setup_attempts TO service_role;


--
-- Name: TABLE account_setup_links; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.account_setup_links TO anon;
GRANT SELECT,MAINTAIN ON TABLE public.account_setup_links TO authenticated;
GRANT ALL ON TABLE public.account_setup_links TO service_role;


--
-- Name: TABLE account_setup_rate_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.account_setup_rate_limits TO anon;
GRANT ALL ON TABLE public.account_setup_rate_limits TO authenticated;
GRANT ALL ON TABLE public.account_setup_rate_limits TO service_role;


--
-- Name: TABLE announcement_dismissals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.announcement_dismissals TO anon;
GRANT ALL ON TABLE public.announcement_dismissals TO authenticated;
GRANT ALL ON TABLE public.announcement_dismissals TO service_role;


--
-- Name: TABLE assignment_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.assignment_types TO anon;
GRANT ALL ON TABLE public.assignment_types TO authenticated;
GRANT ALL ON TABLE public.assignment_types TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE auth_email_outbox; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.auth_email_outbox TO anon;
GRANT ALL ON TABLE public.auth_email_outbox TO authenticated;
GRANT ALL ON TABLE public.auth_email_outbox TO service_role;


--
-- Name: TABLE availability_entries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.availability_entries TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.availability_entries TO authenticated;
GRANT ALL ON TABLE public.availability_entries TO service_role;


--
-- Name: COLUMN availability_entries.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.availability_entries TO authenticated;


--
-- Name: COLUMN availability_entries.organization_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(organization_id) ON TABLE public.availability_entries TO authenticated;


--
-- Name: COLUMN availability_entries.personnel_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(personnel_id) ON TABLE public.availability_entries TO authenticated;


--
-- Name: COLUMN availability_entries.status_type_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(status_type_id) ON TABLE public.availability_entries TO authenticated;


--
-- Name: COLUMN availability_entries.start_date; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(start_date) ON TABLE public.availability_entries TO authenticated;


--
-- Name: COLUMN availability_entries.end_date; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(end_date) ON TABLE public.availability_entries TO authenticated;


--
-- Name: COLUMN availability_entries.created_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(created_at) ON TABLE public.availability_entries TO authenticated;


--
-- Name: COLUMN availability_entries.note; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(note) ON TABLE public.availability_entries TO authenticated;


--
-- Name: TABLE beta_feedback; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.beta_feedback TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.beta_feedback TO authenticated;
GRANT ALL ON TABLE public.beta_feedback TO service_role;


--
-- Name: COLUMN beta_feedback.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(id) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: COLUMN beta_feedback.user_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(user_id) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: COLUMN beta_feedback.user_email; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(user_email) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: COLUMN beta_feedback.organization_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(organization_id) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: COLUMN beta_feedback.organization_name; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(organization_name) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: COLUMN beta_feedback.category; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(category) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: COLUMN beta_feedback.message; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(message) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: COLUMN beta_feedback.page_url; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(page_url) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: COLUMN beta_feedback.page_section; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(page_section) ON TABLE public.beta_feedback TO authenticated;


--
-- Name: TABLE calendar_event_activity; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_event_activity TO service_role;
GRANT SELECT ON TABLE public.calendar_event_activity TO authenticated;


--
-- Name: SEQUENCE calendar_event_activity_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.calendar_event_activity_id_seq TO anon;
GRANT ALL ON SEQUENCE public.calendar_event_activity_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.calendar_event_activity_id_seq TO service_role;


--
-- Name: TABLE calendar_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_events TO service_role;
GRANT SELECT ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(id) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.organization_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(organization_id) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.title; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(title),UPDATE(title) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.starts_on; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(starts_on),UPDATE(starts_on) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.ends_on; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(ends_on),UPDATE(ends_on) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.host_name; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(host_name),UPDATE(host_name) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.coordinator_user_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(coordinator_user_id),UPDATE(coordinator_user_id) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.location; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(location),UPDATE(location) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.description; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(description),UPDATE(description) ON TABLE public.calendar_events TO authenticated;


--
-- Name: COLUMN calendar_events.source_reference; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(source_reference),UPDATE(source_reference) ON TABLE public.calendar_events TO authenticated;


--
-- Name: TABLE calendar_tasking_activity; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_tasking_activity TO service_role;


--
-- Name: SEQUENCE calendar_tasking_activity_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.calendar_tasking_activity_id_seq TO anon;
GRANT ALL ON SEQUENCE public.calendar_tasking_activity_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.calendar_tasking_activity_id_seq TO service_role;


--
-- Name: TABLE calendar_tasking_checklist_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_tasking_checklist_items TO service_role;
GRANT SELECT,DELETE ON TABLE public.calendar_tasking_checklist_items TO authenticated;


--
-- Name: COLUMN calendar_tasking_checklist_items.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(id) ON TABLE public.calendar_tasking_checklist_items TO authenticated;


--
-- Name: COLUMN calendar_tasking_checklist_items.organization_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(organization_id) ON TABLE public.calendar_tasking_checklist_items TO authenticated;


--
-- Name: COLUMN calendar_tasking_checklist_items.tasking_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(tasking_id) ON TABLE public.calendar_tasking_checklist_items TO authenticated;


--
-- Name: COLUMN calendar_tasking_checklist_items.label; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(label),UPDATE(label) ON TABLE public.calendar_tasking_checklist_items TO authenticated;


--
-- Name: COLUMN calendar_tasking_checklist_items.done; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(done) ON TABLE public.calendar_tasking_checklist_items TO authenticated;


--
-- Name: TABLE calendar_tasking_equipment; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_tasking_equipment TO service_role;
GRANT SELECT,DELETE ON TABLE public.calendar_tasking_equipment TO authenticated;


--
-- Name: COLUMN calendar_tasking_equipment.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(id) ON TABLE public.calendar_tasking_equipment TO authenticated;


--
-- Name: COLUMN calendar_tasking_equipment.organization_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(organization_id) ON TABLE public.calendar_tasking_equipment TO authenticated;


--
-- Name: COLUMN calendar_tasking_equipment.tasking_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(tasking_id) ON TABLE public.calendar_tasking_equipment TO authenticated;


--
-- Name: COLUMN calendar_tasking_equipment.name; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(name),UPDATE(name) ON TABLE public.calendar_tasking_equipment TO authenticated;


--
-- Name: COLUMN calendar_tasking_equipment.quantity; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(quantity),UPDATE(quantity) ON TABLE public.calendar_tasking_equipment TO authenticated;


--
-- Name: COLUMN calendar_tasking_equipment.secured_quantity; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(secured_quantity),UPDATE(secured_quantity) ON TABLE public.calendar_tasking_equipment TO authenticated;


--
-- Name: COLUMN calendar_tasking_equipment.returned_quantity; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(returned_quantity) ON TABLE public.calendar_tasking_equipment TO authenticated;


--
-- Name: TABLE calendar_tasking_participants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_tasking_participants TO service_role;
GRANT SELECT ON TABLE public.calendar_tasking_participants TO authenticated;


--
-- Name: TABLE calendar_taskings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_taskings TO service_role;
GRANT SELECT ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(id) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.organization_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(organization_id) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.event_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(event_id),UPDATE(event_id) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.title; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(title),UPDATE(title) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.responsible_group_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(responsible_group_id),UPDATE(responsible_group_id) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.suspense_on; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(suspense_on),UPDATE(suspense_on) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.execution_starts_on; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(execution_starts_on),UPDATE(execution_starts_on) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.execution_ends_on; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(execution_ends_on),UPDATE(execution_ends_on) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.report_time; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(report_time),UPDATE(report_time) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.staffing_required; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(staffing_required),UPDATE(staffing_required) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.qualifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(qualifications),UPDATE(qualifications) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: COLUMN calendar_taskings.instructions; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(instructions),UPDATE(instructions) ON TABLE public.calendar_taskings TO authenticated;


--
-- Name: TABLE counseling_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.counseling_records TO anon;
GRANT ALL ON TABLE public.counseling_records TO authenticated;
GRANT ALL ON TABLE public.counseling_records TO service_role;


--
-- Name: TABLE dashboard_configs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dashboard_configs TO anon;
GRANT ALL ON TABLE public.dashboard_configs TO authenticated;
GRANT ALL ON TABLE public.dashboard_configs TO service_role;


--
-- Name: TABLE data_exports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.data_exports TO anon;
GRANT ALL ON TABLE public.data_exports TO authenticated;
GRANT ALL ON TABLE public.data_exports TO service_role;


--
-- Name: TABLE deletion_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.deletion_requests TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.deletion_requests TO authenticated;
GRANT ALL ON TABLE public.deletion_requests TO service_role;


--
-- Name: TABLE durable_rate_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.durable_rate_limits TO anon;
GRANT ALL ON TABLE public.durable_rate_limits TO authenticated;
GRANT ALL ON TABLE public.durable_rate_limits TO service_role;


--
-- Name: TABLE feedback_replies; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE public.feedback_replies TO authenticated;
GRANT SELECT,INSERT ON TABLE public.feedback_replies TO service_role;


--
-- Name: TABLE feedback_staff_notes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.feedback_staff_notes TO service_role;
GRANT SELECT ON TABLE public.feedback_staff_notes TO authenticated;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.groups TO anon;
GRANT ALL ON TABLE public.groups TO authenticated;
GRANT ALL ON TABLE public.groups TO service_role;


--
-- Name: TABLE leader_notes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.leader_notes TO anon;
GRANT ALL ON TABLE public.leader_notes TO authenticated;
GRANT ALL ON TABLE public.leader_notes TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE onboarding_step_progress; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.onboarding_step_progress TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.onboarding_step_progress TO authenticated;
GRANT ALL ON TABLE public.onboarding_step_progress TO service_role;


--
-- Name: COLUMN onboarding_step_progress.completed; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(completed) ON TABLE public.onboarding_step_progress TO authenticated;


--
-- Name: COLUMN onboarding_step_progress.current_stage; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(current_stage) ON TABLE public.onboarding_step_progress TO authenticated;


--
-- Name: COLUMN onboarding_step_progress.notes; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(notes) ON TABLE public.onboarding_step_progress TO authenticated;


--
-- Name: TABLE onboarding_template_steps; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.onboarding_template_steps TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.onboarding_template_steps TO authenticated;
GRANT ALL ON TABLE public.onboarding_template_steps TO service_role;


--
-- Name: COLUMN onboarding_template_steps.name; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(name) ON TABLE public.onboarding_template_steps TO authenticated;


--
-- Name: COLUMN onboarding_template_steps.description; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(description) ON TABLE public.onboarding_template_steps TO authenticated;


--
-- Name: COLUMN onboarding_template_steps.step_type; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(step_type) ON TABLE public.onboarding_template_steps TO authenticated;


--
-- Name: COLUMN onboarding_template_steps.training_type_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(training_type_id) ON TABLE public.onboarding_template_steps TO authenticated;


--
-- Name: COLUMN onboarding_template_steps.stages; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(stages) ON TABLE public.onboarding_template_steps TO authenticated;


--
-- Name: COLUMN onboarding_template_steps.sort_order; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(sort_order) ON TABLE public.onboarding_template_steps TO authenticated;


--
-- Name: COLUMN onboarding_template_steps.template_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(template_id) ON TABLE public.onboarding_template_steps TO authenticated;


--
-- Name: TABLE onboarding_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.onboarding_templates TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.onboarding_templates TO authenticated;
GRANT ALL ON TABLE public.onboarding_templates TO service_role;


--
-- Name: COLUMN onboarding_templates.name; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(name) ON TABLE public.onboarding_templates TO authenticated;


--
-- Name: COLUMN onboarding_templates.description; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(description) ON TABLE public.onboarding_templates TO authenticated;


--
-- Name: TABLE organization_creation_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.organization_creation_requests TO service_role;


--
-- Name: TABLE organization_invitations; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.organization_invitations TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.organization_invitations TO authenticated;
GRANT ALL ON TABLE public.organization_invitations TO service_role;


--
-- Name: COLUMN organization_invitations.status; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(status) ON TABLE public.organization_invitations TO authenticated;


--
-- Name: COLUMN organization_invitations.declined_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(declined_at) ON TABLE public.organization_invitations TO authenticated;


--
-- Name: COLUMN organization_invitations.declined_by; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(declined_by) ON TABLE public.organization_invitations TO authenticated;


--
-- Name: COLUMN organization_invitations.revoked_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(revoked_at) ON TABLE public.organization_invitations TO authenticated;


--
-- Name: COLUMN organization_invitations.revoked_by; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(revoked_by) ON TABLE public.organization_invitations TO authenticated;


--
-- Name: COLUMN organization_invitations.expired_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(expired_at) ON TABLE public.organization_invitations TO authenticated;


--
-- Name: TABLE organization_memberships; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.organization_memberships TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.organization_memberships TO authenticated;
GRANT ALL ON TABLE public.organization_memberships TO service_role;


--
-- Name: COLUMN organization_memberships.role; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(role) ON TABLE public.organization_memberships TO authenticated;


--
-- Name: COLUMN organization_memberships.member_preset; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(member_preset) ON TABLE public.organization_memberships TO authenticated;


--
-- Name: COLUMN organization_memberships.capability_overrides; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(capability_overrides) ON TABLE public.organization_memberships TO authenticated;


--
-- Name: COLUMN organization_memberships.access_scope_kind; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(access_scope_kind) ON TABLE public.organization_memberships TO authenticated;


--
-- Name: COLUMN organization_memberships.access_scope_group_ids; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(access_scope_group_ids) ON TABLE public.organization_memberships TO authenticated;


--
-- Name: TABLE organization_rank_catalog; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.organization_rank_catalog TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.organization_rank_catalog TO authenticated;


--
-- Name: TABLE organization_suspensions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.organization_suspensions TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.organizations TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: COLUMN organizations.name; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(name) ON TABLE public.organizations TO authenticated;


--
-- Name: COLUMN organizations.archive_retention_months; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(archive_retention_months) ON TABLE public.organizations TO authenticated;


--
-- Name: COLUMN organizations.loss_warning_window_days; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(loss_warning_window_days) ON TABLE public.organizations TO authenticated;


--
-- Name: COLUMN organizations.personnel_document_storage_cap_bytes; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(personnel_document_storage_cap_bytes) ON TABLE public.organizations TO authenticated;


--
-- Name: COLUMN organizations.url_slug; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(url_slug) ON TABLE public.organizations TO authenticated;


--
-- Name: COLUMN organizations.training_readiness_goal_percent; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(training_readiness_goal_percent) ON TABLE public.organizations TO authenticated;


--
-- Name: COLUMN organizations.disabled_features; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(disabled_features) ON TABLE public.organizations TO authenticated;


--
-- Name: COLUMN organizations.strength_floor_percent; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(strength_floor_percent) ON TABLE public.organizations TO authenticated;


--
-- Name: TABLE personnel; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.personnel TO anon;
GRANT ALL ON TABLE public.personnel TO authenticated;
GRANT ALL ON TABLE public.personnel TO service_role;


--
-- Name: TABLE personnel_attribute_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.personnel_attribute_history TO service_role;
GRANT SELECT ON TABLE public.personnel_attribute_history TO authenticated;


--
-- Name: TABLE personnel_documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.personnel_documents TO anon;
GRANT ALL ON TABLE public.personnel_documents TO authenticated;
GRANT ALL ON TABLE public.personnel_documents TO service_role;


--
-- Name: TABLE personnel_extended_info; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.personnel_extended_info TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.personnel_extended_info TO authenticated;
GRANT ALL ON TABLE public.personnel_extended_info TO service_role;


--
-- Name: COLUMN personnel_extended_info.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.organization_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(organization_id) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.personnel_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(personnel_id) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.emergency_contact_name; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(emergency_contact_name) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.emergency_contact_relationship; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(emergency_contact_relationship) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.emergency_contact_phone; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(emergency_contact_phone) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.spouse_name; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(spouse_name) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.spouse_phone; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(spouse_phone) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.vehicle_make_model; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(vehicle_make_model) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.vehicle_plate; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(vehicle_plate) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.vehicle_color; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(vehicle_color) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.personal_email; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(personal_email) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.personal_phone; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(personal_phone) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.address_street; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(address_street) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.address_city; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(address_city) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.address_state; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(address_state) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.address_zip; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(address_zip) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.created_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(created_at) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.updated_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(updated_at) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.blood_type; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(blood_type) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.basd; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(basd) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.date_of_rank; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(date_of_rank) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.marital_status; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(marital_status) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.number_of_dependents; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(number_of_dependents) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.children; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(children) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.civilian_education; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(civilian_education) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.military_education; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(military_education) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.marital_status_date; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(marital_status_date) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: COLUMN personnel_extended_info.updated_by; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(updated_by) ON TABLE public.personnel_extended_info TO authenticated;


--
-- Name: TABLE personnel_follow_ups; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.personnel_follow_ups TO anon;
GRANT ALL ON TABLE public.personnel_follow_ups TO authenticated;
GRANT ALL ON TABLE public.personnel_follow_ups TO service_role;


--
-- Name: TABLE personnel_onboardings; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.personnel_onboardings TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.personnel_onboardings TO authenticated;
GRANT ALL ON TABLE public.personnel_onboardings TO service_role;


--
-- Name: COLUMN personnel_onboardings.completed_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(completed_at) ON TABLE public.personnel_onboardings TO authenticated;


--
-- Name: COLUMN personnel_onboardings.status; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(status) ON TABLE public.personnel_onboardings TO authenticated;


--
-- Name: COLUMN personnel_onboardings.template_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(template_id) ON TABLE public.personnel_onboardings TO authenticated;


--
-- Name: COLUMN personnel_onboardings.cancelled_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(cancelled_at) ON TABLE public.personnel_onboardings TO authenticated;


--
-- Name: TABLE personnel_training_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.personnel_training_history TO anon;
GRANT ALL ON TABLE public.personnel_training_history TO authenticated;
GRANT ALL ON TABLE public.personnel_training_history TO service_role;


--
-- Name: TABLE personnel_trainings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.personnel_trainings TO anon;
GRANT ALL ON TABLE public.personnel_trainings TO authenticated;
GRANT ALL ON TABLE public.personnel_trainings TO service_role;


--
-- Name: TABLE platform_announcements; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.platform_announcements TO anon;
GRANT SELECT,MAINTAIN ON TABLE public.platform_announcements TO authenticated;
GRANT ALL ON TABLE public.platform_announcements TO service_role;


--
-- Name: TABLE platform_operators; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.platform_operators TO service_role;
GRANT SELECT ON TABLE public.platform_operators TO authenticated;


--
-- Name: TABLE rating_scheme_entries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rating_scheme_entries TO anon;
GRANT ALL ON TABLE public.rating_scheme_entries TO authenticated;
GRANT ALL ON TABLE public.rating_scheme_entries TO service_role;


--
-- Name: TABLE roster_excusals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.roster_excusals TO anon;
GRANT ALL ON TABLE public.roster_excusals TO authenticated;
GRANT ALL ON TABLE public.roster_excusals TO service_role;


--
-- Name: TABLE roster_starting_numbers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.roster_starting_numbers TO anon;
GRANT ALL ON TABLE public.roster_starting_numbers TO authenticated;
GRANT ALL ON TABLE public.roster_starting_numbers TO service_role;


--
-- Name: TABLE roster_swaps; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.roster_swaps TO service_role;
GRANT SELECT ON TABLE public.roster_swaps TO authenticated;


--
-- Name: TABLE status_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.status_types TO anon;
GRANT ALL ON TABLE public.status_types TO authenticated;
GRANT ALL ON TABLE public.status_types TO service_role;


--
-- Name: TABLE training_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.training_types TO anon;
GRANT ALL ON TABLE public.training_types TO authenticated;
GRANT ALL ON TABLE public.training_types TO service_role;


--
-- Name: TABLE training_views; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.training_views TO anon;
GRANT ALL ON TABLE public.training_views TO authenticated;
GRANT ALL ON TABLE public.training_views TO service_role;


--
-- Name: TABLE user_email_identities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_email_identities TO service_role;


--
-- Name: TABLE user_org_preferences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_org_preferences TO anon;
GRANT ALL ON TABLE public.user_org_preferences TO authenticated;
GRANT ALL ON TABLE public.user_org_preferences TO service_role;


--
-- Name: TABLE user_pinned_groups; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_pinned_groups TO anon;
GRANT ALL ON TABLE public.user_pinned_groups TO authenticated;
GRANT ALL ON TABLE public.user_pinned_groups TO service_role;


--
-- Name: TABLE user_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_profiles TO anon;
GRANT ALL ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;


--
-- Name: TABLE user_suspensions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_suspensions TO service_role;
GRANT SELECT ON TABLE public.user_suspensions TO authenticated;


--
-- Name: TABLE whats_new_entries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.whats_new_entries TO service_role;
GRANT SELECT ON TABLE public.whats_new_entries TO authenticated;


--
-- Name: SEQUENCE whats_new_publish_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.whats_new_publish_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--
