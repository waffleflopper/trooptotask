BEGIN;

CREATE INDEX sign_in_rosters_signed_file_path_idx ON public.sign_in_rosters (signed_file_path)
  WHERE signed_file_path IS NOT NULL;

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
  END AS prefix) AS owned;
$$;

CREATE OR REPLACE FUNCTION organization_private.artifact_file_referenced(p_kind text, p_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  CASE p_kind
    WHEN 'counseling', 'roster' THEN
      RETURN EXISTS (SELECT 1 FROM public.counseling_records WHERE file_path = p_path)
        OR EXISTS (SELECT 1 FROM public.sign_in_rosters WHERE signed_file_path = p_path);
    WHEN 'document' THEN
      RETURN EXISTS (SELECT 1 FROM public.personnel_documents WHERE file_path = p_path);
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
  END;
$$;

CREATE FUNCTION organization_private.pending_roster_file_retirement(p_object_name text) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT object_name FROM organization_private.file_retirements
  WHERE p_object_name IS NOT NULL
    AND key_digest = organization_private.file_key_digest('counseling-files', p_object_name)
    AND object_name IS NOT NULL;
$$;

CREATE TABLE organization_private.file_retirement_holds (
  key_digest bytea PRIMARY KEY,
  bucket_id text NOT NULL CHECK (bucket_id IN ('counseling-files', 'personnel-documents')),
  object_name text NOT NULL,
  held_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz
);
CREATE INDEX file_retirement_holds_pending_idx ON organization_private.file_retirement_holds
  (attempted_at NULLS FIRST, held_at);
ALTER TABLE organization_private.file_retirement_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organization_private.file_retirement_holds FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION organization_private.retire_unreferenced_file(p_kind text, p_path text) RETURNS bytea
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_bucket text := organization_private.artifact_bucket(p_kind);
  v_key bytea := organization_private.file_key_digest(v_bucket, p_path);
  v_digest bytea;
BEGIN
  PERFORM organization_private.lock_file_key(v_bucket, p_path);
  IF organization_private.artifact_file_referenced(p_kind, p_path) THEN
    IF NOT organization_private.file_key_retired(v_bucket, p_path) THEN
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

CREATE FUNCTION organization_private.promote_file_retirement_holds(p_limit integer) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_hold record;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Stored file changes require read committed isolation' USING ERRCODE = '25000';
  END IF;
  FOR v_hold IN
    WITH picked AS (
      SELECT key_digest FROM organization_private.file_retirement_holds
      ORDER BY attempted_at NULLS FIRST, held_at, key_digest
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 0), 0), 1000)
      FOR UPDATE SKIP LOCKED
    )
    UPDATE organization_private.file_retirement_holds AS hold
    SET attempted_at = pg_catalog.clock_timestamp()
    FROM picked WHERE hold.key_digest = picked.key_digest
    RETURNING hold.bucket_id, hold.object_name
  LOOP
    CONTINUE WHEN NOT pg_catalog.pg_try_advisory_xact_lock(
      organization_private.file_key_lock(v_hold.bucket_id, v_hold.object_name));
    PERFORM organization_private.retire_unreferenced_file(
      CASE v_hold.bucket_id WHEN 'counseling-files' THEN 'counseling' ELSE 'document' END, v_hold.object_name);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_pending_organization_file_retirements(p_limit integer)
RETURNS TABLE (bucket_id text, object_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
BEGIN
  PERFORM organization_private.promote_file_retirement_holds(p_limit);
  RETURN QUERY
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
END;
$$;

-- SECURITY INVOKER keeps current_user as the API role, so the definer commands
-- pass the pointer rule.
CREATE FUNCTION organization_private.guard_sign_in_roster() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)
  THEN
    RAISE EXCEPTION 'A roster cannot change identity' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND (current_user IN ('authenticated', 'anon') OR auth.role() IN ('authenticated', 'anon')) THEN
    NEW.id := pg_catalog.gen_random_uuid();
  END IF;
  IF current_user IN ('authenticated', 'anon')
    AND NEW.signed_file_path IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.signed_file_path END)
  THEN
    RAISE EXCEPTION 'Signed scans change only through roster scan commands' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION organization_private.fence_inserted_roster_scans() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM organization_private.apply_artifact_file_changes(
    'roster', ARRAY(SELECT signed_file_path FROM new_rows), '{}');
  RETURN NULL;
END;
$$;

