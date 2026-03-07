


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."invitation_status" AS ENUM (
    'pending',
    'accepted',
    'revoked'
);


ALTER TYPE "public"."invitation_status" OWNER TO "postgres";


CREATE TYPE "public"."organization_role" AS ENUM (
    'owner',
    'member'
);


ALTER TYPE "public"."organization_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_calendar = true)
  );
END;
$$;


ALTER FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_personnel = true)
  );
END;
$$;


ALTER FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_edit_training = true)
  );
END;
$$;


ALTER FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_manage_members = true)
  );
END;
$$;


ALTER FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_calendar = true)
  );
END;
$$;


ALTER FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_personnel = true)
  );
END;
$$;


ALTER FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_training"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role = 'owner' OR can_view_training = true)
  );
END;
$$;


ALTER FUNCTION "public"."can_view_training"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_demo_sandboxes"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."cleanup_expired_demo_sandboxes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::integer
  FROM public.personnel
  WHERE organization_id = p_org_id;
$$;


ALTER FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") OWNER TO "postgres";



CREATE OR REPLACE FUNCTION "public"."create_clinic_with_owner"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_clinic_id uuid;
    v_user_id uuid;
  BEGIN
    -- Get the current user's ID
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Create the clinic
    INSERT INTO public.clinics (name, created_by)
    VALUES (p_name, v_user_id)
    RETURNING id INTO v_clinic_id;

    -- Add the creator as owner
    INSERT INTO public.clinic_memberships (clinic_id, user_id, role)
    VALUES (v_clinic_id, v_user_id, 'owner');

    RETURN v_clinic_id;
  END;
  $$;


ALTER FUNCTION "public"."create_clinic_with_owner"("p_name" "text") OWNER TO "postgres";



CREATE OR REPLACE FUNCTION "public"."create_demo_sandbox"("p_session_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."create_demo_sandbox"("p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_org_with_owner"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Create the organization
  INSERT INTO public.organizations (name, created_by)
  VALUES (p_name, auth.uid())
  RETURNING id INTO v_org_id;

  -- Create the owner membership
  INSERT INTO public.organization_memberships (
    organization_id,
    user_id,
    role,
    can_view_calendar,
    can_edit_calendar,
    can_view_personnel,
    can_edit_personnel,
    can_view_training,
    can_edit_training,
    can_manage_members
  ) VALUES (
    v_org_id,
    auth.uid(),
    'owner',
    true,
    true,
    true,
    true,
    true,
    true,
    true
  );

  RETURN v_org_id;
END;
$$;


ALTER FUNCTION "public"."create_org_with_owner"("p_name" "text") OWNER TO "postgres";





CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_org_member"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND is_active = true
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND is_active = true AND role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";



CREATE OR REPLACE FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Verify caller is current owner
  IF NOT public.is_org_owner(p_organization_id) THEN
    RAISE EXCEPTION 'Only the owner can transfer ownership';
  END IF;

  -- Verify new owner is a member
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'New owner must be an existing member';
  END IF;

  -- Demote current owner to admin member (keeps full permissions)
  UPDATE public.organization_memberships
  SET role = 'member',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  WHERE organization_id = p_organization_id AND user_id = auth.uid();

  -- Promote new owner
  UPDATE public.organization_memberships
  SET role = 'owner',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true
  WHERE organization_id = p_organization_id AND user_id = p_new_owner_id;
END;
$$;


ALTER FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") OWNER TO "postgres";



CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."access_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "invite_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "access_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."access_requests" OWNER TO "postgres";



CREATE TABLE IF NOT EXISTS "public"."assignment_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text" NOT NULL,
    "assign_to" "text" NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exempt_personnel_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "assignment_types_assign_to_check" CHECK (("assign_to" = ANY (ARRAY['personnel'::"text", 'group'::"text"])))
);


ALTER TABLE "public"."assignment_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_entries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "status_type_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_date_range" CHECK (("end_date" >= "start_date"))
);


ALTER TABLE "public"."availability_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_email" "text" NOT NULL,
    "organization_id" "uuid",
    "organization_name" "text",
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "page_url" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "beta_feedback_category_check" CHECK (("category" = ANY (ARRAY['bug'::"text", 'feature'::"text", 'general'::"text"]))),
    CONSTRAINT "beta_feedback_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'reviewed'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."beta_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."counseling_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "counseling_type_id" "uuid",
    "date_conducted" "date" NOT NULL,
    "subject" "text" NOT NULL,
    "key_points" "text",
    "plan_of_action" "text",
    "follow_up_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "counselor_signed" boolean DEFAULT false NOT NULL,
    "counselor_signed_at" timestamp with time zone,
    "soldier_signed" boolean DEFAULT false NOT NULL,
    "soldier_signed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "file_path" "text",
    CONSTRAINT "counseling_records_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text", 'acknowledged'::"text"])))
);


