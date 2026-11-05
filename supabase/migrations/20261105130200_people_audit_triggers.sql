-- #1999 People records are audited by the database in the same transaction as the change, one entry per row: the
-- person (added, changed, archived, restored, permanently deleted), their extended info and award flag, Groups, and a
-- member's pinned Groups. Phone numbers, addresses and family details are never kept: an extended info entry names
-- the sections that changed. A failed audit write fails the change.
BEGIN;

CREATE FUNCTION audit_private.audit_personnel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.personnel;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'personnel.created' WHEN 'UPDATE' THEN 'personnel.updated' WHEN 'DELETE' THEN 'personnel.permanently_deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"rank": "rank", "mos": "mos", "role": "clinic_role", "ets": "ets", "deros": "deros"}');
    IF NEW.last_name IS DISTINCT FROM OLD.last_name OR NEW.first_name IS DISTINCT FROM OLD.first_name THEN
      v_change := v_change || pg_catalog.jsonb_build_object('name', pg_catalog.jsonb_build_object(
        'from', OLD.last_name || ', ' || OLD.first_name, 'to', NEW.last_name || ', ' || NEW.first_name));
    END IF;
    IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
      v_change := v_change || pg_catalog.jsonb_build_object('group', pg_catalog.jsonb_build_object(
        'from', (SELECT unit.name FROM public.groups unit WHERE unit.id = OLD.group_id),
        'to', (SELECT unit.name FROM public.groups unit WHERE unit.id = NEW.group_id)));
    END IF;
    IF v_change = '{}'::jsonb AND NOT ((OLD.archived_at IS NULL) <> (NEW.archived_at IS NULL)) THEN
      RETURN NULL;
    END IF;
    v_kind := CASE
  WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'personnel.archived'
  WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'personnel.restored'
  ELSE 'personnel.updated' END;
  END IF;
  v_details := '{}'::jsonb;
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'personnel', v_row.id, audit_private.person_label(v_row.rank, v_row.last_name, v_row.first_name),
    v_row.id, audit_private.person_label(v_row.rank, v_row.last_name, v_row.first_name), v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_personnel() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_personnel
AFTER INSERT OR UPDATE OR DELETE ON public.personnel
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_personnel();

CREATE FUNCTION audit_private.audit_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.groups;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id)) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'group.created' WHEN 'UPDATE' THEN 'group.updated' WHEN 'DELETE' THEN 'group.deleted' END;
  IF TG_OP = 'UPDATE' THEN
    v_change := audit_private.changed(pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), '{"name": "name"}');
    IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
      v_change := v_change || pg_catalog.jsonb_build_object('parent', pg_catalog.jsonb_build_object(
        'from', (SELECT parent.name FROM public.groups parent WHERE parent.id = OLD.parent_id),
        'to', (SELECT parent.name FROM public.groups parent WHERE parent.id = NEW.parent_id)));
    END IF;
    IF v_change = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
    v_kind := CASE WHEN NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN 'group.moved' ELSE 'group.updated' END;
  END IF;
  v_details := pg_catalog.jsonb_build_object('parent', (SELECT parent.name FROM public.groups parent WHERE parent.id = v_row.parent_id));
  IF TG_OP = 'UPDATE' AND v_change <> '{}'::jsonb THEN
    v_details := v_details || pg_catalog.jsonb_build_object('change', v_change);
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'group', v_row.id, v_row.name,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_group() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_group
AFTER INSERT OR UPDATE OR DELETE ON public.groups
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_group();

CREATE FUNCTION audit_private.audit_pinned_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.user_pinned_groups;
  v_kind text;
  v_change jsonb := '{}'::jsonb;
  v_details jsonb;
  v_group text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RETURN NULL;
  END IF;
  SELECT unit.name INTO v_group FROM public.groups unit WHERE unit.id = v_row.group_id;
  -- Rows removed with their parent or unit: that deletion is the audited event.
  IF TG_OP = 'DELETE' AND (NOT audit_private.unit_exists(v_row.organization_id) OR v_group IS NULL) THEN
    RETURN NULL;
  END IF;
  v_kind := CASE TG_OP WHEN 'INSERT' THEN 'pinned_group.created' WHEN 'DELETE' THEN 'pinned_group.deleted' END;
  v_details := '{}'::jsonb;
  PERFORM audit_private.record_entry(
    v_row.organization_id, v_kind, 'pinned_group', v_row.id, v_group,
    NULL, NULL, v_details
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_pinned_group() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_pinned_group
AFTER INSERT OR DELETE ON public.user_pinned_groups
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_pinned_group();

CREATE FUNCTION audit_private.audit_personnel_extended_info() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb := pg_catalog.to_jsonb(NEW);
  v_sections jsonb;
  v_person public.personnel;
BEGIN
  SELECT * INTO v_person FROM public.personnel WHERE id = NEW.personnel_id;
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
  IF (NEW.award_tracking_acknowledged_at IS NULL) IS DISTINCT FROM (v_old ->> 'award_tracking_acknowledged_at' IS NULL) THEN
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
REVOKE ALL ON FUNCTION audit_private.audit_personnel_extended_info() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_personnel_extended_info
AFTER INSERT OR UPDATE ON public.personnel_extended_info
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_personnel_extended_info();

COMMIT;
