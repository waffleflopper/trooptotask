-- #1999 Sign-in, failed sign-in, MFA and rate-limit entries keep for 90 days, every other entry for 3 years. The list of
-- short-lived kinds lives here, next to the delete that uses it. Opening a counseling record, a leader note or a
-- document writes an entry that names the person and the type of record, and never the title, text or file name.
BEGIN;

CREATE FUNCTION audit_private.short_retention_actions() RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['auth.login_success', 'auth.login_failure', 'auth.mfa_verify', 'security.rate_limit_violation']::text[];
$$;
REVOKE ALL ON FUNCTION audit_private.short_retention_actions() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.audit_logs
  WHERE "timestamp" < now() - interval '3 years'
    OR (action = ANY (audit_private.short_retention_actions()) AND "timestamp" < now() - interval '90 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- The server authorized the read and names the member. A second open of the same record by the same member within ten
-- minutes writes nothing: the first entry already says who looked, and a refresh, a page of older notes or a second
-- click on the same file would otherwise fill the log with copies. Ten minutes outlasts the five-minute file link.
-- Concurrent opens queue on the same key, so two requests cannot both find the window empty.
CREATE FUNCTION public.record_personnel_record_open(
  p_kind text,
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_personnel_id uuid,
  p_record_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record_type text;
BEGIN
  v_record_type := CASE p_kind
    WHEN 'personnel.counseling_record.opened' THEN 'counseling_record'
    WHEN 'personnel.document.opened' THEN 'personnel_document'
    WHEN 'personnel.leader_note.opened' THEN 'leader_note'
  END;
  IF v_record_type IS NULL OR p_actor_user_id IS NULL OR p_organization_id IS NULL OR p_personnel_id IS NULL THEN
    RAISE EXCEPTION 'Not a record open' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_kind || ':' || p_actor_user_id::text || ':' || p_personnel_id::text || ':' || coalesce(p_record_id::text, ''), 0));

  IF EXISTS (
    SELECT 1 FROM public.audit_logs entry
    WHERE entry.org_id = p_organization_id
      AND entry.subject_personnel_id = p_personnel_id
      AND entry.user_id = p_actor_user_id
      AND entry.action = p_kind
      AND entry.resource_id IS NOT DISTINCT FROM p_record_id
      AND entry."timestamp" > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  PERFORM public.record_app_audit_entry(
    p_kind, v_record_type, 'info', '{}'::jsonb, p_actor_user_id, p_organization_id, p_record_id, NULL, p_personnel_id,
    NULL, NULL, p_ip_address, p_user_agent
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_personnel_record_open(text, uuid, uuid, uuid, uuid, inet, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_personnel_record_open(text, uuid, uuid, uuid, uuid, inet, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
