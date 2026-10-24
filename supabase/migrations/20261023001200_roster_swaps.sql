-- A duty exchange changes who stands the day while keeping each person's
-- published DA 6 count. Keeping the original holders separately lets any later
-- reassignment end the exchange and resume counting the calendar holders.
BEGIN;

CREATE TABLE public.roster_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  assignment_type_id uuid NOT NULL,
  first_date date NOT NULL,
  first_held_by text NOT NULL,
  second_date date NOT NULL,
  second_held_by text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_swaps_type_fkey FOREIGN KEY (organization_id, assignment_type_id)
    REFERENCES public.assignment_types(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT roster_swaps_dates_check CHECK (first_date < second_date),
  CONSTRAINT roster_swaps_holders_check CHECK (first_held_by <> second_held_by
    AND btrim(first_held_by) <> '' AND btrim(second_held_by) <> '')
);
CREATE INDEX roster_swaps_first_day_idx ON public.roster_swaps(organization_id, assignment_type_id, first_date);
CREATE INDEX roster_swaps_second_day_idx ON public.roster_swaps(organization_id, assignment_type_id, second_date);
ALTER TABLE public.roster_swaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.roster_swaps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.roster_swaps TO authenticated;
CREATE POLICY "Organization-wide Calendar viewers can read duty swaps" ON public.roster_swaps
  FOR SELECT TO authenticated USING (organization_id IN (
    SELECT v.organization_id FROM calendar_private.organization_wide_viewer_organizations() v
  ));

CREATE FUNCTION calendar_private.require_roster_swap_access(p_organization_id uuid, p_today date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
    OR NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    ) THEN
    RAISE EXCEPTION 'Duty swaps need Organization-wide Calendar operation access' USING ERRCODE = '42501';
  END IF;
  IF p_today IS NULL OR pg_catalog.abs(p_today - (pg_catalog.now() AT TIME ZONE 'UTC')::date) > 1 THEN
    RAISE EXCEPTION 'The date on this device is off' USING ERRCODE = 'RSD01';
  END IF;
END;
$$;
ALTER FUNCTION calendar_private.require_roster_swap_access(uuid, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.require_roster_swap_access(uuid, date) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION calendar_private.end_roster_swap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
    OR OLD.date IS DISTINCT FROM NEW.date OR OLD.assignment_type_id IS DISTINCT FROM NEW.assignment_type_id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    DELETE FROM public.roster_swaps s
    WHERE s.organization_id = OLD.organization_id AND s.assignment_type_id = OLD.assignment_type_id
      AND OLD.date IN (s.first_date, s.second_date);
  END IF;
  RETURN NULL;
END;
$$;
ALTER FUNCTION calendar_private.end_roster_swap() OWNER TO postgres;
REVOKE ALL ON FUNCTION calendar_private.end_roster_swap() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER end_roster_swap AFTER UPDATE OR DELETE ON public.daily_assignments
  FOR EACH ROW EXECUTE FUNCTION calendar_private.end_roster_swap();

CREATE FUNCTION public.swap_roster_days(
  p_organization_id uuid, p_assignment_type_id uuid,
  p_first_date date, p_first_was text, p_second_date date, p_second_was text, p_today date
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  first_row public.daily_assignments%ROWTYPE;
  second_row public.daily_assignments%ROWTYPE;
  swap_row public.roster_swaps%ROWTYPE;
  affected_date date;
BEGIN
  PERFORM calendar_private.require_roster_swap_access(p_organization_id, p_today);
  PERFORM 1 FROM public.assignment_types t WHERE t.organization_id = p_organization_id
    AND t.id = p_assignment_type_id AND t.assign_to = 'personnel' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Both days need a person-assigned duty' USING ERRCODE = 'RSW06';
  END IF;
  IF p_first_date IS NULL OR p_second_date IS NULL OR p_first_date = p_second_date THEN
    RAISE EXCEPTION 'Choose two different days' USING ERRCODE = 'RSW03';
  END IF;
  IF p_first_date < p_today OR p_second_date < p_today THEN
    RAISE EXCEPTION 'Swap only today or later days' USING ERRCODE = 'RSW02';
  END IF;
  FOR affected_date IN SELECT day FROM unnest(ARRAY[p_first_date, p_second_date]) day ORDER BY day LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(affected_date::text));
  END LOOP;
  PERFORM 1 FROM public.daily_assignments a
  WHERE a.organization_id = p_organization_id AND a.assignment_type_id = p_assignment_type_id
    AND a.date IN (p_first_date, p_second_date) ORDER BY a.date FOR UPDATE;
  SELECT * INTO first_row FROM public.daily_assignments a WHERE a.organization_id = p_organization_id
    AND a.assignment_type_id = p_assignment_type_id AND a.date = p_first_date;
  SELECT * INTO second_row FROM public.daily_assignments a WHERE a.organization_id = p_organization_id
    AND a.assignment_type_id = p_assignment_type_id AND a.date = p_second_date;
  IF first_row.id IS NULL OR second_row.id IS NULL
    OR btrim(first_row.assignee_id) = '' OR btrim(second_row.assignee_id) = '' THEN
    RAISE EXCEPTION 'Both days need an assigned person' USING ERRCODE = 'RSW04';
  END IF;
  IF first_row.assignee_id IS DISTINCT FROM p_first_was OR second_row.assignee_id IS DISTINCT FROM p_second_was THEN
    RAISE EXCEPTION 'The roster changed since this preview' USING ERRCODE = 'RSW01';
  END IF;
  IF first_row.assignee_id = second_row.assignee_id THEN
    RAISE EXCEPTION 'Choose days held by two different people' USING ERRCODE = 'RSW05';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roster_swaps s
    WHERE s.organization_id = p_organization_id AND s.assignment_type_id = p_assignment_type_id
      AND (s.first_date IN (p_first_date, p_second_date) OR s.second_date IN (p_first_date, p_second_date))) THEN
    RAISE EXCEPTION 'One of these days is already in a swap' USING ERRCODE = 'RSW07';
  END IF;
  PERFORM pg_catalog.set_config('calendar.roster_write', '', true);
  UPDATE public.daily_assignments SET assignee_id = second_row.assignee_id WHERE id = first_row.id;
  UPDATE public.daily_assignments SET assignee_id = first_row.assignee_id WHERE id = second_row.id;
  INSERT INTO public.roster_swaps(organization_id, assignment_type_id, first_date, first_held_by,
    second_date, second_held_by, created_by)
  VALUES (p_organization_id, p_assignment_type_id, LEAST(p_first_date, p_second_date),
    CASE WHEN p_first_date < p_second_date THEN first_row.assignee_id ELSE second_row.assignee_id END,
    GREATEST(p_first_date, p_second_date),
    CASE WHEN p_first_date < p_second_date THEN second_row.assignee_id ELSE first_row.assignee_id END, auth.uid())
  RETURNING * INTO swap_row;
  PERFORM calendar_private.require_roster_swap_access(p_organization_id, p_today);
  RETURN jsonb_build_object('swap', to_jsonb(swap_row), 'saved', (
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.date) FROM public.daily_assignments a
    WHERE a.id IN (first_row.id, second_row.id)));
