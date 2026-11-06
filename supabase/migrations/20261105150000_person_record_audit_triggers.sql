-- #1999 Leader notes, counseling records, documents and follow-ups are audited by the database in the same transaction
-- as the change, one entry per row, naming the person whose record it is. Their text, titles and files are never kept.
--
-- An operator may write these records without being allowed to read them back, so the server writes them with the
-- service role. The commands below take the member the server has authorized and make them the signed-in member for
-- the write only, the way approve_record_deletion_request does, so the triggers record that member. Only the service
-- role can run them, and a signed-in client's own claim is what every other write reads, so no client can choose whose
-- name an entry carries.
BEGIN;

-- Each row names its person; the unit comes from the command. One call is one transaction, so the rows of a bulk
-- action share one batch.
CREATE FUNCTION public.insert_personnel_artifacts(
  p_actor uuid, p_organization_id uuid, p_table text, p_rows jsonb
) RETURNS SETOF jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_claim text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  v_row jsonb;
  v_columns text;
  v_saved jsonb;
BEGIN
  IF p_table IS NULL OR p_table NOT IN ('leader_notes', 'personnel_follow_ups', 'counseling_records', 'personnel_documents') THEN
    RAISE EXCEPTION 'Unsupported Personnel artifact table' USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NULL OR p_organization_id IS NULL OR pg_catalog.jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid Personnel artifact write' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
    IF pg_catalog.jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR v_row ? 'id' OR v_row ? 'organization_id'
      OR NOT v_row ? 'personnel_id'
    THEN
      RAISE EXCEPTION 'Invalid Personnel artifact write' USING ERRCODE = '22023';
    END IF;
    v_row := v_row || pg_catalog.jsonb_build_object('organization_id', p_organization_id);
    SELECT pg_catalog.string_agg(pg_catalog.quote_ident(key), ', ') INTO v_columns
    FROM pg_catalog.jsonb_object_keys(v_row) AS key;
    EXECUTE pg_catalog.format(
      'INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM pg_catalog.jsonb_populate_record(NULL::public.%1$I, $1) '
        'RETURNING pg_catalog.to_jsonb(%1$I.*)',
      p_table, v_columns
    ) INTO v_saved USING v_row;
    RETURN NEXT v_saved;
  END LOOP;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_claim, ''), true);
END;
$$;

CREATE FUNCTION public.update_personnel_artifact(
  p_actor uuid, p_organization_id uuid, p_personnel_id uuid, p_table text, p_id uuid, p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_claim text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  v_columns text;
  v_saved jsonb;
BEGIN
  IF p_table IS NULL OR p_table NOT IN ('leader_notes', 'personnel_follow_ups', 'counseling_records', 'personnel_documents') THEN
    RAISE EXCEPTION 'Unsupported Personnel artifact table' USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NULL OR pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch = '{}'::jsonb
    OR p_patch ?| ARRAY['id', 'organization_id', 'personnel_id']
  THEN
    RAISE EXCEPTION 'Invalid Personnel artifact write' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);
  SELECT pg_catalog.string_agg(pg_catalog.quote_ident(key), ', ') INTO v_columns
  FROM pg_catalog.jsonb_object_keys(p_patch) AS key;
  EXECUTE pg_catalog.format(
    'UPDATE public.%1$I AS row_value SET (%2$s) = (SELECT %2$s FROM pg_catalog.jsonb_populate_record(NULL::public.%1$I, $1)) '
      'WHERE row_value.organization_id = $2 AND row_value.personnel_id = $3 AND row_value.id = $4 '
      'RETURNING pg_catalog.to_jsonb(row_value.*)',
    p_table, v_columns
  ) INTO v_saved USING p_patch, p_organization_id, p_personnel_id, p_id;
  IF v_saved IS NULL THEN
    RAISE EXCEPTION 'Personnel artifact not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_claim, ''), true);
  RETURN v_saved;
END;
$$;

