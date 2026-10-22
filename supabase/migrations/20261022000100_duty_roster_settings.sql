-- Every person-assigned assignment type is a duty roster. Its pool rules and
-- weekend mode live on the type, and each run under one set of rules is a DA 6
-- form. close_roster_form is the only application writer of the rules, the
-- forms and their starting numbers: it closes the open form with the record the
-- application computed, carries the counts, and opens the next form the
-- following day, or ends the roster when the type becomes a Group assignment.
-- Dated excusals with a reason replace exempt_personnel_ids.
BEGIN;

-- The shapes the application parses (poolRulesSchema and the form rules). The
-- checks run for every writer, so the functions are executable by all API roles.
CREATE FUNCTION public.is_roster_pool_rules(p_rules jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_key text;
BEGIN
  IF p_rules IS NULL OR pg_catalog.jsonb_typeof(p_rules) <> 'object'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_rules)) <> 4
  THEN
    RETURN false;
  END IF;
  FOREACH v_key IN ARRAY ARRAY['mos', 'role', 'groupIds'] LOOP
    IF pg_catalog.jsonb_typeof(p_rules -> v_key) IS DISTINCT FROM 'array' THEN
      RETURN false;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_rules -> v_key) AS e(value)
      WHERE pg_catalog.jsonb_typeof(e.value) <> 'string'
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  IF pg_catalog.jsonb_typeof(p_rules -> 'rank') = 'null' THEN
    RETURN true;
  END IF;
  IF pg_catalog.jsonb_typeof(p_rules -> 'rank') IS DISTINCT FROM 'object'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_rules -> 'rank')) <> 2
  THEN
    RETURN false;
  END IF;
  RETURN pg_catalog.jsonb_typeof(p_rules -> 'rank' -> 'from') IS NOT DISTINCT FROM 'string'
    AND pg_catalog.jsonb_typeof(p_rules -> 'rank' -> 'to') IS NOT DISTINCT FROM 'string'
    AND (p_rules -> 'rank' ->> 'from') IS DISTINCT FROM ''
    AND (p_rules -> 'rank' ->> 'to') IS DISTINCT FROM '';
END;
$$;

CREATE FUNCTION public.is_roster_form_rules(p_rules jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_rules IS NULL OR pg_catalog.jsonb_typeof(p_rules) <> 'object'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_rules)) <> 2
  THEN
    RETURN false;
  END IF;
  IF pg_catalog.jsonb_typeof(p_rules -> 'weekendMode') IS DISTINCT FROM 'string'
    OR (p_rules ->> 'weekendMode') NOT IN ('same', 'separate', 'none')
  THEN
    RETURN false;
  END IF;
  RETURN pg_catalog.jsonb_typeof(p_rules -> 'pool') IS NOT DISTINCT FROM 'null'
    OR public.is_roster_pool_rules(p_rules -> 'pool');
END;
$$;

REVOKE ALL ON FUNCTION public.is_roster_pool_rules(jsonb), public.is_roster_form_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_roster_pool_rules(jsonb), public.is_roster_form_rules(jsonb)
  TO anon, authenticated, service_role;

ALTER TABLE public.assignment_types
  ADD CONSTRAINT assignment_types_organization_id_id_key UNIQUE (organization_id, id),
  ADD COLUMN roster_pool_rules jsonb NULL
    CONSTRAINT assignment_types_roster_pool_rules_check CHECK (roster_pool_rules IS NULL OR public.is_roster_pool_rules(roster_pool_rules)),
  ADD COLUMN roster_weekend_mode text NOT NULL DEFAULT 'same'
    CONSTRAINT assignment_types_roster_weekend_mode_check CHECK (roster_weekend_mode IN ('same', 'separate', 'none'));

CREATE TABLE public.roster_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  assignment_type_id uuid NOT NULL,
  starts_on date NOT NULL,
  -- Null while the form is open. A closed form keeps its record and never changes.
  ends_on date NULL,
  rules jsonb NOT NULL CONSTRAINT roster_forms_rules_check CHECK (public.is_roster_form_rules(rules)),
  record jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_forms_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT roster_forms_assignment_type_fkey FOREIGN KEY (organization_id, assignment_type_id)
    REFERENCES public.assignment_types (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT roster_forms_dates_check CHECK (ends_on >= starts_on),
  CONSTRAINT roster_forms_record_check CHECK ((ends_on IS NULL) = (record IS NULL)),
  CONSTRAINT roster_forms_record_object_check CHECK (pg_catalog.jsonb_typeof(record) = 'object')
);
CREATE UNIQUE INDEX roster_forms_one_open_per_type ON public.roster_forms (assignment_type_id) WHERE ends_on IS NULL;
CREATE INDEX roster_forms_type_starts_on_idx ON public.roster_forms (organization_id, assignment_type_id, starts_on);

