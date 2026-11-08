-- #2030 Training types and Calendar status types are archived instead of deleted. An archived type keeps every
-- record that uses it and can be restored. A type with records can no longer be deleted: the composite foreign keys
-- that cascaded the delete to its records now refuse it (NO ACTION is checked at the end of the statement, so deleting
-- an Organization, which removes parent and child rows together, still works).
BEGIN;

ALTER TABLE public.training_types ADD COLUMN archived_at timestamptz;
ALTER TABLE public.status_types ADD COLUMN archived_at timestamptz;

ALTER TABLE public.availability_entries DROP CONSTRAINT availability_entries_org_status_type_fkey;
ALTER TABLE public.availability_entries
  ADD CONSTRAINT availability_entries_org_status_type_fkey
  FOREIGN KEY (organization_id, status_type_id) REFERENCES public.status_types (organization_id, id)
  ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.personnel_trainings DROP CONSTRAINT personnel_trainings_org_training_type_fkey;
ALTER TABLE public.personnel_trainings
  ADD CONSTRAINT personnel_trainings_org_training_type_fkey
  FOREIGN KEY (organization_id, training_type_id) REFERENCES public.training_types (organization_id, id)
  ON DELETE NO ACTION NOT VALID;

ALTER TABLE public.personnel_training_history DROP CONSTRAINT personnel_training_history_org_training_type_fkey;
ALTER TABLE public.personnel_training_history
  ADD CONSTRAINT personnel_training_history_org_training_type_fkey
  FOREIGN KEY (organization_id, training_type_id) REFERENCES public.training_types (organization_id, id)
  ON DELETE NO ACTION NOT VALID;
ALTER TABLE public.personnel_training_history VALIDATE CONSTRAINT personnel_training_history_org_training_type_fkey;

-- The reference check on a type delete and the usage count both look up records by (Organization, type).
CREATE INDEX availability_entries_status_type_idx ON public.availability_entries (organization_id, status_type_id);
CREATE INDEX personnel_trainings_type_idx ON public.personnel_trainings (organization_id, training_type_id);

