BEGIN;

CREATE FUNCTION public.delete_availability_entries(
  p_organization_id uuid, p_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL
    OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar availability removal is not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL
    OR cardinality(p_ids) NOT BETWEEN 1 AND 500
    OR array_position(p_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Invalid Calendar availability removal' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.availability_entries
  WHERE organization_id = p_organization_id AND id = ANY(p_ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_availability_entries(uuid, uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_availability_entries(uuid, uuid[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
