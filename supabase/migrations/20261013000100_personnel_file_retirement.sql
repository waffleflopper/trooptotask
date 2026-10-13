-- A stored Personnel file may outlive its record only until cleanup removes it.
-- Every record deletion or path change retires the record's own key in the
-- same transaction once no record still references it. A retired key is a
-- permanent fence: no upload registration, Storage write or record attachment
-- can reuse it, so later byte removal never deletes a newer file. Removal runs
-- after commit; completion clears the name and keeps only its digest.
BEGIN;

CREATE TABLE organization_private.file_retirements (
  key_digest bytea PRIMARY KEY,
  bucket_id text NOT NULL CHECK (bucket_id IN ('counseling-files', 'personnel-documents')),
  object_name text,
  retired_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz
);
CREATE INDEX file_retirements_pending_idx ON organization_private.file_retirements
  (attempted_at NULLS FIRST, retired_at) WHERE object_name IS NOT NULL;
ALTER TABLE organization_private.file_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organization_private.file_retirements FROM PUBLIC, anon, authenticated, service_role;

-- A retry after a lost reply reads the deletion it already made.
CREATE TABLE organization_private.file_artifact_deletions (
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('counseling', 'document')),
  artifact_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  personnel_id uuid NOT NULL,
  retired_key_digest bytea,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_kind, artifact_id)
);
ALTER TABLE organization_private.file_artifact_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organization_private.file_artifact_deletions FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX counseling_records_file_path_idx ON public.counseling_records (file_path);
CREATE INDEX personnel_documents_file_path_idx ON public.personnel_documents (file_path);

CREATE FUNCTION organization_private.file_key_digest(p_bucket_id text, p_object_name text) RETURNS bytea
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.sha256(pg_catalog.convert_to(p_bucket_id || '/' || p_object_name, 'UTF8'));
$$;

CREATE FUNCTION organization_private.file_key_lock(p_bucket_id text, p_object_name text) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.hashtextextended('organization-file-key:' || p_bucket_id || '/' || p_object_name, 0);
$$;

-- Checks after the lock must see commits made while it waited.
CREATE FUNCTION organization_private.lock_file_key(p_bucket_id text, p_object_name text) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Stored file changes require read committed isolation' USING ERRCODE = '25000';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(organization_private.file_key_lock(p_bucket_id, p_object_name));
END;
$$;

CREATE FUNCTION organization_private.file_key_retired(p_bucket_id text, p_object_name text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM organization_private.file_retirements
    WHERE key_digest = organization_private.file_key_digest(p_bucket_id, p_object_name));
$$;

-- The same rule as require_artifact_file_under_person. A path outside its own
-- Person is never retired, so its bytes are never removed.
CREATE FUNCTION organization_private.artifact_file_owned(
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
  END AS prefix) AS owned;
$$;

CREATE FUNCTION organization_private.artifact_file_referenced(p_kind text, p_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_kind = 'counseling' THEN
    RETURN EXISTS (SELECT 1 FROM public.counseling_records WHERE file_path = p_path);
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.personnel_documents WHERE file_path = p_path);
END;
$$;

