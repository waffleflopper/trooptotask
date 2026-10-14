-- Each command serializes its own Organization decision with a namespaced
-- transaction advisory lock, because competing resets touch rows that do not
-- exist yet and an Organization may have no header row to lock.
BEGIN;

CREATE FUNCTION public.reset_federal_holidays(p_organization_id uuid, p_holidays jsonb)
RETURNS SETOF public.special_days
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
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

CREATE FUNCTION public.set_assignment_type_date_header(
  p_organization_id uuid, p_assignment_type_id uuid
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_target_found boolean;
  v_changed integer;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_assignment_type_id IS NULL THEN
    RAISE EXCEPTION 'Choose an assignment type' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('calendar-date-header:' || p_organization_id::text, 0)
  );

  -- NO KEY UPDATE holds the choice against a concurrent delete or archive
  -- without waiting on daily-assignment foreign-key checks. It also applies the
  -- update policy, so authority is checked before reporting a missing target.
  PERFORM 1 FROM public.assignment_types
  WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND archived_at IS NULL
  FOR NO KEY UPDATE;
  v_target_found := FOUND;
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT v_target_found THEN
    RAISE EXCEPTION 'Assignment type not found' USING ERRCODE = 'P0002';
  END IF;

  -- Two statements: the non-deferrable index checks each row as it changes.
  UPDATE public.assignment_types SET show_in_date_header = false
  WHERE organization_id = p_organization_id AND show_in_date_header AND id <> p_assignment_type_id;
  UPDATE public.assignment_types SET show_in_date_header = true
  WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND NOT show_in_date_header;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  -- Row security can hide the target from the write without an error, as when
  -- authority is revoked while the clear waits on another writer's header row.
  IF v_changed = 0 AND NOT EXISTS (
    SELECT 1 FROM public.assignment_types
    WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND show_in_date_header
  ) THEN
    RAISE EXCEPTION 'Date header was not saved' USING ERRCODE = '42501';
  END IF;
  -- The update policy admits the caller before the one-header index can wait
  -- on another writer's uncommitted header.
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_federal_holidays(uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reset_federal_holidays(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.set_assignment_type_date_header(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_assignment_type_date_header(uuid, uuid) TO authenticated;

COMMIT;
