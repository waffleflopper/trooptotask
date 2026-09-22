-- 05-01-02-R01: align retained template configuration with the Onboarding lane.
-- Append-only policy repair; no existing rows, Personnel helpers or operational
-- onboarding policies change. Remote application requires separate authorization.
BEGIN;

CREATE FUNCTION public.can_manage_onboarding_configuration(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'onboarding', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;

-- Validate the optional reference independently of Training read permission.
-- This returns only a same-Organization association fact to Onboarding readers.
CREATE FUNCTION public.onboarding_template_training_type_matches(
  p_organization_id uuid, p_training_type_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.can_view_onboarding(p_organization_id)
    AND (p_training_type_id IS NULL OR EXISTS (
      SELECT 1 FROM public.training_types t
      WHERE t.id = p_training_type_id AND t.organization_id = p_organization_id
    ));
$$;

REVOKE ALL ON FUNCTION public.can_manage_onboarding_configuration(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onboarding_template_training_type_matches(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_onboarding_configuration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_template_training_type_matches(uuid, uuid) TO authenticated;

-- Only the user-editable fields may change. Column grants keep template identity
-- and Organization fixed, including simultaneous id/tenant changes and races.
REVOKE UPDATE ON public.onboarding_templates FROM authenticated;
GRANT UPDATE (name, description) ON public.onboarding_templates TO authenticated;

DROP POLICY "org editors can manage onboarding templates" ON public.onboarding_templates;
DROP POLICY "org members can view onboarding templates" ON public.onboarding_templates;
DROP POLICY "Org editors can manage onboarding template steps" ON public.onboarding_template_steps;
DROP POLICY "Org members can view onboarding template steps" ON public.onboarding_template_steps;

CREATE POLICY "Onboarding readers can view templates"
ON public.onboarding_templates FOR SELECT TO authenticated
USING (public.can_view_onboarding(organization_id));

CREATE POLICY "Onboarding configurators can manage templates"
ON public.onboarding_templates FOR ALL TO authenticated
USING (public.can_manage_onboarding_configuration(organization_id))
WITH CHECK (public.can_manage_onboarding_configuration(organization_id));

CREATE POLICY "Onboarding readers can view template steps"
ON public.onboarding_template_steps FOR SELECT TO authenticated
USING (
  public.can_view_onboarding(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.onboarding_templates t
    WHERE t.id = onboarding_template_steps.template_id
      AND t.organization_id = onboarding_template_steps.organization_id
  )
);

CREATE POLICY "Onboarding configurators can manage template steps"
ON public.onboarding_template_steps FOR ALL TO authenticated
USING (
  public.can_manage_onboarding_configuration(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.onboarding_templates t
    WHERE t.id = onboarding_template_steps.template_id
      AND t.organization_id = onboarding_template_steps.organization_id
  )
)
WITH CHECK (
  public.can_manage_onboarding_configuration(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.onboarding_templates t
    WHERE t.id = onboarding_template_steps.template_id
      AND t.organization_id = onboarding_template_steps.organization_id
  )
  AND public.onboarding_template_training_type_matches(organization_id, training_type_id)
);

COMMIT;
