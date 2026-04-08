-- ============================================================
-- Atomic advanced duty aggregate updates
-- Run manually after deploying the app code changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_advanced_duty_template_aggregate(
  p_org_id uuid,
  p_template_id uuid,
  p_template_data jsonb,
  p_slot_rows jsonb DEFAULT '[]'::jsonb,
  p_rotation_baseline_rows jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_template_row public.duty_templates%ROWTYPE;
  v_result jsonb;
BEGIN
  UPDATE public.duty_templates
  SET
    status = template_data.status,
    name = template_data.name,
    description = template_data.description,
    scope_type = template_data.scope_type,
    scope_group_ids = template_data.scope_group_ids,
    exempt_personnel_ids = template_data.exempt_personnel_ids,
    exempt_status_type_ids = template_data.exempt_status_type_ids,
    coverage_mode = template_data.coverage_mode,
    start_time = template_data.start_time,
    end_time = template_data.end_time,
    spans_midnight = template_data.spans_midnight,
    is_blocking = template_data.is_blocking,
    cooldown_hours = template_data.cooldown_hours,
    soft_preferences = template_data.soft_preferences,
    updated_at = template_data.updated_at
  FROM jsonb_to_record(p_template_data) AS template_data(
    status text,
    name text,
    description text,
    scope_type text,
    scope_group_ids uuid[],
    exempt_personnel_ids uuid[],
    exempt_status_type_ids uuid[],
    coverage_mode text,
    start_time text,
    end_time text,
    spans_midnight boolean,
    is_blocking boolean,
    cooldown_hours integer,
    soft_preferences jsonb,
    updated_at timestamptz
  )
  WHERE duty_templates.id = p_template_id
    AND duty_templates.organization_id = p_org_id
  RETURNING duty_templates.* INTO v_template_row;

  IF v_template_row.id IS NULL THEN
    RAISE EXCEPTION 'Duty template not found: %', p_template_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.duty_template_slots
  WHERE organization_id = p_org_id
    AND template_id = p_template_id;

  DELETE FROM public.duty_template_rotation_baselines
  WHERE organization_id = p_org_id
    AND template_id = p_template_id;

  WITH inserted_slots AS (
    INSERT INTO public.duty_template_slots (
      organization_id,
      template_id,
      role_label,
      quantity,
      allowed_ranks,
      allowed_group_ids,
      preferred_group_ids,
      allowed_mos_values,
      allowed_role_values,
      rotation_pool_key,
      blocking_mode,
      sort_order
    )
    SELECT
      p_org_id,
      p_template_id,
      slot_rows.role_label,
      slot_rows.quantity,
      slot_rows.allowed_ranks,
      slot_rows.allowed_group_ids,
      slot_rows.preferred_group_ids,
      slot_rows.allowed_mos_values,
      slot_rows.allowed_role_values,
      slot_rows.rotation_pool_key,
      slot_rows.blocking_mode,
      slot_rows.sort_order
    FROM jsonb_to_recordset(COALESCE(p_slot_rows, '[]'::jsonb)) AS slot_rows(
      role_label text,
      quantity integer,
      allowed_ranks text[],
      allowed_group_ids uuid[],
      preferred_group_ids uuid[],
      allowed_mos_values text[],
      allowed_role_values text[],
      rotation_pool_key text,
      blocking_mode text,
      sort_order integer
    )
    RETURNING *
  ),
  inserted_baselines AS (
    INSERT INTO public.duty_template_rotation_baselines (
      organization_id,
      template_id,
      rotation_pool_key,
      person_id,
      last_served_date,
      created_at
    )
    SELECT
      p_org_id,
      p_template_id,
      baseline_rows.rotation_pool_key,
      baseline_rows.person_id,
      baseline_rows.last_served_date,
      baseline_rows.created_at
    FROM jsonb_to_recordset(COALESCE(p_rotation_baseline_rows, '[]'::jsonb)) AS baseline_rows(
      rotation_pool_key text,
      person_id uuid,
      last_served_date date,
      created_at timestamptz
    )
    RETURNING *
  )
  SELECT jsonb_build_object(
    'templateRow',
    to_jsonb(v_template_row),
    'slotRows',
    COALESCE((SELECT jsonb_agg(to_jsonb(inserted_slots)) FROM inserted_slots), '[]'::jsonb),
    'rotationBaselineRows',
    COALESCE((SELECT jsonb_agg(to_jsonb(inserted_baselines)) FROM inserted_baselines), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_advanced_duty_event_aggregate(
  p_org_id uuid,
  p_duty_event_id uuid,
  p_event_data jsonb,
  p_slot_rows jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event_row public.duty_events%ROWTYPE;
  v_result jsonb;
BEGIN
  UPDATE public.duty_events
  SET
    template_id = event_data.template_id,
    template_name = event_data.template_name,
    event_date = event_data.event_date,
    coverage_mode = event_data.coverage_mode,
    coverage_start = event_data.coverage_start,
    coverage_end = event_data.coverage_end,
    is_blocking = event_data.is_blocking,
    cooldown_hours = event_data.cooldown_hours,
    rules_snapshot = event_data.rules_snapshot,
    fill_summary = event_data.fill_summary,
    collision_summary = event_data.collision_summary,
    original_proposal = event_data.original_proposal,
    updated_at = event_data.updated_at
  FROM jsonb_to_record(p_event_data) AS event_data(
    template_id uuid,
    template_name text,
    event_date date,
    coverage_mode text,
    coverage_start text,
    coverage_end text,
    is_blocking boolean,
    cooldown_hours integer,
    rules_snapshot jsonb,
    fill_summary jsonb,
    collision_summary jsonb,
    original_proposal jsonb,
    updated_at timestamptz
  )
  WHERE duty_events.id = p_duty_event_id
    AND duty_events.organization_id = p_org_id
  RETURNING duty_events.* INTO v_event_row;

  IF v_event_row.id IS NULL THEN
    RAISE EXCEPTION 'Duty event not found: %', p_duty_event_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.duty_event_slots
  WHERE organization_id = p_org_id
    AND duty_event_id = p_duty_event_id;

  WITH inserted_slots AS (
    INSERT INTO public.duty_event_slots (
      organization_id,
      duty_event_id,
      template_slot_id,
      role_label,
      slot_index,
      assignee_id,
      assignment_source,
      warning_state,
      fairness_confidence,
      selection_reason,
      unfilled_reason,
      sort_order,
      created_at
    )
    SELECT
      p_org_id,
      p_duty_event_id,
      slot_rows.template_slot_id,
      slot_rows.role_label,
      slot_rows.slot_index,
      slot_rows.assignee_id,
      slot_rows.assignment_source,
      slot_rows.warning_state,
      slot_rows.fairness_confidence,
      slot_rows.selection_reason,
      slot_rows.unfilled_reason,
      slot_rows.sort_order,
      slot_rows.created_at
    FROM jsonb_to_recordset(COALESCE(p_slot_rows, '[]'::jsonb)) AS slot_rows(
      template_slot_id uuid,
      role_label text,
      slot_index integer,
      assignee_id uuid,
      assignment_source text,
      warning_state text,
      fairness_confidence text,
      selection_reason text,
      unfilled_reason text,
      sort_order integer,
      created_at timestamptz
    )
    RETURNING *
  )
  SELECT jsonb_build_object(
    'eventRow',
    to_jsonb(v_event_row),
    'slotRows',
    COALESCE((SELECT jsonb_agg(to_jsonb(inserted_slots)) FROM inserted_slots), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_advanced_duty_template_aggregate(uuid, uuid, jsonb, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.update_advanced_duty_template_aggregate(uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_advanced_duty_template_aggregate(uuid, uuid, jsonb, jsonb, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.update_advanced_duty_event_aggregate(uuid, uuid, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.update_advanced_duty_event_aggregate(uuid, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_advanced_duty_event_aggregate(uuid, uuid, jsonb, jsonb) TO service_role;