CREATE FUNCTION organization_private.artifact_bucket(p_kind text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_kind WHEN 'counseling' THEN 'counseling-files' WHEN 'document' THEN 'personnel-documents' END;
$$;

-- Returns the digest only when this call retired it.
CREATE FUNCTION organization_private.retire_unreferenced_file(p_kind text, p_path text) RETURNS bytea
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_bucket text := organization_private.artifact_bucket(p_kind);
  v_digest bytea;
BEGIN
  PERFORM organization_private.lock_file_key(v_bucket, p_path);
  IF organization_private.artifact_file_referenced(p_kind, p_path) THEN
    RETURN NULL;
  END IF;
  INSERT INTO organization_private.file_retirements (key_digest, bucket_id, object_name)
    VALUES (organization_private.file_key_digest(v_bucket, p_path), v_bucket, p_path)
    ON CONFLICT (key_digest) DO NOTHING
    RETURNING key_digest INTO v_digest;
  RETURN v_digest;
END;
$$;

CREATE FUNCTION organization_private.retire_deleted_artifact_files() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_kind text := CASE TG_TABLE_NAME WHEN 'counseling_records' THEN 'counseling' ELSE 'document' END;
  v_bucket text := organization_private.artifact_bucket(v_kind);
  v_key record;
  v_retired bytea[] := '{}';
  v_digest bytea;
BEGIN
  FOR v_key IN
    SELECT DISTINCT file_path, organization_private.file_key_lock(v_bucket, file_path) AS lock_id
    FROM deleted_rows
    WHERE organization_private.artifact_file_owned(v_kind, organization_id, personnel_id, file_path)
    ORDER BY lock_id, file_path
  LOOP
    v_digest := organization_private.retire_unreferenced_file(v_kind, v_key.file_path);
    IF v_digest IS NOT NULL THEN v_retired := v_retired || v_digest; END IF;
  END LOOP;

  -- A cascade from a deleted Person has no one left to ask for a receipt.
  INSERT INTO organization_private.file_artifact_deletions
    (artifact_kind, artifact_id, organization_id, personnel_id, retired_key_digest)
  SELECT v_kind, deleted.id, deleted.organization_id, deleted.personnel_id,
    CASE WHEN organization_private.artifact_file_owned(v_kind, deleted.organization_id, deleted.personnel_id, deleted.file_path)
      AND organization_private.file_key_digest(v_bucket, deleted.file_path) = ANY (v_retired)
    THEN organization_private.file_key_digest(v_bucket, deleted.file_path) END
  FROM deleted_rows AS deleted
  WHERE EXISTS (SELECT 1 FROM public.personnel WHERE id = deleted.personnel_id);
  RETURN NULL;
END;
$$;

CREATE FUNCTION organization_private.apply_artifact_file_changes(
  p_kind text, p_attached text[], p_detached text[]
) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_bucket text := organization_private.artifact_bucket(p_kind);
  v_key record;
BEGIN
  FOR v_key IN
    SELECT file_path, bool_or(attach) AS attach, organization_private.file_key_lock(v_bucket, file_path) AS lock_id
    FROM (
      SELECT pg_catalog.unnest(p_attached) AS file_path, true AS attach
      UNION ALL
      SELECT pg_catalog.unnest(p_detached), false
    ) AS changed
    WHERE file_path IS NOT NULL
    GROUP BY file_path
    ORDER BY lock_id, file_path
  LOOP
    IF v_key.attach THEN
      PERFORM organization_private.lock_file_key(v_bucket, v_key.file_path);
      IF organization_private.file_key_retired(v_bucket, v_key.file_path) THEN
        RAISE EXCEPTION 'This stored file was deleted and cannot be attached' USING ERRCODE = '23514';
      END IF;
    ELSE
      PERFORM organization_private.retire_unreferenced_file(p_kind, v_key.file_path);
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION organization_private.fence_inserted_artifact_files() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_kind text := CASE TG_TABLE_NAME WHEN 'counseling_records' THEN 'counseling' ELSE 'document' END;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Stored file changes require read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF EXISTS (SELECT 1 FROM new_rows JOIN organization_private.file_artifact_deletions AS deletion
      ON deletion.artifact_kind = v_kind AND deletion.artifact_id = new_rows.id)
  THEN
    RAISE EXCEPTION 'A deleted Personnel file record id cannot be reused' USING ERRCODE = '23505';
  END IF;
  PERFORM organization_private.apply_artifact_file_changes(v_kind, ARRAY(SELECT file_path FROM new_rows), '{}');
  RETURN NULL;
END;
$$;

CREATE FUNCTION organization_private.keep_artifact_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Personnel file record identity cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION organization_private.fence_updated_artifact_files() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_kind text := CASE TG_TABLE_NAME WHEN 'counseling_records' THEN 'counseling' ELSE 'document' END;
BEGIN
  PERFORM organization_private.apply_artifact_file_changes(
    v_kind,
    ARRAY(SELECT after_row.file_path FROM new_rows AS after_row JOIN old_rows AS before_row ON before_row.id = after_row.id
      WHERE after_row.file_path IS DISTINCT FROM before_row.file_path),
    ARRAY(SELECT before_row.file_path FROM new_rows AS after_row JOIN old_rows AS before_row ON before_row.id = after_row.id
      WHERE after_row.file_path IS DISTINCT FROM before_row.file_path
        AND organization_private.artifact_file_owned(v_kind, before_row.organization_id, before_row.personnel_id, before_row.file_path)));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION organization_private.file_key_digest(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.file_key_lock(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.lock_file_key(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.file_key_retired(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.artifact_file_owned(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.artifact_file_referenced(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.artifact_bucket(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.retire_unreferenced_file(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.retire_deleted_artifact_files() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.apply_artifact_file_changes(text, text[], text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.fence_inserted_artifact_files() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.fence_updated_artifact_files() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.keep_artifact_identity() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER retire_deleted_artifact_files AFTER DELETE ON public.counseling_records
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.retire_deleted_artifact_files();
CREATE TRIGGER retire_deleted_artifact_files AFTER DELETE ON public.personnel_documents
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.retire_deleted_artifact_files();
CREATE TRIGGER fence_inserted_artifact_files AFTER INSERT ON public.counseling_records
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_inserted_artifact_files();
CREATE TRIGGER fence_inserted_artifact_files AFTER INSERT ON public.personnel_documents
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_inserted_artifact_files();
CREATE TRIGGER fence_updated_artifact_files AFTER UPDATE ON public.counseling_records
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_updated_artifact_files();
CREATE TRIGGER fence_updated_artifact_files AFTER UPDATE ON public.personnel_documents
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_updated_artifact_files();
CREATE TRIGGER keep_artifact_identity BEFORE UPDATE OF id ON public.counseling_records
  FOR EACH ROW EXECUTE FUNCTION organization_private.keep_artifact_identity();
CREATE TRIGGER keep_artifact_identity BEFORE UPDATE OF id ON public.personnel_documents
  FOR EACH ROW EXECUTE FUNCTION organization_private.keep_artifact_identity();

CREATE OR REPLACE FUNCTION public.register_organization_file_upload(
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
  IF NEW.bucket_id NOT IN ('counseling-files', 'personnel-documents')
    AND (TG_OP = 'INSERT' OR OLD.bucket_id NOT IN ('counseling-files', 'personnel-documents'))
  THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.bucket_id IS NOT DISTINCT FROM NEW.bucket_id
    AND OLD.name IS NOT DISTINCT FROM NEW.name AND OLD.version IS NOT DISTINCT FROM NEW.version
  THEN RETURN NEW; END IF;

  -- No writer, including fixtures, may put bytes back under a retired key.
  IF NEW.bucket_id IN ('counseling-files', 'personnel-documents') THEN
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

CREATE FUNCTION organization_private.artifact_file_deletion(
  p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid
) RETURNS TABLE (bucket_id text, object_name text, file_removed boolean)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT retirement.bucket_id, retirement.object_name, retirement.object_name IS NULL
  FROM organization_private.file_artifact_deletions AS deletion
  LEFT JOIN organization_private.file_retirements AS retirement ON retirement.key_digest = deletion.retired_key_digest
  WHERE deletion.artifact_kind = p_kind AND deletion.artifact_id = p_artifact_id
    AND deletion.organization_id = p_organization_id AND deletion.personnel_id = p_personnel_id;
$$;
REVOKE ALL ON FUNCTION organization_private.artifact_file_deletion(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Delete only the exact archived record the caller observed. A restore or
-- re-archive after that read keeps the record.
CREATE FUNCTION public.delete_archived_personnel_artifact(
  p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid, p_archived_at timestamptz
) RETURNS TABLE (deleted boolean, bucket_id text, object_name text, file_removed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_deleted boolean;
BEGIN
  IF p_kind = 'counseling' THEN
    DELETE FROM public.counseling_records
      WHERE id = p_artifact_id AND organization_id = p_organization_id AND personnel_id = p_personnel_id
        AND archived_at = p_archived_at;
  ELSIF p_kind = 'document' THEN
    DELETE FROM public.personnel_documents
      WHERE id = p_artifact_id AND organization_id = p_organization_id AND personnel_id = p_personnel_id
        AND archived_at = p_archived_at;
  ELSE
    RAISE EXCEPTION 'Unknown Personnel file artifact' USING ERRCODE = '22023';
  END IF;
  v_deleted := FOUND;
  RETURN QUERY SELECT v_deleted, deletion.bucket_id, deletion.object_name, deletion.file_removed
    FROM organization_private.artifact_file_deletion(p_organization_id, p_personnel_id, p_kind, p_artifact_id) AS deletion;
END;
$$;

CREATE FUNCTION public.personnel_file_artifact_deletion(
  p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid
) RETURNS TABLE (bucket_id text, object_name text, file_removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM organization_private.artifact_file_deletion(p_organization_id, p_personnel_id, p_kind, p_artifact_id);
$$;

-- After an attachment fails or its reply is lost, return the record that owns
-- the key, or retire the unattached key so no late attachment can claim it.
CREATE FUNCTION public.reconcile_personnel_file_attachment(
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

-- Workers need no lease. A listed key moves behind untried keys, and removal
-- of an absent object is complete, so overlapping workers converge.
CREATE FUNCTION public.list_pending_organization_file_retirements(p_limit integer)
RETURNS TABLE (bucket_id text, object_name text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  WITH picked AS (
    SELECT key_digest FROM organization_private.file_retirements
    WHERE object_name IS NOT NULL
    ORDER BY attempted_at NULLS FIRST, retired_at
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 0), 0), 1000)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE organization_private.file_retirements AS retirement
  SET attempted_at = pg_catalog.clock_timestamp()
  FROM picked WHERE retirement.key_digest = picked.key_digest
  RETURNING retirement.bucket_id, retirement.object_name;
$$;

CREATE FUNCTION public.complete_organization_file_retirements(p_bucket_id text, p_object_names text[])
RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  WITH completed AS (
    UPDATE organization_private.file_retirements SET object_name = NULL
    WHERE object_name IS NOT NULL AND key_digest IN (
      SELECT organization_private.file_key_digest(p_bucket_id, name) FROM pg_catalog.unnest(p_object_names) AS name)
    RETURNING 1
  )
  SELECT count(*)::integer FROM completed;
$$;

REVOKE ALL ON FUNCTION public.delete_archived_personnel_artifact(uuid, uuid, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.personnel_file_artifact_deletion(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_personnel_file_attachment(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_pending_organization_file_retirements(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_organization_file_retirements(text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_archived_personnel_artifact(uuid, uuid, text, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.personnel_file_artifact_deletion(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_personnel_file_attachment(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_organization_file_retirements(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_organization_file_retirements(text, text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
