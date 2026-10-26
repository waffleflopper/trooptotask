-- Each picked Person a Calendar operator could give Availability for a Tasking, and whether their
-- Availability entries, together, cover every execution day. Derived on read, never stored.
-- Covers People the caller may write Availability for; picks under review commit nobody.
CREATE FUNCTION public.calendar_tasking_availability_gaps(p_organization_id uuid, p_tasking_id uuid)
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
