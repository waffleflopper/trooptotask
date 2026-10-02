-- #1363: append one attributed note to the latest saved array after any wait.
-- Existing rows, permissions and terminal/inactive step behavior are unchanged.
BEGIN;

CREATE FUNCTION public.append_onboarding_step_note(
  p_organization_id uuid, p_step_id uuid, p_text text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  saved public.onboarding_step_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_edit_onboarding(p_organization_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding changes are not allowed' USING ERRCODE = '42501';
  END IF;

  -- Reconciliation locks parent then progress. This function does not explicitly
  -- lock a parent; existing foreign keys can still acquire key-share locks.
  SELECT progress.* INTO saved
  FROM public.onboarding_step_progress AS progress
  WHERE progress.organization_id = p_organization_id AND progress.id = p_step_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found' USING ERRCODE = 'P0002';
  END IF;

  -- This separate statement sees capability/Person scope committed during the
  -- row-lock wait, rather than relying only on the earlier SELECT's RLS snapshot.
  IF public.can_edit_onboarding(p_organization_id) IS NOT TRUE
    OR public.onboarding_parent_scope_matches(p_organization_id, saved.onboarding_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding changes are not allowed' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(saved.notes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Saved onboarding notes must be an array' USING ERRCODE = '22023';
  END IF;

  UPDATE public.onboarding_step_progress AS progress
  SET notes = progress.notes || jsonb_build_array(jsonb_build_object(
    'text', p_text,
    'timestamp', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'userId', auth.uid()
  ))
  WHERE progress.organization_id = p_organization_id AND progress.id = p_step_id
  RETURNING progress.* INTO saved;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding changes are not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('id', saved.id, 'notes', saved.notes);
END;
$$;
REVOKE ALL ON FUNCTION public.append_onboarding_step_note(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.append_onboarding_step_note(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
