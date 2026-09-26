-- Counseling file helpers run as definers and bypass Personnel row RLS. Use
-- Personnel's effective row authorization for their Person branch, preserving
-- the Sign-In Roster branch, path checks, signatures and existing grants.
BEGIN;

CREATE OR REPLACE FUNCTION public.sensitive_file_object_is_readable(
  bucket_name text, object_name text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  org_id uuid;
  object_scope text;
  personnel_id uuid;
  roster_id uuid;
BEGIN
  IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
    RETURN FALSE;
  END IF;

  org_id := public.storage_object_org_id(object_name);
  object_scope := public.storage_object_scope(object_name);

  CASE object_scope
    WHEN 'sign-in-rosters' THEN
      BEGIN
        roster_id := (storage.foldername(object_name))[3]::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN FALSE;
      END;

      RETURN EXISTS (
        SELECT 1 FROM public.sign_in_rosters r
        WHERE r.id = roster_id AND r.organization_id = org_id
          AND public.can_access_sign_in_roster_scope(
            r.organization_id, r.scope_group_ids, 'view'
          )
      );
    WHEN 'counseling-records' THEN
      BEGIN
        personnel_id := (storage.foldername(object_name))[3]::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN FALSE;
      END;

      RETURN EXISTS (
        SELECT 1 FROM public.personnel p
        WHERE p.id = personnel_id AND p.organization_id = org_id
          AND public.can_view_personnel_record(org_id, p.group_id)
      );
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.sensitive_file_object_is_writable(
  bucket_name text, object_name text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  org_id uuid;
  object_scope text;
  personnel_id uuid;
  roster_id uuid;
BEGIN
  IF NOT public.is_valid_sensitive_file_path(bucket_name, object_name) THEN
    RETURN FALSE;
  END IF;

  org_id := public.storage_object_org_id(object_name);
  object_scope := public.storage_object_scope(object_name);

  CASE object_scope
    WHEN 'sign-in-rosters' THEN
      BEGIN
        roster_id := (storage.foldername(object_name))[3]::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN FALSE;
      END;

      RETURN EXISTS (
        SELECT 1 FROM public.sign_in_rosters r
        WHERE r.id = roster_id AND r.organization_id = org_id
          AND public.can_access_sign_in_roster_scope(
            r.organization_id, r.scope_group_ids, 'operate'
          )
      );
    WHEN 'counseling-records' THEN
      BEGIN
        personnel_id := (storage.foldername(object_name))[3]::uuid;
      EXCEPTION
        WHEN others THEN
          RETURN FALSE;
      END;

      RETURN EXISTS (
        SELECT 1 FROM public.personnel p
        WHERE p.id = personnel_id AND p.organization_id = org_id
          AND public.can_edit_personnel_record(org_id, p.group_id)
      );
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

COMMIT;