CREATE TABLE public.roster_starting_numbers (
  organization_id uuid NOT NULL,
  form_id uuid NOT NULL,
  personnel_id uuid NOT NULL,
  track text NOT NULL CONSTRAINT roster_starting_numbers_track_check CHECK (track IN ('all', 'weekday', 'weekend')),
  count integer NOT NULL CONSTRAINT roster_starting_numbers_count_check CHECK (count >= 0),
  origin text NOT NULL CONSTRAINT roster_starting_numbers_origin_check CHECK (origin IN ('typed', 'carried')),
  PRIMARY KEY (form_id, personnel_id, track),
  CONSTRAINT roster_starting_numbers_form_fkey FOREIGN KEY (organization_id, form_id)
    REFERENCES public.roster_forms (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT roster_starting_numbers_personnel_fkey FOREIGN KEY (organization_id, personnel_id)
    REFERENCES public.personnel (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX roster_starting_numbers_personnel_idx ON public.roster_starting_numbers (organization_id, personnel_id);

CREATE TABLE public.roster_excusals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  assignment_type_id uuid NOT NULL,
  personnel_id uuid NOT NULL,
  reason text NOT NULL CONSTRAINT roster_excusals_reason_check
    CHECK (pg_catalog.btrim(reason) <> '' AND pg_catalog.char_length(reason) <= 120),
  starts_on date NOT NULL,
  -- The last excused day, set when the person is reinstated.
  ends_on date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_excusals_dates_check CHECK (ends_on >= starts_on),
  CONSTRAINT roster_excusals_assignment_type_fkey FOREIGN KEY (organization_id, assignment_type_id)
    REFERENCES public.assignment_types (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT roster_excusals_personnel_fkey FOREIGN KEY (organization_id, personnel_id)
    REFERENCES public.personnel (organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX roster_excusals_one_open_per_person
  ON public.roster_excusals (assignment_type_id, personnel_id) WHERE ends_on IS NULL;
CREATE INDEX roster_excusals_type_idx ON public.roster_excusals (organization_id, assignment_type_id);
CREATE INDEX roster_excusals_personnel_idx ON public.roster_excusals (organization_id, personnel_id);

ALTER TABLE public.roster_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_starting_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_excusals ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION calendar_private.organization_wide_viewer_organizations()
RETURNS TABLE(organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.organization_id
  FROM public.organization_memberships m
  WHERE m.user_id = auth.uid()
    AND public.member_access_has_capability(m.organization_id, 'calendar', 'view')
    AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization');
$$;

REVOKE ALL ON FUNCTION calendar_private.organization_wide_viewer_organizations() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION calendar_private.organization_wide_viewer_organizations() TO authenticated;

CREATE POLICY "Calendar viewers can read DA 6 forms" ON public.roster_forms
  FOR SELECT TO authenticated USING (organization_id IN (
    SELECT v.organization_id FROM calendar_private.organization_wide_viewer_organizations() v
  ));
CREATE POLICY "Calendar configurators can manage DA 6 forms" ON public.roster_forms
  USING (public.can_manage_calendar_configuration(organization_id))
  WITH CHECK (public.can_manage_calendar_configuration(organization_id));
CREATE POLICY "Calendar viewers can read roster starting numbers" ON public.roster_starting_numbers
  FOR SELECT TO authenticated USING ((organization_id, personnel_id) IN (
    SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
  ));
CREATE POLICY "Calendar configurators can manage roster starting numbers" ON public.roster_starting_numbers
  USING (public.can_manage_calendar_configuration(organization_id))
  WITH CHECK (public.can_manage_calendar_configuration(organization_id));
CREATE POLICY "Calendar viewers can read roster excusals" ON public.roster_excusals
  FOR SELECT TO authenticated USING ((organization_id, personnel_id) IN (
    SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
  ));
CREATE POLICY "Calendar configurators can manage roster excusals" ON public.roster_excusals
  USING (public.can_manage_calendar_configuration(organization_id))
  WITH CHECK (public.can_manage_calendar_configuration(organization_id));

GRANT ALL ON TABLE public.roster_forms TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.roster_starting_numbers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.roster_excusals TO anon, authenticated, service_role;

-- Changing the rules without closing the form would rewrite the open form's past.
CREATE FUNCTION calendar_private.guard_roster_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('trooptotask.roster_close', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Roster rules change only when the DA 6 form closes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.guard_roster_rules() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_roster_rules BEFORE UPDATE OF roster_pool_rules, roster_weekend_mode ON public.assignment_types
  FOR EACH ROW WHEN (OLD.roster_pool_rules IS DISTINCT FROM NEW.roster_pool_rules
    OR OLD.roster_weekend_mode IS DISTINCT FROM NEW.roster_weekend_mode)
  EXECUTE FUNCTION calendar_private.guard_roster_rules();

-- A type that becomes person-assigned on any write path gets a fresh open form,
-- starting after any form it closed. A Group type never holds an open form:
-- close_roster_form closes it before the type becomes a Group assignment.
CREATE FUNCTION calendar_private.open_roster_form() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_open boolean := EXISTS (
    SELECT 1 FROM public.roster_forms WHERE assignment_type_id = NEW.id AND ends_on IS NULL
  );
BEGIN
  IF NEW.assign_to = 'personnel' AND NOT v_open THEN
    INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, rules)
    VALUES (
      NEW.organization_id, NEW.id,
      GREATEST((pg_catalog.now() AT TIME ZONE 'UTC')::date,
        (SELECT pg_catalog.max(f.ends_on) + 1 FROM public.roster_forms f WHERE f.assignment_type_id = NEW.id)),
      pg_catalog.jsonb_build_object('pool', NEW.roster_pool_rules, 'weekendMode', NEW.roster_weekend_mode)
    );
  ELSIF NEW.assign_to = 'group' AND v_open THEN
    RAISE EXCEPTION 'Close the DA 6 form before the type becomes a Group assignment' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.open_roster_form() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER open_roster_form AFTER INSERT OR UPDATE OF assign_to ON public.assignment_types
  FOR EACH ROW EXECUTE FUNCTION calendar_private.open_roster_form();

INSERT INTO public.roster_forms (organization_id, assignment_type_id, starts_on, rules)
SELECT t.organization_id, t.id,
  LEAST((pg_catalog.now() AT TIME ZONE 'UTC')::date,
    (SELECT pg_catalog.min(a.date) FROM public.daily_assignments a WHERE a.assignment_type_id = t.id)),
  pg_catalog.jsonb_build_object('pool', NULL, 'weekendMode', 'same')
FROM public.assignment_types t
WHERE t.assign_to = 'personnel';

-- Exemptions of people who no longer exist, and Group-assigned exemptions, have
-- nothing to migrate to.
INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
SELECT DISTINCT t.organization_id, t.id, p.id, 'Excused', f.starts_on
FROM public.assignment_types t
CROSS JOIN LATERAL pg_catalog.unnest(t.exempt_personnel_ids) AS exempt(person_id)
JOIN public.personnel p ON p.organization_id = t.organization_id AND p.id::text = exempt.person_id::text
JOIN public.roster_forms f ON f.assignment_type_id = t.id AND f.ends_on IS NULL
WHERE t.assign_to = 'personnel';

ALTER TABLE public.assignment_types DROP COLUMN exempt_personnel_ids;

-- Forms and starting numbers change only inside close_roster_form, which sets
-- trooptotask.roster_close for its transaction, or inside another trigger: the
-- one that opens a form and the cascades from a deleted type or Person.
CREATE FUNCTION calendar_private.guard_roster_forms() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() < 2
    AND pg_catalog.current_setting('trooptotask.roster_close', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'DA 6 forms change only when a form closes' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION calendar_private.guard_roster_forms() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_roster_forms BEFORE INSERT OR UPDATE OR DELETE ON public.roster_forms
  FOR EACH ROW EXECUTE FUNCTION calendar_private.guard_roster_forms();
CREATE TRIGGER guard_roster_starting_numbers BEFORE INSERT OR UPDATE OR DELETE ON public.roster_starting_numbers
  FOR EACH ROW EXECUTE FUNCTION calendar_private.guard_roster_forms();

-- p_excusals is the open set the caller wants: [{personnel_id, reason}].
-- Someone left out is reinstated today. Someone new is excused from today. An
-- excusal that started today and is reinstated the same day never took effect.
CREATE FUNCTION public.set_roster_excusals(
  p_organization_id uuid, p_assignment_type_id uuid, p_today date, p_excusals jsonb
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_written integer;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_assignment_type_id IS NULL OR p_excusals IS NULL OR pg_catalog.jsonb_typeof(p_excusals) <> 'array'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_excusals) AS e(value)
      WHERE pg_catalog.jsonb_typeof(e.value) <> 'object'
        OR pg_catalog.jsonb_typeof(e.value -> 'personnel_id') <> 'string'
        OR (e.value ->> 'personnel_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(e.value -> 'reason') <> 'string'
        OR pg_catalog.btrim(e.value ->> 'reason') = ''
        OR pg_catalog.char_length(pg_catalog.btrim(e.value ->> 'reason')) > 120
    )
    OR pg_catalog.jsonb_array_length(p_excusals) <> (
      SELECT pg_catalog.count(DISTINCT e.value ->> 'personnel_id') FROM pg_catalog.jsonb_array_elements(p_excusals) AS e(value))
  THEN
    RAISE EXCEPTION 'Give each excused person a reason' USING ERRCODE = '22023';
  END IF;
  -- The Organization has no timezone. The caller's calendar day must be one the
  -- server could also be on.
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
  -- Calendar configuration does not require the Personnel capability, so the
  -- check reads the people the caller sees on the Calendar.
  IF (SELECT pg_catalog.count(*) FROM member_access_private.viewable_personnel('calendar') p
      WHERE p.organization_id = p_organization_id
        AND p.personnel_id IN (SELECT (e.value ->> 'personnel_id')::uuid FROM pg_catalog.jsonb_array_elements(p_excusals) AS e(value)))
     <> pg_catalog.jsonb_array_length(p_excusals)
  THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.roster_excusals x
  WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id
    AND x.ends_on IS NULL AND x.starts_on >= p_today
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid) WHERE w.personnel_id = x.personnel_id);
  UPDATE public.roster_excusals x SET ends_on = p_today - 1
  WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id
    AND x.ends_on IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid) WHERE w.personnel_id = x.personnel_id);
  UPDATE public.roster_excusals x SET reason = pg_catalog.btrim(w.reason)
  FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid, reason text)
  WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id
    AND x.ends_on IS NULL AND x.personnel_id = w.personnel_id AND x.reason <> pg_catalog.btrim(w.reason);
  INSERT INTO public.roster_excusals (organization_id, assignment_type_id, personnel_id, reason, starts_on)
  SELECT p_organization_id, p_assignment_type_id, w.personnel_id, pg_catalog.btrim(w.reason), p_today
  FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid, reason text)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.roster_excusals x
    WHERE x.assignment_type_id = p_assignment_type_id AND x.personnel_id = w.personnel_id AND x.ends_on IS NULL
  );

  -- Row security silently hides rows from a write whose author lost authority
  -- after the first check.
  IF public.can_manage_calendar_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT pg_catalog.count(*) INTO v_written
  FROM public.roster_excusals x
  JOIN pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid, reason text)
    ON w.personnel_id = x.personnel_id AND pg_catalog.btrim(w.reason) = x.reason
  WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id AND x.ends_on IS NULL;
  IF v_written <> pg_catalog.jsonb_array_length(p_excusals) OR EXISTS (
    SELECT 1 FROM public.roster_excusals x
    WHERE x.organization_id = p_organization_id AND x.assignment_type_id = p_assignment_type_id AND x.ends_on IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_excusals) AS w(personnel_id uuid) WHERE w.personnel_id = x.personnel_id)
  ) THEN
    RAISE EXCEPTION 'Excusals were not saved' USING ERRCODE = 'RSF01';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_roster_excusals(uuid, uuid, date, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_roster_excusals(uuid, uuid, date, jsonb) TO authenticated;

-- The application computes p_record and p_carry from the whole open form with
-- the count engine. p_form_id is the open form it read, so a close that raced
-- another fails instead of closing twice. A form that starts after p_today has
-- no day to record; it takes the new rules and starting numbers in place.
-- p_carry is [{personnel_id, track, count, origin}]. A null p_weekend_mode ends
-- the roster: the form closes without a next one and the type becomes a Group
-- assignment.
CREATE FUNCTION public.close_roster_form(
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
    UPDATE public.roster_forms SET ends_on = p_today, record = p_record WHERE id = v_form.id;
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

REVOKE ALL ON FUNCTION public.close_roster_form(uuid, uuid, uuid, date, jsonb, text, jsonb, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.close_roster_form(uuid, uuid, uuid, date, jsonb, text, jsonb, jsonb) TO authenticated;

-- A duty day still counts for the pool after its assignee is deleted, but the
-- assignment read shows only days of people the caller can see. This read keeps
-- those days and still hides days of people outside the caller's scope.
CREATE FUNCTION public.list_roster_detail_days(
  p_organization_id uuid, p_assignment_type_id uuid, p_from date, p_through date
) RETURNS TABLE(date date, assignee_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL OR public.can_view_calendar(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Calendar access is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.date, a.assignee_id
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
