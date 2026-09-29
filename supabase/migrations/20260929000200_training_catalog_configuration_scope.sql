-- #1356: shared Training types and views require Organization-wide configure.
-- Existing catalog rows and the Training view read policy stay unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_training_configuration(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.member_access_has_capability(p_organization_id, 'training', 'configure')
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
        AND (m.role IN ('owner', 'admin') OR m.access_scope_kind = 'organization')
    );
$$;

ALTER FUNCTION public.can_manage_training_configuration(uuid) OWNER TO postgres;

DROP POLICY "Training editors can create views" ON public.training_views;
DROP POLICY "Training editors can update views" ON public.training_views;
DROP POLICY "Training editors can delete views" ON public.training_views;

CREATE POLICY "Training configurators can create views"
ON public.training_views FOR INSERT
WITH CHECK (public.can_manage_training_configuration(organization_id));

CREATE POLICY "Training configurators can update views"
ON public.training_views FOR UPDATE
USING (public.can_manage_training_configuration(organization_id))
WITH CHECK (public.can_manage_training_configuration(organization_id));

CREATE POLICY "Training configurators can delete views"
ON public.training_views FOR DELETE
USING (public.can_manage_training_configuration(organization_id));

-- The Organization/type pair governs new references and same-Organization
-- deletion effects. NOT VALID keeps historical cross-Organization references
-- present until they can be reviewed separately.
ALTER TABLE public.training_types
  ADD CONSTRAINT training_types_organization_id_id_key UNIQUE (organization_id, id);

-- Both Onboarding references are optional; these narrow indexes serve the
-- existing ID lookup and the new Organization/type delete action.
CREATE INDEX onboarding_template_steps_training_type_org_idx
  ON public.onboarding_template_steps (training_type_id, organization_id)
  WHERE training_type_id IS NOT NULL;
CREATE INDEX onboarding_step_progress_training_type_org_idx
  ON public.onboarding_step_progress (training_type_id, organization_id)
  WHERE training_type_id IS NOT NULL;

ALTER TABLE public.personnel_trainings
  ADD CONSTRAINT personnel_trainings_org_training_type_fkey
  FOREIGN KEY (organization_id, training_type_id)
  REFERENCES public.training_types (organization_id, id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.onboarding_template_steps
  ADD CONSTRAINT onboarding_template_steps_org_training_type_fkey
  FOREIGN KEY (organization_id, training_type_id)
  REFERENCES public.training_types (organization_id, id)
  ON DELETE SET NULL (training_type_id)
  NOT VALID;

ALTER TABLE public.onboarding_step_progress
  ADD CONSTRAINT onboarding_step_progress_org_training_type_fkey
  FOREIGN KEY (organization_id, training_type_id)
  REFERENCES public.training_types (organization_id, id)
  ON DELETE SET NULL (training_type_id)
  NOT VALID;

-- Keep the ID references for legacy rows, but stop their global CASCADE and
-- SET NULL actions. A foreign reference then rejects the parent deletion at
-- transaction end, rolling back the same-Organization actions as well.
ALTER TABLE public.personnel_trainings
  DROP CONSTRAINT personnel_trainings_training_type_id_fkey;
ALTER TABLE public.personnel_trainings
  ADD CONSTRAINT personnel_trainings_training_type_id_fkey
  FOREIGN KEY (training_type_id)
  REFERENCES public.training_types (id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED
  NOT VALID;

ALTER TABLE public.onboarding_template_steps
  DROP CONSTRAINT onboarding_template_steps_training_type_id_fkey;
ALTER TABLE public.onboarding_template_steps
  ADD CONSTRAINT onboarding_template_steps_training_type_id_fkey
  FOREIGN KEY (training_type_id)
  REFERENCES public.training_types (id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED
  NOT VALID;

ALTER TABLE public.onboarding_step_progress
  DROP CONSTRAINT onboarding_step_progress_training_type_id_fkey;
ALTER TABLE public.onboarding_step_progress
  ADD CONSTRAINT onboarding_step_progress_training_type_id_fkey
  FOREIGN KEY (training_type_id)
  REFERENCES public.training_types (id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED
  NOT VALID;

COMMIT;