ALTER TABLE "public"."counseling_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."counseling_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "template_content" "text",
    "recurrence" "text" DEFAULT 'none'::"text",
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "is_freeform" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_file_path" "text",
    CONSTRAINT "counseling_types_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['none'::"text", 'monthly'::"text", 'quarterly'::"text", 'annually'::"text"])))
);


ALTER TABLE "public"."counseling_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_assignments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "assignment_type_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "assignee_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."development_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'career'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'not-started'::"text" NOT NULL,
    "target_date" "date",
    "progress_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "development_goals_category_check" CHECK (("category" = ANY (ARRAY['career'::"text", 'education'::"text", 'physical'::"text", 'personal'::"text"]))),
    CONSTRAINT "development_goals_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "development_goals_status_check" CHECK (("status" = ANY (ARRAY['not-started'::"text", 'in-progress'::"text", 'completed'::"text", 'on-hold'::"text"])))
);


ALTER TABLE "public"."development_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duty_roster_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "assignment_type_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "roster" "jsonb" NOT NULL,
    "config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_user_id" "uuid"
);


ALTER TABLE "public"."duty_roster_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_step_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "onboarding_id" "uuid" NOT NULL,
    "step_name" "text" NOT NULL,
    "step_type" "text" NOT NULL,
    "training_type_id" "uuid",
    "stages" "jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "current_stage" "text",
    "notes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_step_progress_step_type_check" CHECK (("step_type" = ANY (ARRAY['training'::"text", 'paperwork'::"text", 'checkbox'::"text"])))
);


ALTER TABLE "public"."onboarding_step_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_template_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "step_type" "text" NOT NULL,
    "training_type_id" "uuid",
    "stages" "jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_template_steps_step_type_check" CHECK (("step_type" = ANY (ARRAY['training'::"text", 'paperwork'::"text", 'checkbox'::"text"])))
);


ALTER TABLE "public"."onboarding_template_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_invitations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "public"."invitation_status" DEFAULT 'pending'::"public"."invitation_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_view_calendar" boolean DEFAULT true NOT NULL,
    "can_edit_calendar" boolean DEFAULT true NOT NULL,
    "can_view_personnel" boolean DEFAULT true NOT NULL,
    "can_edit_personnel" boolean DEFAULT true NOT NULL,
    "can_view_training" boolean DEFAULT true NOT NULL,
    "can_edit_training" boolean DEFAULT true NOT NULL,
    "can_manage_members" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."organization_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_memberships" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."organization_role" DEFAULT 'member'::"public"."organization_role" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_view_calendar" boolean DEFAULT true NOT NULL,
    "can_edit_calendar" boolean DEFAULT true NOT NULL,
    "can_view_personnel" boolean DEFAULT true NOT NULL,
    "can_edit_personnel" boolean DEFAULT true NOT NULL,
    "can_view_training" boolean DEFAULT true NOT NULL,
    "can_edit_training" boolean DEFAULT true NOT NULL,
    "can_manage_members" boolean DEFAULT false NOT NULL,
    "email" "text"
);


ALTER TABLE "public"."organization_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "demo_type" "text",
    "demo_expires_at" timestamp with time zone,
    CONSTRAINT "organizations_demo_type_check" CHECK (("demo_type" = ANY (ARRAY['showcase'::"text", 'sandbox'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";



CREATE TABLE IF NOT EXISTS "public"."personnel" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "rank" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "clinic_role" "text" DEFAULT ''::"text" NOT NULL,
    "group_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mos" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."personnel" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_extended_info" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "emergency_contact_name" "text",
    "emergency_contact_relationship" "text",
    "emergency_contact_phone" "text",
    "spouse_name" "text",
    "spouse_phone" "text",
    "vehicle_make_model" "text",
    "vehicle_plate" "text",
    "vehicle_color" "text",
    "personal_email" "text",
    "personal_phone" "text",
    "address_street" "text",
    "address_city" "text",
    "address_state" "text",
    "address_zip" "text",
    "leader_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."personnel_extended_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_onboardings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "started_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "completed_at" "date",
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personnel_onboardings_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."personnel_onboardings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_trainings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "training_type_id" "uuid" NOT NULL,
    "completion_date" "date",
    "expiration_date" "date",
    "notes" "text",
    "certificate_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."personnel_trainings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."personnel_trainings"."completion_date" IS 'Date training was completed. NULL is allowed for never-expires training when marked complete without a specific date.';



CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'support'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_admins_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'support'::"text", 'billing'::"text"])))
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rating_scheme_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "rated_person_id" "uuid" NOT NULL,
    "eval_type" "text" NOT NULL,
    "rater_person_id" "uuid",
    "rater_name" "text",
    "senior_rater_person_id" "uuid",
    "senior_rater_name" "text",
    "intermediate_rater_person_id" "uuid",
    "intermediate_rater_name" "text",
    "reviewer_person_id" "uuid",
    "reviewer_name" "text",
    "rating_period_start" "date" NOT NULL,
    "rating_period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "report_type" "text",
    "workflow_status" "text",
    CONSTRAINT "rating_scheme_entries_eval_type_check" CHECK (("eval_type" = ANY (ARRAY['OER'::"text", 'NCOER'::"text", 'WOER'::"text"]))),
    CONSTRAINT "rating_scheme_entries_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'change-of-rater'::"text"]))),
    CONSTRAINT "rating_scheme_entries_workflow_status_check" CHECK ((("workflow_status" IS NULL) OR ("workflow_status" = ANY (ARRAY['drafting'::"text", 'with-rater'::"text", 'rater-signed'::"text", 'with-senior-rater'::"text", 'sr-signed'::"text", 'with-intermediate-rater'::"text", 'ir-signed'::"text", 'with-reviewer'::"text", 'reviewer-signed'::"text", 'with-rated-soldier'::"text", 'sm-signed'::"text", 'submitted-to-s1'::"text", 'completed'::"text"]))))
);


