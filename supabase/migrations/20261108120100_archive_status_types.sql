-- #2030 Calendar status types are archived instead of deleted, as Training types are. An archived type keeps every
-- schedule entry that uses it and can be restored. A type with entries can no longer be deleted: the composite foreign
-- key that cascaded the delete to its entries now refuses it.
BEGIN;

ALTER TABLE public.status_types ADD COLUMN archived_at timestamptz;

ALTER TABLE public.availability_entries DROP CONSTRAINT availability_entries_org_status_type_fkey;
ALTER TABLE public.availability_entries
  ADD CONSTRAINT availability_entries_org_status_type_fkey
  FOREIGN KEY (organization_id, status_type_id) REFERENCES public.status_types (organization_id, id)
  ON DELETE NO ACTION NOT VALID;

-- The reference check on a type delete and the usage count both look up entries by (Organization, type).
CREATE INDEX availability_entries_status_type_idx ON public.availability_entries (organization_id, status_type_id);

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

-- How many entries use each type, for the Delete offer and the archive confirmation.
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

REVOKE ALL ON FUNCTION public.status_type_record_counts(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.status_type_record_counts(uuid) TO authenticated;

COMMIT;
