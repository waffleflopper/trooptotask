-- Archive cleanup must not cascade a Calendar assignment inserted after its initial candidate read.
-- Lock each type before checking references; the FK insert takes a conflicting key-share lock.
CREATE OR REPLACE FUNCTION "public"."delete_expired_unreferenced_assignment_types"(
  "p_org_id" uuid,
  "p_candidate_ids" uuid[],
  "p_cutoff" timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type_id uuid;
  v_deleted integer := 0;
  v_count integer;
BEGIN
  IF p_org_id IS NULL OR p_candidate_ids IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'Organization, candidate IDs and cutoff are required' USING ERRCODE = '22023';
  END IF;

  FOR v_type_id IN
    SELECT assignment_type.id
    FROM public.assignment_types AS assignment_type
    WHERE assignment_type.organization_id = p_org_id
      AND assignment_type.id = ANY (p_candidate_ids)
      AND assignment_type.archived_at < p_cutoff
    ORDER BY assignment_type.id
    FOR UPDATE OF assignment_type
  LOOP
    -- Check every reference, even a malformed cross-Organization legacy row, before a cascading delete.
    IF EXISTS (
      SELECT 1 FROM public.daily_assignments
      WHERE assignment_type_id = v_type_id
    ) THEN
      CONTINUE;
    END IF;

    DELETE FROM public.assignment_types
    WHERE id = v_type_id AND organization_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted + v_count;
  END LOOP;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION "public"."delete_expired_unreferenced_assignment_types"(uuid, uuid[], timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."delete_expired_unreferenced_assignment_types"(uuid, uuid[], timestamptz)
  TO service_role;