ALTER TABLE "public"."rating_scheme_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registration_invites" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "code" "text" NOT NULL,
    "email" "text",
    "used_by" "uuid",
    "used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."registration_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."special_days" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "special_days_type_check" CHECK (("type" = ANY (ARRAY['federal-holiday'::"text", 'org-closure'::"text"])))
);


ALTER TABLE "public"."special_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."status_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "text_color" "text" DEFAULT '#ffffff'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."status_types" OWNER TO "postgres";




CREATE TABLE IF NOT EXISTS "public"."training_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "expiration_months" integer,
    "warning_days_yellow" integer DEFAULT 60 NOT NULL,
    "warning_days_orange" integer DEFAULT 30 NOT NULL,
    "required_for_roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expiration_date_only" boolean DEFAULT false NOT NULL,
    "can_be_exempted" boolean DEFAULT false NOT NULL,
    "exempt_personnel_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."training_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_pinned_groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "group_name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_pinned_groups" OWNER TO "postgres";



ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id");




ALTER TABLE ONLY "public"."assignment_types"
    ADD CONSTRAINT "assignment_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."availability_entries"
    ADD CONSTRAINT "availability_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "clinic_invitations_clinic_id_email_key" UNIQUE ("organization_id", "email");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "clinic_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_clinic_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."counseling_records"
    ADD CONSTRAINT "counseling_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."counseling_types"
    ADD CONSTRAINT "counseling_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_clinic_id_assignment_type_id_date_key" UNIQUE ("organization_id", "assignment_type_id", "date");



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."development_goals"
    ADD CONSTRAINT "development_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."duty_roster_history"
    ADD CONSTRAINT "duty_roster_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_clinic_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_template_steps"
    ADD CONSTRAINT "onboarding_template_steps_pkey" PRIMARY KEY ("id");




ALTER TABLE ONLY "public"."personnel_extended_info"
    ADD CONSTRAINT "personnel_extended_info_personnel_id_key" UNIQUE ("personnel_id");



ALTER TABLE ONLY "public"."personnel_extended_info"
    ADD CONSTRAINT "personnel_extended_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_onboardings"
    ADD CONSTRAINT "personnel_onboardings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel"
    ADD CONSTRAINT "personnel_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_clinic_id_personnel_id_training_type_id_key" UNIQUE ("organization_id", "personnel_id", "training_type_id");



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registration_invites"
    ADD CONSTRAINT "registration_invites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."registration_invites"
    ADD CONSTRAINT "registration_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."special_days"
    ADD CONSTRAINT "special_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_types"
    ADD CONSTRAINT "status_types_pkey" PRIMARY KEY ("id");




ALTER TABLE ONLY "public"."training_types"
    ADD CONSTRAINT "training_types_clinic_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."training_types"
    ADD CONSTRAINT "training_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_pinned_groups"
    ADD CONSTRAINT "user_pinned_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_pinned_groups"
    ADD CONSTRAINT "user_pinned_groups_user_id_clinic_id_group_name_key" UNIQUE ("user_id", "organization_id", "group_name");




CREATE UNIQUE INDEX "access_requests_pending_email_idx" ON "public"."access_requests" USING "btree" ("lower"("email")) WHERE ("status" = 'pending'::"text");




CREATE INDEX "idx_assignment_types_org" ON "public"."assignment_types" USING "btree" ("organization_id");



