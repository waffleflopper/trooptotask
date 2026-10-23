-- A unit moving from a paper DA 6 types each person's last number into the
-- open form. Typed numbers stay editable until the first detail on the form is
-- served, and a form that carried its numbers from the last one never takes
-- typed ones. An edit re-picks the roster's planned days in the same
-- transaction, so the roster never shows numbers its picks did not use.
--
-- The re-picks must stay roster picks, and only the server's roster path may
-- write those (20261022000400), so this runs like write_roster_assignment_slots:
-- as the service role on behalf of p_actor, re-checking the actor's authority.
BEGIN;

-- p_numbers is [{personnel_id, track, count}], the whole typed set; a person
-- left out starts at the pool's lowest number. p_repicks is [{date,
-- assignee_id, was}] for this type's roster picks after p_today that the new
-- numbers move, computed by the application with the count engine. Each slot
-- must still hold `was` as a roster pick, or the whole save fails.
CREATE FUNCTION public.set_roster_starting_numbers(
  p_actor uuid,
  p_organization_id uuid,
  p_assignment_type_id uuid,
  p_form_id uuid,
  p_today date,
  p_numbers jsonb,
  p_repicks jsonb
) RETURNS SETOF public.daily_assignments
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_form public.roster_forms%ROWTYPE;
  v_mode text;
  v_tracks text[];
  v_slots jsonb;
  v_day date;
BEGIN
  IF p_actor IS NULL OR p_organization_id IS NULL OR p_assignment_type_id IS NULL OR p_form_id IS NULL
    OR p_numbers IS NULL OR pg_catalog.jsonb_typeof(p_numbers) <> 'array'
    OR p_repicks IS NULL OR pg_catalog.jsonb_typeof(p_repicks) <> 'array'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_numbers) AS n(value)
      WHERE pg_catalog.jsonb_typeof(n.value) IS DISTINCT FROM 'object'
        OR (n.value ->> 'personnel_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(n.value -> 'track') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(n.value -> 'count') IS DISTINCT FROM 'number'
        OR (n.value ->> 'count') !~ '^[0-9]{1,4}$'
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_repicks) AS r(value)
      WHERE pg_catalog.jsonb_typeof(r.value) IS DISTINCT FROM 'object'
        OR (r.value ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR (r.value ->> 'assignee_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(r.value -> 'was') IS DISTINCT FROM 'string'
    )
  THEN
    RAISE EXCEPTION 'Invalid starting numbers' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);

  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_today IS NULL OR pg_catalog.abs(p_today - (pg_catalog.now() AT TIME ZONE 'UTC')::date) > 1 THEN
    RAISE EXCEPTION 'The date on this device is off' USING ERRCODE = 'RSD01';
  END IF;

  -- The same lock close_roster_form takes, so a close and this save never interleave.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('roster-form:' || p_assignment_type_id::text, 0)
  );
  SELECT roster_weekend_mode INTO v_mode FROM public.assignment_types
  WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND assign_to = 'personnel'
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment type not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_form FROM public.roster_forms
  WHERE organization_id = p_organization_id AND assignment_type_id = p_assignment_type_id AND ends_on IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_form.id <> p_form_id THEN
    RAISE EXCEPTION 'The DA 6 form changed' USING ERRCODE = 'RSF01';
  END IF;

  -- The lock, as the count engine's startingNumbersLocked decides it: carried
  -- numbers, or a detail dated on or before today on one of the form's tracks.
  -- Under No duty, a weekend or holiday assignment is not a detail.
  IF EXISTS (SELECT 1 FROM public.roster_starting_numbers WHERE form_id = v_form.id AND origin = 'carried')
    OR EXISTS (
      SELECT 1 FROM public.daily_assignments a
      WHERE a.organization_id = p_organization_id AND a.assignment_type_id = p_assignment_type_id
        AND a.date BETWEEN v_form.starts_on AND p_today
        AND (
          v_mode <> 'none'
          OR (
            pg_catalog.date_part('isodow', a.date) < 6
            AND NOT EXISTS (
              SELECT 1 FROM public.special_days s WHERE s.organization_id = p_organization_id AND s.date = a.date
            )
          )
        )
    )
  THEN
    RAISE EXCEPTION 'The starting numbers are part of the record' USING ERRCODE = 'RSL01';
  END IF;

  v_tracks := CASE v_mode WHEN 'separate' THEN ARRAY['weekday', 'weekend'] WHEN 'none' THEN ARRAY['weekday'] ELSE ARRAY['all'] END;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_numbers) AS n(personnel_id uuid, track text)
    WHERE n.track <> ALL (v_tracks)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_numbers) AS n(personnel_id uuid, track text)
    GROUP BY n.personnel_id, n.track HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_repicks) AS r(date date)
    WHERE r.date <= p_today
  ) THEN
    RAISE EXCEPTION 'Invalid starting numbers' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_numbers) AS n(personnel_id uuid)
    WHERE n.personnel_id NOT IN (
      SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
      WHERE v.organization_id = p_organization_id
    )
  ) THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.set_config('trooptotask.roster_close', 'on', true);
  DELETE FROM public.roster_starting_numbers WHERE form_id = v_form.id;
  INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin)
  SELECT p_organization_id, v_form.id, n.personnel_id, n.track, n.count, 'typed'
  FROM pg_catalog.jsonb_to_recordset(p_numbers) AS n(personnel_id uuid, track text, count integer);
  PERFORM pg_catalog.set_config('trooptotask.roster_close', '', true);

  IF pg_catalog.jsonb_array_length(p_repicks) = 0 THEN
    RETURN;
  END IF;

  -- The same per-day locks the replacement takes, in the same order, so the check holds through the write.
  FOR v_day IN
    SELECT DISTINCT r.date FROM pg_catalog.jsonb_to_recordset(p_repicks) AS r(date date) ORDER BY r.date
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(v_day::text)
    );
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_repicks) AS r(date date, was text)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.daily_assignments a
      WHERE a.organization_id = p_organization_id AND a.assignment_type_id = p_assignment_type_id
        AND a.date = r.date AND a.assignee_id = r.was AND a.source = 'roster'
    )
  ) THEN
    RAISE EXCEPTION 'Assignment slot unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'date', r.date, 'assignment_type_id', p_assignment_type_id, 'assignee_id', r.assignee_id,
    'was', r.was, 'source', 'roster'
  )) INTO v_slots
  FROM pg_catalog.jsonb_to_recordset(p_repicks) AS r(date date, assignee_id text, was text);
  RETURN QUERY SELECT * FROM public.write_roster_assignment_slots(p_actor, p_organization_id, v_slots);
END;
$$;

ALTER FUNCTION public.set_roster_starting_numbers(uuid, uuid, uuid, uuid, date, jsonb, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_roster_starting_numbers(uuid, uuid, uuid, uuid, date, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_roster_starting_numbers(uuid, uuid, uuid, uuid, date, jsonb, jsonb) TO service_role;

COMMIT;
