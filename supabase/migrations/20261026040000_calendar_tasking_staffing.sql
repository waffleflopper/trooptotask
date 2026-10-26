-- Tasking staffing: the People picked for a Tasking, one row each. A Group
-- Tasking picks from its responsible Group's active roster; an Organization-level
-- Tasking picks from the whole active roster and needs Organization-wide scope.
-- The whole selection changes only through save_calendar_tasking_people, which
-- checks a staffing revision so concurrent edits never overwrite each other.
-- A pick whose person is archived or leaves the responsible Group is kept and
-- flagged for review; restoring the person does not clear the flag. Readers see
-- the names of picked People only while those People are in their Calendar scope.
BEGIN;

ALTER TABLE public.calendar_taskings ADD COLUMN staffing_revision integer NOT NULL DEFAULT 0;

CREATE TABLE public.calendar_tasking_participants (
  organization_id uuid NOT NULL,
  tasking_id uuid NOT NULL,
  personnel_id uuid NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  selected_by uuid,
  -- When the pick stopped qualifying. Only an explicit keep or removal clears it.
  review_since timestamptz,
  PRIMARY KEY (tasking_id, personnel_id),
  CONSTRAINT calendar_tasking_participants_tasking_fkey FOREIGN KEY (organization_id, tasking_id)
    REFERENCES public.calendar_taskings (organization_id, id) ON DELETE CASCADE,
  -- Permanently deleting a picked Person is refused; staffing history never cascades away.
  -- Checked at commit, so deleting the whole Organization can remove People and picks together.
  CONSTRAINT calendar_tasking_participants_personnel_fkey FOREIGN KEY (organization_id, personnel_id)
    REFERENCES public.personnel (organization_id, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX calendar_tasking_participants_personnel_idx
  ON public.calendar_tasking_participants (organization_id, personnel_id);

-- Slices extend this list in parallel, so add to whatever it holds instead of restating it.
DO $$
DECLARE
  v_kinds text[];
BEGIN
  SELECT pg_catalog.array_agg(DISTINCT m[1]) INTO v_kinds
  FROM pg_catalog.pg_constraint AS c,
    LATERAL pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
  WHERE c.conrelid = 'public.calendar_tasking_activity'::regclass AND c.conname = 'calendar_tasking_activity_kind_check';
  ALTER TABLE public.calendar_tasking_activity DROP CONSTRAINT calendar_tasking_activity_kind_check;
  EXECUTE pg_catalog.format(
    'ALTER TABLE public.calendar_tasking_activity ADD CONSTRAINT calendar_tasking_activity_kind_check CHECK (kind = ANY (%L::text[]))',
    v_kinds || ARRAY['staffing_changed']
  );
END;
$$;

-- Whether the signed-in member's Calendar roster scope covers this Person now.
CREATE FUNCTION calendar_private.calendar_person_in_scope(p_organization_id uuid, p_personnel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel AS p
    WHERE p.organization_id = p_organization_id AND p.id = p_personnel_id
      AND public.calendar_personnel_group_scope_matches(p_organization_id, p.group_id)
  );
$$;
ALTER FUNCTION calendar_private.calendar_person_in_scope(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.calendar_person_in_scope(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION calendar_private.calendar_person_in_scope(uuid, uuid) TO authenticated;

ALTER TABLE public.calendar_tasking_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Calendar readers view picks of people in their scope" ON public.calendar_tasking_participants
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.calendar_taskings AS t
    WHERE t.organization_id = calendar_tasking_participants.organization_id
      AND t.id = calendar_tasking_participants.tasking_id
  )
  AND calendar_private.calendar_person_in_scope(organization_id, personnel_id)
);

REVOKE ALL ON public.calendar_tasking_participants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.calendar_tasking_participants TO authenticated;
GRANT ALL ON public.calendar_tasking_participants TO service_role;

-- Archiving a picked Person, or moving them out of a Group Tasking's Group, flags the pick.
-- A closed Tasking keeps its record as it stood; reopening flags what changed meanwhile.
CREATE FUNCTION calendar_private.flag_picks_of_changed_person() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.calendar_tasking_participants AS p SET review_since = pg_catalog.now()
  FROM public.calendar_taskings AS t
  WHERE p.organization_id = NEW.organization_id AND p.personnel_id = NEW.id AND p.review_since IS NULL
    AND t.organization_id = p.organization_id AND t.id = p.tasking_id
    AND t.status NOT IN ('completed', 'cancelled')
    AND (NEW.archived_at IS NOT NULL
      OR (t.responsible_group_id IS NOT NULL AND NEW.group_id IS DISTINCT FROM t.responsible_group_id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.flag_picks_of_changed_person() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER flag_calendar_tasking_picks
AFTER UPDATE OF group_id, archived_at ON public.personnel
FOR EACH ROW
WHEN (OLD.group_id IS DISTINCT FROM NEW.group_id OR (OLD.archived_at IS NULL) <> (NEW.archived_at IS NULL))
EXECUTE FUNCTION calendar_private.flag_picks_of_changed_person();

-- Rerouting or reopening a Tasking flags the picks it no longer holds; nobody is moved or dropped.
CREATE FUNCTION calendar_private.flag_picks_of_changed_tasking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status NOT IN ('completed', 'cancelled') THEN
    UPDATE public.calendar_tasking_participants AS p SET review_since = pg_catalog.now()
    FROM public.personnel AS person
    WHERE p.organization_id = NEW.organization_id AND p.tasking_id = NEW.id AND p.review_since IS NULL
      AND person.organization_id = p.organization_id AND person.id = p.personnel_id
      AND (person.archived_at IS NOT NULL
        OR (NEW.responsible_group_id IS NOT NULL AND person.group_id IS DISTINCT FROM NEW.responsible_group_id));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.flag_picks_of_changed_tasking() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER flag_calendar_tasking_picks_on_change
AFTER UPDATE OF responsible_group_id, status ON public.calendar_taskings
FOR EACH ROW
WHEN (OLD.responsible_group_id IS DISTINCT FROM NEW.responsible_group_id
  OR (OLD.status IN ('completed', 'cancelled') AND NEW.status NOT IN ('completed', 'cancelled')))
EXECUTE FUNCTION calendar_private.flag_picks_of_changed_tasking();

-- Replaces the whole selection in one transaction. Saving the selection that is
-- already stored changes nothing, so a retried save converges. Any other change
-- against a revision the caller did not see returns 'conflict' and writes nothing.
-- Newly picked and kept People must be active and in the Tasking's roster;
-- a pick already under review may stay as it is. The caller cannot name picks
-- outside their roster scope, so those stay unless p_remove_outside_scope says
-- to remove them.
CREATE FUNCTION public.save_calendar_tasking_people(
  p_organization_id uuid, p_tasking_id uuid, p_personnel_ids uuid[], p_kept_ids uuid[], p_remove_outside_scope boolean,
  p_expected_revision integer
) RETURNS TABLE (outcome text, revision integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[] := coalesce(p_personnel_ids, ARRAY[]::uuid[]);
  v_kept uuid[] := coalesce(p_kept_ids, ARRAY[]::uuid[]);
  v_status text;
  v_group uuid;
  v_revision integer;
  v_current uuid[];
  v_flagged uuid[];
  v_outside uuid[];
  v_added uuid[];
  v_removed uuid[];
  v_checked uuid[];
  v_eligible integer;
BEGIN
  IF array_position(v_ids, NULL) IS NOT NULL OR array_position(v_kept, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(v_ids) AS id) <> cardinality(v_ids)
    OR (SELECT count(DISTINCT id) FROM unnest(v_kept) AS id) <> cardinality(v_kept)
    OR NOT v_kept <@ v_ids
    OR cardinality(v_ids) > 9999
  THEN
    RAISE EXCEPTION 'Pick each person once' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, t.responsible_group_id, t.staffing_revision INTO v_status, v_group, v_revision
  FROM public.calendar_taskings AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
  FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR calendar_private.can_view_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tasking not found' USING ERRCODE = 'P0002';
  END IF;
  IF calendar_private.can_manage_calendar_tasking(p_organization_id, v_group) IS NOT TRUE THEN
    RAISE EXCEPTION 'Staffing this tasking needs Calendar operation access for its scope' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(p.personnel_id), ARRAY[]::uuid[]),
    coalesce(array_agg(p.personnel_id) FILTER (WHERE p.review_since IS NOT NULL), ARRAY[]::uuid[]),
    coalesce(array_agg(p.personnel_id) FILTER (
      WHERE NOT calendar_private.calendar_person_in_scope(p.organization_id, p.personnel_id)
    ), ARRAY[]::uuid[])
  INTO v_current, v_flagged, v_outside
  FROM public.calendar_tasking_participants AS p
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id;
  IF p_remove_outside_scope IS NOT TRUE THEN
    v_ids := v_ids || ARRAY(SELECT id FROM unnest(v_outside) AS id WHERE NOT id = ANY (v_ids));
  END IF;

  v_kept := ARRAY(SELECT id FROM unnest(v_kept) AS id WHERE id = ANY (v_flagged));
  IF v_ids @> v_current AND v_current @> v_ids AND cardinality(v_kept) = 0 THEN
    RETURN QUERY SELECT 'unchanged'::text, v_revision;
    RETURN;
  END IF;
  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'A % tasking cannot change its staffing', v_status USING ERRCODE = '55000';
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_revision THEN
    RETURN QUERY SELECT 'conflict'::text, v_revision;
    RETURN;
  END IF;

  v_added := ARRAY(SELECT id FROM unnest(v_ids) AS id WHERE NOT id = ANY (v_current));
  v_removed := ARRAY(SELECT id FROM unnest(v_current) AS id WHERE NOT id = ANY (v_ids));
  v_checked := v_added || v_kept;
  -- Lock the People so an archive or Group move lands before or after this save, never beside it.
  SELECT count(*) INTO v_eligible FROM (
    SELECT 1 FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.id = ANY (v_checked)
      AND person.archived_at IS NULL
      AND (v_group IS NULL OR person.group_id = v_group)
    FOR SHARE
  ) AS eligible;
  IF v_eligible <> cardinality(v_checked) THEN
    RAISE EXCEPTION 'Pick active people from this tasking''s roster' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.calendar_tasking_participants AS p
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id AND p.personnel_id = ANY (v_removed);
  INSERT INTO public.calendar_tasking_participants (organization_id, tasking_id, personnel_id, selected_by)
  SELECT p_organization_id, p_tasking_id, id, auth.uid() FROM unnest(v_added) AS id;
  UPDATE public.calendar_tasking_participants AS p SET review_since = NULL
  WHERE p.organization_id = p_organization_id AND p.tasking_id = p_tasking_id AND p.personnel_id = ANY (v_kept);

  UPDATE public.calendar_taskings AS t SET staffing_revision = t.staffing_revision + 1
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id;
  INSERT INTO public.calendar_tasking_activity (organization_id, tasking_id, actor_id, kind, payload)
  VALUES (p_organization_id, p_tasking_id, auth.uid(), 'staffing_changed', pg_catalog.jsonb_build_object(
    'added', pg_catalog.to_jsonb(v_added), 'removed', pg_catalog.to_jsonb(v_removed), 'kept', pg_catalog.to_jsonb(v_kept)
  ));
  RETURN QUERY SELECT 'saved'::text, v_revision + 1;
END;
$$;
ALTER FUNCTION public.save_calendar_tasking_people(uuid, uuid, uuid[], uuid[], boolean, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_calendar_tasking_people(uuid, uuid, uuid[], uuid[], boolean, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_calendar_tasking_people(uuid, uuid, uuid[], uuid[], boolean, integer) TO authenticated;

-- Staffing counts for the Taskings the reader can see. `outside_scope` counts
-- picks whose person the reader's roster scope does not cover; they stay nameless.
CREATE FUNCTION public.calendar_tasking_staffing(p_organization_id uuid, p_tasking_ids uuid[])
RETURNS TABLE (tasking_id uuid, revision integer, picked integer, needs_review integer, outside_scope integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t.staffing_revision,
    (count(p.personnel_id) FILTER (WHERE p.review_since IS NULL))::integer,
    (count(p.personnel_id) FILTER (WHERE p.review_since IS NOT NULL))::integer,
    (count(p.personnel_id) FILTER (
      WHERE NOT calendar_private.calendar_person_in_scope(p.organization_id, p.personnel_id)
    ))::integer
  FROM public.calendar_taskings AS t
  LEFT JOIN public.calendar_tasking_participants AS p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
  WHERE t.organization_id = p_organization_id AND t.id = ANY (p_tasking_ids)
    AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  GROUP BY t.id, t.staffing_revision
  ORDER BY t.id;
$$;
ALTER FUNCTION public.calendar_tasking_staffing(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_tasking_staffing(uuid, uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_staffing(uuid, uuid[]) TO authenticated;

-- The picks of one Tasking whose person is in the reader's roster scope, with the
-- roster facts that explain a review. Organization-wide readers see every pick.
CREATE FUNCTION public.calendar_tasking_people(p_organization_id uuid, p_tasking_id uuid)
RETURNS TABLE (
  personnel_id uuid, rank text, first_name text, last_name text, group_id uuid, archived boolean,
  selected_at timestamptz, review_since timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT person.id, person.rank, person.first_name, person.last_name, person.group_id, person.archived_at IS NOT NULL,
    p.selected_at, p.review_since
  FROM public.calendar_taskings AS t
  JOIN public.calendar_tasking_participants AS p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
  JOIN public.personnel AS person ON person.organization_id = p.organization_id AND person.id = p.personnel_id
  WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id
    AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
    AND public.calendar_personnel_group_scope_matches(person.organization_id, person.group_id)
  ORDER BY person.last_name, person.first_name, person.id;
$$;
ALTER FUNCTION public.calendar_tasking_people(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_tasking_people(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_people(uuid, uuid) TO authenticated;

-- "RANK Last, First" for each Person the reader's Calendar scope covers; others are absent.
CREATE FUNCTION public.calendar_person_labels(p_organization_id uuid, p_personnel_ids uuid[])
RETURNS TABLE (personnel_id uuid, label text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT person.id, pg_catalog.concat_ws(' ', NULLIF(person.rank, ''), pg_catalog.concat_ws(', ', person.last_name, person.first_name))
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND calendar_private.can_view_calendar_events(p_organization_id)
    AND public.calendar_personnel_group_scope_matches(person.organization_id, person.group_id)
  ORDER BY person.id;
$$;
ALTER FUNCTION public.calendar_person_labels(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_person_labels(uuid, uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_person_labels(uuid, uuid[]) TO authenticated;

-- What already occupies each Person over the Tasking's execution dates, for the
-- staffing picker. Covers active People in the operator's scope. Another active
-- Tasking the operator cannot see comes back without its id, title or dates.
-- Picks under review, Completed and Cancelled Taskings commit nobody.
CREATE FUNCTION public.calendar_tasking_advisories(p_organization_id uuid, p_tasking_id uuid)
RETURNS TABLE (
  personnel_id uuid, kind text, label text, starts_on date, ends_on date, other_tasking_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH tasking AS (
    SELECT t.organization_id, t.id, t.execution_starts_on AS starts_on, t.execution_ends_on AS ends_on
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id AND t.execution_starts_on IS NOT NULL
      AND calendar_private.can_manage_calendar_tasking(t.organization_id, t.responsible_group_id)
  ),
  people AS (
    SELECT person.id FROM public.personnel AS person, tasking
    WHERE person.organization_id = tasking.organization_id AND person.archived_at IS NULL
      AND public.calendar_personnel_group_scope_matches(person.organization_id, person.group_id)
  )
  SELECT a.personnel_id, 'availability', coalesce(s.name, 'Unavailable'), a.start_date, a.end_date, NULL::uuid
  FROM tasking
  JOIN public.availability_entries AS a ON a.organization_id = tasking.organization_id
    AND a.start_date <= tasking.ends_on AND a.end_date >= tasking.starts_on
  JOIN people ON people.id = a.personnel_id
  LEFT JOIN public.status_types AS s ON s.organization_id = a.organization_id AND s.id = a.status_type_id
  UNION ALL
  SELECT p.personnel_id, 'tasking',
    CASE WHEN visible THEN other.title END,
    CASE WHEN visible THEN other.execution_starts_on END,
    CASE WHEN visible THEN other.execution_ends_on END,
    CASE WHEN visible THEN other.id END
  FROM tasking
  JOIN public.calendar_taskings AS other ON other.organization_id = tasking.organization_id AND other.id <> tasking.id
    AND other.status IN ('open', 'in_progress', 'blocked')
    AND other.execution_starts_on <= tasking.ends_on AND other.execution_ends_on >= tasking.starts_on
  JOIN public.calendar_tasking_participants AS p ON p.organization_id = other.organization_id AND p.tasking_id = other.id
    AND p.review_since IS NULL
  JOIN people ON people.id = p.personnel_id
  CROSS JOIN LATERAL (
    SELECT calendar_private.can_view_calendar_tasking(other.organization_id, other.responsible_group_id) AS visible
  ) AS access
  ORDER BY 1, 4 NULLS LAST, 3, 2, 5, 6;
$$;
ALTER FUNCTION public.calendar_tasking_advisories(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_tasking_advisories(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_advisories(uuid, uuid) TO authenticated;

-- The Taskings that keep a Person or Group from permanent deletion. A Tasking the
-- caller cannot see comes back without its id or title, so it is only counted.
CREATE FUNCTION public.calendar_deletion_references(
  p_organization_id uuid, p_personnel_id uuid, p_group_id uuid
) RETURNS TABLE (tasking_id uuid, title text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN visible THEN t.id END, CASE WHEN visible THEN t.title END
  FROM public.calendar_taskings AS t
  CROSS JOIN LATERAL (
    SELECT calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id) AS visible
  ) AS access
  WHERE t.organization_id = p_organization_id
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships AS m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
    )
    AND (
      (p_group_id IS NOT NULL AND t.responsible_group_id = p_group_id)
      OR (p_personnel_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.calendar_tasking_participants AS p
        JOIN public.personnel AS person ON person.organization_id = p.organization_id AND person.id = p.personnel_id
        WHERE p.organization_id = t.organization_id AND p.tasking_id = t.id AND p.personnel_id = p_personnel_id
          AND public.can_view_personnel_record(person.organization_id, person.group_id)
      ))
    )
  ORDER BY t.suspense_on DESC, t.id;
$$;
ALTER FUNCTION public.calendar_deletion_references(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_deletion_references(uuid, uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_deletion_references(uuid, uuid, uuid) TO authenticated;

-- Retention keeps archived People that a Tasking still names.
CREATE OR REPLACE FUNCTION public.delete_expired_personnel(
  p_org_id uuid,
  p_candidate_ids uuid[],
  p_cutoff timestamptz
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_org_id IS NULL OR p_candidate_ids IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization, candidate IDs and cutoff are required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.personnel AS person
  WHERE person.organization_id = p_org_id
    AND person.id = ANY (p_candidate_ids)
    AND person.archived_at IS NOT NULL
    AND person.archived_at < p_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.calendar_tasking_participants AS p
      WHERE p.organization_id = person.organization_id AND p.personnel_id = person.id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