CREATE INDEX "idx_availability_org" ON "public"."availability_entries" USING "btree" ("organization_id");



CREATE INDEX "idx_availability_personnel" ON "public"."availability_entries" USING "btree" ("personnel_id");



CREATE INDEX "idx_beta_feedback_created_at" ON "public"."beta_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_beta_feedback_status" ON "public"."beta_feedback" USING "btree" ("status");



CREATE INDEX "idx_beta_feedback_user_id" ON "public"."beta_feedback" USING "btree" ("user_id");



CREATE INDEX "idx_counseling_records_date" ON "public"."counseling_records" USING "btree" ("date_conducted");



CREATE INDEX "idx_counseling_records_org" ON "public"."counseling_records" USING "btree" ("organization_id");



CREATE INDEX "idx_counseling_records_personnel" ON "public"."counseling_records" USING "btree" ("personnel_id");



CREATE INDEX "idx_counseling_records_type" ON "public"."counseling_records" USING "btree" ("counseling_type_id");



CREATE INDEX "idx_counseling_types_org" ON "public"."counseling_types" USING "btree" ("organization_id");



CREATE INDEX "idx_daily_assignments_date" ON "public"."daily_assignments" USING "btree" ("date");



CREATE INDEX "idx_daily_assignments_org" ON "public"."daily_assignments" USING "btree" ("organization_id");



CREATE INDEX "idx_development_goals_category" ON "public"."development_goals" USING "btree" ("category");



CREATE INDEX "idx_development_goals_org" ON "public"."development_goals" USING "btree" ("organization_id");



CREATE INDEX "idx_development_goals_personnel" ON "public"."development_goals" USING "btree" ("personnel_id");



CREATE INDEX "idx_development_goals_status" ON "public"."development_goals" USING "btree" ("status");



CREATE INDEX "idx_groups_org" ON "public"."groups" USING "btree" ("organization_id");



CREATE INDEX "idx_organization_invitations_email" ON "public"."organization_invitations" USING "btree" ("email");



CREATE INDEX "idx_organization_memberships_org" ON "public"."organization_memberships" USING "btree" ("organization_id");



CREATE INDEX "idx_organization_memberships_user" ON "public"."organization_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_organizations_demo_expires" ON "public"."organizations" USING "btree" ("demo_expires_at") WHERE ("demo_expires_at" IS NOT NULL);




CREATE INDEX "idx_personnel_extended_info_org" ON "public"."personnel_extended_info" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_extended_info_personnel" ON "public"."personnel_extended_info" USING "btree" ("personnel_id");



CREATE INDEX "idx_personnel_group" ON "public"."personnel" USING "btree" ("group_id");



CREATE INDEX "idx_personnel_org" ON "public"."personnel" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_trainings_expiration" ON "public"."personnel_trainings" USING "btree" ("expiration_date");



CREATE INDEX "idx_personnel_trainings_org" ON "public"."personnel_trainings" USING "btree" ("organization_id");



CREATE INDEX "idx_personnel_trainings_personnel" ON "public"."personnel_trainings" USING "btree" ("personnel_id");



CREATE INDEX "idx_personnel_trainings_type" ON "public"."personnel_trainings" USING "btree" ("training_type_id");



CREATE INDEX "idx_platform_admins_user_id" ON "public"."platform_admins" USING "btree" ("user_id");



CREATE INDEX "idx_registration_invites_code" ON "public"."registration_invites" USING "btree" ("code");



CREATE INDEX "idx_special_days_org" ON "public"."special_days" USING "btree" ("organization_id");



CREATE INDEX "idx_status_types_org" ON "public"."status_types" USING "btree" ("organization_id");




CREATE INDEX "idx_training_types_org" ON "public"."training_types" USING "btree" ("organization_id");



CREATE INDEX "idx_user_pinned_groups_user_org" ON "public"."user_pinned_groups" USING "btree" ("user_id", "organization_id");




CREATE INDEX "onboarding_step_progress_onboarding_idx" ON "public"."onboarding_step_progress" USING "btree" ("onboarding_id");



CREATE INDEX "onboarding_template_steps_org_idx" ON "public"."onboarding_template_steps" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "personnel_onboardings_active_idx" ON "public"."personnel_onboardings" USING "btree" ("organization_id", "personnel_id") WHERE ("status" = 'in_progress'::"text");



CREATE INDEX "personnel_onboardings_org_idx" ON "public"."personnel_onboardings" USING "btree" ("organization_id");



CREATE INDEX "rating_scheme_entries_org_idx" ON "public"."rating_scheme_entries" USING "btree" ("organization_id");



