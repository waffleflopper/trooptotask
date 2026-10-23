BEGIN;

-- Resolve from the stored row so a composite argument cannot spoof its Organization.
-- Definer reads include retained assignments whose Person has since been deleted.
CREATE FUNCTION public.roster_form_effective_start(p_form public.roster_forms) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN f.ends_on IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.roster_forms previous
        WHERE previous.organization_id = f.organization_id AND previous.assignment_type_id = f.assignment_type_id
          AND previous.ends_on IS NOT NULL AND previous.id <> f.id)
      OR EXISTS (SELECT 1 FROM public.roster_starting_numbers n WHERE n.form_id = f.id AND n.origin = 'carried')
    THEN f.starts_on
    ELSE LEAST(f.starts_on, (SELECT min(a.date) FROM public.daily_assignments a
      WHERE a.organization_id = f.organization_id AND a.assignment_type_id = f.assignment_type_id
        AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.organization_id = a.organization_id AND g.id::text = a.assignee_id)))
    END
  FROM public.roster_forms f
  WHERE f.id = p_form.id AND (
    auth.role() = 'service_role'
    OR f.organization_id IN (SELECT v.organization_id FROM calendar_private.organization_wide_viewer_organizations() v)
  );
$$;
REVOKE ALL ON FUNCTION public.roster_form_effective_start(public.roster_forms) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roster_form_effective_start(public.roster_forms) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_roster_starting_numbers(
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
        AND a.date BETWEEN public.roster_form_effective_start(v_form) AND p_today
        AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.organization_id = a.organization_id AND g.id::text = a.assignee_id)
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


CREATE OR REPLACE FUNCTION public.close_roster_form(
  p_organization_id uuid,
  p_assignment_type_id uuid,
  p_form_id uuid,
  p_today date,
  p_pool_rules jsonb,
  p_weekend_mode text,
  p_record jsonb,
  p_carry jsonb
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_form public.roster_forms%ROWTYPE;
  v_rules jsonb;
  v_next uuid;
  v_pool jsonb := NULLIF(p_pool_rules, 'null'::jsonb);
  v_ending boolean := p_weekend_mode IS NULL;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_assignment_type_id IS NULL OR p_form_id IS NULL
    OR p_weekend_mode NOT IN ('same', 'separate', 'none')
    OR (p_record IS NOT NULL AND pg_catalog.jsonb_typeof(p_record) <> 'object')
    OR p_carry IS NULL OR pg_catalog.jsonb_typeof(p_carry) <> 'array'
    OR (v_ending AND (v_pool IS NOT NULL OR pg_catalog.jsonb_array_length(p_carry) > 0))
  THEN
    RAISE EXCEPTION 'Invalid roster rules' USING ERRCODE = '22023';
  END IF;
  IF v_pool IS NOT NULL AND NOT public.is_roster_pool_rules(v_pool) THEN
    RAISE EXCEPTION 'Pool rules need a rank range or null, and lists of MOS, roles and group ids' USING ERRCODE = '22023';
  END IF;
  IF p_today IS NULL OR pg_catalog.abs(p_today - (pg_catalog.now() AT TIME ZONE 'UTC')::date) > 1 THEN
    RAISE EXCEPTION 'The date on this device is off' USING ERRCODE = 'RSD01';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('roster-form:' || p_assignment_type_id::text, 0)
  );
  PERFORM 1 FROM public.assignment_types
  WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND assign_to = 'personnel'
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Assignment type not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_form FROM public.roster_forms
  WHERE organization_id = p_organization_id AND assignment_type_id = p_assignment_type_id AND ends_on IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_form.id <> p_form_id THEN
    RAISE EXCEPTION 'The DA 6 form changed' USING ERRCODE = 'RSF01';
  END IF;
  v_form.starts_on := public.roster_form_effective_start(v_form);
  IF (v_form.starts_on > p_today) <> (p_record IS NULL) THEN
    RAISE EXCEPTION 'Invalid DA 6 record' USING ERRCODE = '22023';
  END IF;

  v_rules := pg_catalog.jsonb_build_object('pool', v_pool, 'weekendMode', p_weekend_mode);
  PERFORM pg_catalog.set_config('trooptotask.roster_close', 'on', true);
  IF p_record IS NULL AND v_ending THEN
    DELETE FROM public.roster_forms WHERE id = v_form.id;
  ELSIF p_record IS NULL THEN
    UPDATE public.roster_forms SET rules = v_rules WHERE id = v_form.id;
    DELETE FROM public.roster_starting_numbers WHERE form_id = v_form.id;
    v_next := v_form.id;
  ELSE
    UPDATE public.roster_forms SET starts_on = v_form.starts_on, ends_on = p_today, record = p_record WHERE id = v_form.id;
    IF NOT v_ending THEN
      INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, rules)
      VALUES (p_organization_id, p_assignment_type_id, p_today + 1, v_rules)
      RETURNING id INTO v_next;
    END IF;
  END IF;

  -- People deleted since the application read the form have nothing to carry.
  INSERT INTO public.roster_starting_numbers (organization_id, form_id, personnel_id, track, count, origin)
  SELECT p_organization_id, v_next, c.personnel_id, c.track, c.count, c.origin
  FROM pg_catalog.jsonb_to_recordset(p_carry) AS c(personnel_id uuid, track text, count integer, origin text)
  WHERE c.personnel_id IN (
    SELECT v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
    WHERE v.organization_id = p_organization_id
  );

  IF v_ending THEN
    UPDATE public.assignment_types SET assign_to = 'group'
    WHERE organization_id = p_organization_id AND id = p_assignment_type_id;
  ELSE
    UPDATE public.assignment_types SET roster_pool_rules = v_pool, roster_weekend_mode = p_weekend_mode
    WHERE organization_id = p_organization_id AND id = p_assignment_type_id;
  END IF;
  PERFORM pg_catalog.set_config('trooptotask.roster_close', '', true);

  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_ending THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.assignment_types
      WHERE organization_id = p_organization_id AND id = p_assignment_type_id AND assign_to = 'group'
    ) THEN
      RAISE EXCEPTION 'The DA 6 form was not saved' USING ERRCODE = 'RSF01';
    END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assignment_types
    WHERE organization_id = p_organization_id AND id = p_assignment_type_id
      AND roster_pool_rules IS NOT DISTINCT FROM v_pool AND roster_weekend_mode = p_weekend_mode
  ) OR NOT EXISTS (
    SELECT 1 FROM public.roster_forms WHERE id = v_next AND ends_on IS NULL AND rules = v_rules
  ) THEN
    RAISE EXCEPTION 'The DA 6 form was not saved' USING ERRCODE = 'RSF01';
  END IF;
  RETURN v_next;
