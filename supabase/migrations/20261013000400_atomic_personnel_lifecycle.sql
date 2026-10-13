-- Children are changed only by set-based statements whose
-- eligibility is rechecked after any row wait, so a concurrent individual
-- child change is ordered entirely before or after the cascade.
BEGIN;

CREATE FUNCTION organization_private.archive_locked_personnel(
  p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamptz
) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  UPDATE public.personnel AS person SET archived_at = p_archived_at
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND person.archived_at IS NULL;

  UPDATE public.personnel_follow_ups AS child SET archived_at = person.archived_at, status = 'archived'
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND child.organization_id = person.organization_id AND child.personnel_id = person.id
    AND child.archived_at IS NULL AND child.status = 'open';
  UPDATE public.counseling_records AS child SET archived_at = person.archived_at
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND child.organization_id = person.organization_id AND child.personnel_id = person.id
    AND child.archived_at IS NULL;
  UPDATE public.personnel_documents AS child SET archived_at = person.archived_at
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND child.organization_id = person.organization_id AND child.personnel_id = person.id
    AND child.archived_at IS NULL;
  UPDATE public.leader_notes AS child SET archived_at = person.archived_at
  FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
    AND child.organization_id = person.organization_id AND child.personnel_id = person.id
    AND child.archived_at IS NULL;
END;
$$;

CREATE FUNCTION organization_private.restore_locked_personnel(
  p_organization_id uuid, p_personnel_id uuid, p_archived_at timestamptz
) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  UPDATE public.personnel_follow_ups AS child SET archived_at = NULL, status = 'open'
  WHERE child.organization_id = p_organization_id AND child.personnel_id = p_personnel_id
    AND child.archived_at = p_archived_at AND child.status = 'archived';
  UPDATE public.counseling_records AS child SET archived_at = NULL
  WHERE child.organization_id = p_organization_id AND child.personnel_id = p_personnel_id
    AND child.archived_at = p_archived_at;
  UPDATE public.personnel_documents AS child SET archived_at = NULL
  WHERE child.organization_id = p_organization_id AND child.personnel_id = p_personnel_id
    AND child.archived_at = p_archived_at;
  UPDATE public.leader_notes AS child SET archived_at = NULL
  WHERE child.organization_id = p_organization_id AND child.personnel_id = p_personnel_id
    AND child.archived_at = p_archived_at;
  UPDATE public.personnel AS person SET archived_at = NULL
  WHERE person.organization_id = p_organization_id AND person.id = p_personnel_id
    AND person.archived_at = p_archived_at;
END;
$$;

CREATE FUNCTION organization_private.require_configure_and_lock_personnel(
  p_organization_id uuid, p_personnel_ids uuid[]
) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_locked integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Personnel lifecycle changes require READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Archiving or restoring Personnel requires configure access' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_personnel_ids IS NULL
    OR pg_catalog.cardinality(p_personnel_ids) = 0 OR pg_catalog.array_position(p_personnel_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Personnel lifecycle change needs Personnel' USING ERRCODE = '22023';
  END IF;
  IF NOT public.member_access_has_capability(p_organization_id, 'personnel', 'configure') THEN
    RAISE EXCEPTION 'Archiving or restoring Personnel requires configure access' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*) INTO v_locked FROM (
    SELECT person.id FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
      AND public.can_configure_personnel_record(person.organization_id, person.group_id)
    ORDER BY person.id
    FOR NO KEY UPDATE
  ) AS locked;
  IF v_locked <> (SELECT pg_catalog.count(DISTINCT id) FROM pg_catalog.unnest(p_personnel_ids) AS ids(id)) THEN
    RAISE EXCEPTION 'Personnel not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Called after the command's last write: each statement takes a fresh
-- snapshot, so access revoked during any request, Person or child wait rejects
-- the command and rolls back its writes.
CREATE FUNCTION organization_private.require_configurable_personnel(
  p_organization_id uuid, p_personnel_ids uuid[]
) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.personnel AS person
    WHERE person.organization_id = p_organization_id AND person.id = ANY (p_personnel_ids)
      AND NOT public.can_configure_personnel_record(person.organization_id, person.group_id)
  ) THEN
    RAISE EXCEPTION 'Archiving or restoring Personnel requires configure access' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Archives each admitted Person under its saved event, or the proposed event
