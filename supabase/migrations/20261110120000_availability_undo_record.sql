-- #2070 Undo of a removed status restores what the server deleted, including its Tasking link, which no signed-in
-- role can read. The removal keeps the deleted rows in a private record that only the same actor can restore from.
BEGIN;

CREATE TABLE calendar_private.availability_undo (
  actor_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  -- No foreign key: a removal would then lock the Person after its entries, the reverse of a restore. A record for
  -- a deleted Person fails the restore's edit check and expires.
  personnel_id uuid NOT NULL,
  status_type_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL,
  set_for_tasking_id uuid,
  expires_at timestamptz NOT NULL,
  -- Set only inside a restore call, which deletes the record before it returns, so no other request ever sees it.
  restoring boolean NOT NULL DEFAULT false,
  PRIMARY KEY (actor_id, entry_id)
);
CREATE INDEX availability_undo_expires_idx ON calendar_private.availability_undo (expires_at);
ALTER TABLE calendar_private.availability_undo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE calendar_private.availability_undo FROM PUBLIC, anon, authenticated, service_role;

-- Stands in for the foreign key on personnel_id, so a deleted Person keeps no removed status. A record another
-- transaction holds is one that transaction is purging or restoring, and waiting on it could deadlock.
CREATE FUNCTION calendar_private.forget_deleted_personnel_undo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM calendar_private.availability_undo u
  WHERE (u.actor_id, u.entry_id) IN (
    SELECT x.actor_id, x.entry_id FROM calendar_private.availability_undo x
    JOIN deleted_personnel d ON d.id = x.personnel_id
    FOR UPDATE OF x SKIP LOCKED);
  RETURN NULL;
END;
$$;
ALTER FUNCTION calendar_private.forget_deleted_personnel_undo() OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.forget_deleted_personnel_undo() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER forget_deleted_personnel_undo AFTER DELETE ON public.personnel
REFERENCING OLD TABLE AS deleted_personnel
FOR EACH STATEMENT EXECUTE FUNCTION calendar_private.forget_deleted_personnel_undo();

-- Every add holds its Person's import lock until commit, so a restore that takes the same lock sees each of them
-- finished. Locking the Person row instead would also block every insert that references the Person, in any table.
-- An edit does not take it: an UPDATE trigger runs after the row is locked, and import locks rows after this lock.
CREATE FUNCTION calendar_private.lock_availability_person() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.organization_id::text || ':' || NEW.personnel_id::text, 1861));
  RETURN NEW;
END;
$$;
ALTER FUNCTION calendar_private.lock_availability_person() OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.lock_availability_person() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER lock_availability_person
BEFORE INSERT ON public.availability_entries
FOR EACH ROW EXECUTE FUNCTION calendar_private.lock_availability_person();

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

-- Only a restore call may name a Tasking the writer cannot see, and only with the link its record holds. Every
-- other write still needs a visible Tasking.
CREATE OR REPLACE FUNCTION calendar_private.check_availability_tasking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Also when unchanged: success on a no-op write would confirm a hidden Tasking's provenance.
  IF NEW.set_for_tasking_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM calendar_private.availability_undo u
    WHERE u.actor_id = auth.uid() AND u.entry_id = NEW.id AND u.organization_id = NEW.organization_id
      AND u.personnel_id = NEW.personnel_id AND u.set_for_tasking_id = NEW.set_for_tasking_id
      AND u.restoring
  ) THEN
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

  -- A Tasking delete locks the Tasking before it unlinks entries, so its linked Taskings are locked in that order too.
  -- One deleted first comes back unlinked instead of failing the batch on its foreign key.
  PERFORM 1 FROM public.calendar_taskings t
  WHERE t.organization_id = p_organization_id AND t.id IN (
    SELECT u.set_for_tasking_id FROM calendar_private.availability_undo u
    WHERE u.actor_id = auth.uid() AND u.organization_id = p_organization_id AND u.entry_id = ANY(p_ids))
  ORDER BY t.id
  FOR KEY SHARE;

  -- Holds off a delete of the Person, which would otherwise wait on records this call locks below.
  PERFORM 1 FROM public.personnel p
  WHERE p.organization_id = p_organization_id AND p.id = ANY(p_personnel_ids)
  ORDER BY p.id
  FOR KEY SHARE;

  -- The lock every add and import of the Person takes, in the order import and a sorted bulk add take it.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || claimed.personnel_id::text, 1861))
  FROM (SELECT DISTINCT c.personnel_id FROM pg_catalog.unnest(p_personnel_ids) AS c(personnel_id)
    ORDER BY c.personnel_id) AS claimed;
  -- An edit locks the entry it moves, so waiting on the Person's entries waits out every open edit. The next
  -- statement then takes a fresh snapshot that sees each add, edit and import that finished.
  PERFORM 1 FROM public.availability_entries a
  WHERE a.organization_id = p_organization_id AND a.personnel_id = ANY(p_personnel_ids)
  ORDER BY a.id
  FOR SHARE;

  DELETE FROM calendar_private.availability_undo WHERE expires_at <= pg_catalog.now();

  -- The Tasking check reads the caller's undo records, so they stay until the insert is done.
  UPDATE calendar_private.availability_undo u SET restoring = true
  WHERE u.actor_id = auth.uid() AND u.organization_id = p_organization_id AND u.entry_id = ANY(p_ids);

  RETURN QUERY
  WITH claim AS (
    SELECT c.entry_id, c.personnel_id FROM ROWS FROM (pg_catalog.unnest(p_ids), pg_catalog.unnest(p_personnel_ids)) AS c(entry_id, personnel_id)
  ), restorable AS (
    SELECT u.* FROM calendar_private.availability_undo u
    WHERE u.actor_id = auth.uid() AND u.organization_id = p_organization_id AND u.entry_id = ANY(p_ids)
      AND u.expires_at > pg_catalog.now()
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

  -- An Undo is one-shot: the record goes whether or not the entry came back.
  DELETE FROM calendar_private.availability_undo u
  WHERE u.actor_id = auth.uid() AND u.organization_id = p_organization_id AND u.entry_id = ANY(p_ids);
END;
$$;
ALTER FUNCTION public.restore_availability_entries(uuid, uuid[], uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.restore_availability_entries(uuid, uuid[], uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_availability_entries(uuid, uuid[], uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