CREATE FUNCTION organization_private.fence_updated_roster_scans() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM organization_private.apply_artifact_file_changes(
    'roster',
    ARRAY(SELECT after_row.signed_file_path FROM new_rows AS after_row JOIN old_rows AS before_row ON before_row.id = after_row.id
      WHERE after_row.signed_file_path IS DISTINCT FROM before_row.signed_file_path),
    ARRAY(SELECT before_row.signed_file_path FROM new_rows AS after_row JOIN old_rows AS before_row ON before_row.id = after_row.id
      WHERE after_row.signed_file_path IS DISTINCT FROM before_row.signed_file_path
        AND organization_private.artifact_file_owned('roster', before_row.organization_id, before_row.id, before_row.signed_file_path)));
  RETURN NULL;
END;
$$;

CREATE FUNCTION organization_private.retire_deleted_roster_scans() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM organization_private.apply_artifact_file_changes(
    'roster', '{}',
    ARRAY(SELECT signed_file_path FROM deleted_rows
      WHERE organization_private.artifact_file_owned('roster', organization_id, id, signed_file_path)));
  RETURN NULL;
END;
$$;

CREATE TRIGGER guard_sign_in_roster
  BEFORE INSERT OR UPDATE OF signed_file_path, id, organization_id ON public.sign_in_rosters
  FOR EACH ROW EXECUTE FUNCTION organization_private.guard_sign_in_roster();
CREATE TRIGGER fence_inserted_roster_scans AFTER INSERT ON public.sign_in_rosters
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_inserted_roster_scans();
CREATE TRIGGER fence_updated_roster_scans AFTER UPDATE ON public.sign_in_rosters
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.fence_updated_roster_scans();
CREATE TRIGGER retire_deleted_roster_scans AFTER DELETE ON public.sign_in_rosters
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION organization_private.retire_deleted_roster_scans();

CREATE FUNCTION organization_private.require_managed_sign_in_roster(p_organization_id uuid, p_scope_group_ids uuid[])
RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.can_access_sign_in_roster_scope(p_organization_id, p_scope_group_ids, 'operate') THEN
    RAISE EXCEPTION 'Sign-in roster management is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Authority is read before the row lock, so no one outside the roster's view
-- can hold it, and again after, so a grant revoked during the wait is seen.
CREATE FUNCTION organization_private.lock_managed_sign_in_roster(p_organization_id uuid, p_roster_id uuid)
RETURNS public.sign_in_rosters
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_roster public.sign_in_rosters;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Signed scan changes require read committed isolation' USING ERRCODE = '25000';
  END IF;
  IF auth.uid() IS NULL
    OR NOT public.member_access_has_capability(p_organization_id, 'training', 'operate')
  THEN
    RAISE EXCEPTION 'Sign-in roster management is not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sign_in_rosters
      WHERE organization_id = p_organization_id AND id = p_roster_id
        AND public.can_access_sign_in_roster_scope(organization_id, scope_group_ids, 'view'))
  THEN
    RAISE EXCEPTION 'This roster is no longer available' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_roster FROM public.sign_in_rosters
    WHERE organization_id = p_organization_id AND id = p_roster_id
    FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_sign_in_roster_scope(p_organization_id, v_roster.scope_group_ids, 'view') THEN
    RAISE EXCEPTION 'This roster is no longer available' USING ERRCODE = 'P0002';
  END IF;
  PERFORM organization_private.require_managed_sign_in_roster(p_organization_id, v_roster.scope_group_ids);
  IF v_roster.signed_file_path IS NOT NULL
    AND NOT organization_private.artifact_file_owned('roster', p_organization_id, p_roster_id, v_roster.signed_file_path)
  THEN
    RAISE EXCEPTION 'This roster''s signed scan uses an unsupported storage location' USING ERRCODE = '22023';
  END IF;
  RETURN v_roster;
END;
$$;

-- The latest attachment wins. Returns the displaced key while its bytes are
-- still pending removal.
CREATE FUNCTION public.attach_sign_in_roster_scan(p_organization_id uuid, p_roster_id uuid, p_object_name text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_roster public.sign_in_rosters;
BEGIN
  IF NOT COALESCE(organization_private.artifact_file_owned('roster', p_organization_id, p_roster_id, p_object_name), false) THEN
    RAISE EXCEPTION 'Invalid signed scan key' USING ERRCODE = '22023';
  END IF;
  v_roster := organization_private.lock_managed_sign_in_roster(p_organization_id, p_roster_id);
  IF v_roster.signed_file_path = p_object_name THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_private.file_uploads
      WHERE bucket_id = 'counseling-files' AND object_name = p_object_name
        AND organization_id = p_organization_id AND actor_id = auth.uid())
    OR NOT EXISTS (SELECT 1 FROM storage.objects
      WHERE bucket_id = 'counseling-files' AND name = p_object_name)
  THEN
    RAISE EXCEPTION 'This scan upload is no longer in progress' USING ERRCODE = '55000';
  END IF;
  UPDATE public.sign_in_rosters SET signed_file_path = p_object_name
    WHERE organization_id = p_organization_id AND id = p_roster_id;
  PERFORM organization_private.require_managed_sign_in_roster(p_organization_id, v_roster.scope_group_ids);
  RETURN organization_private.pending_roster_file_retirement(v_roster.signed_file_path);
