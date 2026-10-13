BEGIN;

CREATE FUNCTION public.submit_deletion_request(
  p_organization_id uuid,
  p_requested_by uuid,
  p_requester_email text,
  p_resource_type text,
  p_resource_id uuid,
  p_description text,
  p_resource_url text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_request public.deletion_requests;
BEGIN
  -- The pending check after the wait must see the earlier submission's commit.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Deletion request submission requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF p_organization_id IS NULL OR p_requested_by IS NULL OR p_resource_id IS NULL
    OR p_requester_email IS NULL OR p_description IS NULL
    OR p_resource_type IS NULL OR p_resource_type NOT IN (
      'personnel', 'training_type', 'personnel_training', 'rating_scheme_entry', 'counseling_record'
    )
  THEN
    RAISE EXCEPTION 'Invalid deletion request submission' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'deletion-request-pending:' || p_organization_id::text || ':' || p_resource_type || ':' || p_resource_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.deletion_requests AS request
    WHERE request.organization_id = p_organization_id AND request.resource_type = p_resource_type
      AND request.resource_id = p_resource_id AND request.status = 'pending'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'duplicate');
  END IF;

  INSERT INTO public.deletion_requests (
    organization_id, requested_by, requested_by_email, resource_type, resource_id,
    resource_description, resource_url, status
  ) VALUES (
    p_organization_id, p_requested_by, p_requester_email, p_resource_type, p_resource_id,
    p_description, p_resource_url, 'pending'
  ) RETURNING * INTO v_request;
  RETURN pg_catalog.jsonb_build_object('outcome', 'created', 'request', pg_catalog.to_jsonb(v_request));
END;
$$;
ALTER FUNCTION public.submit_deletion_request(uuid, uuid, text, text, uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_deletion_request(uuid, uuid, text, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_deletion_request(uuid, uuid, text, text, uuid, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