-- The archive time is the database's. A client may archive or restore a type but cannot choose when, and a type
-- starts active.
CREATE FUNCTION organization_private.stamp_catalog_archived_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.archived_at := NULL;
  ELSIF NEW.archived_at IS NOT NULL THEN
    NEW.archived_at := coalesce(OLD.archived_at, pg_catalog.now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.stamp_catalog_archived_at() FROM PUBLIC;

CREATE TRIGGER stamp_archived_at BEFORE INSERT OR UPDATE ON public.training_types
FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_catalog_archived_at();
CREATE TRIGGER stamp_archived_at BEFORE INSERT OR UPDATE ON public.status_types
FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_catalog_archived_at();

-- Archiving and restoring are audited like the critical task library's.
CREATE OR REPLACE FUNCTION audit_private.audit_status_type() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.status_types;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'status_type.created' WHEN 'UPDATE' THEN 'status_type.updated' WHEN 'DELETE' THEN 'status_type.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name", "shortLabel": "short_label", "color": "color", "textColor": "text_color", "rosterEffect": "roster_effect"}');
    IF v_change = '{}'::jsonb AND NOT ((OLD.archived_at IS NULL) <> (NEW.archived_at IS NULL)) THEN
      RETURN NULL;
    END IF;
    v_kind := CASE
      WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'status_type.archived'
      WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'status_type.restored'
      ELSE 'status_type.updated' END;
  END IF;
  v_details := '{}'::jsonb;
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'status_type', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION audit_private.audit_training_type() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.training_types;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
  v_ex record;
  v_who text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'training_type.created' WHEN 'UPDATE' THEN 'training_type.updated' WHEN 'DELETE' THEN 'training_type.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name", "expirationMonths": "expiration_months", "warningDaysYellow": "warning_days_yellow", "warningDaysOrange": "warning_days_orange", "color": "color", "expirationDateOnly": "expiration_date_only", "canBeExempted": "can_be_exempted", "isOptional": "is_optional"}');
    IF NEW.applies_to_roles IS DISTINCT FROM OLD.applies_to_roles OR NEW.applies_to_mos IS DISTINCT FROM OLD.applies_to_mos OR NEW.applies_to_ranks IS DISTINCT FROM OLD.applies_to_ranks OR NEW.excluded_roles IS DISTINCT FROM OLD.excluded_roles OR NEW.excluded_mos IS DISTINCT FROM OLD.excluded_mos OR NEW.excluded_ranks IS DISTINCT FROM OLD.excluded_ranks THEN
      v_change := v_change || pg_catalog.jsonb_build_object('audience', true);
    END IF;
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_change := v_change || pg_catalog.jsonb_build_object('description', true);
    END IF;
    IF v_change = '{}'::jsonb AND NOT (OLD.exempt_personnel_ids IS DISTINCT FROM NEW.exempt_personnel_ids)
      AND NOT ((OLD.archived_at IS NULL) <> (NEW.archived_at IS NULL))
    THEN
      RETURN NULL;
    END IF;
    v_kind := CASE
      WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'training_type.archived'
      WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'training_type.restored'
      ELSE 'training_type.updated' END;
  END IF;
  v_details := '{}'::jsonb;
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  IF TG_OP <> 'UPDATE' OR v_change <> '{}'::jsonb OR v_kind <> 'training_type.updated' THEN
    PERFORM audit_private.record_entry(
      v_row.organization_id, v_kind, 'training_type', v_row.id, v_row.name,
      NULL, NULL, v_details
    );
  END IF;
  IF TG_OP = 'UPDATE' THEN
    FOR v_ex IN
      SELECT added.id, true AS exempt FROM (
        SELECT e AS id FROM audit_private.id_list(NEW.exempt_personnel_ids) AS e
        EXCEPT SELECT e FROM audit_private.id_list(OLD.exempt_personnel_ids) AS e) AS added
      UNION ALL
      SELECT removed.id, false FROM (
        SELECT e AS id FROM audit_private.id_list(OLD.exempt_personnel_ids) AS e
        EXCEPT SELECT e FROM audit_private.id_list(NEW.exempt_personnel_ids) AS e) AS removed
    LOOP
      v_who := audit_private.personnel_label(NEW.organization_id, v_ex.id);
      IF v_ex.exempt THEN
        PERFORM audit_private.require_in_unit(v_who, v_ex.id);
      END IF;
      IF v_who IS NOT NULL THEN
        PERFORM audit_private.record_entry(
          NEW.organization_id,
          CASE WHEN v_ex.exempt THEN 'training_type.exemption_added' ELSE 'training_type.exemption_removed' END,
          'training_type', NEW.id, NEW.name, v_ex.id, v_who, '{}'::jsonb);
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