END;
$$;


CREATE OR REPLACE FUNCTION public.list_roster_detail_days(
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
    AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.organization_id = a.organization_id AND g.id::text = a.assignee_id)
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


-- The server authorizes Calendar access and supplies its Organization and Group scope.
CREATE FUNCTION public.calendar_roster_attribute_timelines(
  p_organization_id uuid, p_from date, p_through date, p_group_ids uuid[] DEFAULT NULL
) RETURNS TABLE (
  id uuid, rank text, last_name text, first_name text, mos text, clinic_role text,
  group_id uuid, created_at timestamptz, archived_at timestamptz, history jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p.id, p.rank, p.last_name, p.first_name, p.mos, p.clinic_role,
    p.group_id, p.created_at, p.archived_at, states.history
  FROM public.personnel p
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(to_jsonb(h) ORDER BY h.effective_on) AS history, bool_or(NOT h.archived) AS active
    FROM (
      (SELECT h.effective_on, h.rank, h.mos, h.clinic_role, h.group_id, h.archived
        FROM public.personnel_attribute_history h
        WHERE h.organization_id = p.organization_id AND h.personnel_id = p.id AND h.effective_on <= p_from
        ORDER BY h.effective_on DESC LIMIT 1)
      UNION ALL
      SELECT h.effective_on, h.rank, h.mos, h.clinic_role, h.group_id, h.archived
        FROM public.personnel_attribute_history h
        WHERE h.organization_id = p.organization_id AND h.personnel_id = p.id
          AND h.effective_on > p_from AND h.effective_on <= p_through
    ) h
  ) states ON true
  WHERE p.organization_id = p_organization_id
    AND (p_group_ids IS NULL OR p.group_id = ANY(p_group_ids))
    AND (states.history IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.personnel_attribute_history h WHERE h.organization_id = p.organization_id AND h.personnel_id = p.id
    ))
    AND (states.active OR states.history IS NULL OR EXISTS (
      SELECT 1 FROM public.daily_assignments a WHERE a.organization_id = p.organization_id
        AND a.assignee_id = p.id::text AND a.date BETWEEN p_from AND p_through
    ) OR EXISTS (
      SELECT 1 FROM public.roster_excusals x WHERE x.organization_id = p.organization_id AND x.personnel_id = p.id
        AND x.starts_on <= p_through AND (x.ends_on IS NULL OR x.ends_on >= p_from)
    ) OR EXISTS (
      SELECT 1 FROM public.roster_starting_numbers n JOIN public.roster_forms f ON f.id = n.form_id
      WHERE n.organization_id = p.organization_id AND n.personnel_id = p.id AND f.ends_on IS NULL
    ));
$$;
REVOKE ALL ON FUNCTION public.calendar_roster_attribute_timelines(uuid, date, date, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_roster_attribute_timelines(uuid, date, date, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
