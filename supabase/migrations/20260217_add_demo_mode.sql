-- Migration: Add Demo Mode Support
-- Date: 2026-02-17
-- Description: Adds demo_type column to organizations for read-only showcase and temporary sandboxes

-- ============================================================
-- Add demo columns to organizations
-- ============================================================

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS demo_type text CHECK (demo_type IN ('showcase', 'sandbox')),
ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_organizations_demo_expires
ON public.organizations(demo_expires_at)
WHERE demo_expires_at IS NOT NULL;

-- ============================================================
-- Function to create a demo sandbox from the showcase org
-- Returns the new sandbox org ID
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_demo_sandbox(p_session_id text)
RETURNS uuid AS $$
DECLARE
  showcase_org_id uuid;
  sandbox_org_id uuid;
  sandbox_user_id uuid;

  -- Mapping for IDs
  group_map jsonb := '{}';
  personnel_map jsonb := '{}';
  status_type_map jsonb := '{}';
  assignment_type_map jsonb := '{}';
  training_type_map jsonb := '{}';
  counseling_type_map jsonb := '{}';

  old_id uuid;
  new_id uuid;
  r record;
BEGIN
  -- Get the showcase org
  SELECT id INTO showcase_org_id
  FROM public.organizations
  WHERE demo_type = 'showcase'
  LIMIT 1;

  IF showcase_org_id IS NULL THEN
    RAISE EXCEPTION 'No showcase organization found';
  END IF;

  -- Create a temporary user for this sandbox (using the session_id as identifier)
  -- We'll use the session_id in the user's raw_user_meta_data
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    role
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'sandbox-' || p_session_id || '@demo.trooptotask.app',
    '',  -- No password, can't login normally
    now(),
    jsonb_build_object('demo_sandbox', true, 'session_id', p_session_id),
    now(),
    now(),
    'authenticated',
    'authenticated'
  )
  RETURNING id INTO sandbox_user_id;

  -- Create sandbox organization
  INSERT INTO public.organizations (name, created_by, demo_type, demo_expires_at)
  SELECT
    name || ' (Your Sandbox)',
    sandbox_user_id,
    'sandbox',
    now() + interval '1 hour'
  FROM public.organizations
  WHERE id = showcase_org_id
  RETURNING id INTO sandbox_org_id;

  -- Add sandbox user as owner
  INSERT INTO public.organization_memberships (organization_id, user_id, role)
  VALUES (sandbox_org_id, sandbox_user_id, 'owner');

  -- Copy groups
  FOR r IN SELECT * FROM public.groups WHERE organization_id = showcase_org_id LOOP
    new_id := gen_random_uuid();
    group_map := group_map || jsonb_build_object(r.id::text, new_id::text);
    INSERT INTO public.groups (id, organization_id, name, sort_order)
    VALUES (new_id, sandbox_org_id, r.name, r.sort_order);
  END LOOP;

  -- Copy personnel
  FOR r IN SELECT * FROM public.personnel WHERE organization_id = showcase_org_id LOOP
    new_id := gen_random_uuid();
    personnel_map := personnel_map || jsonb_build_object(r.id::text, new_id::text);
    INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
    VALUES (
      new_id,
      sandbox_org_id,
      r.rank,
      r.last_name,
      r.first_name,
      r.mos,
      r.clinic_role,
      CASE WHEN r.group_id IS NOT NULL THEN (group_map->>r.group_id::text)::uuid ELSE NULL END
    );
  END LOOP;

  -- Copy status types
  FOR r IN SELECT * FROM public.status_types WHERE organization_id = showcase_org_id LOOP
    new_id := gen_random_uuid();
    status_type_map := status_type_map || jsonb_build_object(r.id::text, new_id::text);
    INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order)
    VALUES (new_id, sandbox_org_id, r.name, r.color, r.text_color, r.sort_order);
  END LOOP;

  -- Copy availability entries
  FOR r IN SELECT * FROM public.availability_entries WHERE organization_id = showcase_org_id LOOP
    INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date)
    VALUES (
      sandbox_org_id,
      (personnel_map->>r.personnel_id::text)::uuid,
      (status_type_map->>r.status_type_id::text)::uuid,
      r.start_date,
      r.end_date
    );
  END LOOP;

  -- Copy assignment types
  FOR r IN SELECT * FROM public.assignment_types WHERE organization_id = showcase_org_id LOOP
    new_id := gen_random_uuid();
    assignment_type_map := assignment_type_map || jsonb_build_object(r.id::text, new_id::text);
    INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, color, sort_order)
    VALUES (new_id, sandbox_org_id, r.name, r.short_name, r.assign_to, r.color, r.sort_order);
  END LOOP;

  -- Copy daily assignments
  FOR r IN SELECT * FROM public.daily_assignments WHERE organization_id = showcase_org_id LOOP
    INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
    VALUES (
      sandbox_org_id,
      (assignment_type_map->>r.assignment_type_id::text)::uuid,
      r.date,
      -- assignee_id could be a personnel ID or a group name
      CASE
        WHEN personnel_map ? r.assignee_id THEN personnel_map->>r.assignee_id
        ELSE r.assignee_id
      END
    );
  END LOOP;

  -- Copy special days
  INSERT INTO public.special_days (organization_id, date, name, type)
  SELECT sandbox_org_id, date, name, type
  FROM public.special_days
  WHERE organization_id = showcase_org_id;

  -- Copy training types
  FOR r IN SELECT * FROM public.training_types WHERE organization_id = showcase_org_id LOOP
    new_id := gen_random_uuid();
    training_type_map := training_type_map || jsonb_build_object(r.id::text, new_id::text);
    INSERT INTO public.training_types (id, organization_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
    VALUES (new_id, sandbox_org_id, r.name, r.description, r.expiration_months, r.warning_days_yellow, r.warning_days_orange, r.required_for_roles, r.color, r.sort_order);
  END LOOP;

  -- Copy personnel trainings
  FOR r IN SELECT * FROM public.personnel_trainings WHERE organization_id = showcase_org_id LOOP
    INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id, completion_date, expiration_date, notes, certificate_url)
    VALUES (
      sandbox_org_id,
      (personnel_map->>r.personnel_id::text)::uuid,
      (training_type_map->>r.training_type_id::text)::uuid,
      r.completion_date,
      r.expiration_date,
      r.notes,
      r.certificate_url
    );
  END LOOP;

  -- Copy counseling types
  FOR r IN SELECT * FROM public.counseling_types WHERE organization_id = showcase_org_id LOOP
    new_id := gen_random_uuid();
    counseling_type_map := counseling_type_map || jsonb_build_object(r.id::text, new_id::text);
    INSERT INTO public.counseling_types (id, organization_id, name, description, template_content, recurrence, color, is_freeform, sort_order)
    VALUES (new_id, sandbox_org_id, r.name, r.description, r.template_content, r.recurrence, r.color, r.is_freeform, r.sort_order);
  END LOOP;

  -- Copy counseling records
  FOR r IN SELECT * FROM public.counseling_records WHERE organization_id = showcase_org_id LOOP
    INSERT INTO public.counseling_records (organization_id, personnel_id, counseling_type_id, date_conducted, subject, key_points, plan_of_action, follow_up_date, status, counselor_signed, counselor_signed_at, soldier_signed, soldier_signed_at)
    VALUES (
      sandbox_org_id,
      (personnel_map->>r.personnel_id::text)::uuid,
      CASE WHEN r.counseling_type_id IS NOT NULL THEN (counseling_type_map->>r.counseling_type_id::text)::uuid ELSE NULL END,
      r.date_conducted,
      r.subject,
      r.key_points,
      r.plan_of_action,
      r.follow_up_date,
      r.status,
      r.counselor_signed,
      r.counselor_signed_at,
      r.soldier_signed,
      r.soldier_signed_at
    );
  END LOOP;

  -- Copy development goals
  FOR r IN SELECT * FROM public.development_goals WHERE organization_id = showcase_org_id LOOP
    INSERT INTO public.development_goals (organization_id, personnel_id, title, description, category, priority, status, target_date, progress_notes)
    VALUES (
      sandbox_org_id,
      (personnel_map->>r.personnel_id::text)::uuid,
      r.title,
      r.description,
      r.category,
      r.priority,
      r.status,
      r.target_date,
      r.progress_notes
    );
  END LOOP;

  -- Copy personnel extended info
  FOR r IN SELECT * FROM public.personnel_extended_info WHERE organization_id = showcase_org_id LOOP
    INSERT INTO public.personnel_extended_info (organization_id, personnel_id, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, spouse_name, spouse_phone, vehicle_make_model, vehicle_plate, vehicle_color, personal_email, personal_phone, address_street, address_city, address_state, address_zip, leader_notes)
    VALUES (
      sandbox_org_id,
      (personnel_map->>r.personnel_id::text)::uuid,
      r.emergency_contact_name,
      r.emergency_contact_relationship,
      r.emergency_contact_phone,
      r.spouse_name,
      r.spouse_phone,
      r.vehicle_make_model,
      r.vehicle_plate,
      r.vehicle_color,
      r.personal_email,
      r.personal_phone,
      r.address_street,
      r.address_city,
      r.address_state,
      r.address_zip,
      r.leader_notes
    );
  END LOOP;

  RETURN sandbox_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Function to cleanup expired sandboxes
