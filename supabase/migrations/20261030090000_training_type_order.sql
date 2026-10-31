-- set_training_type_order is the only application writer of
-- training_types.sort_order after create, which appends. The expected-order
-- check and every position write share one lock, so overlapping saves cannot
-- interleave.
BEGIN;

CREATE FUNCTION public.set_training_type_order(
  p_organization_id uuid, p_training_type_ids uuid[], p_expected_training_type_ids uuid[]
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_saved uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_training_configuration(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_training_type_ids IS NULL OR p_expected_training_type_ids IS NULL
    OR pg_catalog.array_ndims(p_training_type_ids) > 1
    OR pg_catalog.array_ndims(p_expected_training_type_ids) > 1
    OR pg_catalog.array_position(p_training_type_ids, NULL) IS NOT NULL
    OR pg_catalog.array_position(p_expected_training_type_ids, NULL) IS NOT NULL
    OR pg_catalog.cardinality(p_training_type_ids) <> (
      SELECT pg_catalog.count(DISTINCT ids.id) FROM pg_catalog.unnest(p_training_type_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Choose every Training type once' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('training-type-order:' || p_organization_id::text, 0)
  );
  -- NO KEY UPDATE on every type holds the set against delete and edits without
  -- blocking foreign-key checks from rows that reference a type. It also
  -- applies the update policy, so authority is rechecked after the waits.
  PERFORM 1 FROM public.training_types
  WHERE organization_id = p_organization_id
  ORDER BY id
  FOR NO KEY UPDATE;
  IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}') INTO v_saved
  FROM public.training_types
  WHERE organization_id = p_organization_id;
  -- A replay after a lost reply, or the same change from two people, converges
  -- before the precondition can report a false conflict.
  IF v_saved = p_training_type_ids THEN
    IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  -- TTO01, not 40001: PostgREST silently retries a serialization failure, so a
  -- stale command would loop and could later commit over the newer order. A
  -- type created or deleted since the client read also lands here, so a stale
  -- order never drops a new type.
  IF v_saved IS DISTINCT FROM p_expected_training_type_ids THEN
    RAISE EXCEPTION 'Training type order changed' USING ERRCODE = 'TTO01';
  END IF;
  IF pg_catalog.cardinality(p_training_type_ids) <> pg_catalog.cardinality(v_saved)
    OR NOT (p_training_type_ids @> v_saved)
  THEN
    RAISE EXCEPTION 'Choose every Training type once' USING ERRCODE = '22023';
  END IF;

  UPDATE public.training_types AS t SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_training_type_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE t.organization_id = p_organization_id AND t.id = o.id AND t.sort_order <> o.ordinal - 1;

  -- Row security silently hides rows from a write whose author lost authority
  -- after the check above.
  IF public.can_manage_training_configuration(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Training configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}')
      FROM public.training_types WHERE organization_id = p_organization_id)
     IS DISTINCT FROM p_training_type_ids
  THEN
    RAISE EXCEPTION 'Training type order was not saved' USING ERRCODE = 'TTO01';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_training_type_order(uuid, uuid[], uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_training_type_order(uuid, uuid[], uuid[]) TO authenticated;

COMMIT;
