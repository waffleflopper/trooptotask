-- #1686: one closure over a range of dates is one request. Each date becomes
-- its own Special Day, so the special_days contract does not change. Dates that
-- already hold a holiday or closure are skipped, which also makes a retry after
-- a lost reply insert nothing.
BEGIN;

CREATE FUNCTION public.add_closure_days(p_organization_id uuid, p_name text, p_dates date[])
RETURNS SETOF public.special_days
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.add_closure_days(uuid, text, date[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.add_closure_days(uuid, text, date[]) TO authenticated;

COMMIT;
