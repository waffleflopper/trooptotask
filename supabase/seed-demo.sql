-- Troop to Task: Demo Data Seed
-- Run this AFTER schema.sql and policies.sql
-- Creates a demo clinic with sample data for showcasing features

-- ============================================================
-- Demo User (create in Supabase Auth first, then get the UUID)
-- Email: demo@trooptotask.app
-- Password: demo1234
-- ============================================================

-- Replace this with the actual UUID from Supabase Auth after creating the demo user
-- You can create the user via the Supabase dashboard: Authentication > Users > Add User
DO $$
DECLARE
  demo_user_id uuid := '0e008df8-3564-42c9-a506-42e6833d47c1'; -- REPLACE THIS
  demo_clinic_id uuid;

  -- Group IDs
  group_hq_id uuid;
  group_alpha_id uuid;
  group_bravo_id uuid;
  group_charlie_id uuid;

  -- Personnel IDs (for assignments and training)
  pers_commander_id uuid;
  pers_xo_id uuid;
  pers_smith_id uuid;
  pers_jones_id uuid;
  pers_williams_id uuid;
  pers_brown_id uuid;
  pers_davis_id uuid;
  pers_miller_id uuid;
  pers_wilson_id uuid;
  pers_moore_id uuid;
  pers_taylor_id uuid;
  pers_anderson_id uuid;
  pers_thomas_id uuid;
  pers_jackson_id uuid;
  pers_white_id uuid;
  pers_harris_id uuid;

  -- Status Type IDs
  status_leave_id uuid;
  status_tdy_id uuid;
  status_school_id uuid;
  status_sick_id uuid;
  status_appointment_id uuid;

  -- Assignment Type IDs
  assign_mod_id uuid;
  assign_fds_id uuid;

  -- Training Type IDs
  train_bls_id uuid;
  train_acls_id uuid;
  train_sharp_id uuid;
  train_cyber_id uuid;

  -- Date helpers
  today date := CURRENT_DATE;