CREATE FUNCTION public.delete_personnel_artifact(
  p_actor uuid, p_organization_id uuid, p_personnel_id uuid, p_table text, p_id uuid
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_claim text := pg_catalog.current_setting('request.jwt.claim.sub', true);
BEGIN
  -- Counseling records and documents hold a stored file, so only delete_archived_personnel_artifact removes them.
  IF p_table IS NULL OR p_table NOT IN ('leader_notes', 'personnel_follow_ups') THEN
    RAISE EXCEPTION 'Unsupported Personnel artifact table' USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Invalid Personnel artifact write' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);
  EXECUTE pg_catalog.format(
    'DELETE FROM public.%I WHERE organization_id = $1 AND personnel_id = $2 AND id = $3', p_table
  ) USING p_organization_id, p_personnel_id, p_id;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_claim, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION public.insert_personnel_artifacts(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_personnel_artifact(uuid, uuid, uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_personnel_artifact(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_personnel_artifacts(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_personnel_artifact(uuid, uuid, uuid, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_personnel_artifact(uuid, uuid, uuid, text, uuid) TO service_role;

-- A file artifact's deletion names the member who deleted it. A call without one, such as an older server, records
-- System.
DROP FUNCTION public.delete_archived_personnel_artifact(uuid, uuid, text, uuid, timestamptz);
CREATE FUNCTION public.delete_archived_personnel_artifact(
  p_organization_id uuid, p_personnel_id uuid, p_kind text, p_artifact_id uuid, p_archived_at timestamptz,
  p_actor uuid DEFAULT NULL
) RETURNS TABLE(deleted boolean, bucket_id text, object_name text, file_removed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  v_deleted boolean;
BEGIN
  IF p_actor IS NOT NULL THEN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);
  END IF;
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
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_claim, ''), true);
  RETURN QUERY SELECT v_deleted, deletion.bucket_id, deletion.object_name, deletion.file_removed
    FROM organization_private.artifact_file_deletion(p_organization_id, p_personnel_id, p_kind, p_artifact_id) AS deletion;
END;
$$;
ALTER FUNCTION public.delete_archived_personnel_artifact(uuid, uuid, text, uuid, timestamptz, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_archived_personnel_artifact(uuid, uuid, text, uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_archived_personnel_artifact(uuid, uuid, text, uuid, timestamptz, uuid)
  TO service_role;

-- An approved counseling deletion names its reviewer, as approve_record_deletion_request does for other records.
CREATE OR REPLACE FUNCTION public.approve_counseling_deletion_request(
  p_organization_id uuid, p_request_id uuid, p_record_id uuid, p_reviewer_id uuid, p_reviewed_at timestamptz,
  p_expected_file_path text
) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_claim text := pg_catalog.current_setting('request.jwt.claim.sub', true);
BEGIN
  UPDATE public.deletion_requests
  SET status = 'approved',
      reviewed_by = p_reviewer_id,
      reviewed_at = p_reviewed_at,
      denial_reason = NULL
  WHERE organization_id = p_organization_id
    AND id = p_request_id
    AND resource_type = 'counseling_record'
    AND resource_id = p_record_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_reviewer_id::text, ''), true);
  DELETE FROM public.counseling_records
  WHERE organization_id = p_organization_id
    AND id = p_record_id
    AND file_path IS NOT DISTINCT FROM p_expected_file_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Counseling record not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_claim, ''), true);
END;
$$;

-- TG_ARGV[0] is the kind prefix and TG_ARGV[1] the record type. Columns that only keep the record's own bookkeeping
-- never make an update entry.
CREATE FUNCTION audit_private.audit_personnel_artifact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_org uuid;
  v_person uuid;
  v_who text;
  v_person_archived timestamptz;
  v_event text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old := pg_catalog.to_jsonb(OLD);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new := pg_catalog.to_jsonb(NEW);
  END IF;
  v_row := coalesce(v_new, v_old);
  v_org := (v_row ->> 'organization_id')::uuid;
  v_person := (v_row ->> 'personnel_id')::uuid;
  v_who := audit_private.personnel_label(v_org, v_person);
  IF TG_OP <> 'DELETE' THEN
    PERFORM audit_private.require_in_unit(v_who, v_person, (v_old ->> 'personnel_id')::uuid);
  END IF;
  -- Rows removed with their person or unit: that deletion is the audited event.
  IF v_who IS NULL OR NOT audit_private.unit_exists(v_org) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event := 'created';
  ELSIF TG_OP = 'DELETE' THEN
    v_event := 'deleted';
  ELSIF (v_old -> 'archived_at') IS DISTINCT FROM (v_new -> 'archived_at') THEN
    -- Archiving or restoring a person carries their records with the person's own archive time. The person's entry
    -- is the audited event.
    SELECT person.archived_at INTO v_person_archived FROM public.personnel person
    WHERE person.id = v_person AND person.organization_id = v_org;
    IF v_person_archived = coalesce((v_new ->> 'archived_at')::timestamptz, (v_old ->> 'archived_at')::timestamptz) THEN
      RETURN NULL;
    END IF;
    v_event := CASE WHEN v_new ->> 'archived_at' IS NULL THEN 'restored' ELSE 'archived' END;
  ELSIF TG_TABLE_NAME = 'personnel_follow_ups' AND (v_old -> 'completed_at') IS DISTINCT FROM (v_new -> 'completed_at') THEN
    v_event := CASE WHEN v_new ->> 'completed_at' IS NULL THEN 'reopened' ELSE 'completed' END;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_each(v_new) AS field
      WHERE field.value IS DISTINCT FROM v_old -> field.key
        AND field.key NOT IN ('updated_at', 'archived_by', 'completed_by')
        AND NOT (TG_TABLE_NAME = 'personnel_follow_ups' AND field.key = 'status')
    ) THEN
      RETURN NULL;
    END IF;
    v_event := 'updated';
  END IF;

  PERFORM audit_private.record_entry(
    v_org, TG_ARGV[0] || '.' || v_event, TG_ARGV[1], (v_row ->> 'id')::uuid, NULL, v_person, v_who, '{}'::jsonb
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION audit_private.audit_personnel_artifact() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_leader_note
AFTER INSERT OR UPDATE OR DELETE ON public.leader_notes
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_personnel_artifact('personnel.leader_note', 'leader_note');
CREATE TRIGGER audit_counseling_record
AFTER INSERT OR UPDATE OR DELETE ON public.counseling_records
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_personnel_artifact('personnel.counseling_record', 'counseling_record');
CREATE TRIGGER audit_personnel_document
AFTER INSERT OR UPDATE OR DELETE ON public.personnel_documents
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_personnel_artifact('personnel.document', 'personnel_document');
CREATE TRIGGER audit_follow_up
AFTER INSERT OR UPDATE OR DELETE ON public.personnel_follow_ups
FOR EACH ROW EXECUTE FUNCTION audit_private.audit_personnel_artifact('personnel.follow_up', 'follow_up');

NOTIFY pgrst, 'reload schema';
COMMIT;