CREATE INDEX "rating_scheme_entries_rated_idx" ON "public"."rating_scheme_entries" USING "btree" ("rated_person_id");



CREATE OR REPLACE TRIGGER "set_beta_feedback_updated_at" BEFORE UPDATE ON "public"."beta_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_counseling_records_updated_at" BEFORE UPDATE ON "public"."counseling_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_counseling_types_updated_at" BEFORE UPDATE ON "public"."counseling_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_development_goals_updated_at" BEFORE UPDATE ON "public"."development_goals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_personnel_extended_info_updated_at" BEFORE UPDATE ON "public"."personnel_extended_info" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_rating_scheme_entries_updated_at" BEFORE UPDATE ON "public"."rating_scheme_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();




ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "public"."registration_invites"("id");



ALTER TABLE ONLY "public"."access_requests"
    ADD CONSTRAINT "access_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");




ALTER TABLE ONLY "public"."assignment_types"
    ADD CONSTRAINT "assignment_types_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_entries"
    ADD CONSTRAINT "availability_entries_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_entries"
    ADD CONSTRAINT "availability_entries_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_entries"
    ADD CONSTRAINT "availability_entries_status_type_id_fkey" FOREIGN KEY ("status_type_id") REFERENCES "public"."status_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "clinic_invitations_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "clinic_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "clinic_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "clinics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."counseling_records"
    ADD CONSTRAINT "counseling_records_counseling_type_id_fkey" FOREIGN KEY ("counseling_type_id") REFERENCES "public"."counseling_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."counseling_records"
    ADD CONSTRAINT "counseling_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."counseling_records"
    ADD CONSTRAINT "counseling_records_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."counseling_types"
    ADD CONSTRAINT "counseling_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_assignment_type_id_fkey" FOREIGN KEY ("assignment_type_id") REFERENCES "public"."assignment_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_assignments"
    ADD CONSTRAINT "daily_assignments_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."development_goals"
    ADD CONSTRAINT "development_goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."development_goals"
    ADD CONSTRAINT "development_goals_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_history"
    ADD CONSTRAINT "duty_roster_history_assignment_type_id_fkey" FOREIGN KEY ("assignment_type_id") REFERENCES "public"."assignment_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duty_roster_history"
    ADD CONSTRAINT "duty_roster_history_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."duty_roster_history"
    ADD CONSTRAINT "duty_roster_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "public"."personnel_onboardings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_training_type_id_fkey" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."onboarding_template_steps"
    ADD CONSTRAINT "onboarding_template_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_template_steps"
    ADD CONSTRAINT "onboarding_template_steps_training_type_id_fkey" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE SET NULL;




ALTER TABLE ONLY "public"."personnel"
    ADD CONSTRAINT "personnel_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_extended_info"
    ADD CONSTRAINT "personnel_extended_info_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_extended_info"
    ADD CONSTRAINT "personnel_extended_info_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel"
    ADD CONSTRAINT "personnel_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personnel_onboardings"
    ADD CONSTRAINT "personnel_onboardings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_onboardings"
    ADD CONSTRAINT "personnel_onboardings_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_trainings"
    ADD CONSTRAINT "personnel_trainings_training_type_id_fkey" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_intermediate_rater_person_id_fkey" FOREIGN KEY ("intermediate_rater_person_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_rated_person_id_fkey" FOREIGN KEY ("rated_person_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_rater_person_id_fkey" FOREIGN KEY ("rater_person_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_reviewer_person_id_fkey" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rating_scheme_entries"
    ADD CONSTRAINT "rating_scheme_entries_senior_rater_person_id_fkey" FOREIGN KEY ("senior_rater_person_id") REFERENCES "public"."personnel"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."registration_invites"
    ADD CONSTRAINT "registration_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."registration_invites"
    ADD CONSTRAINT "registration_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."special_days"
    ADD CONSTRAINT "special_days_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."status_types"
    ADD CONSTRAINT "status_types_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_types"
    ADD CONSTRAINT "training_types_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_pinned_groups"
    ADD CONSTRAINT "user_pinned_groups_clinic_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_pinned_groups"
    ADD CONSTRAINT "user_pinned_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;




CREATE POLICY "Admins can create invitations" ON "public"."organization_invitations" FOR INSERT WITH CHECK ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Admins can delete invitations" ON "public"."organization_invitations" FOR DELETE USING ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Admins can delete memberships" ON "public"."organization_memberships" FOR DELETE USING ("public"."can_manage_org_members"("organization_id"));




CREATE POLICY "Admins can read platform_admins" ON "public"."platform_admins" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Admins can update invitations" ON "public"."organization_invitations" FOR UPDATE USING ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Admins can update memberships" ON "public"."organization_memberships" FOR UPDATE USING ("public"."can_manage_org_members"("organization_id"));