-- when it is active. Returns how many distinct People the command covered.
CREATE FUNCTION public.archive_personnel(
  p_organization_id uuid, p_personnel_ids uuid[], p_archived_at timestamptz
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_archived_at IS NULL THEN
    RAISE EXCEPTION 'Personnel archive needs an event time' USING ERRCODE = '22023';
  END IF;
  PERFORM organization_private.require_configure_and_lock_personnel(p_organization_id, p_personnel_ids);
  PERFORM organization_private.archive_locked_personnel(p_organization_id, p_personnel_ids, p_archived_at);
  PERFORM organization_private.require_configurable_personnel(p_organization_id, p_personnel_ids);
  RETURN (SELECT pg_catalog.count(DISTINCT id)::integer FROM pg_catalog.unnest(p_personnel_ids) AS ids(id));
END;
$$;

-- False when the Person is no longer archived.
CREATE FUNCTION public.restore_personnel(p_organization_id uuid, p_personnel_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_archived_at timestamptz;
BEGIN
  PERFORM organization_private.require_configure_and_lock_personnel(p_organization_id, ARRAY[p_personnel_id]);
  SELECT person.archived_at INTO v_archived_at FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = p_personnel_id;
  IF v_archived_at IS NOT NULL THEN
    PERFORM organization_private.restore_locked_personnel(p_organization_id, p_personnel_id, v_archived_at);
  END IF;
  PERFORM organization_private.require_configurable_personnel(p_organization_id, ARRAY[p_personnel_id]);
  RETURN v_archived_at IS NOT NULL;
END;
$$;

-- An Organization reviewer approves one pending Personnel archive request.
-- The request status, parent event and every family commit together, so a
-- denial, cancellation or competing approval that wins leaves no effect.
-- Personnel lane access is not required.
CREATE FUNCTION public.approve_personnel_archive_request(
  p_organization_id uuid, p_request_id uuid, p_personnel_id uuid, p_reviewed_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_reviewer uuid := auth.uid();
  v_status text;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Deletion request review requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF v_reviewer IS NULL THEN
    RAISE EXCEPTION 'Deletion request review is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_request_id IS NULL OR p_personnel_id IS NULL OR p_reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Invalid deletion request review' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_org_privileged(p_organization_id) THEN
    RAISE EXCEPTION 'Deletion request review is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT request.status INTO v_status FROM public.deletion_requests AS request
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.resource_type = 'personnel' AND request.resource_id = p_personnel_id
  FOR UPDATE;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.personnel AS person
  WHERE person.organization_id = p_organization_id AND person.id = p_personnel_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personnel not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM organization_private.archive_locked_personnel(p_organization_id, ARRAY[p_personnel_id], p_reviewed_at);

  UPDATE public.deletion_requests AS request
  SET status = 'approved', reviewed_by = v_reviewer, reviewed_at = p_reviewed_at, denial_reason = NULL
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id AND request.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Fresh statement after the last write: reviewer access may have changed
  -- during the request, Person or child waits.
  IF NOT public.is_org_privileged(p_organization_id) THEN
    RAISE EXCEPTION 'Deletion request review is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

ALTER FUNCTION organization_private.archive_locked_personnel(uuid, uuid[], timestamptz) OWNER TO postgres;
ALTER FUNCTION organization_private.restore_locked_personnel(uuid, uuid, timestamptz) OWNER TO postgres;
ALTER FUNCTION organization_private.require_configure_and_lock_personnel(uuid, uuid[]) OWNER TO postgres;
ALTER FUNCTION organization_private.require_configurable_personnel(uuid, uuid[]) OWNER TO postgres;
ALTER FUNCTION public.archive_personnel(uuid, uuid[], timestamptz) OWNER TO postgres;
ALTER FUNCTION public.restore_personnel(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.approve_personnel_archive_request(uuid, uuid, uuid, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION organization_private.archive_locked_personnel(uuid, uuid[], timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.restore_locked_personnel(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.require_configure_and_lock_personnel(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.require_configurable_personnel(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.archive_personnel(uuid, uuid[], timestamptz) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.restore_personnel(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.approve_personnel_archive_request(uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.archive_personnel(uuid, uuid[], timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_personnel(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_personnel_archive_request(uuid, uuid, uuid, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
