-- Troop to Task: Demo Showcase Data
-- Creates the read-only showcase organization for the demo
-- Run this to set up the demo showcase org

DO $$
DECLARE
  -- We need a user to own the showcase org - use the demo user or create a system user
  demo_user_id uuid;
  showcase_org_id uuid;

  -- Group IDs
  group_hq_id uuid;
  group_ops_id uuid;
  group_support_id uuid;

  -- Personnel IDs
  pers_1_id uuid; -- Commander
  pers_2_id uuid; -- XO
  pers_3_id uuid; -- NCOIC
  pers_4_id uuid;
  pers_5_id uuid;
  pers_6_id uuid;
  pers_7_id uuid;
  pers_8_id uuid;
  pers_9_id uuid;
  pers_10_id uuid;

  -- Status Type IDs
  status_leave_id uuid;
  status_tdy_id uuid;
  status_school_id uuid;
  status_sick_id uuid;

  -- Assignment Type IDs
  assign_od_id uuid;

  -- Training Type IDs
  train_bls_id uuid;
  train_sharp_id uuid;
  train_cyber_id uuid;

  -- Counseling Type IDs
  counsel_initial_id uuid;
  counsel_monthly_id uuid;
  counsel_event_id uuid;

  today date := CURRENT_DATE;

BEGIN
  -- Get or create demo user for owning the showcase org
  SELECT id INTO demo_user_id
  FROM auth.users
  WHERE email = 'demo@trooptotask.app'
  LIMIT 1;

  -- If no demo user exists, create a system user for the showcase
  IF demo_user_id IS NULL THEN
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
      'demo@trooptotask.app',
      '',  -- No password, can't login normally
      now(),
      jsonb_build_object('system_demo_user', true),
      now(),
      now(),
      'authenticated',
      'authenticated'
    )
    RETURNING id INTO demo_user_id;

    RAISE NOTICE 'Created demo user: %', demo_user_id;
  END IF;

  -- Delete existing showcase org if any
  DELETE FROM public.organizations WHERE demo_type = 'showcase';

  -- ============================================================
  -- Create Showcase Organization
  -- ============================================================

  INSERT INTO public.organizations (name, created_by, demo_type)
  VALUES ('1st Medical Battalion - Aid Station', demo_user_id, 'showcase')
  RETURNING id INTO showcase_org_id;

  -- Add demo user as owner (for RLS to work)
  INSERT INTO public.organization_memberships (organization_id, user_id, role)
  VALUES (showcase_org_id, demo_user_id, 'owner');

  -- ============================================================
  -- Create Groups (3 groups)
  -- ============================================================

  INSERT INTO public.groups (id, organization_id, name, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'HQ', 0)
  RETURNING id INTO group_hq_id;

  INSERT INTO public.groups (id, organization_id, name, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Operations', 1)
  RETURNING id INTO group_ops_id;

  INSERT INTO public.groups (id, organization_id, name, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Support', 2)
  RETURNING id INTO group_support_id;

  -- ============================================================
  -- Create Personnel (10 people with fake but realistic names)
  -- ============================================================

  -- HQ (3 people)
  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'CPT', 'Hawkins', 'Daniel', '70B', 'Commander', group_hq_id)
  RETURNING id INTO pers_1_id;

  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, '1LT', 'Reyes', 'Maria', '70B', 'XO', group_hq_id)
  RETURNING id INTO pers_2_id;

  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'SFC', 'Thompson', 'Marcus', '68W', 'NCOIC', group_hq_id)
  RETURNING id INTO pers_3_id;

  -- Operations (4 people)
  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'SSG', 'Chen', 'Kevin', '68W', 'Team Leader', group_ops_id)
  RETURNING id INTO pers_4_id;

  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'SGT', 'Rodriguez', 'Elena', '68W', 'Medic', group_ops_id)
  RETURNING id INTO pers_5_id;

  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'SPC', 'Williams', 'Jamal', '68W', 'Medic', group_ops_id)
  RETURNING id INTO pers_6_id;

  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'PFC', 'Kim', 'Sarah', '68W', 'Medic', group_ops_id)
  RETURNING id INTO pers_7_id;

  -- Support (3 people)
  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'SSG', 'Okonkwo', 'Chidi', '42A', 'Admin NCO', group_support_id)
  RETURNING id INTO pers_8_id;

  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'SPC', 'Patel', 'Priya', '68G', 'Patient Admin', group_support_id)
  RETURNING id INTO pers_9_id;

  INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (gen_random_uuid(), showcase_org_id, 'PV2', 'Murphy', 'Connor', '42A', 'Clerk', group_support_id)
  RETURNING id INTO pers_10_id;

  -- ============================================================
  -- Create Status Types
  -- ============================================================

  INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Leave', '#22c55e', '#ffffff', 0)
  RETURNING id INTO status_leave_id;

  INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'TDY', '#3b82f6', '#ffffff', 1)
  RETURNING id INTO status_tdy_id;

  INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'School', '#8b5cf6', '#ffffff', 2)
  RETURNING id INTO status_school_id;

  INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Sick Call', '#ef4444', '#ffffff', 3)
  RETURNING id INTO status_sick_id;

  -- ============================================================
  -- Create Availability Entries
  -- ============================================================

  -- Someone on leave
  INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (showcase_org_id, pers_5_id, status_leave_id, today + 2, today + 6);

  -- Someone at school
  INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (showcase_org_id, pers_4_id, status_school_id, today + 7, today + 14);

  -- Someone TDY
  INSERT INTO public.availability_entries (organization_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (showcase_org_id, pers_8_id, status_tdy_id, today, today + 3);

  -- ============================================================
  -- Create Assignment Types
  -- ============================================================

  INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, color, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Officer of the Day', 'OD', 'personnel', '#dc2626', 0)
  RETURNING id INTO assign_od_id;

  -- ============================================================
  -- Create Daily Assignments
  -- ============================================================

  INSERT INTO public.daily_assignments (organization_id, assignment_type_id, date, assignee_id)
  VALUES
    (showcase_org_id, assign_od_id, today, pers_1_id),
    (showcase_org_id, assign_od_id, today + 1, pers_2_id),
    (showcase_org_id, assign_od_id, today + 2, pers_1_id);

  -- ============================================================
  -- Create Training Types
  -- ============================================================

  INSERT INTO public.training_types (id, organization_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'BLS', 'Basic Life Support', 24, 60, 30, ARRAY['68W'], '#ef4444', 0)
  RETURNING id INTO train_bls_id;

  INSERT INTO public.training_types (id, organization_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'SHARP', 'Sexual Harassment/Assault Response Prevention', 12, 60, 30, ARRAY[]::text[], '#8b5cf6', 1)
  RETURNING id INTO train_sharp_id;

  INSERT INTO public.training_types (id, organization_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Cyber Awareness', 'Annual Cyber Security Training', 12, 60, 30, ARRAY[]::text[], '#3b82f6', 2)
  RETURNING id INTO train_cyber_id;

  -- ============================================================
  -- Create Personnel Training Records
  -- ============================================================

  -- BLS - Mix of statuses
  INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id, completion_date, expiration_date)
  VALUES
    (showcase_org_id, pers_3_id, train_bls_id, today - 365, today + 365), -- Current
    (showcase_org_id, pers_4_id, train_bls_id, today - 700, today + 30),  -- Expiring soon
    (showcase_org_id, pers_5_id, train_bls_id, today - 400, today + 330), -- Current
    (showcase_org_id, pers_6_id, train_bls_id, today - 750, today - 20),  -- Expired
    (showcase_org_id, pers_7_id, train_bls_id, today - 200, today + 530); -- Current

  -- SHARP - All have it
  INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id, completion_date, expiration_date)
  VALUES
    (showcase_org_id, pers_1_id, train_sharp_id, today - 100, today + 265),
    (showcase_org_id, pers_2_id, train_sharp_id, today - 200, today + 165),
    (showcase_org_id, pers_3_id, train_sharp_id, today - 50, today + 315),
    (showcase_org_id, pers_4_id, train_sharp_id, today - 350, today + 15),  -- Expiring soon
    (showcase_org_id, pers_5_id, train_sharp_id, today - 150, today + 215),
    (showcase_org_id, pers_6_id, train_sharp_id, today - 380, today - 15),  -- Expired
    (showcase_org_id, pers_7_id, train_sharp_id, today - 80, today + 285),
    (showcase_org_id, pers_8_id, train_sharp_id, today - 120, today + 245),
    (showcase_org_id, pers_9_id, train_sharp_id, today - 300, today + 65),
    (showcase_org_id, pers_10_id, train_sharp_id, today - 250, today + 115);

  -- ============================================================
  -- Create Counseling Types
  -- ============================================================

  INSERT INTO public.counseling_types (id, organization_id, name, description, template_content, recurrence, color, is_freeform, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Initial Counseling', 'Initial counseling for new soldiers', '## Purpose
Welcome to the unit and establish expectations.

## Key Points
- Unit mission and your role
- Standards and expectations
- Goals for the rating period

## Plan of Action
', 'none', '#3b82f6', false, 0)
  RETURNING id INTO counsel_initial_id;

  INSERT INTO public.counseling_types (id, organization_id, name, description, template_content, recurrence, color, is_freeform, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Monthly Counseling', 'Regular monthly performance counseling', '## Performance Review
Assessment of performance since last counseling.

## Areas of Excellence

## Areas for Improvement

## Goals for Next Month
', 'monthly', '#22c55e', false, 1)
  RETURNING id INTO counsel_monthly_id;

  INSERT INTO public.counseling_types (id, organization_id, name, description, template_content, recurrence, color, is_freeform, sort_order)
  VALUES (gen_random_uuid(), showcase_org_id, 'Event Counseling', 'Counseling for specific events', NULL, 'none', '#f59e0b', true, 2)
  RETURNING id INTO counsel_event_id;

  -- ============================================================
  -- Create Counseling Records
  -- ============================================================

  INSERT INTO public.counseling_records (organization_id, personnel_id, counseling_type_id, date_conducted, subject, key_points, plan_of_action, status, counselor_signed, counselor_signed_at, soldier_signed, soldier_signed_at)
  VALUES
    (showcase_org_id, pers_7_id, counsel_initial_id, today - 30, 'Initial Counseling - PFC Kim', 'Welcomed to unit. Discussed mission, expectations, and career goals.', 'Complete in-processing NLT next week. Schedule BLS certification.', 'acknowledged', true, today - 30, true, today - 29),
    (showcase_org_id, pers_6_id, counsel_monthly_id, today - 14, 'Monthly Performance Review', 'Strong performance in patient care. Need to improve on timeliness of documentation.', 'Complete all documentation within 24 hours. Shadow SSG Chen for best practices.', 'completed', true, today - 14, false, NULL),
    (showcase_org_id, pers_5_id, counsel_event_id, today - 7, 'Recognition - Outstanding Patient Care', 'Recognized for exceptional care during mass casualty exercise.', 'Continue excellent performance. Consider for promotion board.', 'acknowledged', true, today - 7, true, today - 6);

  -- ============================================================
  -- Create Development Goals
  -- ============================================================

  INSERT INTO public.development_goals (organization_id, personnel_id, title, description, category, priority, status, target_date, progress_notes)
  VALUES
    (showcase_org_id, pers_4_id, 'Complete SLC', 'Attend and graduate Senior Leader Course', 'career', 'high', 'in-progress', today + 90, 'Packet submitted. Awaiting school date.'),
    (showcase_org_id, pers_5_id, 'College Degree', 'Complete Associates Degree in Healthcare', 'education', 'medium', 'in-progress', today + 365, 'Currently enrolled at local community college. 12 credits remaining.'),
    (showcase_org_id, pers_6_id, 'APFT Score', 'Achieve 270+ on APFT', 'physical', 'high', 'not-started', today + 60, NULL),
    (showcase_org_id, pers_3_id, 'Mentorship Program', 'Establish formal mentorship program for junior medics', 'personal', 'medium', 'completed', today - 30, 'Program established. Three mentorship pairs active.');

  -- ============================================================
  -- Create Personnel Extended Info (for a few people)
  -- ============================================================

  INSERT INTO public.personnel_extended_info (organization_id, personnel_id, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, spouse_name, spouse_phone, vehicle_make_model, vehicle_plate, vehicle_color, address_city, address_state, leader_notes)
  VALUES
    (showcase_org_id, pers_4_id, 'Lisa Chen', 'Spouse', '(555) 123-4567', 'Lisa Chen', '(555) 123-4567', 'Toyota Tacoma', 'ABC-1234', 'Silver', 'Fayetteville', 'NC', 'Strong performer, recommend for promotion. ETS date: 2027-06-15'),
    (showcase_org_id, pers_5_id, 'Carlos Rodriguez', 'Father', '(555) 234-5678', NULL, NULL, 'Honda Civic', 'XYZ-5678', 'Blue', 'Spring Lake', 'NC', 'Working on degree completion. Very motivated.'),
    (showcase_org_id, pers_7_id, 'Jennifer Kim', 'Mother', '(555) 345-6789', NULL, NULL, NULL, NULL, NULL, 'Fayetteville', 'NC', 'New to unit. Shows great potential.');

  RAISE NOTICE 'Demo showcase organization created successfully!';
  RAISE NOTICE 'Showcase Org ID: %', showcase_org_id;

END $$;