-- Should be called periodically (e.g., via cron or edge function)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_demo_sandboxes()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
  sandbox record;
BEGIN
  deleted_count := 0;

  -- Find and delete expired sandboxes
  FOR sandbox IN
    SELECT id, created_by
    FROM public.organizations
    WHERE demo_type = 'sandbox'
    AND demo_expires_at < now()
  LOOP
    -- Delete the organization (cascades to all related data)
    DELETE FROM public.organizations WHERE id = sandbox.id;

    -- Delete the temporary user created for this sandbox
    DELETE FROM auth.users
    WHERE id = sandbox.created_by
    AND raw_user_meta_data->>'demo_sandbox' = 'true';

    deleted_count := deleted_count + 1;
  END LOOP;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Allow anonymous access to create sandbox (will be called from API)
-- ============================================================

-- Grant execute on the sandbox creation function
GRANT EXECUTE ON FUNCTION public.create_demo_sandbox(text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_demo_sandbox(text) TO authenticated;

-- ============================================================
-- Schedule cleanup with pg_cron (if available)
-- Runs every 15 minutes
-- ============================================================

-- Note: pg_cron may need to be enabled via Supabase dashboard first
-- The following will only work if pg_cron extension is available
DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if it exists (check first to avoid error)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-demo-sandboxes') THEN
      PERFORM cron.unschedule('cleanup-demo-sandboxes');
    END IF;

    -- Schedule cleanup to run every 15 minutes
    PERFORM cron.schedule(
      'cleanup-demo-sandboxes',
      '*/15 * * * *',
      'SELECT public.cleanup_expired_demo_sandboxes();'
    );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- pg_cron not available, will need to use external scheduler
    RAISE NOTICE 'pg_cron not available, use external scheduler for cleanup';
  WHEN undefined_function THEN
    -- pg_cron not available, will need to use external scheduler
    RAISE NOTICE 'pg_cron not available, use external scheduler for cleanup';
END;
$$;
