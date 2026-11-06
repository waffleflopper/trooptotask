-- #1999 Acknowledging award tracking again is audited. Only the first acknowledgement and clearing it were.
BEGIN;

CREATE OR REPLACE FUNCTION audit_private.audit_personnel_extended_info() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb := pg_catalog.to_jsonb(NEW);
  v_sections jsonb;
  v_person public.personnel;
BEGIN
  SELECT * INTO v_person FROM public.personnel WHERE id = NEW.personnel_id AND organization_id = NEW.organization_id;
  PERFORM audit_private.require_in_unit(v_person.last_name, NEW.personnel_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.personnel_id END);
  IF v_person.id IS NULL THEN
    RETURN NULL;
  END IF;
  -- An insert starts from an empty sheet, so its sections are the ones it filled.
  IF TG_OP = 'UPDATE' THEN
    v_old := pg_catalog.to_jsonb(OLD);
  ELSE
    v_old := pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(NULL::public.personnel_extended_info, '{}'::jsonb));
  END IF;
  -- The values are never kept: phone numbers, addresses and family details are free text about a person.
  SELECT coalesce(pg_catalog.jsonb_agg(section), '[]'::jsonb) INTO v_sections FROM pg_catalog.unnest(ARRAY[
    CASE WHEN (v_old -> 'emergency_contact_name') IS DISTINCT FROM (v_new -> 'emergency_contact_name') OR (v_old -> 'emergency_contact_relationship') IS DISTINCT FROM (v_new -> 'emergency_contact_relationship') OR (v_old -> 'emergency_contact_phone') IS DISTINCT FROM (v_new -> 'emergency_contact_phone') THEN 'Emergency contact' END,
    CASE WHEN (v_old -> 'spouse_name') IS DISTINCT FROM (v_new -> 'spouse_name') OR (v_old -> 'spouse_phone') IS DISTINCT FROM (v_new -> 'spouse_phone') OR (v_old -> 'marital_status') IS DISTINCT FROM (v_new -> 'marital_status') OR (v_old -> 'marital_status_date') IS DISTINCT FROM (v_new -> 'marital_status_date') THEN 'Spouse' END,
    CASE WHEN (v_old -> 'number_of_dependents') IS DISTINCT FROM (v_new -> 'number_of_dependents') OR (v_old -> 'children') IS DISTINCT FROM (v_new -> 'children') THEN 'Dependents' END,
    CASE WHEN (v_old -> 'vehicle_make_model') IS DISTINCT FROM (v_new -> 'vehicle_make_model') OR (v_old -> 'vehicle_plate') IS DISTINCT FROM (v_new -> 'vehicle_plate') OR (v_old -> 'vehicle_color') IS DISTINCT FROM (v_new -> 'vehicle_color') THEN 'Vehicle' END,
    CASE WHEN (v_old -> 'personal_email') IS DISTINCT FROM (v_new -> 'personal_email') OR (v_old -> 'personal_phone') IS DISTINCT FROM (v_new -> 'personal_phone') THEN 'Contact info' END,
    CASE WHEN (v_old -> 'address_street') IS DISTINCT FROM (v_new -> 'address_street') OR (v_old -> 'address_city') IS DISTINCT FROM (v_new -> 'address_city') OR (v_old -> 'address_state') IS DISTINCT FROM (v_new -> 'address_state') OR (v_old -> 'address_zip') IS DISTINCT FROM (v_new -> 'address_zip') THEN 'Address' END,
    CASE WHEN (v_old -> 'civilian_education') IS DISTINCT FROM (v_new -> 'civilian_education') OR (v_old -> 'military_education') IS DISTINCT FROM (v_new -> 'military_education') THEN 'Education' END,
    CASE WHEN (v_old -> 'basd') IS DISTINCT FROM (v_new -> 'basd') OR (v_old -> 'date_of_rank') IS DISTINCT FROM (v_new -> 'date_of_rank') THEN 'Career dates' END,
    CASE WHEN (v_old -> 'blood_type') IS DISTINCT FROM (v_new -> 'blood_type') THEN 'Blood type' END,
    CASE WHEN (v_old -> 'dod_id') IS DISTINCT FROM (v_new -> 'dod_id') THEN 'DoD ID' END
  ]) AS section WHERE section IS NOT NULL;
  IF v_sections <> '[]'::jsonb THEN
    PERFORM audit_private.record_entry(
      NEW.organization_id, 'personnel.extended_info.updated', 'personnel', NEW.personnel_id,
      audit_private.person_label(v_person.rank, v_person.last_name, v_person.first_name),
      NEW.personnel_id, audit_private.person_label(v_person.rank, v_person.last_name, v_person.first_name),
      pg_catalog.jsonb_build_object('sections', v_sections));
  END IF;
  -- Acknowledging again moves the timestamp and is its own entry; saving the same value writes nothing.
  IF NEW.award_tracking_acknowledged_at IS DISTINCT FROM (v_old ->> 'award_tracking_acknowledged_at')::timestamptz THEN
    PERFORM audit_private.record_entry(
      NEW.organization_id,
      CASE WHEN NEW.award_tracking_acknowledged_at IS NULL THEN 'personnel.award_tracking_cleared'
        ELSE 'personnel.award_tracking_acknowledged' END,
      'personnel', NEW.personnel_id,
      audit_private.person_label(v_person.rank, v_person.last_name, v_person.first_name),
      NEW.personnel_id, audit_private.person_label(v_person.rank, v_person.last_name, v_person.first_name),
      '{}'::jsonb);
  END IF;
  RETURN NULL;
END;
$$;
COMMIT;
