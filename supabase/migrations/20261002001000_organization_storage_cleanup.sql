-- Organization destruction needs ordinary owner access to retained files even
-- when their Person/roster parent is gone. This adds only SELECT/DELETE; actual
-- byte removal must use Storage API before deleting the Organization row.
BEGIN;

CREATE FUNCTION public.organization_storage_object_is_owner_removable(
  bucket_name text, object_name text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN bucket_name IN ('counseling-files', 'personnel-documents')
      AND object_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    THEN (SELECT auth.uid()) IS NOT NULL
      AND public.is_user_suspended((SELECT auth.uid())) IS FALSE
      AND public.is_org_owner(pg_catalog.split_part(object_name, '/', 1)::uuid)
      AND EXISTS (
        SELECT 1 FROM public.organizations AS organization
        WHERE organization.id = pg_catalog.split_part(object_name, '/', 1)::uuid
          AND organization.suspended_at IS NULL
      )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.organization_storage_object_is_owner_removable(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organization_storage_object_is_owner_removable(text, text)
  TO authenticated, service_role;

CREATE POLICY "Organization owners can discover retained private files"
  ON storage.objects FOR SELECT TO authenticated
  USING (public.organization_storage_object_is_owner_removable(bucket_id, name));

CREATE POLICY "Organization owners can remove retained private files"
  ON storage.objects FOR DELETE TO authenticated
  USING (public.organization_storage_object_is_owner_removable(bucket_id, name));

NOTIFY pgrst, 'reload schema';
COMMIT;
