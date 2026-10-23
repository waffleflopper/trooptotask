-- Find replacement writes a conflicted day and the later roster days it
-- re-picks together, so the roster write now replaces occupied slots as well as
-- filling open ones. One function serves both Fill from roster and Find
-- replacement.
BEGIN;

DROP FUNCTION public.fill_roster_assignment_slots(uuid, uuid, jsonb);

-- Writes roster slots as p_actor, all or none. Each slot names the assignee the
-- preview saw there (`was`, null for an open day), so a slot that changed since
-- the preview fails the whole write rather than being overwritten. The
-- replacement RPC runs its own capability and scope checks against auth.uid(),
-- so the call sets the actor's claim and reuses them unchanged. Only slots whose
-- `source` is roster become roster picks; the rest are hand assignments.
CREATE FUNCTION public.write_roster_assignment_slots(
  p_actor uuid, p_organization_id uuid, p_slots jsonb
) RETURNS SETOF public.daily_assignments
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
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

ALTER FUNCTION public.write_roster_assignment_slots(uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.write_roster_assignment_slots(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_roster_assignment_slots(uuid, uuid, jsonb) TO service_role;

COMMIT;
