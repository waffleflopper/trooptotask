-- A Training record keeps one current completion. Changing its dates keeps the
-- superseded completion as history; a correction edits either in place.
-- Uploaded certificates live in their own private bucket under the Person and
-- retire like Personnel files once no current or history row names them.
BEGIN;

CREATE TABLE public.personnel_training_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  training_type_id uuid NOT NULL,
  completion_date date,
  expiration_date date,
  notes text,
  certificate_url text,
  superseded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_training_history_org_training_type_fkey
    FOREIGN KEY (organization_id, training_type_id)
    REFERENCES public.training_types (organization_id, id)
    ON DELETE CASCADE
);
CREATE INDEX personnel_training_history_person_idx
  ON public.personnel_training_history (organization_id, personnel_id);
-- The Person and type cascades look rows up by these keys.
CREATE INDEX personnel_training_history_personnel_id_idx
  ON public.personnel_training_history (personnel_id);
CREATE INDEX personnel_training_history_type_idx
  ON public.personnel_training_history (organization_id, training_type_id);

ALTER TABLE public.personnel_training_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view personnel training history if allowed by scoped training"
  ON public.personnel_training_history FOR SELECT
  USING (public.can_view_personnel_training_record(organization_id, personnel_id));
CREATE POLICY "Users can insert personnel training history if allowed by scoped training"
  ON public.personnel_training_history FOR INSERT
  WITH CHECK (public.can_edit_personnel_training_record_with_type(organization_id, personnel_id, training_type_id));
CREATE POLICY "Users can update personnel training history if allowed by scoped training"
  ON public.personnel_training_history FOR UPDATE
  USING (public.can_edit_personnel_training_record(organization_id, personnel_id))
  WITH CHECK (public.can_edit_personnel_training_record_with_type(organization_id, personnel_id, training_type_id));
CREATE POLICY "Users can delete personnel training history if allowed by scoped training"
  ON public.personnel_training_history FOR DELETE
  USING (public.can_configure_personnel_training_record(organization_id, personnel_id));
GRANT ALL ON TABLE public.personnel_training_history TO anon, authenticated, service_role;

CREATE FUNCTION public.record_superseded_training_completion() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('trooptotask.training_correction', true) = 'on' THEN
    RETURN NULL;
  END IF;
  -- Without either date, only a never-expiring type's row is a completion; a
  -- dated type's row has not been completed yet and supersedes nothing.
  IF OLD.completion_date IS NULL AND OLD.expiration_date IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.training_types
    WHERE organization_id = OLD.organization_id AND id = OLD.training_type_id
      AND expiration_months IS NULL AND NOT expiration_date_only
  ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.personnel_training_history
    (organization_id, personnel_id, training_type_id, completion_date, expiration_date, notes, certificate_url)
  VALUES
    (OLD.organization_id, OLD.personnel_id, OLD.training_type_id, OLD.completion_date, OLD.expiration_date,
     OLD.notes, OLD.certificate_url);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.record_superseded_training_completion() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER record_superseded_training_completion
  AFTER UPDATE OF completion_date, expiration_date ON public.personnel_trainings
  FOR EACH ROW
  WHEN (OLD.completion_date IS DISTINCT FROM NEW.completion_date
    OR OLD.expiration_date IS DISTINCT FROM NEW.expiration_date)
  EXECUTE FUNCTION public.record_superseded_training_completion();

