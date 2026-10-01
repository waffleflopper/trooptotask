-- Keep the whole selected Personnel batch atomic and return its actual parent
-- count without PostgREST URL or returned-row limits. Existing cascades apply.
BEGIN;

CREATE FUNCTION public.delete_expired_personnel(
  p_org_id uuid,
  p_candidate_ids uuid[],
  p_cutoff timestamptz
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_org_id IS NULL OR p_candidate_ids IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization, candidate IDs and cutoff are required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.personnel
  WHERE organization_id = p_org_id
    AND id = ANY (p_candidate_ids)
    AND archived_at IS NOT NULL
    AND archived_at < p_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expired_personnel(uuid, uuid[], timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_personnel(uuid, uuid[], timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
