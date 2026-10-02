-- A Storage permission check finishes before the provider writes bytes. Keep a
-- durable registration across that whole call and its record attachment or
-- acknowledged compensation. Unknown outcomes must not expire automatically.
BEGIN;

CREATE SCHEMA organization_private;
REVOKE ALL ON SCHEMA organization_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE organization_private.file_uploads (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  bucket_id text NOT NULL CHECK (bucket_id IN ('counseling-files', 'personnel-documents')),
  object_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, object_name),
  CHECK (object_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND lower(split_part(object_name, '/', 1)) = organization_id::text)
);
CREATE INDEX file_uploads_organization_idx ON organization_private.file_uploads (organization_id);
ALTER TABLE organization_private.file_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organization_private.file_uploads FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.register_organization_file_upload(
  p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'File uploads require read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF p_upload_id IS NULL OR p_actor_id IS NULL OR p_organization_id IS NULL
    OR p_bucket_id IS NULL OR p_bucket_id NOT IN ('counseling-files', 'personnel-documents')
    OR p_object_name IS NULL
    OR p_object_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    OR pg_catalog.lower(pg_catalog.split_part(p_object_name, '/', 1)) <> p_organization_id::text
    OR p_object_name ~ '(^|/)[.]{1,2}(/|$)'
  THEN
    RAISE EXCEPTION 'Invalid Organization file upload' USING ERRCODE = '22023';
  END IF;

  -- Begin, settle and the ordinary DELETE all exclude each other on this row.
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization is unavailable for file uploads' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations
      WHERE id = p_organization_id AND suspended_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = p_actor_id)
    OR NOT EXISTS (SELECT 1 FROM public.organization_memberships
      WHERE organization_id = p_organization_id AND user_id = p_actor_id)
  THEN
    RAISE EXCEPTION 'Organization file upload is not allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO organization_private.file_uploads(id, organization_id, actor_id, bucket_id, object_name)
    VALUES (p_upload_id, p_organization_id, p_actor_id, p_bucket_id, p_object_name);
  RETURN p_upload_id;
END;
$$;

CREATE FUNCTION public.settle_organization_file_upload(
  p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'File uploads require read committed isolation' USING ERRCODE = '25000';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM organization_private.file_uploads
    WHERE id = p_upload_id AND organization_id = p_organization_id AND actor_id = p_actor_id
      AND bucket_id = p_bucket_id AND object_name = p_object_name;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.register_organization_file_upload(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_organization_file_upload(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_organization_file_upload(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_organization_file_upload(uuid, uuid, uuid, text, text) TO service_role;

CREATE FUNCTION organization_private.require_registered_file_upload() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.bucket_id NOT IN ('counseling-files', 'personnel-documents')
    AND (TG_OP = 'INSERT' OR OLD.bucket_id NOT IN ('counseling-files', 'personnel-documents'))
  THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.bucket_id IS NOT DISTINCT FROM NEW.bucket_id
    AND OLD.name IS NOT DISTINCT FROM NEW.name AND OLD.version IS NOT DISTINCT FROM NEW.version
  THEN RETURN NEW; END IF;

  -- Historical SQL fixtures/migrations may seed metadata without a provider
  -- call. SECURITY DEFINER changes current_user, so inspect the session role
  -- and JWT explicitly; RESET ROLE alone does not clear authenticated claims.
  IF SESSION_USER = 'postgres'
    AND COALESCE(pg_catalog.current_setting('role', true), 'none') IN ('', 'none', 'postgres')
    AND auth.role() IS NULL AND auth.uid() IS NULL
    AND NULLIF(pg_catalog.current_setting('request.jwt', true), '') IS NULL
    AND COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb = '{}'::jsonb
  THEN RETURN NEW; END IF;

  -- Raw client uploads cannot borrow or end a server registration. Both
  -- preflight and final metadata writes require the trusted provider identity
  -- and exact committed, fresh server-generated key. Old tokens for other keys
  -- cannot admit writes; maintained callers never reuse registered keys.
  IF pg_catalog.current_setting('role', true) IS DISTINCT FROM 'service_role'
    OR auth.role() IS DISTINCT FROM 'service_role'
    OR NOT EXISTS (SELECT 1 FROM organization_private.file_uploads
      WHERE bucket_id = NEW.bucket_id AND object_name = NEW.name)
  THEN
    RAISE EXCEPTION 'A registered server file upload is required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_registered_file_upload()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER require_registered_organization_file_upload
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION organization_private.require_registered_file_upload();

-- Storage owns its relations. Its existing (bucket_id, lower(name) COLLATE "C")
-- index supports the exact UUID/slash range below, including case variants.
CREATE FUNCTION organization_private.require_empty_files_before_delete() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Organization deletion requires read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF pg_catalog.current_setting('role', true) = 'authenticated' OR auth.role() = 'authenticated' THEN
    -- RLS still owns ordinary deletion authority. Recheck current authority
    -- after a waited row lock rather than rely on its older statement snapshot.
    IF NOT EXISTS (SELECT 1 FROM public.organizations AS organization
      JOIN public.organization_memberships AS membership ON membership.organization_id = organization.id
      WHERE organization.id = OLD.id AND organization.suspended_at IS NULL
        AND membership.user_id = auth.uid() AND membership.role = 'owner'
        AND NOT EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = auth.uid()))
    THEN
      RAISE EXCEPTION 'Current Organization owner access is required' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- The ordinary DELETE already holds the Organization's FOR UPDATE row lock
  -- before its BEFORE ROW trigger. These separate VOLATILE queries therefore
  -- see registrations/files committed while that DELETE was waiting for it.
  IF EXISTS (SELECT 1 FROM organization_private.file_uploads WHERE organization_id = OLD.id) THEN
    RAISE EXCEPTION 'An Organization file upload is still in progress' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
    WHERE bucket_id IN ('counseling-files', 'personnel-documents')
      AND pg_catalog.lower(name) COLLATE "C" >= (OLD.id::text || '/') COLLATE "C"
      AND pg_catalog.lower(name) COLLATE "C" < (OLD.id::text || '0') COLLATE "C"
      AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      AND pg_catalog.lower(pg_catalog.split_part(name, '/', 1)) = OLD.id::text)
  THEN
    RAISE EXCEPTION 'Organization files must be removed before deletion' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION organization_private.require_empty_files_before_delete()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER require_empty_organization_files_before_delete
  BEFORE DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION organization_private.require_empty_files_before_delete();

NOTIFY pgrst, 'reload schema';
COMMIT;
