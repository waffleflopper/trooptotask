BEGIN;

CREATE FUNCTION public.organization_member_labels(p_organization_id uuid)
RETURNS TABLE (user_id uuid, rank text, first_name text, last_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.user_id, p.rank, p.first_name, p.last_name, m.email
  FROM public.organization_memberships m
  LEFT JOIN public.user_profiles p ON p.user_id = m.user_id
  WHERE m.organization_id = p_organization_id
    AND EXISTS (SELECT 1 FROM public.organization_memberships caller
      WHERE caller.organization_id = p_organization_id AND caller.user_id = auth.uid())
  ORDER BY m.user_id;
$$;
REVOKE ALL ON FUNCTION public.organization_member_labels(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_member_labels(uuid) TO authenticated;

ALTER TABLE public.availability_entries ADD COLUMN set_for_tasking_id uuid;
-- Provenance can name work outside the Person reader's Tasking scope. Public readers redact it.
REVOKE SELECT ON public.availability_entries FROM authenticated;
GRANT SELECT (id, organization_id, personnel_id, status_type_id, start_date, end_date, created_at, note)
  ON public.availability_entries TO authenticated;
ALTER TABLE public.availability_entries ADD CONSTRAINT availability_entries_tasking_fkey
  FOREIGN KEY (organization_id, set_for_tasking_id) REFERENCES public.calendar_taskings(organization_id, id)
  ON DELETE SET NULL (set_for_tasking_id);
CREATE INDEX availability_entries_tasking_idx ON public.availability_entries(organization_id, set_for_tasking_id)
  WHERE set_for_tasking_id IS NOT NULL;

CREATE FUNCTION calendar_private.check_availability_tasking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.set_for_tasking_id IS NOT NULL AND (TG_OP = 'INSERT'
    OR NEW.set_for_tasking_id IS DISTINCT FROM OLD.set_for_tasking_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.calendar_taskings t
      WHERE t.organization_id = NEW.organization_id AND t.id = NEW.set_for_tasking_id
        AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)) THEN
      RAISE EXCEPTION 'Tasking is unavailable for this Organization' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.check_availability_tasking() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER check_availability_tasking BEFORE INSERT OR UPDATE ON public.availability_entries
  FOR EACH ROW EXECUTE FUNCTION calendar_private.check_availability_tasking();

-- Private unredacted facts are callable only by the scoped public readers below.
CREATE FUNCTION calendar_private.tasking_conflicts(p_organization_id uuid)
RETURNS TABLE(tasking_id uuid, personnel_id uuid, availability_id uuid, label text,
  starts_on date, ends_on date, overlap_days integer, execution_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id, p.personnel_id, a.id, s.name, a.start_date, a.end_date,
    least(a.end_date, t.execution_ends_on) - greatest(a.start_date, t.execution_starts_on) + 1,
    t.execution_ends_on - t.execution_starts_on + 1
  FROM public.calendar_taskings t
  JOIN public.calendar_tasking_participants p ON p.organization_id = t.organization_id AND p.tasking_id = t.id
    AND p.review_since IS NULL
  JOIN public.personnel person ON person.organization_id = p.organization_id AND person.id = p.personnel_id
    AND person.archived_at IS NULL
  JOIN public.availability_entries a ON a.organization_id = p.organization_id AND a.personnel_id = p.personnel_id
    AND a.start_date <= t.execution_ends_on AND a.end_date >= t.execution_starts_on
    AND a.set_for_tasking_id IS DISTINCT FROM t.id
  JOIN public.status_types s ON s.organization_id = a.organization_id AND s.id = a.status_type_id
    AND s.roster_effect <> 'available'
  WHERE t.organization_id = p_organization_id AND t.status IN ('open', 'in_progress', 'blocked');
$$;
REVOKE ALL ON FUNCTION calendar_private.tasking_conflicts(uuid) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.calendar_tasking_advisories(uuid, uuid);
CREATE FUNCTION public.calendar_tasking_advisories(p_organization_id uuid, p_tasking_id uuid)
RETURNS TABLE(personnel_id uuid, kind text, label text, starts_on date, ends_on date, other_tasking_id uuid,
  is_conflict boolean, overlap_days integer, execution_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH tasking AS MATERIALIZED (
    SELECT t.* FROM public.calendar_taskings t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id AND t.execution_starts_on IS NOT NULL
      AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  ), people AS MATERIALIZED (
    SELECT person.id FROM member_access_private.viewable_personnel('calendar') v
    JOIN public.personnel person ON person.organization_id = v.organization_id AND person.id = v.personnel_id
    JOIN tasking t ON t.organization_id = person.organization_id
    WHERE person.archived_at IS NULL
      AND (t.responsible_group_id IS NULL OR person.group_id = t.responsible_group_id
        OR EXISTS (SELECT 1 FROM public.calendar_tasking_participants p
          WHERE p.tasking_id = t.id AND p.personnel_id = person.id))
  )
  SELECT a.personnel_id, 'availability', s.name, a.start_date, a.end_date, NULL::uuid,
    t.status IN ('open', 'in_progress', 'blocked') AND a.set_for_tasking_id IS DISTINCT FROM t.id
      AND s.roster_effect <> 'available',
    least(a.end_date, t.execution_ends_on) - greatest(a.start_date, t.execution_starts_on) + 1,
    t.execution_ends_on - t.execution_starts_on + 1
  FROM tasking t
  JOIN public.availability_entries a ON a.organization_id = t.organization_id
    AND a.start_date <= t.execution_ends_on AND a.end_date >= t.execution_starts_on
  JOIN people ON people.id = a.personnel_id
  JOIN public.status_types s ON s.organization_id = a.organization_id AND s.id = a.status_type_id
  UNION ALL
  SELECT p.personnel_id, 'tasking', CASE WHEN visible THEN other.title END,
    CASE WHEN visible THEN other.execution_starts_on END, CASE WHEN visible THEN other.execution_ends_on END,
    CASE WHEN visible THEN other.id END, false, NULL::integer, NULL::integer
  FROM tasking t
  JOIN public.calendar_taskings other ON other.organization_id = t.organization_id AND other.id <> t.id
    AND other.status IN ('open', 'in_progress', 'blocked')
    AND other.execution_starts_on <= t.execution_ends_on AND other.execution_ends_on >= t.execution_starts_on
  JOIN public.calendar_tasking_participants p ON p.organization_id = other.organization_id AND p.tasking_id = other.id
    AND p.review_since IS NULL
  JOIN people ON people.id = p.personnel_id
  CROSS JOIN LATERAL (SELECT calendar_private.can_view_calendar_tasking(other.organization_id,
    other.responsible_group_id) AS visible) access
  ORDER BY 1, 4 NULLS LAST, 3, 2, 5, 6;
$$;
REVOKE ALL ON FUNCTION public.calendar_tasking_advisories(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_advisories(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.calendar_tasking_availability_gaps(p_organization_id uuid, p_tasking_id uuid)
RETURNS TABLE (personnel_id uuid, covered boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH tasking AS (
    SELECT t.organization_id, t.id, t.execution_starts_on AS starts_on, t.execution_ends_on AS ends_on
    FROM public.calendar_taskings AS t
    WHERE t.organization_id = p_organization_id AND t.id = p_tasking_id AND t.execution_starts_on IS NOT NULL
      AND calendar_private.can_view_calendar_tasking(t.organization_id, t.responsible_group_id)
  ),
  picked AS (
    SELECT p.personnel_id
    FROM tasking
    JOIN public.calendar_tasking_participants AS p ON p.organization_id = tasking.organization_id
      AND p.tasking_id = tasking.id AND p.review_since IS NULL
    WHERE public.can_edit_availability_record(tasking.organization_id, p.personnel_id)
  ),
  clipped AS (
    SELECT a.personnel_id, greatest(a.start_date, tasking.starts_on) AS lo, least(a.end_date, tasking.ends_on) AS hi
    FROM tasking
    JOIN public.availability_entries AS a ON a.organization_id = tasking.organization_id
      AND a.set_for_tasking_id = tasking.id
      AND a.start_date <= tasking.ends_on AND a.end_date >= tasking.starts_on
    WHERE a.personnel_id IN (SELECT picked.personnel_id FROM picked)
  ),
  -- Each entry adds only the days past everything that started before it.
  fresh AS (
    SELECT clipped.personnel_id,
      greatest(0, clipped.hi - greatest(
        clipped.lo - 1,
        coalesce(max(clipped.hi) OVER (
          PARTITION BY clipped.personnel_id ORDER BY clipped.lo, clipped.hi ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), clipped.lo - 1)
      )) AS days
    FROM clipped
  ),
  covered AS (
    SELECT fresh.personnel_id, sum(fresh.days) AS days FROM fresh GROUP BY fresh.personnel_id
  )
  SELECT picked.personnel_id, coalesce(covered.days, 0) >= tasking.ends_on - tasking.starts_on + 1
  FROM picked CROSS JOIN tasking
  LEFT JOIN covered ON covered.personnel_id = picked.personnel_id
  ORDER BY picked.personnel_id;
$$;
ALTER FUNCTION public.calendar_tasking_availability_gaps(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_tasking_availability_gaps(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_tasking_availability_gaps(uuid, uuid) TO authenticated;

ALTER FUNCTION public.organization_member_labels(uuid) OWNER TO postgres;
ALTER FUNCTION calendar_private.check_availability_tasking() OWNER TO postgres;
ALTER FUNCTION calendar_private.tasking_conflicts(uuid) OWNER TO postgres;
ALTER FUNCTION public.calendar_tasking_advisories(uuid, uuid) OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
COMMIT;
