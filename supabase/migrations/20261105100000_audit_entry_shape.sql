-- #1999 Audit entries save who did what to which record, and about whom, as labels taken when the entry is written.
-- Earlier rows keep their columns and read as before; nothing here rewrites them.
BEGIN;

ALTER TABLE public.audit_logs
  ADD COLUMN actor_label text,
  ADD COLUMN record_label text,
  ADD COLUMN subject_personnel_id uuid,
  ADD COLUMN subject_label text,
  ADD COLUMN batch_id uuid;

-- Writers are the service role and SECURITY DEFINER functions. A signed-in client only reads, so it can never
-- forge an actor or a saved label.
REVOKE ALL ON TABLE public.audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.audit_logs FROM authenticated;

DROP POLICY "Org owners can read own audit logs" ON public.audit_logs;
CREATE POLICY "Organization owners and admins read their audit logs" ON public.audit_logs
FOR SELECT TO authenticated USING (public.is_org_privileged(org_id) OR public.is_platform_operator());

CREATE SCHEMA audit_private;
REVOKE ALL ON SCHEMA audit_private FROM PUBLIC, anon, authenticated, service_role;

-- The roster form `<rank> <last>, <first>`, as formatRosterPersonDisplayName renders it in the app.
CREATE FUNCTION audit_private.person_label(p_rank text, p_last_name text, p_first_name text) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.concat_ws(' ', NULLIF(p_rank, ''), p_last_name || ', ' || p_first_name);
$$;

-- A member's profile rank and name, else the email their membership or account holds.
CREATE FUNCTION audit_private.member_label(p_organization_id uuid, p_user_id uuid) RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT audit_private.person_label(profile.rank, profile.last_name, profile.first_name)
      FROM public.user_profiles profile
      WHERE profile.user_id = p_user_id AND profile.last_name IS NOT NULL AND profile.first_name IS NOT NULL),
    (SELECT NULLIF(pg_catalog.btrim(membership.email), '')
      FROM public.organization_memberships membership
      WHERE membership.organization_id = p_organization_id AND membership.user_id = p_user_id),
    (SELECT account.email::text FROM auth.users account WHERE account.id = p_user_id)
  );
$$;

-- Every entry one transaction writes shares this id, so a bulk action reads as one line. The transaction id alone
-- restarts on a restored cluster; its start time keeps two batches apart.
CREATE FUNCTION audit_private.current_batch_id() RETURNS uuid
LANGUAGE sql VOLATILE
SET search_path = ''
AS $$
  SELECT pg_catalog.md5(pg_catalog.pg_current_xact_id()::text || ':' || pg_catalog.transaction_timestamp()::text)::uuid;
$$;

-- The one writer for database-recorded entries. The actor is the signed-in member; a write with none is the system.
CREATE FUNCTION audit_private.record_entry(
  p_organization_id uuid,
  p_kind text,
  p_record_type text,
  p_record_id uuid,
  p_record_label text,
  p_subject_personnel_id uuid,
  p_subject_label text,
  p_details jsonb
) RETURNS void
LANGUAGE sql VOLATILE
SET search_path = ''
AS $$
  INSERT INTO public.audit_logs (
    user_id, actor_label, org_id, action, resource_type, resource_id, record_label,
    subject_personnel_id, subject_label, batch_id, details
  )
  SELECT actor.id, audit_private.member_label(p_organization_id, actor.id), p_organization_id, p_kind, p_record_type,
    p_record_id, p_record_label, p_subject_personnel_id, p_subject_label, audit_private.current_batch_id(), p_details
  FROM (SELECT auth.uid() AS id) actor;
$$;

REVOKE ALL ON FUNCTION audit_private.person_label(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION audit_private.member_label(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION audit_private.current_batch_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION audit_private.record_entry(uuid, text, text, uuid, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
