-- Calendar availability and assignment reads decide visibility once per
-- statement, and the assignment save reads only the days it replaces. The
-- per-row helpers ran several definer functions for every row a read scanned,
-- and the save scanned every row of the Organization, so both grew with the
-- Organization's rows rather than with the work asked for.
BEGIN;

ALTER POLICY "Users can view availability if allowed by scoped calendar acces"
ON public.availability_entries
TO authenticated
USING ((organization_id, personnel_id) IN (
  SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
));

-- The same rule as can_view_daily_assignment_record, as a set: view in the
-- Calendar lane, then a Person assignee by viewable_personnel('calendar') and a
-- Group assignee by Group scope, each only under a type of its own kind.
CREATE FUNCTION calendar_private.viewable_assignees()
RETURNS TABLE(organization_id uuid, assignment_type_id uuid, assignee_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.organization_id, t.id, v.personnel_id::text
  FROM member_access_private.viewable_personnel('calendar') v
  JOIN public.assignment_types t ON t.organization_id = v.organization_id AND t.assign_to = 'personnel'
  UNION ALL
  SELECT t.organization_id, t.id, g.id::text
  FROM public.organization_memberships m
  JOIN public.groups g ON g.organization_id = m.organization_id
  JOIN public.assignment_types t ON t.organization_id = m.organization_id AND t.assign_to = 'group'
  WHERE m.user_id = auth.uid()
    AND public.member_access_has_capability(m.organization_id, 'calendar', 'view')
    AND (
      m.role IN ('owner', 'admin')
      OR m.access_scope_kind = 'organization'
      OR (m.access_scope_kind = 'groups' AND g.id = ANY(m.access_scope_group_ids))
    );
$$;

REVOKE ALL ON FUNCTION calendar_private.viewable_assignees() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION calendar_private.viewable_assignees() TO authenticated;

ALTER POLICY "Users can view daily assignments if allowed by scoped calendar "
ON public.daily_assignments
TO authenticated
USING ((organization_id, assignment_type_id, assignee_id) IN (
  SELECT v.organization_id, v.assignment_type_id, v.assignee_id FROM calendar_private.viewable_assignees() v
));

-- The two SELECT policies were their only callers.
DROP FUNCTION public.can_view_availability_record(uuid, uuid);
DROP FUNCTION public.can_view_daily_assignment_record(uuid, uuid, text);

-- Every affected row lies on a replaced day or a slot's day, so that leading
-- condition only lets the index skip the rest of the Organization.
CREATE OR REPLACE FUNCTION calendar_private.can_replace_daily_assignment_rows(
  p_organization_id uuid, p_replace_days date[], p_slots jsonb
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.member_access_has_capability(p_organization_id, 'calendar', 'operate')
    AND NOT EXISTS (
      SELECT 1
      FROM public.daily_assignments AS existing
      WHERE existing.organization_id = p_organization_id
        AND existing.date = ANY(p_replace_days || ARRAY(
          SELECT slot.date FROM jsonb_to_recordset(p_slots) AS slot(date date, assignment_type_id uuid, assignee_id text)
        ))
        AND (
          existing.date = ANY(p_replace_days)
          OR EXISTS (
            SELECT 1
            FROM jsonb_to_recordset(p_slots) AS slot(date date, assignment_type_id uuid, assignee_id text)
            WHERE slot.date = existing.date
              AND slot.assignment_type_id = existing.assignment_type_id
          )
        )
        AND public.can_edit_daily_assignment_record(
          existing.organization_id, existing.assignment_type_id, existing.assignee_id
        ) IS NOT TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.replace_daily_assignment_slots(
  p_organization_id uuid, p_replace_days date[], p_slots jsonb
) RETURNS SETOF public.daily_assignments
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  slot jsonb;
  slot_date date;
  slot_type uuid;
  slot_assignee text;
  affected_date date;
  affected_days date[];
  normalized_slots jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar assignment operation is not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_replace_days IS NULL OR p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array'
    OR array_position(p_replace_days, NULL) IS NOT NULL
    OR cardinality(p_replace_days) + jsonb_array_length(p_slots) = 0
    OR cardinality(p_replace_days) > 1000 OR jsonb_array_length(p_slots) > 1000
    OR (SELECT count(*) FROM unnest(p_replace_days) AS day(value)) <> (
      SELECT count(DISTINCT value) FROM unnest(p_replace_days) AS day(value)
    )
  THEN
    RAISE EXCEPTION 'Invalid Calendar assignment replacement' USING ERRCODE = '22023';
  END IF;

  FOR slot IN SELECT value FROM jsonb_array_elements(p_slots)
  LOOP
    IF jsonb_typeof(slot) IS DISTINCT FROM 'object'
      OR jsonb_typeof(slot->'date') IS DISTINCT FROM 'string'
      OR jsonb_typeof(slot->'assignment_type_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(slot->'assignee_id') IS DISTINCT FROM 'string'
      OR (slot->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RAISE EXCEPTION 'Invalid Calendar assignment slot' USING ERRCODE = '22023';
    END IF;

    BEGIN
      slot_date := (slot->>'date')::date;
      slot_type := (slot->>'assignment_type_id')::uuid;
    EXCEPTION
      WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid Calendar assignment slot' USING ERRCODE = '22023';
    END;
    slot_assignee := btrim(slot->>'assignee_id');
    IF to_char(slot_date, 'YYYY-MM-DD') <> slot->>'date' THEN
      RAISE EXCEPTION 'Invalid Calendar assignment date' USING ERRCODE = '22023';
    END IF;
    IF slot_assignee <> '' AND public.can_edit_daily_assignment_record(
      p_organization_id, slot_type, slot_assignee
    ) IS NOT TRUE THEN
      RAISE EXCEPTION 'Calendar assignment operation is not allowed' USING ERRCODE = '42501';
    END IF;

    normalized_slots := normalized_slots || jsonb_build_array(jsonb_build_object(
      'date', slot_date, 'assignment_type_id', slot_type, 'assignee_id', slot_assignee
    ));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(normalized_slots)
      AS item(date date, assignment_type_id uuid, assignee_id text)
    GROUP BY item.date, item.assignment_type_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Calendar assignment slot' USING ERRCODE = '22023';
  END IF;

  affected_days := ARRAY(
    SELECT DISTINCT day FROM (
      SELECT unnest(p_replace_days) AS day
      UNION ALL
      SELECT item.date AS day FROM jsonb_to_recordset(normalized_slots)
        AS item(date date, assignment_type_id uuid, assignee_id text)
    ) AS affected ORDER BY day
  );

  -- Lock empty days too; row locks alone cannot serialize competing inserts.
  FOREACH affected_date IN ARRAY affected_days
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(affected_date::text)
    );
  END LOOP;

  IF calendar_private.can_replace_daily_assignment_rows(
    p_organization_id, p_replace_days, normalized_slots
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Assignment slot unavailable' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.daily_assignments AS existing
  WHERE existing.organization_id = p_organization_id
    AND existing.date = ANY(affected_days)
    AND (
      existing.date = ANY(p_replace_days)
      OR EXISTS (
        SELECT 1 FROM jsonb_to_recordset(normalized_slots)
          AS item(date date, assignment_type_id uuid, assignee_id text)
        WHERE item.date = existing.date
          AND item.assignment_type_id = existing.assignment_type_id
      )
    );

  RETURN QUERY
    INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
    SELECT p_organization_id, item.assignment_type_id, item.date, item.assignee_id
    FROM jsonb_to_recordset(normalized_slots)
      AS item(date date, assignment_type_id uuid, assignee_id text)
    WHERE item.assignee_id <> ''
    ORDER BY item.date, item.assignment_type_id
    RETURNING *;
END;
$$;

COMMIT;
