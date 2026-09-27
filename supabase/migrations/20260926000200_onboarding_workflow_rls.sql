-- Give operational Onboarding rows their own lane and strict Personnel scope.
-- Calendar receives only active marker IDs through a narrow function. Existing
-- rows are unchanged; this migration does not alter Personnel row RLS.
BEGIN;

CREATE FUNCTION public.onboarding_personnel_scope_matches(
  p_organization_id uuid, p_personnel_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel p
    WHERE p.id = p_personnel_id AND p.organization_id = p_organization_id
      AND (
        (p.group_id IS NOT NULL AND public.member_access_group_scope_matches(p_organization_id, p.group_id))
        OR (p.group_id IS NULL AND EXISTS (
          SELECT 1 FROM public.organization_memberships m
          WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
            AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
        ))
      )
  );
$$;

CREATE FUNCTION public.onboarding_parent_scope_matches(
  p_organization_id uuid, p_onboarding_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel_onboardings po
    WHERE po.id = p_onboarding_id AND po.organization_id = p_organization_id
      AND public.onboarding_personnel_scope_matches(p_organization_id, po.personnel_id)
  );
$$;

CREATE FUNCTION public.onboarding_template_reference_matches(
  p_organization_id uuid, p_template_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_template_id IS NULL OR EXISTS (
    SELECT 1 FROM public.onboarding_templates t
    WHERE t.id = p_template_id AND t.organization_id = p_organization_id
  );
$$;

CREATE FUNCTION public.onboarding_step_references_match(
  p_organization_id uuid, p_template_step_id uuid, p_training_type_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (p_template_step_id IS NULL OR EXISTS (
    SELECT 1 FROM public.onboarding_template_steps s
    WHERE s.id = p_template_step_id AND s.organization_id = p_organization_id
  )) AND (p_training_type_id IS NULL OR EXISTS (
    SELECT 1 FROM public.training_types t
    WHERE t.id = p_training_type_id AND t.organization_id = p_organization_id
  ));
$$;

CREATE FUNCTION public.active_onboarding_calendar_personnel_ids(p_organization_id uuid)
RETURNS TABLE(personnel_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT po.personnel_id
  FROM public.personnel_onboardings po
  WHERE po.organization_id = p_organization_id AND po.status = 'in_progress'
    AND public.can_view_calendar(p_organization_id)
    AND public.onboarding_personnel_scope_matches(p_organization_id, po.personnel_id)
  ORDER BY po.personnel_id;
$$;

REVOKE ALL ON FUNCTION public.onboarding_personnel_scope_matches(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onboarding_parent_scope_matches(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onboarding_template_reference_matches(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onboarding_step_references_match(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.active_onboarding_calendar_personnel_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_personnel_scope_matches(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_parent_scope_matches(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_template_reference_matches(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_step_references_match(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_onboarding_calendar_personnel_ids(uuid) TO authenticated;

DROP POLICY "Org editors can manage onboardings" ON public.personnel_onboardings;
DROP POLICY "Org members can view onboardings" ON public.personnel_onboardings;
DROP POLICY "Org editors can manage step progress" ON public.onboarding_step_progress;
DROP POLICY "Org members can view step progress" ON public.onboarding_step_progress;

-- Personnel-view retains the existing Dashboard read, now with correct scope.
CREATE POLICY "Onboarding or Personnel readers can view scoped workflows"
ON public.personnel_onboardings FOR SELECT TO authenticated
USING (
  (public.can_view_onboarding(organization_id) OR public.can_view_personnel(organization_id))
  AND public.onboarding_personnel_scope_matches(organization_id, personnel_id)
);

CREATE POLICY "Onboarding operators can manage scoped workflows"
ON public.personnel_onboardings FOR ALL TO authenticated
USING (
  public.can_edit_onboarding(organization_id)
  AND public.onboarding_personnel_scope_matches(organization_id, personnel_id)
)
WITH CHECK (
  public.can_edit_onboarding(organization_id)
  AND public.onboarding_personnel_scope_matches(organization_id, personnel_id)
  AND public.onboarding_template_reference_matches(organization_id, template_id)
);

CREATE POLICY "Onboarding or Personnel readers can view scoped progress"
ON public.onboarding_step_progress FOR SELECT TO authenticated
USING (
  (public.can_view_onboarding(organization_id) OR public.can_view_personnel(organization_id))
  AND public.onboarding_parent_scope_matches(organization_id, onboarding_id)
);

CREATE POLICY "Onboarding operators can manage scoped progress"
ON public.onboarding_step_progress FOR ALL TO authenticated
USING (
  public.can_edit_onboarding(organization_id)
  AND public.onboarding_parent_scope_matches(organization_id, onboarding_id)
)
WITH CHECK (
  public.can_edit_onboarding(organization_id)
  AND public.onboarding_parent_scope_matches(organization_id, onboarding_id)
  AND public.onboarding_step_references_match(organization_id, template_step_id, training_type_id)
);

-- Upserts may re-send unchanged identity columns. Reject changes to their values
-- without forcing resync into one request per step.
CREATE FUNCTION public.guard_onboarding_workflow_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Onboarding row identity cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'personnel_onboardings' THEN
    IF NEW.personnel_id IS DISTINCT FROM OLD.personnel_id THEN
      RAISE EXCEPTION 'Onboarding personnel cannot change' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'onboarding_step_progress' THEN
    IF NEW.onboarding_id IS DISTINCT FROM OLD.onboarding_id THEN
      RAISE EXCEPTION 'Onboarding step parent cannot change' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_personnel_onboarding_identity
BEFORE UPDATE ON public.personnel_onboardings
FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_workflow_identity();

CREATE TRIGGER guard_onboarding_step_progress_identity
BEFORE UPDATE ON public.onboarding_step_progress
FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_workflow_identity();

COMMIT;
