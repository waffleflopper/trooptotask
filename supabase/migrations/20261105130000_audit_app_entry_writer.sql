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
    v_subject_label := audit_private.personnel_label(p_subject_personnel_id);
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

CREATE FUNCTION audit_private.personnel_label(p_personnel_id uuid) RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT audit_private.person_label(person.rank, person.last_name, person.first_name)
  FROM public.personnel person WHERE person.id = p_personnel_id;
$$;

REVOKE ALL ON FUNCTION audit_private.changed(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION audit_private.unit_exists(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION audit_private.personnel_label(uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
