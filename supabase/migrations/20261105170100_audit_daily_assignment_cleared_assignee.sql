-- #1999 Clearing a daily assignment saves whose assignment it was, read the same way as an assignment: a person of the
-- unit as the entry's person, a Group by name in its details. Logs filtered by that person then show the clear. Entries
-- saved before this keep only the day and read as before.
BEGIN;

CREATE OR REPLACE FUNCTION audit_private.audit_daily_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.daily_assignments;
  v_type text;
  v_assign_to text;
  v_assignee uuid;
  v_person uuid;
  v_who text;
  v_group text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  SELECT kind.name, kind.assign_to INTO v_type, v_assign_to FROM public.assignment_types kind
  WHERE kind.id = v_row.assignment_type_id AND kind.organization_id = v_row.organization_id;
  IF TG_OP <> 'DELETE' THEN
    PERFORM audit_private.require_in_unit(
      v_type, v_row.assignment_type_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.assignment_type_id END);
  END IF;
  IF v_type IS NULL OR NOT audit_private.unit_exists(v_row.organization_id) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id AND NEW.date = OLD.date
    AND NEW.assignment_type_id = OLD.assignment_type_id
  THEN
    RETURN NULL;
  END IF;

  IF v_row.assignee_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_assignee := v_row.assignee_id::uuid;
  END IF;
  IF v_assign_to = 'group' THEN
    SELECT team.name INTO v_group FROM public.groups team
    WHERE team.id = v_assignee AND team.organization_id = v_row.organization_id;
    v_who := v_group;
  ELSE
    v_who := audit_private.personnel_label(v_row.organization_id, v_assignee);
    v_person := CASE WHEN v_who IS NOT NULL THEN v_assignee END;
  END IF;
  PERFORM audit_private.record_entry(
    v_row.organization_id,
    CASE TG_OP WHEN 'INSERT' THEN 'daily_assignment.created' WHEN 'UPDATE' THEN 'daily_assignment.updated'
      ELSE 'daily_assignment.cleared' END,
    'daily_assignment', v_row.id, v_type, v_person, CASE WHEN v_person IS NOT NULL THEN v_who END,
    pg_catalog.jsonb_build_object('date', v_row.date, 'group', v_group));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_daily_assignment() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
