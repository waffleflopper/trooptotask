BEGIN;

CREATE FUNCTION public.import_availability_entries(p_organization_id uuid, p_entries jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  replaced_count integer;
  replaced_id_missing boolean;
  stale integer[];
  deleted_count integer;
  inserted_count integer;
BEGIN
  IF auth.uid() IS NULL
    OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'calendar', 'operate') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Calendar availability import is not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_entries IS NULL
    OR jsonb_typeof(p_entries) <> 'array'
    OR jsonb_array_length(p_entries) NOT BETWEEN 1 AND 500
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_entries) AS item(value)
      WHERE jsonb_typeof(item.value) <> 'object'
        OR jsonb_typeof(coalesce(item.value->'replaces', '[]'::jsonb)) <> 'array'
    )
  THEN
    RAISE EXCEPTION 'Invalid Calendar availability import' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), coalesce(bool_or(reviewed.value->>'id' IS NULL), false)
  INTO replaced_count, replaced_id_missing
  FROM jsonb_array_elements(p_entries) AS item(value)
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(item.value->'replaces', '[]'::jsonb)) AS reviewed(value);
  IF replaced_count > 500 OR replaced_id_missing THEN
    RAISE EXCEPTION 'Invalid Calendar availability import' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.availability_entries saved
  WHERE saved.organization_id = p_organization_id
    AND saved.id IN (
      SELECT (reviewed.value->>'id')::uuid
      FROM jsonb_array_elements(p_entries) AS item(value)
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(item.value->'replaces', '[]'::jsonb)) AS reviewed(value)
    )
  ORDER BY saved.id
  FOR UPDATE;

  -- A replaced entry that is gone needs no delete; one that changed or no longer overlaps refuses its row.
  SELECT coalesce(array_agg(DISTINCT (item.position - 1)::integer ORDER BY (item.position - 1)::integer), '{}')
  INTO stale
  FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS item(value, position)
  CROSS JOIN LATERAL jsonb_to_recordset(coalesce(item.value->'replaces', '[]'::jsonb))
    AS reviewed(id uuid, status_type_id uuid, start_date date, end_date date, note text)
  JOIN public.availability_entries saved
    ON saved.organization_id = p_organization_id AND saved.id = reviewed.id
  WHERE saved.personnel_id IS DISTINCT FROM (item.value->>'personnel_id')::uuid
    OR saved.status_type_id IS DISTINCT FROM reviewed.status_type_id
    OR saved.start_date IS DISTINCT FROM reviewed.start_date
    OR saved.end_date IS DISTINCT FROM reviewed.end_date
    OR saved.note IS DISTINCT FROM reviewed.note
    OR saved.start_date > (item.value->>'end_date')::date
    OR saved.end_date < (item.value->>'start_date')::date;

  DELETE FROM public.availability_entries saved
  USING jsonb_array_elements(p_entries) WITH ORDINALITY AS item(value, position),
    jsonb_to_recordset(coalesce(item.value->'replaces', '[]'::jsonb)) AS reviewed(id uuid)
  WHERE item.position - 1 <> ALL(stale)
    AND saved.organization_id = p_organization_id
    AND saved.id = reviewed.id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  INSERT INTO public.availability_entries(
    organization_id, personnel_id, status_type_id, start_date, end_date, note
  )
  SELECT p_organization_id, entry.personnel_id, entry.status_type_id, entry.start_date, entry.end_date, entry.note
  FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS item(value, position)
  CROSS JOIN LATERAL jsonb_to_record(item.value) AS entry(
    personnel_id uuid, status_type_id uuid, start_date date, end_date date, note text
  )
  WHERE item.position - 1 <> ALL(stale);
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object('inserted', inserted_count, 'deleted', deleted_count, 'stale', to_jsonb(stale));
END;
$$;

REVOKE ALL ON FUNCTION public.import_availability_entries(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.import_availability_entries(uuid, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