END;
$$;

-- Clears the scan only while it is still the one the member saw. A replay
-- after a lost reply reports the removal again with its pending key.
CREATE FUNCTION public.remove_sign_in_roster_scan(
  p_organization_id uuid, p_roster_id uuid, p_expected_object_name text
) RETURNS TABLE (outcome text, retired_object_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_roster public.sign_in_rosters;
BEGIN
  IF NOT COALESCE(organization_private.artifact_file_owned('roster', p_organization_id, p_roster_id, p_expected_object_name), false) THEN
    RAISE EXCEPTION 'Invalid signed scan key' USING ERRCODE = '22023';
  END IF;
  v_roster := organization_private.lock_managed_sign_in_roster(p_organization_id, p_roster_id);
  IF v_roster.signed_file_path IS NOT NULL AND v_roster.signed_file_path <> p_expected_object_name THEN
    RETURN QUERY SELECT 'changed'::text, NULL::text;
    RETURN;
  END IF;
  IF v_roster.signed_file_path IS NOT NULL THEN
    UPDATE public.sign_in_rosters SET signed_file_path = NULL
      WHERE organization_id = p_organization_id AND id = p_roster_id;
    PERFORM organization_private.require_managed_sign_in_roster(p_organization_id, v_roster.scope_group_ids);
  END IF;
  RETURN QUERY SELECT 'removed'::text, organization_private.pending_roster_file_retirement(p_expected_object_name);
END;
$$;

CREATE FUNCTION public.delete_sign_in_roster(p_organization_id uuid, p_roster_id uuid)
RETURNS TABLE (title text, retired_object_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_roster public.sign_in_rosters;
BEGIN
  v_roster := organization_private.lock_managed_sign_in_roster(p_organization_id, p_roster_id);
  DELETE FROM public.sign_in_rosters WHERE organization_id = p_organization_id AND id = p_roster_id;
  PERFORM organization_private.require_managed_sign_in_roster(p_organization_id, v_roster.scope_group_ids);
  RETURN QUERY SELECT v_roster.title, organization_private.pending_roster_file_retirement(v_roster.signed_file_path);
END;
$$;

-- After any attach error, including a lost reply, the key lock orders this
-- against a late attach of the same key. Either the roster holds the key or
-- the key retires so no late attach can claim it.
CREATE FUNCTION public.settle_sign_in_roster_scan_upload(
  p_organization_id uuid, p_roster_id uuid, p_object_name text
) RETURNS TABLE (attached boolean, retired_object_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT COALESCE(organization_private.artifact_file_owned('roster', p_organization_id, p_roster_id, p_object_name), false) THEN
    RAISE EXCEPTION 'Invalid signed scan key' USING ERRCODE = '22023';
  END IF;
  PERFORM organization_private.lock_file_key('counseling-files', p_object_name);
  IF EXISTS (SELECT 1 FROM public.sign_in_rosters
      WHERE organization_id = p_organization_id AND id = p_roster_id AND signed_file_path = p_object_name)
  THEN
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;
  IF organization_private.artifact_file_referenced('roster', p_object_name) THEN
    RAISE EXCEPTION 'This stored file is attached to another record' USING ERRCODE = '23505';
  END IF;
  PERFORM organization_private.retire_unreferenced_file('roster', p_object_name);
  RETURN QUERY SELECT false, organization_private.pending_roster_file_retirement(p_object_name);
END;
$$;

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
          AND r.signed_file_path = object_name
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

DROP POLICY "Sensitive files are deletable by authorized editors" ON storage.objects;

REVOKE ALL ON FUNCTION organization_private.pending_roster_file_retirement(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.promote_file_retirement_holds(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.guard_sign_in_roster() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.fence_inserted_roster_scans() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.fence_updated_roster_scans() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.retire_deleted_roster_scans() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.require_managed_sign_in_roster(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.lock_managed_sign_in_roster(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.attach_sign_in_roster_scan(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_sign_in_roster_scan(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_sign_in_roster(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.settle_sign_in_roster_scan_upload(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_sign_in_roster_scan(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_sign_in_roster_scan(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sign_in_roster(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_sign_in_roster_scan_upload(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
