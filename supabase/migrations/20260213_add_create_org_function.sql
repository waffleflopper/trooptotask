-- Migration: Add create_org_with_owner function
-- This function creates an organization and the owner membership atomically

CREATE OR REPLACE FUNCTION public.create_org_with_owner(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
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
