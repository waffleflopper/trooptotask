-- #1363: save a prepared packet and every prepared step in one transaction.
-- Existing rows and policies stay unchanged; Training preparation remains owned
-- by the application. This function does not serialize template configuration.
BEGIN;

CREATE FUNCTION public.start_onboarding_packet(
  p_organization_id uuid, p_personnel_id uuid, p_template_id uuid,
  p_started_at date, p_steps jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  packet public.personnel_onboardings%ROWTYPE;
  item jsonb;
  definition_id uuid;
  training_id uuid;
  definition_ids uuid[] := ARRAY[]::uuid[];
  step_order integer;
  result_steps jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL
    OR public.can_edit_onboarding(p_organization_id) IS NOT TRUE
    OR public.onboarding_personnel_scope_matches(p_organization_id, p_personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding start is not allowed' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.onboarding_templates AS t
  WHERE t.organization_id = p_organization_id AND t.id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding template not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_started_at IS NULL OR p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
    RAISE EXCEPTION 'Invalid prepared Onboarding packet' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_steps)
  LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid prepared Onboarding step' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> 7
      OR jsonb_typeof(item->'template_step_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'step_name') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'step_type') IS DISTINCT FROM 'string'
      OR item->>'step_type' NOT IN ('checkbox', 'paperwork', 'training')
      OR coalesce(jsonb_typeof(item->'training_type_id'), '') NOT IN ('string', 'null')
      OR coalesce(jsonb_typeof(item->'stages'), '') NOT IN ('array', 'null')
      OR jsonb_typeof(item->'sort_order') IS DISTINCT FROM 'number'
      OR item->>'sort_order' !~ '^-?[0-9]+$'
      OR jsonb_typeof(item->'completed') IS DISTINCT FROM 'boolean'
    THEN
      RAISE EXCEPTION 'Invalid prepared Onboarding step' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(item->'stages') = 'array' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(item->'stages') AS stage(value)
      WHERE jsonb_typeof(stage.value) <> 'string'
    ) THEN
      RAISE EXCEPTION 'Invalid prepared Onboarding stages' USING ERRCODE = '22023';
    END IF;
    BEGIN
      definition_id := (item->>'template_step_id')::uuid;
      training_id := (item->>'training_type_id')::uuid;
      step_order := (item->>'sort_order')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid prepared Onboarding step' USING ERRCODE = '22023';
    END;
    IF definition_id = ANY(definition_ids) THEN
      RAISE EXCEPTION 'Duplicate prepared Onboarding step' USING ERRCODE = '22023';
    END IF;
    definition_ids := array_append(definition_ids, definition_id);
    PERFORM 1 FROM public.onboarding_template_steps AS s
    WHERE s.organization_id = p_organization_id AND s.template_id = p_template_id
      AND s.id = definition_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Onboarding template step not found' USING ERRCODE = 'P0002';
    END IF;
    -- Ordinary progress RLS and its existing same-Organization Training foreign
    -- key govern the optional Training reference; no Training read is added.
  END LOOP;

  -- The existing partial unique index also governs simultaneous first starts.
  -- Do not catch its named 23505 or an unexpected provider failure.
  INSERT INTO public.personnel_onboardings (
    organization_id, personnel_id, template_id, started_at, status, completed_at, cancelled_at
  ) VALUES (
    p_organization_id, p_personnel_id, p_template_id, p_started_at, 'in_progress', NULL, NULL
  ) RETURNING * INTO packet;

  -- The parent foreign keys can wait. Re-evaluate the current actor and Person
  -- scope in a fresh statement after that wait, before writing any steps.
  IF public.can_edit_onboarding(p_organization_id) IS NOT TRUE
    OR public.onboarding_personnel_scope_matches(p_organization_id, p_personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding start is not allowed' USING ERRCODE = '42501';
  END IF;

  WITH saved AS (
    INSERT INTO public.onboarding_step_progress (
      organization_id, onboarding_id, template_step_id, step_name, step_type,
      training_type_id, stages, sort_order, completed, current_stage, notes, active
    ) SELECT p_organization_id, packet.id, s.template_step_id, s.step_name, s.step_type,
      s.training_type_id, s.stages, s.sort_order,
      s.step_type = 'training' AND s.training_type_id IS NOT NULL AND s.completed,
      CASE WHEN s.step_type = 'paperwork' AND jsonb_typeof(s.stages) = 'array'
        THEN s.stages->>0 ELSE NULL END, '[]'::jsonb, true
    FROM jsonb_to_recordset(p_steps) AS s(
      template_step_id uuid, step_name text, step_type text, training_type_id uuid,
      stages jsonb, sort_order integer, completed boolean
    ) ORDER BY s.sort_order, s.template_step_id
    RETURNING *
  ) SELECT coalesce(jsonb_agg(to_jsonb(saved) ORDER BY saved.sort_order, saved.id), '[]'::jsonb)
    INTO result_steps FROM saved;

  -- Child foreign keys can also wait after earlier inserts. Any access loss
  -- here raises through the same transaction and rolls back parent and steps.
  IF public.can_edit_onboarding(p_organization_id) IS NOT TRUE
    OR public.onboarding_personnel_scope_matches(p_organization_id, p_personnel_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding start is not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('onboarding', to_jsonb(packet), 'steps', result_steps);
END;
$$;
REVOKE ALL ON FUNCTION public.start_onboarding_packet(uuid, uuid, uuid, date, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_onboarding_packet(uuid, uuid, uuid, date, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