CREATE POLICY "Admins full access" ON "public"."beta_feedback" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Anyone can mark invites as used" ON "public"."registration_invites" FOR UPDATE USING (true);




CREATE POLICY "Anyone can validate invite codes" ON "public"."registration_invites" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create invites" ON "public"."registration_invites" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "created_by")));



CREATE POLICY "Creators and owners can insert memberships" ON "public"."organization_memberships" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("public"."is_org_owner"("organization_id") OR (("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_memberships"."organization_id") AND ("organizations"."created_by" = "auth"."uid"()))))))));



CREATE POLICY "Invited users can insert themselves as members" ON "public"."organization_memberships" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."organization_invitations"
  WHERE (("organization_invitations"."organization_id" = "organization_memberships"."organization_id") AND ("lower"("organization_invitations"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) AND ("organization_invitations"."status" = 'pending'::"public"."invitation_status"))))));



CREATE POLICY "Members and creators can insert assignment types" ON "public"."assignment_types" FOR INSERT WITH CHECK (("public"."is_org_member"("organization_id") OR (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "assignment_types"."organization_id") AND ("organizations"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Members and creators can insert groups" ON "public"."groups" FOR INSERT WITH CHECK (("public"."is_org_member"("organization_id") OR (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "groups"."organization_id") AND ("organizations"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Members and creators can insert special days" ON "public"."special_days" FOR INSERT WITH CHECK (("public"."is_org_member"("organization_id") OR (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "special_days"."organization_id") AND ("organizations"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Members and creators can insert status types" ON "public"."status_types" FOR INSERT WITH CHECK (("public"."is_org_member"("organization_id") OR (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "status_types"."organization_id") AND ("organizations"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Members and creators can insert training types" ON "public"."training_types" FOR INSERT WITH CHECK (("public"."is_org_member"("organization_id") OR (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "training_types"."organization_id") AND ("organizations"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Members can delete assignment types" ON "public"."assignment_types" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can delete availability" ON "public"."availability_entries" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can delete daily assignments" ON "public"."daily_assignments" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can delete groups" ON "public"."groups" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can delete personnel" ON "public"."personnel" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can delete personnel trainings" ON "public"."personnel_trainings" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can delete special days" ON "public"."special_days" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can delete status types" ON "public"."status_types" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can delete training types" ON "public"."training_types" FOR DELETE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can insert availability" ON "public"."availability_entries" FOR INSERT WITH CHECK ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can insert daily assignments" ON "public"."daily_assignments" FOR INSERT WITH CHECK ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can insert personnel" ON "public"."personnel" FOR INSERT WITH CHECK ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can insert personnel trainings" ON "public"."personnel_trainings" FOR INSERT WITH CHECK ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update assignment types" ON "public"."assignment_types" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update availability" ON "public"."availability_entries" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update daily assignments" ON "public"."daily_assignments" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update groups" ON "public"."groups" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update personnel" ON "public"."personnel" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update personnel trainings" ON "public"."personnel_trainings" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update special days" ON "public"."special_days" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update status types" ON "public"."status_types" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update training types" ON "public"."training_types" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view assignment types" ON "public"."assignment_types" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view availability" ON "public"."availability_entries" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view daily assignments" ON "public"."daily_assignments" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view groups" ON "public"."groups" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view invitations for their organizations" ON "public"."organization_invitations" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view memberships of their organizations" ON "public"."organization_memberships" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view personnel" ON "public"."personnel" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view personnel trainings" ON "public"."personnel_trainings" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view special days" ON "public"."special_days" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view status types" ON "public"."status_types" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view training types" ON "public"."training_types" FOR SELECT USING ("public"."is_org_member"("organization_id"));




CREATE POLICY "Org editors can manage onboarding template steps" ON "public"."onboarding_template_steps" USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Org editors can manage onboardings" ON "public"."personnel_onboardings" USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Org editors can manage rating scheme" ON "public"."rating_scheme_entries" USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Org editors can manage step progress" ON "public"."onboarding_step_progress" USING ((EXISTS ( SELECT 1
   FROM "public"."personnel_onboardings" "po"
  WHERE (("po"."id" = "onboarding_step_progress"."onboarding_id") AND "public"."can_edit_personnel"("po"."organization_id")))));



CREATE POLICY "Org members can view onboarding template steps" ON "public"."onboarding_template_steps" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Org members can view onboardings" ON "public"."personnel_onboardings" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Org members can view rating scheme" ON "public"."rating_scheme_entries" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Org members can view step progress" ON "public"."onboarding_step_progress" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."personnel_onboardings" "po"
  WHERE (("po"."id" = "onboarding_step_progress"."onboarding_id") AND "public"."can_view_personnel"("po"."organization_id")))));



CREATE POLICY "Organization owners can delete their organizations" ON "public"."organizations" FOR DELETE USING ("public"."is_org_owner"("id"));



CREATE POLICY "Organization owners can update their organizations" ON "public"."organizations" FOR UPDATE USING ("public"."is_org_owner"("id"));



CREATE POLICY "Platform admins can manage access requests" ON "public"."access_requests" USING ("public"."is_platform_admin"());



CREATE POLICY "Super admins can manage platform_admins" ON "public"."platform_admins" USING ((EXISTS ( SELECT 1
   FROM "public"."platform_admins" "platform_admins_1"
  WHERE (("platform_admins_1"."user_id" = "auth"."uid"()) AND ("platform_admins_1"."is_active" = true) AND ("platform_admins_1"."role" = 'super_admin'::"text")))));




CREATE POLICY "Users can check own admin status" ON "public"."platform_admins" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete counseling records if can edit personnel" ON "public"."counseling_records" FOR DELETE USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can delete counseling types if can edit personnel" ON "public"."counseling_types" FOR DELETE USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can delete development goals if can edit personnel" ON "public"."development_goals" FOR DELETE USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can delete extended info if can edit personnel" ON "public"."personnel_extended_info" FOR DELETE USING ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can delete invitations addressed to them" ON "public"."organization_invitations" FOR DELETE USING (("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))));



