-- Every daily assignment says whether a person put it there or Fill from roster
-- picked it. Re-picks only ever move roster picks, so a client must not be able
-- to claim a hand assignment as a roster pick: signed-in callers keep their
-- column grants on every other column and lose them on source, and only the
-- server's Fill from roster path, holding the service role, writes 'roster'.
BEGIN;

ALTER TABLE public.daily_assignments
  ADD COLUMN source text NOT NULL DEFAULT 'manual'
    CONSTRAINT daily_assignments_source_check CHECK (source IN ('manual', 'roster'));

REVOKE INSERT, UPDATE ON public.daily_assignments FROM anon, authenticated;
GRANT INSERT (id, organization_id, assignment_type_id, date, assignee_id, created_at),
  UPDATE (id, organization_id, assignment_type_id, date, assignee_id, created_at)
  ON public.daily_assignments TO anon, authenticated;

-- Writes roster picks into open slots as p_actor. The replacement RPC runs its
-- own capability and scope checks against auth.uid(), so the call sets the
-- actor's claim and reuses them unchanged. A slot that filled after the preview
-- fails the whole batch rather than being overwritten.
CREATE FUNCTION public.fill_roster_assignment_slots(
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
    RAISE EXCEPTION 'Invalid roster fill' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_slots) AS slot(value)
    WHERE jsonb_typeof(slot.value) IS DISTINCT FROM 'object'
      OR coalesce(btrim(slot.value->>'assignee_id'), '') = ''
  ) THEN
    RAISE EXCEPTION 'Invalid roster fill' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);

  -- The same per-day locks the replacement takes, in the same order, so the open check holds through the write.
  FOR affected_date IN
    SELECT DISTINCT (slot.value->>'date')::date AS day FROM jsonb_array_elements(p_slots) AS slot(value) ORDER BY day
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(affected_date::text)
    );
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.daily_assignments AS existing
    JOIN jsonb_array_elements(p_slots) AS slot(value)
      ON existing.date = (slot.value->>'date')::date
      AND existing.assignment_type_id = (slot.value->>'assignment_type_id')::uuid
    WHERE existing.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Assignment slot unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(row_value.id) INTO written
  FROM public.replace_daily_assignment_slots(p_organization_id, '{}'::date[], p_slots) AS row_value;

  RETURN QUERY
    UPDATE public.daily_assignments SET source = 'roster'
    WHERE id = ANY(written)
    RETURNING *;
END;
$$;

ALTER FUNCTION public.fill_roster_assignment_slots(uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fill_roster_assignment_slots(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fill_roster_assignment_slots(uuid, uuid, jsonb) TO service_role;

-- The roster read now carries each day's source.
DROP FUNCTION public.list_roster_detail_days(uuid, uuid, date, date);
CREATE FUNCTION public.list_roster_detail_days(
  p_organization_id uuid, p_assignment_type_id uuid, p_from date, p_through date
) RETURNS TABLE(date date, assignee_id text, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.list_roster_detail_days(uuid, uuid, date, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_roster_detail_days(uuid, uuid, date, date) TO authenticated;

COMMIT;
