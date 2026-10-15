-- Calendar lanes replace the single date header. Lanes are the active types
-- with show_on_calendar, ordered by (sort_order, id). set_calendar_lanes is
-- the only application writer of either column.
BEGIN;

DROP FUNCTION public.set_assignment_type_date_header(uuid, uuid);
DROP INDEX public.assignment_types_one_header_per_org;
ALTER TABLE public.assignment_types RENAME COLUMN show_in_date_header TO show_on_calendar;

-- The former header becomes the first lane; every other type keeps its
-- relative (sort_order, id) order.
UPDATE public.assignment_types AS t SET sort_order = r.position
FROM (
  SELECT id, (pg_catalog.row_number() OVER (
           PARTITION BY organization_id
           ORDER BY (show_on_calendar AND archived_at IS NULL) DESC, sort_order, id) - 1)::integer AS position
  FROM public.assignment_types
) AS r
WHERE t.id = r.id AND t.sort_order IS DISTINCT FROM r.position;
UPDATE public.assignment_types SET show_on_calendar = false
WHERE show_on_calendar AND archived_at IS NOT NULL;

CREATE FUNCTION public.set_calendar_lanes(
  p_organization_id uuid, p_lane_type_ids uuid[], p_expected_lane_type_ids uuid[]
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
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
  IF v_saved IS DISTINCT FROM p_expected_lane_type_ids THEN
    RAISE EXCEPTION 'Calendar lanes changed' USING ERRCODE = '40001';
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
    RAISE EXCEPTION 'Calendar lanes were not saved' USING ERRCODE = '40001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_calendar_lanes(uuid, uuid[], uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_calendar_lanes(uuid, uuid[], uuid[]) TO authenticated;

COMMIT;