CREATE POLICY "Users can delete their own invites" ON "public"."registration_invites" FOR DELETE USING ((("auth"."uid"() = "created_by") AND ("used_by" IS NULL)));



CREATE POLICY "Users can delete their own pinned groups" ON "public"."user_pinned_groups" FOR DELETE USING ((("auth"."uid"() = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can insert counseling records if can edit personnel" ON "public"."counseling_records" FOR INSERT WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can insert counseling types if can edit personnel" ON "public"."counseling_types" FOR INSERT WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can insert development goals if can edit personnel" ON "public"."development_goals" FOR INSERT WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can insert extended info if can edit personnel" ON "public"."personnel_extended_info" FOR INSERT WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can insert own feedback" ON "public"."beta_feedback" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own pinned groups" ON "public"."user_pinned_groups" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_org_member"("organization_id")));




CREATE POLICY "Users can update counseling records if can edit personnel" ON "public"."counseling_records" FOR UPDATE USING ("public"."can_edit_personnel"("organization_id")) WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can update counseling types if can edit personnel" ON "public"."counseling_types" FOR UPDATE USING ("public"."can_edit_personnel"("organization_id")) WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can update development goals if can edit personnel" ON "public"."development_goals" FOR UPDATE USING ("public"."can_edit_personnel"("organization_id")) WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can update extended info if can edit personnel" ON "public"."personnel_extended_info" FOR UPDATE USING ("public"."can_edit_personnel"("organization_id")) WITH CHECK ("public"."can_edit_personnel"("organization_id"));



CREATE POLICY "Users can update their own pinned groups" ON "public"."user_pinned_groups" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND "public"."is_org_member"("organization_id")));



CREATE POLICY "Users can view counseling records if can view personnel" ON "public"."counseling_records" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Users can view counseling types if can view personnel" ON "public"."counseling_types" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Users can view development goals if can view personnel" ON "public"."development_goals" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Users can view extended info if can view personnel" ON "public"."personnel_extended_info" FOR SELECT USING ("public"."can_view_personnel"("organization_id"));



CREATE POLICY "Users can view invitations addressed to them" ON "public"."organization_invitations" FOR SELECT USING (("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))));



CREATE POLICY "Users can view organizations they are invited to" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_invitations"
  WHERE (("organization_invitations"."organization_id" = "organizations"."id") AND ("lower"("organization_invitations"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) AND ("organization_invitations"."status" = 'pending'::"public"."invitation_status")))));



CREATE POLICY "Users can view organizations they are members of" ON "public"."organizations" FOR SELECT USING ("public"."is_org_member"("id"));



CREATE POLICY "Users can view own feedback" ON "public"."beta_feedback" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own pinned groups" ON "public"."user_pinned_groups" FOR SELECT USING ((("auth"."uid"() = "user_id") AND "public"."is_org_member"("organization_id")));



ALTER TABLE "public"."access_requests" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."assignment_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."availability_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beta_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."counseling_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."counseling_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."development_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."duty_roster_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_step_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_template_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_editors_can_delete_roster_history" ON "public"."duty_roster_history" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_roster_history"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND (("organization_memberships"."role" = 'owner'::"public"."organization_role") OR ("organization_memberships"."can_edit_calendar" = true))))));