-- Reordering covers the types the settings list shows. Archived types keep their position.
CREATE OR REPLACE FUNCTION public.set_status_type_order(p_organization_id uuid, p_status_type_ids uuid[], p_expected_status_type_ids uuid[]) RETURNS void
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
  -- The order covers active types only; archived types keep their position.
  -- NO KEY UPDATE on every active type holds the set against delete and edits without
  -- waiting on availability foreign-key checks. It also applies the update
  -- policy, so authority is rechecked after the waits.
  PERFORM 1 FROM public.status_types
  WHERE organization_id = p_organization_id AND archived_at IS NULL
  ORDER BY id
  FOR NO KEY UPDATE;
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}') INTO v_saved
  FROM public.status_types
  WHERE organization_id = p_organization_id AND archived_at IS NULL;
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
  WHERE t.organization_id = p_organization_id AND t.archived_at IS NULL AND t.id = o.id AND t.sort_order <> o.ordinal - 1;

  -- Row security silently hides rows from a write whose author lost authority
  -- after the check above.
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}')
      FROM public.status_types WHERE organization_id = p_organization_id AND archived_at IS NULL)
     IS DISTINCT FROM p_status_type_ids
  THEN
    RAISE EXCEPTION 'Status type order was not saved' USING ERRCODE = 'STO01';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_training_type_order(p_organization_id uuid, p_training_type_ids uuid[], p_expected_training_type_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_saved uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_training_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_training_type_ids IS NULL OR p_expected_training_type_ids IS NULL
    OR pg_catalog.array_ndims(p_training_type_ids) > 1
    OR pg_catalog.array_ndims(p_expected_training_type_ids) > 1
    OR pg_catalog.array_position(p_training_type_ids, NULL) IS NOT NULL
    OR pg_catalog.array_position(p_expected_training_type_ids, NULL) IS NOT NULL
    OR pg_catalog.cardinality(p_training_type_ids) <> (
      SELECT pg_catalog.count(DISTINCT ids.id) FROM pg_catalog.unnest(p_training_type_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Choose every Training type once' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('training-type-order:' || p_organization_id::text, 0)
  );
  -- The order covers active types only; archived types keep their position.
  -- NO KEY UPDATE on every active type holds the set against delete and edits without
  -- blocking foreign-key checks from rows that reference a type. It also
  -- applies the update policy, so authority is rechecked after the waits.
  PERFORM 1 FROM public.training_types
  WHERE organization_id = p_organization_id AND archived_at IS NULL
  ORDER BY id
  FOR NO KEY UPDATE;
  IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}') INTO v_saved
  FROM public.training_types
  WHERE organization_id = p_organization_id AND archived_at IS NULL;
  -- A replay after a lost reply, or the same change from two people, converges
  -- before the precondition can report a false conflict.
  IF v_saved = p_training_type_ids THEN
    IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  -- TTO01, not 40001: PostgREST silently retries a serialization failure, so a
  -- stale command would loop and could later commit over the newer order. A
  -- type created or deleted since the client read also lands here, so a stale
  -- order never drops a new type.
  IF v_saved IS DISTINCT FROM p_expected_training_type_ids THEN
    RAISE EXCEPTION 'Training type order changed' USING ERRCODE = 'TTO01';
  END IF;
  IF pg_catalog.cardinality(p_training_type_ids) <> pg_catalog.cardinality(v_saved)
    OR NOT (p_training_type_ids @> v_saved)
  THEN
    RAISE EXCEPTION 'Choose every Training type once' USING ERRCODE = '22023';
  END IF;

  UPDATE public.training_types AS t SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_training_type_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE t.organization_id = p_organization_id AND t.archived_at IS NULL AND t.id = o.id AND t.sort_order <> o.ordinal - 1;

  -- Row security silently hides rows from a write whose author lost authority
  -- after the check above.
  IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}')
      FROM public.training_types WHERE organization_id = p_organization_id AND archived_at IS NULL)
     IS DISTINCT FROM p_training_type_ids
  THEN
    RAISE EXCEPTION 'Training type order was not saved' USING ERRCODE = 'TTO01';
  END IF;
END;
$$;

-- How many records use each type, for the Delete offer and the archive confirmation. The count covers every Person the
-- type touches, so it is definer-side behind the same authority that archives and deletes types.
CREATE FUNCTION public.training_type_record_counts(p_organization_id uuid)
RETURNS TABLE (training_type_id uuid, record_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_training_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id,
    (SELECT pg_catalog.count(*) FROM public.personnel_trainings r
      WHERE r.organization_id = t.organization_id AND r.training_type_id = t.id)
    + (SELECT pg_catalog.count(*) FROM public.personnel_training_history h
      WHERE h.organization_id = t.organization_id AND h.training_type_id = t.id)
  FROM public.training_types t
  WHERE t.organization_id = p_organization_id
  ORDER BY t.id;
END;
$$;

CREATE FUNCTION public.status_type_record_counts(p_organization_id uuid)
RETURNS TABLE (status_type_id uuid, record_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.id,
    (SELECT pg_catalog.count(*) FROM public.availability_entries a
      WHERE a.organization_id = s.organization_id AND a.status_type_id = s.id)
  FROM public.status_types s
  WHERE s.organization_id = p_organization_id
  ORDER BY s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.training_type_record_counts(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.training_type_record_counts(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.status_type_record_counts(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.status_type_record_counts(uuid) TO authenticated;

COMMIT;