END;
$$;
ALTER FUNCTION public.swap_roster_days(uuid, uuid, date, text, date, text, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.swap_roster_days(uuid, uuid, date, text, date, text, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.swap_roster_days(uuid, uuid, date, text, date, text, date) TO authenticated;

CREATE FUNCTION public.undo_roster_swap(p_organization_id uuid, p_swap_id uuid, p_today date)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  swap_row public.roster_swaps%ROWTYPE;
  affected_date date;
BEGIN
  PERFORM calendar_private.require_roster_swap_access(p_organization_id, p_today);
  SELECT * INTO swap_row FROM public.roster_swaps WHERE organization_id = p_organization_id AND id = p_swap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The roster changed since this preview' USING ERRCODE = 'RSW01';
  END IF;
  IF swap_row.first_date < p_today THEN
    RAISE EXCEPTION 'A swap cannot be undone after either day has passed' USING ERRCODE = 'RSW02';
  END IF;
  FOR affected_date IN SELECT day FROM unnest(ARRAY[swap_row.first_date, swap_row.second_date]) day ORDER BY day LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_organization_id::text), pg_catalog.hashtext(affected_date::text));
  END LOOP;
  PERFORM 1 FROM public.daily_assignments a
  WHERE a.organization_id = p_organization_id AND a.assignment_type_id = swap_row.assignment_type_id
    AND a.date IN (swap_row.first_date, swap_row.second_date) ORDER BY a.date FOR UPDATE;
  DELETE FROM public.roster_swaps WHERE organization_id = p_organization_id AND id = p_swap_id RETURNING * INTO swap_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The roster changed since this preview' USING ERRCODE = 'RSW01';
  END IF;
  PERFORM pg_catalog.set_config('calendar.roster_write', '', true);
  UPDATE public.daily_assignments a SET assignee_id = CASE WHEN a.date = swap_row.first_date
    THEN swap_row.first_held_by ELSE swap_row.second_held_by END
  WHERE a.organization_id = p_organization_id AND a.assignment_type_id = swap_row.assignment_type_id
    AND a.date IN (swap_row.first_date, swap_row.second_date);
  PERFORM calendar_private.require_roster_swap_access(p_organization_id, p_today);
  RETURN jsonb_build_object('swap', to_jsonb(swap_row), 'saved', (
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.date) FROM public.daily_assignments a
    WHERE a.organization_id = p_organization_id AND a.assignment_type_id = swap_row.assignment_type_id
      AND a.date IN (swap_row.first_date, swap_row.second_date)));
END;
$$;
ALTER FUNCTION public.undo_roster_swap(uuid, uuid, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.undo_roster_swap(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_roster_swap(uuid, uuid, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
