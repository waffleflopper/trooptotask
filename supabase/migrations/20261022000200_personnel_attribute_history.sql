-- Duty roster pools match on rank, MOS, role, Group and archive state, so the
-- count engine needs the day each of them changed. A trigger records one row
-- per Person per UTC day of a change, holding the values in effect from that
-- day. Only the trigger writes rows. Existing people start with their current
-- values on the day they were added, and an archived person gets a second row
-- on the day they were archived.
BEGIN;

CREATE TABLE public.personnel_attribute_history (
  organization_id uuid NOT NULL,
  personnel_id uuid NOT NULL,
  effective_on date NOT NULL,
  rank text NOT NULL,
  mos text NOT NULL,
  clinic_role text NOT NULL,
  group_id uuid NULL,
  archived boolean NOT NULL,
  PRIMARY KEY (personnel_id, effective_on),
  CONSTRAINT personnel_attribute_history_personnel_fkey FOREIGN KEY (organization_id, personnel_id)
    REFERENCES public.personnel (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX personnel_attribute_history_org_idx ON public.personnel_attribute_history (organization_id, personnel_id);

ALTER TABLE public.personnel_attribute_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Calendar viewers can read attribute history of people they see"
  ON public.personnel_attribute_history FOR SELECT TO authenticated
  USING ((organization_id, personnel_id) IN (
    SELECT v.organization_id, v.personnel_id FROM member_access_private.viewable_personnel('calendar') v
  ));
REVOKE ALL ON TABLE public.personnel_attribute_history FROM anon, authenticated;
GRANT SELECT ON TABLE public.personnel_attribute_history TO authenticated;
GRANT ALL ON TABLE public.personnel_attribute_history TO service_role;

CREATE FUNCTION organization_private.record_personnel_attributes() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  -- The day of the write, not created_at, which a client can set.
  v_on date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.personnel_attribute_history
    (organization_id, personnel_id, effective_on, rank, mos, clinic_role, group_id, archived)
  VALUES
    (NEW.organization_id, NEW.id, v_on, NEW.rank, NEW.mos, NEW.clinic_role, NEW.group_id, NEW.archived_at IS NOT NULL)
  ON CONFLICT (personnel_id, effective_on) DO UPDATE SET
    rank = EXCLUDED.rank,
    mos = EXCLUDED.mos,
    clinic_role = EXCLUDED.clinic_role,
    group_id = EXCLUDED.group_id,
    archived = EXCLUDED.archived;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.record_personnel_attributes() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER record_personnel_attributes_on_insert AFTER INSERT ON public.personnel
  FOR EACH ROW EXECUTE FUNCTION organization_private.record_personnel_attributes();
CREATE TRIGGER record_personnel_attributes_on_update
  AFTER UPDATE OF rank, mos, clinic_role, group_id, archived_at ON public.personnel
  FOR EACH ROW
  WHEN (OLD.rank IS DISTINCT FROM NEW.rank
    OR OLD.mos IS DISTINCT FROM NEW.mos
    OR OLD.clinic_role IS DISTINCT FROM NEW.clinic_role
    OR OLD.group_id IS DISTINCT FROM NEW.group_id
    OR (OLD.archived_at IS NULL) <> (NEW.archived_at IS NULL))
  EXECUTE FUNCTION organization_private.record_personnel_attributes();

INSERT INTO public.personnel_attribute_history
  (organization_id, personnel_id, effective_on, rank, mos, clinic_role, group_id, archived)
SELECT organization_id, id, (created_at AT TIME ZONE 'UTC')::date, rank, mos, clinic_role, group_id,
  archived_at IS NOT NULL AND (archived_at AT TIME ZONE 'UTC')::date <= (created_at AT TIME ZONE 'UTC')::date
FROM public.personnel
UNION ALL
SELECT organization_id, id, (archived_at AT TIME ZONE 'UTC')::date, rank, mos, clinic_role, group_id, true
FROM public.personnel
WHERE (archived_at AT TIME ZONE 'UTC')::date > (created_at AT TIME ZONE 'UTC')::date;

COMMIT;
