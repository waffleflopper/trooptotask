-- #1809 Group editor commands: display order, rename and delete with reassignment.
-- Each command takes the same per-Organization lock, so a reorder, rename and
-- delete never interleave. Pins are stored by Group name per viewer, and RLS
-- lets a viewer touch only their own, so the one privileged step is the pin
-- rewrite triggered by a Group rename or delete.
BEGIN;

CREATE SCHEMA personnel_private;
REVOKE ALL ON SCHEMA personnel_private FROM PUBLIC, anon, service_role;
GRANT USAGE ON SCHEMA personnel_private TO authenticated;

CREATE FUNCTION personnel_private.sync_group_pins() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.user_pinned_groups
    WHERE organization_id = OLD.organization_id AND group_name = OLD.name;
  ELSIF OLD.name IS DISTINCT FROM NEW.name THEN
    -- Only viewers whose old pin follows this rename need a conflicting target pin removed.
    DELETE FROM public.user_pinned_groups AS target
    USING public.user_pinned_groups AS source
    WHERE target.organization_id = OLD.organization_id AND target.group_name = NEW.name
      AND source.organization_id = OLD.organization_id AND source.group_name = OLD.name
      AND source.user_id = target.user_id;
    UPDATE public.user_pinned_groups SET group_name = NEW.name
    WHERE organization_id = OLD.organization_id AND group_name = OLD.name;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION personnel_private.sync_group_pins() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER sync_group_pins
  AFTER UPDATE OF name OR DELETE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION personnel_private.sync_group_pins();

CREATE FUNCTION personnel_private.require_group_manager(p_organization_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_manage_groups(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Group management is not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION personnel_private.require_group_manager(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION personnel_private.require_group_manager(uuid) TO authenticated;

CREATE FUNCTION personnel_private.lock_group_catalog(p_organization_id uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('personnel-group-catalog:' || p_organization_id::text, 0)
  );
$$;
REVOKE ALL ON FUNCTION personnel_private.lock_group_catalog(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION personnel_private.lock_group_catalog(uuid) TO authenticated;

-- set_group_order is the only application writer of sort_order after create.
CREATE FUNCTION public.set_group_order(
  p_organization_id uuid, p_group_ids uuid[], p_expected_group_ids uuid[]
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_saved uuid[];
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF p_group_ids IS NULL OR p_expected_group_ids IS NULL
    OR pg_catalog.array_ndims(p_group_ids) > 1
    OR pg_catalog.array_ndims(p_expected_group_ids) > 1
    OR pg_catalog.array_position(p_group_ids, NULL) IS NOT NULL
    OR pg_catalog.array_position(p_expected_group_ids, NULL) IS NOT NULL
    OR pg_catalog.cardinality(p_group_ids) <> (
      SELECT pg_catalog.count(DISTINCT ids.id) FROM pg_catalog.unnest(p_group_ids) AS ids(id))
  THEN
    RAISE EXCEPTION 'Choose every Group once' USING ERRCODE = '22023';
  END IF;

  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM 1 FROM public.groups
  WHERE organization_id = p_organization_id
  ORDER BY id
  FOR NO KEY UPDATE;
  PERFORM personnel_private.require_group_manager(p_organization_id);

  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, name, id), '{}') INTO v_saved
  FROM public.groups
  WHERE organization_id = p_organization_id;
  -- A replay after a lost reply converges before the precondition can report a false conflict.
  IF v_saved = p_group_ids THEN
    RETURN;
  END IF;
  -- GRP01, not 40001: PostgREST silently retries a serialization failure, so a
  -- stale command would loop. A Group created or deleted since the client read
  -- also lands here, so a stale order never drops a new Group.
  IF v_saved IS DISTINCT FROM p_expected_group_ids THEN
    RAISE EXCEPTION 'Group order changed' USING ERRCODE = 'GRP01';
  END IF;
  IF pg_catalog.cardinality(p_group_ids) <> pg_catalog.cardinality(v_saved)
    OR NOT (p_group_ids @> v_saved)
  THEN
    RAISE EXCEPTION 'Choose every Group once' USING ERRCODE = '22023';
  END IF;

  UPDATE public.groups AS g SET sort_order = (o.ordinal - 1)::integer
  FROM pg_catalog.unnest(p_group_ids) WITH ORDINALITY AS o(id, ordinal)
  WHERE g.organization_id = p_organization_id AND g.id = o.id AND g.sort_order <> o.ordinal - 1;

  -- Row security silently hides rows from a write whose author lost authority.
  IF (SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, name, id), '{}')
      FROM public.groups WHERE organization_id = p_organization_id)
     IS DISTINCT FROM p_group_ids
  THEN
    RAISE EXCEPTION 'Group order was not saved' USING ERRCODE = 'GRP01';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_group_order(uuid, uuid[], uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_group_order(uuid, uuid[], uuid[]) TO authenticated;

-- Renames a Group and carries every viewer's pin to the new name.
CREATE FUNCTION public.rename_group(p_organization_id uuid, p_group_id uuid, p_name text)
RETURNS TABLE (id uuid, name text, sort_order integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_name text := pg_catalog.btrim(p_name);
  v_old text;
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Group name must be 1 to 100 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM personnel_private.require_group_manager(p_organization_id);
  SELECT g.name INTO v_old FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old <> v_name THEN
    UPDATE public.groups AS g SET name = v_name
    WHERE g.organization_id = p_organization_id AND g.id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Group management is not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT g.id, g.name, g.sort_order FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rename_group(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rename_group(uuid, uuid, text) TO authenticated;

-- Moves every member (active or archived) to the target Group, or to Unassigned
-- when the target is NULL, deletes the Group and removes pins naming it, in one
-- transaction. Returns how many People moved.
CREATE FUNCTION public.delete_group_with_reassignment(
  p_organization_id uuid, p_group_id uuid, p_target_group_id uuid
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_moved integer;
BEGIN
  PERFORM personnel_private.require_group_manager(p_organization_id);
  IF p_group_id IS NULL OR p_group_id = p_target_group_id THEN
    RAISE EXCEPTION 'Choose another Group for the members' USING ERRCODE = '22023';
  END IF;
  PERFORM personnel_private.lock_group_catalog(p_organization_id);
  PERFORM personnel_private.require_group_manager(p_organization_id);
  PERFORM 1 FROM public.groups AS g
  WHERE g.organization_id = p_organization_id AND g.id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_target_group_id IS NOT NULL THEN
    PERFORM 1 FROM public.groups AS g
    WHERE g.organization_id = p_organization_id AND g.id = p_target_group_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.personnel AS p SET group_id = p_target_group_id
  WHERE p.organization_id = p_organization_id AND p.group_id = p_group_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  DELETE FROM public.groups AS g WHERE g.organization_id = p_organization_id AND g.id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group management is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN v_moved;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_group_with_reassignment(uuid, uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_group_with_reassignment(uuid, uuid, uuid) TO authenticated;

COMMIT;
