REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.counseling_records, public.personnel_follow_ups, public.data_exports, public.beta_feedback FROM anon;
REVOKE INSERT, UPDATE ON public.counseling_records, public.personnel_follow_ups, public.data_exports FROM authenticated;
REVOKE UPDATE ON public.beta_feedback FROM authenticated;

GRANT INSERT (id, organization_id, personnel_id, date_conducted, subject, key_points, plan_of_action, follow_up_date, notes, file_path, title, summary, created_at)
  ON public.counseling_records TO authenticated;
GRANT UPDATE (date_conducted, subject, key_points, plan_of_action, follow_up_date, notes, file_path, title, summary)
  ON public.counseling_records TO authenticated;
GRANT INSERT (id, organization_id, personnel_id, title, notes, due_date, created_at, updated_at)
  ON public.personnel_follow_ups TO authenticated;
GRANT UPDATE (title, notes, due_date, updated_at) ON public.personnel_follow_ups TO authenticated;
GRANT INSERT (org_id, requested_by, created_at) ON public.data_exports TO authenticated;
DROP POLICY "Org managers can update export lifecycle" ON public.data_exports;
ALTER TABLE public.data_exports ALTER COLUMN status SET DEFAULT 'processing';

REVOKE INSERT ON public.organization_invitations FROM anon, authenticated;
GRANT INSERT (organization_id, email, invited_by, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids)
  ON public.organization_invitations TO authenticated;
ALTER POLICY "Governors can create invitations" ON public.organization_invitations WITH CHECK (
  invited_by = (SELECT auth.uid())
  AND ((role = 'member' AND public.can_manage_org_members(organization_id))
    OR (role = 'admin' AND public.is_org_owner(organization_id) AND public.current_session_sensitive_action_assured()))
);

CREATE FUNCTION public.finish_data_export(p_organization_id uuid, p_export_id uuid, p_status text,
  p_file_size_bytes bigint DEFAULT NULL)
RETURNS SETOF public.data_exports LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.data_exports SET status = p_status, completed_at = now(),
    file_size_bytes = CASE WHEN p_status = 'completed' THEN p_file_size_bytes ELSE file_size_bytes END
  WHERE id = p_export_id AND org_id = p_organization_id AND status = 'processing'
    AND p_status IN ('completed', 'failed')
    AND (p_status = 'failed' OR p_file_size_bytes >= 0)
    AND public.can_manage_org_members(p_organization_id)
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.finish_data_export(uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_data_export(uuid, uuid, text, bigint) TO authenticated;

CREATE INDEX data_exports_processing_created_at_idx ON public.data_exports (created_at) WHERE status = 'processing';
CREATE FUNCTION public.fail_stale_data_exports() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.data_exports SET status = 'failed', completed_at = now()
    WHERE status = 'processing' AND created_at < now() - interval '1 hour';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.fail_stale_data_exports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_stale_data_exports() TO service_role;

REVOKE UPDATE (disabled_features) ON public.organizations FROM authenticated;
CREATE FUNCTION public.update_organization_feature_settings(p_organization_id uuid, p_changes jsonb, p_expected_disabled_features text[])
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous public.organizations; details jsonb;
BEGIN
  IF NOT public.is_org_privileged(p_organization_id) THEN
    RAISE EXCEPTION 'Organization settings update denied' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR NOT (p_changes ? 'disabled_features')
    OR jsonb_typeof(p_changes->'disabled_features') IS DISTINCT FROM 'array'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE k NOT IN (
      'disabled_features', 'strength_floor_percent', 'archive_retention_months', 'loss_warning_window_days',
      'training_readiness_goal_percent', 'personnel_document_storage_cap_bytes')) THEN
    RAISE EXCEPTION 'Invalid Organization feature settings' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO previous FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization settings update denied' USING ERRCODE = '42501'; END IF;
  IF previous.disabled_features IS DISTINCT FROM p_expected_disabled_features THEN RETURN 'stale'; END IF;
  UPDATE public.organizations SET
    disabled_features = ARRAY(SELECT jsonb_array_elements_text(p_changes->'disabled_features')),
    strength_floor_percent = CASE WHEN p_changes ? 'strength_floor_percent' THEN (p_changes->>'strength_floor_percent')::integer ELSE strength_floor_percent END,
    archive_retention_months = CASE WHEN p_changes ? 'archive_retention_months' THEN (p_changes->>'archive_retention_months')::integer ELSE archive_retention_months END,
    loss_warning_window_days = CASE WHEN p_changes ? 'loss_warning_window_days' THEN (p_changes->>'loss_warning_window_days')::integer ELSE loss_warning_window_days END,
    training_readiness_goal_percent = CASE WHEN p_changes ? 'training_readiness_goal_percent' THEN (p_changes->>'training_readiness_goal_percent')::integer ELSE training_readiness_goal_percent END,
    personnel_document_storage_cap_bytes = CASE WHEN p_changes ? 'personnel_document_storage_cap_bytes' THEN (p_changes->>'personnel_document_storage_cap_bytes')::bigint ELSE personnel_document_storage_cap_bytes END
  WHERE id = p_organization_id;
  details = p_changes || jsonb_build_object('previous_disabled_features', previous.disabled_features);
  IF p_changes ? 'strength_floor_percent' THEN
    details = details || jsonb_build_object('previous_strength_floor_percent', previous.strength_floor_percent);
  END IF;
  PERFORM audit_private.record_entry(p_organization_id, 'organization.settings_updated', 'organization',
    p_organization_id, previous.name, NULL, NULL, details);
  RETURN 'saved';
END;
$$;
REVOKE ALL ON FUNCTION public.update_organization_feature_settings(uuid, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_organization_feature_settings(uuid, jsonb, text[]) TO authenticated;

ALTER TABLE public.organization_invitation_email_outbox DROP CONSTRAINT organization_invitation_email_outbox_status_check;
ALTER TABLE public.organization_invitation_email_outbox ADD CONSTRAINT organization_invitation_email_outbox_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'sent_recording_failed'));
CREATE OR REPLACE FUNCTION public.mark_organization_invitation_email_outbox_delivery(p_outbox_id uuid, p_status text,
  p_marked_at timestamptz DEFAULT now(), p_last_error text DEFAULT NULL)
RETURNS SETOF public.organization_invitation_email_outbox LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.organization_invitation_email_outbox
  SET status = p_status, attempt_count = attempt_count + 1,
    last_error = CASE WHEN p_status = 'sent' THEN NULL ELSE p_last_error END,
    updated_at = p_marked_at,
    sent_at = CASE WHEN p_status IN ('sent', 'sent_recording_failed') THEN p_marked_at ELSE NULL END
  WHERE id = p_outbox_id AND status IN ('pending', 'failed')
    AND p_status IN ('sent', 'failed', 'sent_recording_failed') AND attempt_count < 3
  RETURNING *;
$$;
