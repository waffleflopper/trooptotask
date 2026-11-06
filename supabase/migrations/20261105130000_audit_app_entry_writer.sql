-- #1999 Entries the server writes (invitations, exports, denials, computed actions) take the same saved labels as the
-- ones triggers write, and the actor's label is read in the database. Only the service role can call the writer, so a
-- signed-in client still cannot forge an actor or a label.
BEGIN;

CREATE FUNCTION public.record_app_audit_entry(
  p_kind text,
  p_record_type text,
  p_severity text,
  p_details jsonb,
  p_actor_user_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_record_id uuid DEFAULT NULL,
  p_record_label text DEFAULT NULL,
  p_subject_personnel_id uuid DEFAULT NULL,
  p_subject_label text DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_label text := p_subject_label;
BEGIN
  -- A person's label is read here, not sent, so it always matches what a trigger would have saved.
  IF p_subject_personnel_id IS NOT NULL AND v_subject_label IS NULL THEN
    v_subject_label := audit_private.personnel_label(p_organization_id, p_subject_personnel_id);
    IF v_subject_label IS NULL THEN
      RAISE EXCEPTION 'Audit subject not found' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO public.audit_logs (
    user_id, actor_label, org_id, action, resource_type, resource_id, record_label, subject_personnel_id,
    subject_label, batch_id, severity, details, ip_address, user_agent
  ) VALUES (
    p_actor_user_id,
    CASE WHEN p_actor_user_id IS NULL THEN NULL ELSE audit_private.member_label(p_organization_id, p_actor_user_id) END,
    p_organization_id, p_kind, p_record_type, p_record_id, p_record_label, p_subject_personnel_id, v_subject_label,
    p_batch_id, p_severity, p_details, p_ip_address, p_user_agent
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_app_audit_entry(
  text, text, text, jsonb, uuid, uuid, uuid, text, uuid, text, uuid, inet, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_app_audit_entry(
  text, text, text, jsonb, uuid, uuid, uuid, text, uuid, text, uuid, inet, text
) TO service_role;

-- One round trip for an action that writes an entry per row, such as a note added to many People. The entries are
-- written together in one transaction, so a failure keeps every one of them out, and they share the batch id. Each
-- entry is checked and labeled by the single writer above.
CREATE FUNCTION public.record_app_audit_entries(
  p_entries jsonb,
  p_actor_user_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry jsonb;
BEGIN
  IF pg_catalog.jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Audit entries must be a list' USING ERRCODE = '22023';
  END IF;
  FOR v_entry IN SELECT pg_catalog.jsonb_array_elements(p_entries) LOOP
    PERFORM public.record_app_audit_entry(
      v_entry ->> 'kind', v_entry ->> 'recordType', coalesce(v_entry ->> 'severity', 'info'), v_entry -> 'details',
      p_actor_user_id, p_organization_id, (v_entry ->> 'recordId')::uuid, v_entry ->> 'recordLabel',
      (v_entry ->> 'subjectPersonnelId')::uuid, v_entry ->> 'subjectLabel', p_batch_id, p_ip_address, p_user_agent
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.record_app_audit_entries(jsonb, uuid, uuid, uuid, inet, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_app_audit_entries(jsonb, uuid, uuid, uuid, inet, text) TO service_role;

-- The fields of a row that changed, each with its before and after, for the trigger-written update kinds.
-- `p_fields` maps the name an entry gives a field to the column that holds it.
CREATE FUNCTION audit_private.changed(p_old jsonb, p_new jsonb, p_fields jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    pg_catalog.jsonb_object_agg(field.key,
      pg_catalog.jsonb_build_object('from', p_old -> field.value, 'to', p_new -> field.value))
      FILTER (WHERE (p_old -> field.value) IS DISTINCT FROM (p_new -> field.value)),
    '{}'::jsonb)
  FROM pg_catalog.jsonb_each_text(p_fields) AS field;
$$;

-- Rows removed with their unit are not audited: deleting the unit is the audited event.
CREATE FUNCTION audit_private.unit_exists(p_organization_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id);
$$;

-- Every label is read inside the row's own Organization. A reference that points into another unit reads as missing, so
-- its name can never reach this unit's log.
CREATE FUNCTION audit_private.personnel_label(p_organization_id uuid, p_personnel_id uuid) RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT audit_private.person_label(person.rank, person.last_name, person.first_name)
  FROM public.personnel person
  WHERE person.id = p_personnel_id AND person.organization_id = p_organization_id;
$$;

-- A write that sets or changes a reference whose label cannot be read in the row's Organization points outside the
-- unit. Its entry would have to drop the label or leak another unit's, so the write fails instead. A reference the
-- write leaves as it was may be older than the check, so editing another column of that row still goes through.
CREATE FUNCTION audit_private.require_in_unit(
  p_label text, p_reference_id uuid, p_previous_reference_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_reference_id IS NOT NULL AND p_label IS NULL AND p_reference_id IS DISTINCT FROM p_previous_reference_id THEN
    RAISE EXCEPTION 'Reference belongs to another Organization' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION audit_private.changed(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION audit_private.unit_exists(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION audit_private.personnel_label(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION audit_private.require_in_unit(text, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
