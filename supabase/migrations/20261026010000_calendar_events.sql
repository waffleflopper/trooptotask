-- Calendar Events: Organization-wide shared context behind the Events & Taskings
-- switch. Every Calendar reader sees them; only Organization-wide Calendar
-- operators write them. Attribution and Activity come from the database.
BEGIN;

ALTER TABLE public.organizations DROP CONSTRAINT organizations_disabled_features_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_disabled_features_check
  CHECK (disabled_features <@ ARRAY[
    'training', 'criticalTasks', 'evaluations', 'onboarding', 'lossesAndAwards', 'eventsAndTaskings'
  ]::text[]);

CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 200),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  -- NULL means the Organization itself hosts the Event.
  host_name text CHECK (host_name IS NULL OR (btrim(host_name) <> '' AND char_length(host_name) <= 200)),
  coordinator_user_id uuid NOT NULL,
  location text CHECK (location IS NULL OR (btrim(location) <> '' AND char_length(location) <= 200)),
  description text CHECK (description IS NULL OR (btrim(description) <> '' AND char_length(description) <= 4000)),
  -- An order identifier, or an http(s) link. No other URL scheme is stored.
  source_reference text CHECK (
    source_reference IS NULL OR (
      btrim(source_reference) <> '' AND char_length(source_reference) <= 500
      AND (
        source_reference ~* '^https?://\S+$'
        OR (
          source_reference !~* '^\s*[a-z][a-z0-9+.-]*://'
          AND source_reference !~* '^\s*(javascript|data|vbscript|file|blob):'
        )
      )
    )
  ),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text CHECK (
    cancellation_reason IS NULL OR (btrim(cancellation_reason) <> '' AND char_length(cancellation_reason) <= 1000)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT calendar_events_date_order CHECK (ends_on >= starts_on),
  CONSTRAINT calendar_events_cancellation CHECK (
    (cancelled_at IS NULL) = (cancelled_by IS NULL) AND (cancelled_at IS NOT NULL OR cancellation_reason IS NULL)
  ),
  CONSTRAINT calendar_events_organization_id_id_key UNIQUE (organization_id, id)
);

CREATE INDEX calendar_events_organization_dates_idx ON public.calendar_events (organization_id, starts_on, ends_on);

-- Append-only. Rows come only from calendar_private.record_calendar_event_activity.
CREATE TABLE public.calendar_event_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('created', 'dates_changed', 'coordination_changed', 'cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES public.calendar_events (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX calendar_event_activity_event_idx ON public.calendar_event_activity (event_id, id);
CREATE INDEX calendar_event_activity_organization_idx ON public.calendar_event_activity (organization_id, id);

CREATE FUNCTION calendar_private.can_view_calendar_events(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view')
    AND public.organization_access_admitted(p_organization_id, 'eventsAndTaskings');
$$;
ALTER FUNCTION calendar_private.can_view_calendar_events(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.can_view_calendar_events(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION calendar_private.can_view_calendar_events(uuid) TO authenticated;

CREATE FUNCTION calendar_private.can_manage_calendar_events(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
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
ALTER FUNCTION calendar_private.can_manage_calendar_events(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.can_manage_calendar_events(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION calendar_private.can_manage_calendar_events(uuid) TO authenticated;

CREATE FUNCTION calendar_private.stamp_calendar_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
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
REVOKE ALL ON FUNCTION calendar_private.stamp_calendar_event() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stamp_calendar_event
BEFORE INSERT OR UPDATE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION calendar_private.stamp_calendar_event();

CREATE FUNCTION calendar_private.record_calendar_event_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
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
REVOKE ALL ON FUNCTION calendar_private.record_calendar_event_activity() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER record_calendar_event_activity
AFTER INSERT OR UPDATE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION calendar_private.record_calendar_event_activity();

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Calendar readers can view events" ON public.calendar_events
FOR SELECT TO authenticated USING (calendar_private.can_view_calendar_events(organization_id));
CREATE POLICY "Organization-wide Calendar operators can create events" ON public.calendar_events
FOR INSERT TO authenticated WITH CHECK (calendar_private.can_manage_calendar_events(organization_id));
CREATE POLICY "Organization-wide Calendar operators can edit events" ON public.calendar_events
FOR UPDATE TO authenticated
USING (calendar_private.can_manage_calendar_events(organization_id))
WITH CHECK (calendar_private.can_manage_calendar_events(organization_id));

CREATE POLICY "Calendar readers can view event activity" ON public.calendar_event_activity
FOR SELECT TO authenticated USING (calendar_private.can_view_calendar_events(organization_id));

REVOKE ALL ON public.calendar_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.calendar_event_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.calendar_events TO authenticated;
GRANT INSERT (
  id, organization_id, title, starts_on, ends_on, host_name, coordinator_user_id, location, description, source_reference
) ON public.calendar_events TO authenticated;
GRANT UPDATE (
  title, starts_on, ends_on, host_name, coordinator_user_id, location, description, source_reference
) ON public.calendar_events TO authenticated;
GRANT SELECT ON public.calendar_event_activity TO authenticated;
GRANT ALL ON public.calendar_events, public.calendar_event_activity TO service_role;

-- Cancelling is final and idempotent: a repeat call keeps the first actor, time and reason.
CREATE FUNCTION public.cancel_calendar_event(p_organization_id uuid, p_event_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
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
ALTER FUNCTION public.cancel_calendar_event(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_calendar_event(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_calendar_event(uuid, uuid, text) TO authenticated;

COMMIT;
