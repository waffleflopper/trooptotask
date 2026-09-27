-- The Storage object is removed by the authorized Personnel command first.
-- Keep the counseling row and its request status in one database transaction so
-- a failed approval write leaves the row available for a retry.
BEGIN;

CREATE FUNCTION public.approve_counseling_deletion_request(
  p_organization_id uuid,
  p_request_id uuid,
  p_record_id uuid,
  p_reviewer_id uuid,
  p_reviewed_at timestamptz,
  p_expected_file_path text
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
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

  DELETE FROM public.counseling_records
  WHERE organization_id = p_organization_id
    AND id = p_record_id
    AND file_path IS NOT DISTINCT FROM p_expected_file_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Counseling record not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_counseling_deletion_request(
  uuid, uuid, uuid, uuid, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_counseling_deletion_request(
  uuid, uuid, uuid, uuid, timestamptz, text
) TO service_role;

COMMIT;
