-- Direct sensitive artifact reads require Personnel configure and the referenced
-- Person's strict Organization/Group scope. Operate writes use the admitted,
-- Person-bound server seam; do not expose rows through SELECT to enable RETURNING.
BEGIN;

CREATE FUNCTION public.personnel_sensitive_artifact_is_readable(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'personnel', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
        AND public.can_view_personnel_record(p_organization_id, p.group_id)
    );
$$;
REVOKE ALL ON FUNCTION public.personnel_sensitive_artifact_is_readable(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.personnel_sensitive_artifact_is_readable(uuid, uuid)
  TO authenticated, service_role;

DROP POLICY "Members can view counseling records through scoped personnel access"
  ON public.counseling_records;
CREATE POLICY "Configurators can read scoped counseling records"
  ON public.counseling_records FOR SELECT TO authenticated
  USING (public.personnel_sensitive_artifact_is_readable(organization_id, personnel_id));

DROP POLICY "Members can view leader notes through scoped personnel access"
  ON public.leader_notes;
CREATE POLICY "Configurators can read scoped leader notes"
  ON public.leader_notes FOR SELECT TO authenticated
  USING (public.personnel_sensitive_artifact_is_readable(organization_id, personnel_id));

DROP POLICY "Members can view personnel follow ups through scoped personnel access"
  ON public.personnel_follow_ups;
CREATE POLICY "Configurators can read scoped personnel follow ups"
  ON public.personnel_follow_ups FOR SELECT TO authenticated
  USING (public.personnel_sensitive_artifact_is_readable(organization_id, personnel_id));

DROP POLICY "Members can view personnel documents through scoped personnel access"
  ON public.personnel_documents;
CREATE POLICY "Configurators can read scoped personnel documents"
  ON public.personnel_documents FOR SELECT TO authenticated
  USING (public.personnel_sensitive_artifact_is_readable(organization_id, personnel_id));

DROP POLICY "Members can view personnel document files through scoped personnel access"
  ON storage.objects;
CREATE POLICY "Configurators can read scoped personnel document files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'personnel-documents'
    AND ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND ((storage.foldername(name))[2] = 'personnel')
    AND ((storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND ((storage.foldername(name))[4] = 'documents')
    AND public.personnel_sensitive_artifact_is_readable(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[3])::uuid
    )
  );

-- Keep the separate Training Sign-in Roster branch exactly as admitted today.
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

      RETURN public.personnel_sensitive_artifact_is_readable(org_id, personnel_id);
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

COMMIT;