CREATE POLICY "org_editors_can_insert_roster_history" ON "public"."duty_roster_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_roster_history"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"()) AND (("organization_memberships"."role" = 'owner'::"public"."organization_role") OR ("organization_memberships"."can_edit_calendar" = true))))));



CREATE POLICY "org_members_can_select_roster_history" ON "public"."duty_roster_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships"
  WHERE (("organization_memberships"."organization_id" = "duty_roster_history"."organization_id") AND ("organization_memberships"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."personnel" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_extended_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_onboardings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_trainings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rating_scheme_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registration_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."special_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."status_types" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."training_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_pinned_groups" ENABLE ROW LEVEL SECURITY;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";















































































































































































GRANT ALL ON FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_calendar"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_personnel"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_training"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_org_members"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_calendar"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_personnel"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_training"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_training"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_training"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_sandboxes"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_sandboxes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_sandboxes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") TO "service_role";




GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("p_name" "text") TO "service_role";




GRANT ALL ON FUNCTION "public"."create_demo_sandbox"("p_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_demo_sandbox"("p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_demo_sandbox"("p_session_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_org_with_owner"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_org_with_owner"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_org_with_owner"("p_name" "text") TO "service_role";




GRANT ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_owner"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";




GRANT ALL ON FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_org_ownership"("p_organization_id" "uuid", "p_new_owner_id" "uuid") TO "service_role";




GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."access_requests" TO "anon";
GRANT ALL ON TABLE "public"."access_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."access_requests" TO "service_role";




GRANT ALL ON TABLE "public"."assignment_types" TO "anon";
GRANT ALL ON TABLE "public"."assignment_types" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_types" TO "service_role";



GRANT ALL ON TABLE "public"."availability_entries" TO "anon";
GRANT ALL ON TABLE "public"."availability_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_entries" TO "service_role";



GRANT ALL ON TABLE "public"."beta_feedback" TO "anon";
GRANT ALL ON TABLE "public"."beta_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."counseling_records" TO "anon";
GRANT ALL ON TABLE "public"."counseling_records" TO "authenticated";
GRANT ALL ON TABLE "public"."counseling_records" TO "service_role";



GRANT ALL ON TABLE "public"."counseling_types" TO "anon";
GRANT ALL ON TABLE "public"."counseling_types" TO "authenticated";
GRANT ALL ON TABLE "public"."counseling_types" TO "service_role";



GRANT ALL ON TABLE "public"."daily_assignments" TO "anon";
GRANT ALL ON TABLE "public"."daily_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."development_goals" TO "anon";
GRANT ALL ON TABLE "public"."development_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."development_goals" TO "service_role";



GRANT ALL ON TABLE "public"."duty_roster_history" TO "anon";
GRANT ALL ON TABLE "public"."duty_roster_history" TO "authenticated";
GRANT ALL ON TABLE "public"."duty_roster_history" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_step_progress" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_step_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_step_progress" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_template_steps" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_template_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_template_steps" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invitations" TO "anon";
GRANT ALL ON TABLE "public"."organization_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."organization_memberships" TO "anon";
GRANT ALL ON TABLE "public"."organization_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";




GRANT ALL ON TABLE "public"."personnel" TO "anon";
GRANT ALL ON TABLE "public"."personnel" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_extended_info" TO "anon";
GRANT ALL ON TABLE "public"."personnel_extended_info" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_extended_info" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_onboardings" TO "anon";
GRANT ALL ON TABLE "public"."personnel_onboardings" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_onboardings" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_trainings" TO "anon";
GRANT ALL ON TABLE "public"."personnel_trainings" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_trainings" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."rating_scheme_entries" TO "anon";
GRANT ALL ON TABLE "public"."rating_scheme_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."rating_scheme_entries" TO "service_role";



GRANT ALL ON TABLE "public"."registration_invites" TO "anon";
GRANT ALL ON TABLE "public"."registration_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."registration_invites" TO "service_role";



GRANT ALL ON TABLE "public"."special_days" TO "anon";
GRANT ALL ON TABLE "public"."special_days" TO "authenticated";
GRANT ALL ON TABLE "public"."special_days" TO "service_role";



GRANT ALL ON TABLE "public"."status_types" TO "anon";
GRANT ALL ON TABLE "public"."status_types" TO "authenticated";
GRANT ALL ON TABLE "public"."status_types" TO "service_role";




GRANT ALL ON TABLE "public"."training_types" TO "anon";
GRANT ALL ON TABLE "public"."training_types" TO "authenticated";
GRANT ALL ON TABLE "public"."training_types" TO "service_role";



GRANT ALL ON TABLE "public"."user_pinned_groups" TO "anon";
GRANT ALL ON TABLE "public"."user_pinned_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."user_pinned_groups" TO "service_role";










ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