BEGIN
  -- ============================================================
  -- Create Demo Clinic
  -- ============================================================

  INSERT INTO public.clinics (id, name, created_by)
  VALUES (uuid_generate_v4(), 'Eisenhower Army Medical Center - TMC', demo_user_id)
  RETURNING id INTO demo_clinic_id;

  -- Add demo user as clinic owner
  INSERT INTO public.clinic_memberships (clinic_id, user_id, role)
  VALUES (demo_clinic_id, demo_user_id, 'owner');

  -- ============================================================
  -- Create Groups
  -- ============================================================

  INSERT INTO public.groups (id, clinic_id, name, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'HQ', 0)
  RETURNING id INTO group_hq_id;

  INSERT INTO public.groups (id, clinic_id, name, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Alpha Section', 1)
  RETURNING id INTO group_alpha_id;

  INSERT INTO public.groups (id, clinic_id, name, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Bravo Section', 2)
  RETURNING id INTO group_bravo_id;

  INSERT INTO public.groups (id, clinic_id, name, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Charlie Section', 3)
  RETURNING id INTO group_charlie_id;

  -- ============================================================
  -- Create Personnel
  -- ============================================================

  -- HQ
  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'LTC', 'Richardson', 'James', 'MC', 'Commander', group_hq_id)
  RETURNING id INTO pers_commander_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'MAJ', 'Chen', 'Michelle', 'AN', 'XO', group_hq_id)
  RETURNING id INTO pers_xo_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'MSG', 'Patterson', 'Robert', '68W', 'NCOIC', group_hq_id);

  -- Alpha Section (Primary Care)
  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'CPT', 'Smith', 'Sarah', 'PA', 'Provider', group_alpha_id)
  RETURNING id INTO pers_smith_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'CPT', 'Jones', 'Michael', 'MD', 'Provider', group_alpha_id)
  RETURNING id INTO pers_jones_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SFC', 'Williams', 'David', '68W', 'Clinic NCO', group_alpha_id)
  RETURNING id INTO pers_williams_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SSG', 'Brown', 'Jessica', '68W', 'Medic', group_alpha_id)
  RETURNING id INTO pers_brown_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SGT', 'Davis', 'Anthony', '68W', 'Medic', group_alpha_id)
  RETURNING id INTO pers_davis_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SPC', 'Miller', 'Emily', '68W', 'Medic', group_alpha_id)
  RETURNING id INTO pers_miller_id;

  -- Bravo Section (Specialty Care)
  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'MAJ', 'Wilson', 'Christopher', 'MD', 'Provider', group_bravo_id)
  RETURNING id INTO pers_wilson_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'CPT', 'Moore', 'Amanda', 'PA', 'Provider', group_bravo_id)
  RETURNING id INTO pers_moore_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SSG', 'Taylor', 'Brandon', '68W', 'Clinic NCO', group_bravo_id)
  RETURNING id INTO pers_taylor_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SGT', 'Anderson', 'Nicole', '68W', 'Medic', group_bravo_id)
  RETURNING id INTO pers_anderson_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SPC', 'Thomas', 'Kevin', '68W', 'Medic', group_bravo_id)
  RETURNING id INTO pers_thomas_id;

  -- Charlie Section (Admin/Support)
  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SFC', 'Jackson', 'Marcus', '42A', 'Admin NCO', group_charlie_id)
  RETURNING id INTO pers_jackson_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SSG', 'White', 'Laura', '68G', 'Patient Admin', group_charlie_id)
  RETURNING id INTO pers_white_id;

  INSERT INTO public.personnel (id, clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SPC', 'Harris', 'Tyler', '42A', 'Clerk', group_charlie_id)
  RETURNING id INTO pers_harris_id;

  INSERT INTO public.personnel (clinic_id, rank, last_name, first_name, mos, clinic_role, group_id)
  VALUES (demo_clinic_id, 'CIV', 'Martinez', 'Sofia', 'GS', 'Admin Support', group_charlie_id);

  -- ============================================================
  -- Create Status Types
  -- ============================================================

  INSERT INTO public.status_types (id, clinic_id, name, color, text_color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Leave', '#22c55e', '#ffffff', 0)
  RETURNING id INTO status_leave_id;

  INSERT INTO public.status_types (id, clinic_id, name, color, text_color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'TDY', '#3b82f6', '#ffffff', 1)
  RETURNING id INTO status_tdy_id;

  INSERT INTO public.status_types (id, clinic_id, name, color, text_color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'School/Training', '#8b5cf6', '#ffffff', 2)
  RETURNING id INTO status_school_id;

  INSERT INTO public.status_types (id, clinic_id, name, color, text_color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Sick Call', '#ef4444', '#ffffff', 3)
  RETURNING id INTO status_sick_id;

  INSERT INTO public.status_types (id, clinic_id, name, color, text_color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Appointment', '#f59e0b', '#ffffff', 4)
  RETURNING id INTO status_appointment_id;

  INSERT INTO public.status_types (clinic_id, name, color, text_color, sort_order)
  VALUES (demo_clinic_id, 'CQ/Staff Duty', '#6366f1', '#ffffff', 5);

  INSERT INTO public.status_types (clinic_id, name, color, text_color, sort_order)
  VALUES (demo_clinic_id, 'Quarters', '#ec4899', '#ffffff', 6);

  -- ============================================================
  -- Create Availability Entries (sample statuses for current/upcoming dates)
  -- ============================================================

  -- Someone on leave this week
  INSERT INTO public.availability_entries (clinic_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (demo_clinic_id, pers_smith_id, status_leave_id, today, today + 4);

  -- Someone at school next week
  INSERT INTO public.availability_entries (clinic_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (demo_clinic_id, pers_williams_id, status_school_id, today + 7, today + 11);

  -- Someone TDY
  INSERT INTO public.availability_entries (clinic_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (demo_clinic_id, pers_wilson_id, status_tdy_id, today + 3, today + 10);

  -- Someone on leave next month
  INSERT INTO public.availability_entries (clinic_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (demo_clinic_id, pers_jones_id, status_leave_id, today + 21, today + 35);

  -- Sick call (single day)
  INSERT INTO public.availability_entries (clinic_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (demo_clinic_id, pers_davis_id, status_sick_id, today, today);

  -- Appointment
  INSERT INTO public.availability_entries (clinic_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (demo_clinic_id, pers_miller_id, status_appointment_id, today + 2, today + 2);

  -- More leave entries for variety
  INSERT INTO public.availability_entries (clinic_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (demo_clinic_id, pers_taylor_id, status_leave_id, today + 14, today + 21);

  INSERT INTO public.availability_entries (clinic_id, personnel_id, status_type_id, start_date, end_date)
  VALUES (demo_clinic_id, pers_harris_id, status_leave_id, today + 5, today + 6);

  -- ============================================================
  -- Create Assignment Types
  -- ============================================================

  INSERT INTO public.assignment_types (id, clinic_id, name, short_name, assign_to, color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Medical Officer of the Day', 'MOD', 'personnel', '#dc2626', 0)
  RETURNING id INTO assign_mod_id;

  INSERT INTO public.assignment_types (id, clinic_id, name, short_name, assign_to, color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Front Desk Support', 'FDS', 'group', '#0891b2', 1)
  RETURNING id INTO assign_fds_id;

  -- ============================================================
  -- Create Daily Assignments (sample for current week)
  -- ============================================================

  -- MOD assignments (rotating providers)
  INSERT INTO public.daily_assignments (clinic_id, assignment_type_id, date, assignee_id)
  VALUES
    (demo_clinic_id, assign_mod_id, today, pers_jones_id),
    (demo_clinic_id, assign_mod_id, today + 1, pers_moore_id),
    (demo_clinic_id, assign_mod_id, today + 2, pers_wilson_id),
    (demo_clinic_id, assign_mod_id, today + 3, pers_jones_id),
    (demo_clinic_id, assign_mod_id, today + 4, pers_moore_id);

  -- Front Desk Support (rotating sections)
  INSERT INTO public.daily_assignments (clinic_id, assignment_type_id, date, assignee_id)
  VALUES
    (demo_clinic_id, assign_fds_id, today, 'Alpha Section'),
    (demo_clinic_id, assign_fds_id, today + 1, 'Bravo Section'),
    (demo_clinic_id, assign_fds_id, today + 2, 'Charlie Section'),
    (demo_clinic_id, assign_fds_id, today + 3, 'Alpha Section'),
    (demo_clinic_id, assign_fds_id, today + 4, 'Bravo Section');

  -- ============================================================
  -- Create Special Days (Federal Holidays for current year)
  -- ============================================================

  INSERT INTO public.special_days (clinic_id, date, name, type)
  VALUES
    (demo_clinic_id, DATE_TRUNC('year', today) + INTERVAL '0 days', 'New Year''s Day', 'federal-holiday'),
    (demo_clinic_id, DATE_TRUNC('year', today) + INTERVAL '14 days' + ((1 - EXTRACT(DOW FROM DATE_TRUNC('year', today)))::int % 7 || ' days')::interval + INTERVAL '2 weeks', 'Martin Luther King Jr. Day', 'federal-holiday'),
    (demo_clinic_id, DATE_TRUNC('year', today) + INTERVAL '1 month' + INTERVAL '14 days' + ((1 - EXTRACT(DOW FROM DATE_TRUNC('year', today) + INTERVAL '1 month'))::int % 7 || ' days')::interval + INTERVAL '2 weeks', 'Presidents Day', 'federal-holiday'),
    (demo_clinic_id, '2025-05-26', 'Memorial Day', 'federal-holiday'),
    (demo_clinic_id, '2025-06-19', 'Juneteenth', 'federal-holiday'),
    (demo_clinic_id, '2025-07-04', 'Independence Day', 'federal-holiday'),
    (demo_clinic_id, '2025-09-01', 'Labor Day', 'federal-holiday'),
    (demo_clinic_id, '2025-10-13', 'Columbus Day', 'federal-holiday'),
    (demo_clinic_id, '2025-11-11', 'Veterans Day', 'federal-holiday'),
    (demo_clinic_id, '2025-11-27', 'Thanksgiving Day', 'federal-holiday'),
    (demo_clinic_id, '2025-12-25', 'Christmas Day', 'federal-holiday');

  -- ============================================================
  -- Create Training Types
  -- ============================================================

  INSERT INTO public.training_types (id, clinic_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'BLS Certification', 'Basic Life Support certification', 24, 60, 30, ARRAY['68W', 'PA', 'MD', 'AN'], '#ef4444', 0)
  RETURNING id INTO train_bls_id;

  INSERT INTO public.training_types (id, clinic_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'ACLS Certification', 'Advanced Cardiovascular Life Support', 24, 60, 30, ARRAY['PA', 'MD', 'AN'], '#f97316', 1)
  RETURNING id INTO train_acls_id;

  INSERT INTO public.training_types (id, clinic_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'SHARP Training', 'Sexual Harassment/Assault Response Prevention', 12, 60, 30, ARRAY[]::text[], '#8b5cf6', 2)
  RETURNING id INTO train_sharp_id;

  INSERT INTO public.training_types (id, clinic_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
  VALUES (uuid_generate_v4(), demo_clinic_id, 'Cyber Awareness', 'Annual Cyber Security Awareness Training', 12, 60, 30, ARRAY[]::text[], '#3b82f6', 3)
  RETURNING id INTO train_cyber_id;

  INSERT INTO public.training_types (clinic_id, name, description, expiration_months, warning_days_yellow, warning_days_orange, required_for_roles, color, sort_order)
  VALUES (demo_clinic_id, 'HIPAA Training', 'Health Insurance Portability and Accountability Act', 12, 60, 30, ARRAY[]::text[], '#22c55e', 4);

  -- ============================================================
  -- Create Personnel Training Records
  -- ============================================================

  -- BLS - Mix of current, expiring soon, and expired
  INSERT INTO public.personnel_trainings (clinic_id, personnel_id, training_type_id, completion_date, expiration_date)
  VALUES
    (demo_clinic_id, pers_smith_id, train_bls_id, today - 365, today + 365),
    (demo_clinic_id, pers_jones_id, train_bls_id, today - 700, today + 30), -- Expiring soon (yellow)
    (demo_clinic_id, pers_williams_id, train_bls_id, today - 400, today + 330),
    (demo_clinic_id, pers_brown_id, train_bls_id, today - 750, today - 20), -- Expired
    (demo_clinic_id, pers_davis_id, train_bls_id, today - 200, today + 530),
    (demo_clinic_id, pers_miller_id, train_bls_id, today - 710, today + 20), -- Expiring soon (orange)
    (demo_clinic_id, pers_wilson_id, train_bls_id, today - 100, today + 630),
    (demo_clinic_id, pers_moore_id, train_bls_id, today - 600, today + 130),
    (demo_clinic_id, pers_taylor_id, train_bls_id, today - 300, today + 430),
    (demo_clinic_id, pers_anderson_id, train_bls_id, today - 500, today + 230);

  -- ACLS - For providers only
  INSERT INTO public.personnel_trainings (clinic_id, personnel_id, training_type_id, completion_date, expiration_date)
  VALUES
    (demo_clinic_id, pers_smith_id, train_acls_id, today - 400, today + 330),
    (demo_clinic_id, pers_jones_id, train_acls_id, today - 680, today + 50), -- Expiring yellow
    (demo_clinic_id, pers_wilson_id, train_acls_id, today - 500, today + 230),
    (demo_clinic_id, pers_moore_id, train_acls_id, today - 750, today - 20); -- Expired

  -- SHARP - Everyone
  INSERT INTO public.personnel_trainings (clinic_id, personnel_id, training_type_id, completion_date, expiration_date)
  VALUES
    (demo_clinic_id, pers_commander_id, train_sharp_id, today - 200, today + 165),
    (demo_clinic_id, pers_xo_id, train_sharp_id, today - 100, today + 265),
    (demo_clinic_id, pers_smith_id, train_sharp_id, today - 350, today + 15), -- Expiring orange
    (demo_clinic_id, pers_jones_id, train_sharp_id, today - 50, today + 315),
    (demo_clinic_id, pers_williams_id, train_sharp_id, today - 400, today - 35), -- Expired
    (demo_clinic_id, pers_brown_id, train_sharp_id, today - 150, today + 215),
    (demo_clinic_id, pers_davis_id, train_sharp_id, today - 300, today + 65),
    (demo_clinic_id, pers_wilson_id, train_sharp_id, today - 80, today + 285),
    (demo_clinic_id, pers_moore_id, train_sharp_id, today - 250, today + 115),
    (demo_clinic_id, pers_jackson_id, train_sharp_id, today - 180, today + 185);

  -- Cyber Awareness - Everyone
  INSERT INTO public.personnel_trainings (clinic_id, personnel_id, training_type_id, completion_date, expiration_date)
  VALUES
    (demo_clinic_id, pers_commander_id, train_cyber_id, today - 100, today + 265),
    (demo_clinic_id, pers_xo_id, train_cyber_id, today - 150, today + 215),
    (demo_clinic_id, pers_smith_id, train_cyber_id, today - 200, today + 165),
    (demo_clinic_id, pers_jones_id, train_cyber_id, today - 330, today + 35), -- Expiring yellow
    (demo_clinic_id, pers_williams_id, train_cyber_id, today - 50, today + 315),
    (demo_clinic_id, pers_brown_id, train_cyber_id, today - 280, today + 85),
    (demo_clinic_id, pers_davis_id, train_cyber_id, today - 120, today + 245),
    (demo_clinic_id, pers_miller_id, train_cyber_id, today - 380, today - 15), -- Expired
    (demo_clinic_id, pers_wilson_id, train_cyber_id, today - 60, today + 305),
    (demo_clinic_id, pers_moore_id, train_cyber_id, today - 90, today + 275),
    (demo_clinic_id, pers_taylor_id, train_cyber_id, today - 340, today + 25), -- Expiring orange
    (demo_clinic_id, pers_jackson_id, train_cyber_id, today - 200, today + 165),
    (demo_clinic_id, pers_white_id, train_cyber_id, today - 250, today + 115),
    (demo_clinic_id, pers_harris_id, train_cyber_id, today - 180, today + 185);

  RAISE NOTICE 'Demo data created successfully!';
  RAISE NOTICE 'Demo Clinic ID: %', demo_clinic_id;

END $$;
