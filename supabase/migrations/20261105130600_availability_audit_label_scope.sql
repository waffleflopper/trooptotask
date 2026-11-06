-- #1999 The availability audit trigger reads a Person's label inside the row's own Organization, as every other audit
-- trigger does. Row level security already keeps a Person from another unit out of an availability row; the trigger no
-- longer relies on that policy to keep another unit's name out of this unit's log.
BEGIN;

CREATE OR REPLACE FUNCTION calendar_private.audit_availability_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.availability_entries;
  v_person public.personnel;
  v_status text;
  v_details jsonb;
  v_change jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entry := OLD;
  ELSE
    v_entry := NEW;
  END IF;

  SELECT * INTO v_person FROM public.personnel
  WHERE id = v_entry.personnel_id AND organization_id = v_entry.organization_id;
  SELECT status.name INTO v_status FROM public.status_types status
  WHERE status.organization_id = v_entry.organization_id AND status.id = v_entry.status_type_id;

  IF TG_OP <> 'DELETE' THEN
    PERFORM audit_private.require_in_unit(
      v_person.last_name, v_entry.personnel_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.personnel_id END);
  END IF;

  -- Rows removed with their Person, status type or Organization: that deletion is the audited event.
  IF v_person.id IS NULL OR (TG_OP = 'DELETE' AND (
    v_status IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id)
  )) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.personnel_id IS DISTINCT FROM OLD.personnel_id THEN
      v_change := v_change || pg_catalog.jsonb_build_object('person', pg_catalog.jsonb_build_object(
        'from', (SELECT audit_private.person_label(p.rank, p.last_name, p.first_name)
          FROM public.personnel p
          WHERE p.id = OLD.personnel_id AND p.organization_id = OLD.organization_id),
        'to', audit_private.person_label(v_person.rank, v_person.last_name, v_person.first_name)));
    END IF;
    IF NEW.status_type_id IS DISTINCT FROM OLD.status_type_id THEN
      v_change := v_change || pg_catalog.jsonb_build_object('status', pg_catalog.jsonb_build_object(
        'from', (SELECT status.name FROM public.status_types status
          WHERE status.organization_id = OLD.organization_id AND status.id = OLD.status_type_id),
        'to', v_status));
    END IF;
    IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
      v_change := v_change || pg_catalog.jsonb_build_object('startDate',
        pg_catalog.jsonb_build_object('from', OLD.start_date, 'to', NEW.start_date));
    END IF;
    IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
      v_change := v_change || pg_catalog.jsonb_build_object('endDate',
        pg_catalog.jsonb_build_object('from', OLD.end_date, 'to', NEW.end_date));
    END IF;
    -- A note is free text, so the entry says it changed and keeps neither value.
    IF NEW.note IS DISTINCT FROM OLD.note THEN
      v_change := v_change || pg_catalog.jsonb_build_object('note', pg_catalog.jsonb_build_object('withheld', true));
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;

  v_details := pg_catalog.jsonb_build_object('startDate', v_entry.start_date, 'endDate', v_entry.end_date);
  IF TG_OP = 'UPDATE' THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;

  PERFORM audit_private.record_entry(
    v_entry.organization_id,
    CASE TG_OP WHEN 'INSERT' THEN 'availability.created' WHEN 'UPDATE' THEN 'availability.updated'
      ELSE 'availability.deleted' END,
    'availability',
    v_entry.id,
    v_status,
    v_entry.personnel_id,
    audit_private.person_label(v_person.rank, v_person.last_name, v_person.first_name),
    v_details
  );
  RETURN NULL;
END;
$$;

COMMIT;
