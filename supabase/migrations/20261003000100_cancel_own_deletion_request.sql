-- #1366: retain request history when its current requester cancels it.
-- This command changes only its own pending status. It does not serialize
-- later approval/denial effects or counseling Storage removal.
BEGIN;

CREATE FUNCTION public.cancel_own_deletion_request(
  p_organization_id uuid, p_request_id uuid
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  saved_status text;
BEGIN
  -- A fresh statement after the request-row wait must see committed access
  -- changes. Fixed-snapshot transactions cannot provide that guarantee.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Cancellation requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Deletion request cancellation is not allowed' USING ERRCODE = '42501';
  END IF;

  -- Conceal missing, foreign, other-requester and terminal targets alike.
  PERFORM 1 FROM public.deletion_requests AS request
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.requested_by = actor_id AND request.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS membership
    JOIN public.organizations AS organization ON organization.id = membership.organization_id
    WHERE membership.organization_id = p_organization_id AND membership.user_id = actor_id
      AND organization.suspended_at IS NULL
  ) OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = actor_id) THEN
    RAISE EXCEPTION 'Deletion request cancellation is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT request.status INTO saved_status FROM public.deletion_requests AS request
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.requested_by = actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Separate READ COMMITTED statement: do not reuse admission from before a
  -- wait on a reviewer or another cancellation of this request.
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS membership
    JOIN public.organizations AS organization ON organization.id = membership.organization_id
    WHERE membership.organization_id = p_organization_id AND membership.user_id = actor_id
      AND organization.suspended_at IS NULL
  ) OR EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = actor_id) THEN
    RAISE EXCEPTION 'Deletion request cancellation is not allowed' USING ERRCODE = '42501';
  END IF;
  IF saved_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.deletion_requests AS request SET status = 'cancelled'
  WHERE request.organization_id = p_organization_id AND request.id = p_request_id
    AND request.requested_by = actor_id AND request.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending deletion request not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_own_deletion_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_own_deletion_request(uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
