BEGIN;

DROP FUNCTION public.close_roster_form(uuid, uuid, uuid, date, jsonb, text, jsonb, jsonb);

CREATE FUNCTION public.close_roster_form(
  p_actor uuid,
  p_organization_id uuid,
  p_assignment_type_id uuid,
  p_form_id uuid,
  p_today date,
  p_pool_rules jsonb,
  p_weekend_mode text,
  p_record jsonb,
  p_carry jsonb
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_form public.roster_forms%ROWTYPE;
  v_rules jsonb;
  v_next uuid;
  v_pool jsonb := NULLIF(p_pool_rules, 'null'::jsonb);
  v_ending boolean := p_weekend_mode IS NULL;
BEGIN
  IF p_actor IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
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
  SELECT p_organization_id, v_next, c.personnel_id, c.track, c.count, 'carried'
  FROM pg_catalog.jsonb_to_recordset(p_carry) AS c(personnel_id uuid, track text, count integer)
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

ALTER FUNCTION public.close_roster_form(uuid, uuid, uuid, uuid, date, jsonb, text, jsonb, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.close_roster_form(uuid, uuid, uuid, uuid, date, jsonb, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_roster_form(uuid, uuid, uuid, uuid, date, jsonb, text, jsonb, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
