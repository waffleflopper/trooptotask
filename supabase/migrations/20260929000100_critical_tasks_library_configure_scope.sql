-- #1358: task library writes follow the dedicated Critical Tasks configure lane
-- and require Organization-wide scope. Existing task and completion rows stay put.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_ict_task_library(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'criticalTasks', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;

ALTER FUNCTION public.can_manage_ict_task_library(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_ict_task_library(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_ict_task_library(uuid) TO authenticated, service_role;

DROP POLICY "Owners and admins can insert ICT task library records" ON public.ict_tasks;
DROP POLICY "Owners and admins can update ICT task library records" ON public.ict_tasks;

CREATE POLICY "Critical Tasks configurators can insert library records"
ON public.ict_tasks FOR INSERT TO authenticated
WITH CHECK (public.can_manage_ict_task_library(organization_id));

CREATE POLICY "Critical Tasks configurators can update library records"
ON public.ict_tasks FOR UPDATE TO authenticated
USING (public.can_manage_ict_task_library(organization_id))
WITH CHECK (public.can_manage_ict_task_library(organization_id));

-- Organization RLS still reserves general settings writes for owner/admin.
-- This function permits only these two Critical Tasks fields to be changed.
CREATE OR REPLACE FUNCTION public.set_critical_tasks_defaults(
  p_organization_id uuid,
  p_default_expiration_months integer,
  p_expiring_soon_warning_days integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_manage_ict_task_library(p_organization_id) THEN
    RAISE EXCEPTION 'Critical Tasks configure access with Organization scope is required' USING ERRCODE = '42501';
  END IF;
  IF p_default_expiration_months IS NOT NULL
     AND p_default_expiration_months NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Default expiration must be between 1 and 120 months' USING ERRCODE = '22023';
  END IF;
  IF p_expiring_soon_warning_days IS NOT NULL
     AND p_expiring_soon_warning_days NOT BETWEEN 1 AND 365 THEN
    RAISE EXCEPTION 'Warning window must be between 1 and 365 days' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organizations
  SET critical_tasks_default_expiration_months = p_default_expiration_months,
      critical_tasks_expiring_soon_warning_days = p_expiring_soon_warning_days
  WHERE id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

ALTER FUNCTION public.set_critical_tasks_defaults(uuid, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_critical_tasks_defaults(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_critical_tasks_defaults(uuid, integer, integer) TO authenticated, service_role;

COMMIT;
