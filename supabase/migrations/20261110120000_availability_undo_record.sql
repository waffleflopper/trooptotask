-- #2070 Undo of a removed status restores what the server deleted, including its Tasking link, which no signed-in
-- role can read. The removal keeps the deleted rows in a private record that only the same actor can restore from.
BEGIN;

CREATE TABLE calendar_private.availability_undo (
  actor_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  personnel_id uuid NOT NULL REFERENCES public.personnel (id) ON DELETE CASCADE,
  status_type_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL,
  set_for_tasking_id uuid,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, entry_id)
);
CREATE INDEX availability_undo_expires_idx ON calendar_private.availability_undo (expires_at);
ALTER TABLE calendar_private.availability_undo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE calendar_private.availability_undo FROM PUBLIC, anon, authenticated, service_role;

-- Row level security no longer applies to this function, so the can_edit_availability_record filter below is the
-- authorization the DELETE policy gave it before.
CREATE OR REPLACE FUNCTION public.delete_availability_entries(
  p_organization_id uuid, p_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
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

  DELETE FROM calendar_private.availability_undo WHERE expires_at <= pg_catalog.now();

  WITH deleted AS (
    DELETE FROM public.availability_entries e
    WHERE e.organization_id = p_organization_id AND e.id = ANY(p_ids)
      AND public.can_edit_availability_record(e.organization_id, e.personnel_id)
    RETURNING e.id, e.organization_id, e.personnel_id, e.status_type_id, e.start_date, e.end_date, e.note,
      e.created_at, e.set_for_tasking_id
  ), kept AS (
    -- 30 seconds: the 10 second Undo toast plus allowance for the removal reply and the Undo request in transit.
    INSERT INTO calendar_private.availability_undo AS u (actor_id, organization_id, entry_id, personnel_id,
      status_type_id, start_date, end_date, note, created_at, set_for_tasking_id, expires_at)
    SELECT auth.uid(), d.organization_id, d.id, d.personnel_id, d.status_type_id, d.start_date, d.end_date, d.note,
      d.created_at, d.set_for_tasking_id, pg_catalog.now() + interval '30 seconds'
    FROM deleted d
    ON CONFLICT (actor_id, entry_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id, personnel_id = EXCLUDED.personnel_id,
      status_type_id = EXCLUDED.status_type_id, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
      note = EXCLUDED.note, created_at = EXCLUDED.created_at, set_for_tasking_id = EXCLUDED.set_for_tasking_id,
      expires_at = EXCLUDED.expires_at
    RETURNING u.entry_id
  )
  SELECT pg_catalog.count(*) INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;
ALTER FUNCTION public.delete_availability_entries(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_availability_entries(uuid, uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_availability_entries(uuid, uuid[]) TO authenticated;

-- A restore puts back a link the server held; every other write still needs a Tasking the writer can see.
CREATE OR REPLACE FUNCTION calendar_private.check_availability_tasking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Also when unchanged: success on a no-op write would confirm a hidden Tasking's provenance.
  IF NEW.set_for_tasking_id IS NOT NULL
    AND pg_catalog.current_setting('calendar_private.restoring_availability', true) IS DISTINCT FROM 'on'
  THEN
    IF NOT EXISTS (SELECT 1 FROM public.calendar_taskings t
      WHERE t.organization_id = NEW.organization_id AND t.id = NEW.set_for_tasking_id
        AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)) THEN
      RAISE EXCEPTION 'Tasking is unavailable for this Organization' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Puts back the caller's own recent removals as they were deleted. p_personnel_ids names the Person the caller
-- claims for each id, so the server can run its per-Person policy first; a record restores only for that Person.
-- The result leaves out set_for_tasking_id, which no signed-in role can read.
CREATE FUNCTION public.restore_availability_entries(
  p_organization_id uuid, p_ids uuid[], p_personnel_ids uuid[]
) RETURNS TABLE (
  id uuid, organization_id uuid, personnel_id uuid, status_type_id uuid, start_date date, end_date date,
  note text, created_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL
    OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar availability restore is not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR p_personnel_ids IS NULL
    OR cardinality(p_ids) NOT BETWEEN 1 AND 500
    OR cardinality(p_personnel_ids) <> cardinality(p_ids)
    OR array_position(p_ids, NULL) IS NOT NULL
    OR array_position(p_personnel_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Invalid Calendar availability restore' USING ERRCODE = '22023';
  END IF;

  DELETE FROM calendar_private.availability_undo WHERE expires_at <= pg_catalog.now();

  -- An availability INSERT takes KEY SHARE on its Person through the foreign key, so this lock makes a concurrent
  -- add of the same Person wait. The next statement then takes a fresh snapshot that sees every add that finished.
  PERFORM 1 FROM public.personnel p
  WHERE p.organization_id = p_organization_id AND p.id = ANY(p_personnel_ids)
  ORDER BY p.id
  FOR UPDATE;
  -- An edit can move one of their existing entries into the restored dates without touching the Person, so those
  -- entries are locked too.
  PERFORM 1 FROM public.availability_entries a
  WHERE a.organization_id = p_organization_id AND a.personnel_id = ANY(p_personnel_ids)
  ORDER BY a.id
  FOR SHARE;

  -- The link comes from the server's own record, not from the caller, so the Tasking check below lets it through.
  PERFORM pg_catalog.set_config('calendar_private.restoring_availability', 'on', true);

  RETURN QUERY
  WITH claim AS (
    SELECT c.entry_id, c.personnel_id FROM ROWS FROM (pg_catalog.unnest(p_ids), pg_catalog.unnest(p_personnel_ids)) AS c(entry_id, personnel_id)
  ), consumed AS (
    -- An Undo is one-shot: the record goes whether or not the entry comes back.
    DELETE FROM calendar_private.availability_undo u
    WHERE u.actor_id = auth.uid() AND u.organization_id = p_organization_id AND u.entry_id = ANY(p_ids)
    RETURNING u.entry_id, u.organization_id, u.personnel_id, u.status_type_id, u.start_date, u.end_date, u.note,
      u.created_at, u.set_for_tasking_id, u.expires_at
  ), restorable AS (
    SELECT u.* FROM consumed u
    WHERE u.expires_at > pg_catalog.now()
      AND EXISTS (SELECT 1 FROM claim c WHERE c.entry_id = u.entry_id AND c.personnel_id = u.personnel_id)
      AND public.can_edit_availability_record(u.organization_id, u.personnel_id)
      AND EXISTS (SELECT 1 FROM public.status_types s
        WHERE s.organization_id = u.organization_id AND s.id = u.status_type_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.availability_entries a
        WHERE a.organization_id = u.organization_id AND a.personnel_id = u.personnel_id
          AND a.status_type_id = u.status_type_id
          AND a.start_date <= u.end_date AND a.end_date >= u.start_date
      )
  ), restored AS (
    INSERT INTO public.availability_entries AS e (id, organization_id, personnel_id, status_type_id, start_date,
      end_date, note, created_at, set_for_tasking_id)
    SELECT r.entry_id, r.organization_id, r.personnel_id, r.status_type_id, r.start_date, r.end_date, r.note,
      r.created_at,
      -- The link survives while its Tasking exists, even one this caller cannot see; the caller never reads it.
      (SELECT t.id FROM public.calendar_taskings t
        WHERE t.organization_id = r.organization_id AND t.id = r.set_for_tasking_id)
    FROM restorable r
    ON CONFLICT (id) DO NOTHING
    RETURNING e.id, e.organization_id, e.personnel_id, e.status_type_id, e.start_date, e.end_date, e.note,
      e.created_at
  )
  SELECT restored.id, restored.organization_id, restored.personnel_id, restored.status_type_id,
    restored.start_date, restored.end_date, restored.note, restored.created_at
  FROM restored;

  PERFORM pg_catalog.set_config('calendar_private.restoring_availability', '', true);
END;
$$;
ALTER FUNCTION public.restore_availability_entries(uuid, uuid[], uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.restore_availability_entries(uuid, uuid[], uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_availability_entries(uuid, uuid[], uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
