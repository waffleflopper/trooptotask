-- #1363: one saved packet is reconciled and assigned in one transaction.
-- Existing rows are unchanged on upgrade. Ordinary authenticated callers keep
-- the Onboarding Configure lane and the packet's Personnel/Group scope.
BEGIN;

CREATE FUNCTION public.reconcile_onboarding_packet(
  p_organization_id uuid, p_onboarding_id uuid, p_new_template_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  packet public.personnel_onboardings%ROWTYPE;
  definition public.onboarding_template_steps%ROWTYPE;
  saved public.onboarding_step_progress%ROWTYPE;
  selected_template_id uuid;
  matched_ids uuid[] := ARRAY[]::uuid[];
  has_stages boolean;
  reset_stage boolean;
  result_steps jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.member_access_has_capability(p_organization_id, 'onboarding', 'configure') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  -- Every reconciliation of this packet takes this lock before reading its
  -- template or progress. An awaited resync derives the winner's current template.
  SELECT po.* INTO packet
  FROM public.personnel_onboardings AS po
  WHERE po.organization_id = p_organization_id AND po.id = p_onboarding_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding not found' USING ERRCODE = 'P0002';
  END IF;

  -- Capability and scope can change while the parent lock is awaited.
  IF public.member_access_has_capability(p_organization_id, 'onboarding', 'configure') IS NOT TRUE
    OR public.onboarding_personnel_scope_matches(p_organization_id, packet.personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;
  IF packet.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Only in-progress onboardings can be reconciled' USING ERRCODE = 'P0001';
  END IF;

  selected_template_id := coalesce(p_new_template_id, packet.template_id);
  IF selected_template_id IS NULL THEN
    RAISE EXCEPTION 'Cannot resync: template has been deleted' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = selected_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
  END IF;

  -- Wait for already-running progress edits before reading their saved values.
  -- Metadata updates below never resend note arrays or checkbox completion.
  PERFORM 1 FROM public.onboarding_step_progress AS progress
  WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
  ORDER BY progress.id FOR UPDATE;
  IF public.member_access_has_capability(p_organization_id, 'onboarding', 'configure') IS NOT TRUE
    OR public.onboarding_personnel_scope_matches(p_organization_id, packet.personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  FOR definition IN
    SELECT s.* FROM public.onboarding_template_steps AS s
    WHERE s.organization_id = p_organization_id AND s.template_id = selected_template_id
    ORDER BY s.sort_order, s.id
  LOOP
    SELECT progress.* INTO saved
    FROM public.onboarding_step_progress AS progress
    WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
      AND progress.template_step_id = definition.id AND NOT (progress.id = ANY(matched_ids))
    ORDER BY progress.id LIMIT 1;

    -- Only the transaction that observes an unassigned parent can adopt legacy
    -- work. A deleted definition's null reference is history during normal resync.
    IF NOT FOUND AND packet.template_id IS NULL THEN
      SELECT progress.* INTO saved
      FROM public.onboarding_step_progress AS progress
      WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
        AND progress.template_step_id IS NULL AND progress.active
        AND progress.step_name = definition.name AND progress.step_type = definition.step_type
        AND NOT (progress.id = ANY(matched_ids))
      ORDER BY progress.id LIMIT 1;
    END IF;

    has_stages := definition.step_type = 'paperwork' AND CASE
      WHEN jsonb_typeof(definition.stages) = 'array' THEN jsonb_array_length(definition.stages) > 0
      ELSE false END;
    IF saved.id IS NOT NULL THEN
      reset_stage := has_stages AND saved.current_stage IS NOT NULL
        AND NOT (definition.stages @> jsonb_build_array(saved.current_stage));
      UPDATE public.onboarding_step_progress AS progress SET
        template_step_id = definition.id, active = true,
        step_name = definition.name, step_type = definition.step_type,
        training_type_id = definition.training_type_id, stages = definition.stages,
        sort_order = definition.sort_order,
        current_stage = CASE WHEN reset_stage THEN definition.stages->>0 ELSE progress.current_stage END,
        completed = CASE WHEN reset_stage THEN false ELSE progress.completed END
      WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
        AND progress.id = saved.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
      END IF;
      matched_ids := array_append(matched_ids, saved.id);
    ELSE
      INSERT INTO public.onboarding_step_progress (
        organization_id, onboarding_id, template_step_id, step_name, step_type,
        training_type_id, stages, sort_order, completed, current_stage, notes, active
      ) VALUES (
        p_organization_id, p_onboarding_id, definition.id, definition.name, definition.step_type,
        definition.training_type_id, definition.stages, definition.sort_order, false,
        CASE WHEN has_stages THEN definition.stages->>0 ELSE NULL END, '[]'::jsonb, true
      ) RETURNING * INTO saved;
      matched_ids := array_append(matched_ids, saved.id);
    END IF;
  END LOOP;

  UPDATE public.onboarding_step_progress AS progress SET active = false
  WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id
    AND progress.active AND NOT (progress.id = ANY(matched_ids));
  UPDATE public.personnel_onboardings AS po SET template_id = selected_template_id
  WHERE po.organization_id = p_organization_id AND po.id = p_onboarding_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding configuration is not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(progress) ORDER BY progress.sort_order, progress.id), '[]'::jsonb)
  INTO result_steps FROM public.onboarding_step_progress AS progress
  WHERE progress.organization_id = p_organization_id AND progress.onboarding_id = p_onboarding_id;
  RETURN jsonb_build_object(
    'onboarding_id', p_onboarding_id, 'template_id', selected_template_id,
    'old_template_id', packet.template_id, 'steps', result_steps
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_onboarding_packet(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_onboarding_packet(uuid, uuid, uuid) TO authenticated;

COMMIT;
