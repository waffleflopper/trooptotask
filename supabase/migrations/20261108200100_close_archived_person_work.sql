-- An archived Person keeps no live work: no in-progress onboarding packet, no new
-- artifacts, and no pending deletion request that outlives a purge.

ALTER TABLE public.personnel_onboardings
  ADD COLUMN cancellation_reason text,
  ADD CONSTRAINT personnel_onboardings_cancellation_reason_check
    CHECK (cancellation_reason IS NULL OR (status = 'cancelled' AND cancellation_reason = 'archived'));

CREATE FUNCTION onboarding_private.clear_onboarding_cancellation_reason() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancellation_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION onboarding_private.clear_onboarding_cancellation_reason() OWNER TO postgres;
REVOKE ALL ON FUNCTION onboarding_private.clear_onboarding_cancellation_reason() FROM PUBLIC;

CREATE TRIGGER clear_onboarding_cancellation_reason BEFORE UPDATE OF status ON public.personnel_onboardings
  FOR EACH ROW EXECUTE FUNCTION onboarding_private.clear_onboarding_cancellation_reason();

-- An AFTER trigger, so simultaneous starts for one Person still queue on the active packet index
-- before they wait here. The key-share lock orders a start or reopen against an archive
-- without blocking ordinary edits to the Person.
CREATE FUNCTION onboarding_private.require_active_onboarding_person() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.status = 'in_progress' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'in_progress') THEN
    PERFORM 1 FROM public.personnel AS person
    WHERE person.organization_id = NEW.organization_id AND person.id = NEW.personnel_id
    FOR KEY SHARE;
    -- A key-share lock can return the version from before a committed archive, so a new statement reads the archive.
    IF EXISTS (
      SELECT 1 FROM public.personnel AS person
      WHERE person.organization_id = NEW.organization_id AND person.id = NEW.personnel_id
        AND person.archived_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'This person is archived. Restore them before onboarding them.' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION onboarding_private.require_active_onboarding_person() OWNER TO postgres;
REVOKE ALL ON FUNCTION onboarding_private.require_active_onboarding_person() FROM PUBLIC;

CREATE TRIGGER require_active_onboarding_person AFTER INSERT OR UPDATE OF status ON public.personnel_onboardings
  FOR EACH ROW EXECUTE FUNCTION onboarding_private.require_active_onboarding_person();

CREATE OR REPLACE FUNCTION audit_private.audit_personnel_onboarding() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_kind text;
  v_details jsonb;
  v_who text;
  v_template text;
BEGIN
  v_who := audit_private.personnel_label(NEW.organization_id, NEW.personnel_id);
  PERFORM audit_private.require_in_unit(v_who, NEW.personnel_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.personnel_id END);
  IF v_who IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT item.name INTO v_template FROM public.onboarding_templates item
  WHERE item.id = NEW.template_id AND item.organization_id = NEW.organization_id;
  PERFORM audit_private.require_in_unit(v_template, NEW.template_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.template_id END);
  IF TG_OP = 'INSERT' THEN
    v_kind := 'onboarding.started';
  ELSE
    v_kind := CASE
      WHEN OLD.status = 'in_progress' AND NEW.status = 'completed' THEN 'onboarding.completed'
      WHEN OLD.status = 'in_progress' AND NEW.status = 'cancelled' THEN 'onboarding.cancelled'
      WHEN OLD.status <> 'in_progress' AND NEW.status = 'in_progress' THEN 'onboarding.reopened'
      -- Deleting a template clears this reference. That is the template's deletion, not a switch.
      WHEN NEW.template_id IS NOT NULL AND NEW.template_id IS DISTINCT FROM OLD.template_id THEN 'onboarding.template_switched'
    END;
    IF v_kind IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  v_details := pg_catalog.jsonb_build_object('template', v_template);
  IF v_kind = 'onboarding.completed' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('incomplete',
      (SELECT pg_catalog.count(*) FROM public.onboarding_step_progress progress
        WHERE progress.onboarding_id = NEW.id AND progress.active AND NOT progress.completed));
  ELSIF v_kind = 'onboarding.cancelled' AND NEW.cancellation_reason IS NOT NULL THEN
    v_details := v_details || pg_catalog.jsonb_build_object('reason', NEW.cancellation_reason);
  ELSIF v_kind = 'onboarding.template_switched' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('previousTemplate',
      (SELECT item.name FROM public.onboarding_templates item
        WHERE item.id = OLD.template_id AND item.organization_id = OLD.organization_id));
  END IF;
  PERFORM audit_private.record_entry(
    NEW.organization_id, v_kind, 'personnel_onboarding', NEW.id, v_who,
    NEW.personnel_id, v_who, v_details
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION organization_private.archive_locked_personnel(p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- FOR UPDATE waits for a start, reopen or artifact insert that key-share locked
  -- the Person, so the cascade below sees and closes the work it wrote.
  PERFORM 1 FROM (
    SELECT person.id FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    ORDER BY person.id
    FOR UPDATE
  ) AS locked;

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
  -- Restore leaves these cancelled. A leader reopens a packet deliberately.
  UPDATE public.personnel_onboardings AS packet
  SET status = 'cancelled', cancelled_at = person.archived_at, completed_at = NULL, cancellation_reason = 'archived'
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND packet.organization_id = person.organization_id AND packet.personnel_id = person.id
    AND packet.status = 'in_progress';
END;
$$;

UPDATE public.personnel_onboardings AS packet
SET status = 'cancelled', cancelled_at = person.archived_at, completed_at = NULL, cancellation_reason = 'archived'
FROM public.personnel AS person
WHERE packet.organization_id = person.organization_id AND packet.personnel_id = person.id
  AND person.archived_at IS NOT NULL AND packet.status = 'in_progress';

CREATE OR REPLACE FUNCTION public.insert_personnel_artifacts(p_actor uuid, p_organization_id uuid, p_table text, p_rows jsonb) RETURNS SETOF jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  v_claim text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  v_row jsonb;
  v_columns text;
  v_saved jsonb;
BEGIN
  IF p_table IS NULL OR p_table NOT IN ('leader_notes', 'personnel_follow_ups', 'counseling_records', 'personnel_documents') THEN
    RAISE EXCEPTION 'Unsupported Personnel artifact table' USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NULL OR p_organization_id IS NULL OR pg_catalog.jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid Personnel artifact write' USING ERRCODE = '22023';
  END IF;
  -- Key-share locking the People in id order orders these inserts against an archive,
  -- so a new artifact is either refused or archived by the cascade.
  PERFORM 1 FROM (
    SELECT person.id FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id
      AND person.id IN (
        SELECT (item.value ->> 'personnel_id')::uuid FROM pg_catalog.jsonb_array_elements(p_rows) AS item
        WHERE pg_catalog.jsonb_typeof(item.value) = 'object'
      )
    ORDER BY person.id
    FOR KEY SHARE
  ) AS locked;
  -- A key-share lock can return the version from before a committed archive, so a new statement reads the archive.
  IF EXISTS (
    SELECT 1 FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.archived_at IS NOT NULL
      AND person.id IN (
        SELECT (item.value ->> 'personnel_id')::uuid FROM pg_catalog.jsonb_array_elements(p_rows) AS item
        WHERE pg_catalog.jsonb_typeof(item.value) = 'object'
      )
  ) THEN
    RAISE EXCEPTION 'This person is archived. Restore them before adding records.' USING ERRCODE = '55000';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
    IF pg_catalog.jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR v_row ? 'id' OR v_row ? 'organization_id'
      OR NOT v_row ? 'personnel_id'
    THEN
      RAISE EXCEPTION 'Invalid Personnel artifact write' USING ERRCODE = '22023';
    END IF;
    v_row := v_row || pg_catalog.jsonb_build_object('organization_id', p_organization_id);
    SELECT pg_catalog.string_agg(pg_catalog.quote_ident(key), ', ') INTO v_columns
    FROM pg_catalog.jsonb_object_keys(v_row) AS key;
    EXECUTE pg_catalog.format(
      'INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM pg_catalog.jsonb_populate_record(NULL::public.%1$I, $1) '
        'RETURNING pg_catalog.to_jsonb(%1$I.*)',
      p_table, v_columns
    ) INTO v_saved USING v_row;
    RETURN NEXT v_saved;
  END LOOP;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_claim, ''), true);
END;
$_$;

-- deletion_requests.resource_id is polymorphic, so no foreign key can cancel a
-- request whose target the purge removes. The purge cancels them itself.
CREATE OR REPLACE FUNCTION public.delete_expired_personnel(p_org_id uuid, p_candidate_ids uuid[], p_cutoff timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_org_id IS NULL OR p_candidate_ids IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization, candidate IDs and cutoff are required' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(expired.id), '{}') INTO v_ids FROM (
    SELECT person.id FROM public.personnel AS person
    WHERE person.organization_id = p_org_id
      AND person.id = ANY (p_candidate_ids)
      AND person.archived_at IS NOT NULL
      AND person.archived_at < p_cutoff
      AND NOT EXISTS (
        SELECT 1 FROM public.calendar_tasking_participants AS p
        WHERE p.organization_id = person.organization_id AND p.personnel_id = person.id
      )
    ORDER BY person.id
    FOR UPDATE
  ) AS expired;

  UPDATE public.deletion_requests AS request SET status = 'cancelled'
  WHERE request.organization_id = p_org_id AND request.status = 'pending'
    AND CASE request.resource_type
      WHEN 'personnel' THEN request.resource_id = ANY (v_ids)
      WHEN 'counseling_record' THEN EXISTS (
        SELECT 1 FROM public.counseling_records AS record
        WHERE record.organization_id = p_org_id AND record.id = request.resource_id AND record.personnel_id = ANY (v_ids))
      WHEN 'personnel_training' THEN EXISTS (
        SELECT 1 FROM public.personnel_trainings AS record
        WHERE record.organization_id = p_org_id AND record.id = request.resource_id AND record.personnel_id = ANY (v_ids))
      WHEN 'rating_scheme_entry' THEN EXISTS (
        SELECT 1 FROM public.rating_scheme_entries AS record
        WHERE record.organization_id = p_org_id AND record.id = request.resource_id AND record.rated_person_id = ANY (v_ids))
      ELSE false
    END;

  DELETE FROM public.personnel AS person
  WHERE person.organization_id = p_org_id AND person.id = ANY (v_ids);
  RETURN pg_catalog.cardinality(v_ids);
END;
$$;