-- RLS decides which row the caller may correct. The transaction-local flag
-- stops this one statement from recording the corrected completion as history.
CREATE FUNCTION public.correct_training_completion(
  p_organization_id uuid, p_kind text, p_id uuid,
  p_completion_date date, p_expiration_date date, p_notes text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF p_kind = 'current' THEN
    PERFORM pg_catalog.set_config('trooptotask.training_correction', 'on', true);
    UPDATE public.personnel_trainings
      SET completion_date = p_completion_date, expiration_date = p_expiration_date, notes = p_notes,
        updated_at = pg_catalog.now()
      WHERE organization_id = p_organization_id AND id = p_id
      RETURNING pg_catalog.to_jsonb(personnel_trainings) INTO v_row;
    PERFORM pg_catalog.set_config('trooptotask.training_correction', '', true);
  ELSIF p_kind = 'history' THEN
    UPDATE public.personnel_training_history
      SET completion_date = p_completion_date, expiration_date = p_expiration_date, notes = p_notes
      WHERE organization_id = p_organization_id AND id = p_id
      RETURNING pg_catalog.to_jsonb(personnel_training_history) INTO v_row;
  ELSE
    RAISE EXCEPTION 'Unknown Training completion kind' USING ERRCODE = '22023';
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.correct_training_completion(uuid, text, uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_training_completion(uuid, text, uuid, date, date, text)
  TO authenticated, service_role;

-- Adds or removes one Person without rewriting the rest of the list, so two
-- configurators exempting different Soldiers do not overwrite each other.
CREATE FUNCTION public.set_training_exemption(
  p_organization_id uuid, p_training_type_id uuid, p_personnel_id uuid, p_exempt boolean
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_can_be_exempted boolean;
  v_person text := p_personnel_id::text;
BEGIN
  IF p_exempt IS NULL OR p_personnel_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Training exemption' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_manage_training_configuration(p_organization_id) THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT can_be_exempted INTO v_can_be_exempted FROM public.training_types
    WHERE organization_id = p_organization_id AND id = p_training_type_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This Training type is no longer available' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.personnel WHERE organization_id = p_organization_id AND id = p_personnel_id) THEN
    RAISE EXCEPTION 'Personnel not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_exempt THEN
    IF NOT v_can_be_exempted THEN
      RAISE EXCEPTION 'This Training type does not allow exemptions' USING ERRCODE = '55000';
    END IF;
    UPDATE public.training_types
      SET exempt_personnel_ids = exempt_personnel_ids || pg_catalog.jsonb_build_array(v_person)
      WHERE organization_id = p_organization_id AND id = p_training_type_id
        AND NOT exempt_personnel_ids @> pg_catalog.jsonb_build_array(v_person);
  ELSE
    UPDATE public.training_types
      SET exempt_personnel_ids = exempt_personnel_ids - v_person
      WHERE organization_id = p_organization_id AND id = p_training_type_id
        AND exempt_personnel_ids @> pg_catalog.jsonb_build_array(v_person);
  END IF;
  RETURN p_exempt;
END;
$$;
REVOKE ALL ON FUNCTION public.set_training_exemption(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_training_exemption(uuid, uuid, uuid, boolean) TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-certificates', 'training-certificates', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Training viewers can read scoped training certificates"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'training-certificates'
    AND ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND ((storage.foldername(name))[2] = 'personnel')
    AND ((storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND ((storage.foldername(name))[4] = 'training-certificates')
    AND public.can_view_personnel_training_record(
      ((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[3])::uuid
    )
  );
CREATE POLICY "Training operators can add scoped training certificates"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'training-certificates'
    AND ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND ((storage.foldername(name))[2] = 'personnel')
    AND ((storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND ((storage.foldername(name))[4] = 'training-certificates')
    AND public.can_edit_personnel_training_record(
      ((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[3])::uuid
    )
  );

CREATE OR REPLACE FUNCTION public.organization_storage_object_is_owner_removable(
  bucket_name text, object_name text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN bucket_name IN ('counseling-files', 'personnel-documents', 'training-certificates')
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

ALTER TABLE organization_private.file_uploads
  DROP CONSTRAINT file_uploads_bucket_id_check,
  ADD CONSTRAINT file_uploads_bucket_id_check
    CHECK (bucket_id IN ('counseling-files', 'personnel-documents', 'training-certificates'));
ALTER TABLE organization_private.file_retirements
  DROP CONSTRAINT file_retirements_bucket_id_check,
  ADD CONSTRAINT file_retirements_bucket_id_check
    CHECK (bucket_id IN ('counseling-files', 'personnel-documents', 'training-certificates'));

CREATE OR REPLACE FUNCTION public.register_organization_file_upload(
  p_upload_id uuid, p_organization_id uuid, p_actor_id uuid, p_bucket_id text, p_object_name text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'File uploads require read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF p_upload_id IS NULL OR p_actor_id IS NULL OR p_organization_id IS NULL
    OR p_bucket_id IS NULL OR p_bucket_id NOT IN ('counseling-files', 'personnel-documents', 'training-certificates')
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
  PERFORM pg_catalog.pg_advisory_xact_lock(organization_private.file_key_lock(p_bucket_id, p_object_name));
  IF organization_private.file_key_retired(p_bucket_id, p_object_name) THEN
    RAISE EXCEPTION 'This stored file was deleted and cannot be reused' USING ERRCODE = '23514';
  END IF;
  INSERT INTO organization_private.file_uploads(id, organization_id, actor_id, bucket_id, object_name)
    VALUES (p_upload_id, p_organization_id, p_actor_id, p_bucket_id, p_object_name);
  RETURN p_upload_id;
END;
$$;

CREATE OR REPLACE FUNCTION organization_private.require_registered_file_upload() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.bucket_id NOT IN ('counseling-files', 'personnel-documents', 'training-certificates')
    AND (TG_OP = 'INSERT' OR OLD.bucket_id NOT IN ('counseling-files', 'personnel-documents', 'training-certificates'))
  THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.bucket_id IS NOT DISTINCT FROM NEW.bucket_id
    AND OLD.name IS NOT DISTINCT FROM NEW.name AND OLD.version IS NOT DISTINCT FROM NEW.version
  THEN RETURN NEW; END IF;

  -- No writer, including fixtures, may put bytes back under a retired key.
  IF NEW.bucket_id IN ('counseling-files', 'personnel-documents', 'training-certificates') THEN
    PERFORM organization_private.lock_file_key(NEW.bucket_id, NEW.name);
    IF organization_private.file_key_retired(NEW.bucket_id, NEW.name) THEN
      RAISE EXCEPTION 'This stored file was deleted and cannot be reused' USING ERRCODE = '23514';
    END IF;
  END IF;

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

CREATE OR REPLACE FUNCTION organization_private.require_empty_files_before_delete() RETURNS trigger
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
    WHERE bucket_id IN ('counseling-files', 'personnel-documents', 'training-certificates')
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

CREATE OR REPLACE FUNCTION organization_private.artifact_file_owned(
  p_kind text, p_organization_id uuid, p_personnel_id uuid, p_path text
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_path IS NOT NULL AND p_organization_id IS NOT NULL AND p_personnel_id IS NOT NULL
    AND pg_catalog.left(p_path, pg_catalog.length(prefix)) = prefix
    AND pg_catalog.length(p_path) > pg_catalog.length(prefix)
    AND NOT ('..' = ANY (pg_catalog.string_to_array(p_path, '/')))
    AND NOT ('.' = ANY (pg_catalog.string_to_array(p_path, '/')))
  FROM (SELECT CASE p_kind
    WHEN 'counseling' THEN p_organization_id::text || '/counseling-records/' || p_personnel_id::text || '/'
    WHEN 'document' THEN p_organization_id::text || '/personnel/' || p_personnel_id::text || '/documents/'
    WHEN 'roster' THEN p_organization_id::text || '/sign-in-rosters/' || p_personnel_id::text || '/'
    WHEN 'certificate' THEN
      p_organization_id::text || '/personnel/' || p_personnel_id::text || '/training-certificates/'
  END AS prefix) AS owned;
$$;

CREATE INDEX personnel_trainings_certificate_url_idx ON public.personnel_trainings (certificate_url)
  WHERE certificate_url IS NOT NULL;
CREATE INDEX personnel_training_history_certificate_url_idx ON public.personnel_training_history (certificate_url)
  WHERE certificate_url IS NOT NULL;

CREATE OR REPLACE FUNCTION organization_private.artifact_file_referenced(p_kind text, p_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  CASE p_kind
    WHEN 'counseling', 'roster' THEN
      RETURN EXISTS (SELECT 1 FROM public.counseling_records WHERE file_path = p_path)
        OR EXISTS (SELECT 1 FROM public.sign_in_rosters WHERE signed_file_path = p_path);
    WHEN 'document' THEN
      RETURN EXISTS (SELECT 1 FROM public.personnel_documents WHERE file_path = p_path);
    WHEN 'certificate' THEN
      RETURN EXISTS (SELECT 1 FROM public.personnel_trainings WHERE certificate_url = p_path)
        OR EXISTS (SELECT 1 FROM public.personnel_training_history WHERE certificate_url = p_path);
    ELSE
      RAISE EXCEPTION 'Unknown stored file kind' USING ERRCODE = '22023';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION organization_private.artifact_bucket(p_kind text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_kind
    WHEN 'counseling' THEN 'counseling-files'
    WHEN 'document' THEN 'personnel-documents'
    WHEN 'roster' THEN 'counseling-files'
    WHEN 'certificate' THEN 'training-certificates'
  END;
$$;

-- A hold covers a reference whose own removal would not retire the key. Every
-- certificate a member can write is under its row's Person, and the current
-- and history rows that share one retire it themselves, so it needs no hold.
CREATE OR REPLACE FUNCTION organization_private.retire_unreferenced_file(p_kind text, p_path text) RETURNS bytea
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_bucket text := organization_private.artifact_bucket(p_kind);
  v_key bytea := organization_private.file_key_digest(v_bucket, p_path);
  v_digest bytea;
BEGIN
  PERFORM organization_private.lock_file_key(v_bucket, p_path);
  IF organization_private.artifact_file_referenced(p_kind, p_path) THEN
    IF p_kind <> 'certificate' AND NOT organization_private.file_key_retired(v_bucket, p_path) THEN
      INSERT INTO organization_private.file_retirement_holds (key_digest, bucket_id, object_name)
        VALUES (v_key, v_bucket, p_path)
        ON CONFLICT (key_digest) DO NOTHING;
    END IF;
    RETURN NULL;
  END IF;
  INSERT INTO organization_private.file_retirements (key_digest, bucket_id, object_name)
    VALUES (v_key, v_bucket, p_path)
    ON CONFLICT (key_digest) DO NOTHING
    RETURNING key_digest INTO v_digest;
  DELETE FROM organization_private.file_retirement_holds WHERE key_digest = v_key;
  RETURN v_digest;
END;
$$;

-- Legacy values may be free text or an external link. Anything shaped like a
-- stored key must sit under the row's own Organization and Person.
CREATE FUNCTION organization_private.require_training_certificate_under_person() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  prefix text;
  segments text[];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.certificate_url IS NOT DISTINCT FROM OLD.certificate_url
    AND NEW.personnel_id IS NOT DISTINCT FROM OLD.personnel_id
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
  THEN
    RETURN NEW;
  END IF;
  IF NEW.certificate_url IS NULL
    OR NEW.certificate_url !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
  THEN
    RETURN NEW;
  END IF;
  prefix := NEW.organization_id::text || '/personnel/' || NEW.personnel_id::text || '/training-certificates/';
  segments := string_to_array(NEW.certificate_url, '/');
  IF left(NEW.certificate_url, length(prefix)) <> prefix
    OR length(NEW.certificate_url) = length(prefix)
    OR '..' = ANY (segments)
    OR '.' = ANY (segments)
  THEN
    RAISE EXCEPTION 'A stored certificate must belong to its Person' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION organization_private.fence_training_certificates() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM organization_private.apply_artifact_file_changes('certificate',
      ARRAY(SELECT certificate_url FROM new_rows
        WHERE organization_private.artifact_file_owned('certificate', organization_id, personnel_id, certificate_url)),
      '{}');
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM organization_private.apply_artifact_file_changes('certificate',
      ARRAY(SELECT after_row.certificate_url FROM new_rows AS after_row
        JOIN old_rows AS before_row ON before_row.id = after_row.id
        WHERE after_row.certificate_url IS DISTINCT FROM before_row.certificate_url
          AND organization_private.artifact_file_owned('certificate',
            after_row.organization_id, after_row.personnel_id, after_row.certificate_url)),
      ARRAY(SELECT before_row.certificate_url FROM new_rows AS after_row
        JOIN old_rows AS before_row ON before_row.id = after_row.id
        WHERE after_row.certificate_url IS DISTINCT FROM before_row.certificate_url
          AND organization_private.artifact_file_owned('certificate',
            before_row.organization_id, before_row.personnel_id, before_row.certificate_url)));
  ELSE
    PERFORM organization_private.apply_artifact_file_changes('certificate', '{}',
      ARRAY(SELECT certificate_url FROM old_rows
        WHERE organization_private.artifact_file_owned('certificate', organization_id, personnel_id, certificate_url)));
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION organization_private.require_training_certificate_under_person()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.fence_training_certificates()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER require_training_certificate_under_person
  BEFORE INSERT OR UPDATE OF certificate_url, personnel_id, organization_id ON public.personnel_trainings
  FOR EACH ROW EXECUTE FUNCTION organization_private.require_training_certificate_under_person();
CREATE TRIGGER require_training_certificate_under_person
  BEFORE INSERT OR UPDATE OF certificate_url, personnel_id, organization_id ON public.personnel_training_history
  FOR EACH ROW EXECUTE FUNCTION organization_private.require_training_certificate_under_person();

-- The fences match rows by id, so an id swap would slip a retired key past them.
CREATE TRIGGER keep_training_certificate_identity BEFORE UPDATE OF id ON public.personnel_trainings
  FOR EACH ROW EXECUTE FUNCTION organization_private.keep_artifact_identity();
CREATE TRIGGER keep_training_certificate_identity BEFORE UPDATE OF id ON public.personnel_training_history
  FOR EACH ROW EXECUTE FUNCTION organization_private.keep_artifact_identity();

CREATE TRIGGER fence_inserted_training_certificates AFTER INSERT ON public.personnel_trainings
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();
CREATE TRIGGER fence_updated_training_certificates AFTER UPDATE ON public.personnel_trainings
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();
CREATE TRIGGER retire_deleted_training_certificates AFTER DELETE ON public.personnel_trainings
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();
CREATE TRIGGER fence_inserted_training_certificates AFTER INSERT ON public.personnel_training_history
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();
CREATE TRIGGER fence_updated_training_certificates AFTER UPDATE ON public.personnel_training_history
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();
CREATE TRIGGER retire_deleted_training_certificates AFTER DELETE ON public.personnel_training_history
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_training_certificates();

-- After an attachment fails or its reply is lost, return the record that owns
-- the key, or retire the unattached key so no late attachment can claim it.
CREATE OR REPLACE FUNCTION public.reconcile_personnel_file_attachment(
  p_organization_id uuid, p_personnel_id uuid, p_kind text, p_object_name text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_bucket text := organization_private.artifact_bucket(p_kind);
  v_id uuid;
BEGIN
  IF v_bucket IS NULL
    OR NOT organization_private.artifact_file_owned(p_kind, p_organization_id, p_personnel_id, p_object_name)
  THEN
    RAISE EXCEPTION 'Invalid Personnel file key' USING ERRCODE = '22023';
  END IF;
  PERFORM organization_private.lock_file_key(v_bucket, p_object_name);
  IF p_kind = 'counseling' THEN
    SELECT id INTO v_id FROM public.counseling_records
      WHERE organization_id = p_organization_id AND personnel_id = p_personnel_id AND file_path = p_object_name
      ORDER BY created_at LIMIT 1;
  ELSIF p_kind = 'certificate' THEN
    SELECT id INTO v_id FROM public.personnel_trainings
      WHERE organization_id = p_organization_id AND personnel_id = p_personnel_id AND certificate_url = p_object_name
      ORDER BY created_at LIMIT 1;
  ELSE
    SELECT id INTO v_id FROM public.personnel_documents
      WHERE organization_id = p_organization_id AND personnel_id = p_personnel_id AND file_path = p_object_name
      ORDER BY created_at LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    IF organization_private.artifact_file_referenced(p_kind, p_object_name) THEN
      RAISE EXCEPTION 'This stored file is attached to another record' USING ERRCODE = '23505';
    END IF;
    PERFORM organization_private.retire_unreferenced_file(p_kind, p_object_name);
  END IF;
  RETURN v_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
