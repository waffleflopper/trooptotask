-- ============================================================
-- Advanced duty rotation pools and fairness metadata
-- Run manually after deploying the app code changes.
-- ============================================================

ALTER TABLE public.duty_template_slots
  ADD COLUMN IF NOT EXISTS preferred_group_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rotation_pool_key TEXT;

UPDATE public.duty_template_slots
SET rotation_pool_key = COALESCE(NULLIF(rotation_pool_key, ''), CONCAT('slot-', GREATEST(sort_order, 0) + 1))
WHERE rotation_pool_key IS NULL OR rotation_pool_key = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.duty_template_slots
    WHERE rotation_pool_key IS NULL OR rotation_pool_key = ''
  ) THEN
    EXECUTE 'ALTER TABLE public.duty_template_slots ALTER COLUMN rotation_pool_key SET NOT NULL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.duty_template_rotation_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.duty_templates(id) ON DELETE CASCADE,
  rotation_pool_key TEXT NOT NULL,
  person_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  last_served_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS duty_template_rotation_baselines_org_idx
  ON public.duty_template_rotation_baselines(organization_id);

CREATE INDEX IF NOT EXISTS duty_template_rotation_baselines_template_pool_idx
  ON public.duty_template_rotation_baselines(template_id, rotation_pool_key, last_served_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS duty_template_rotation_baselines_template_pool_person_uidx
  ON public.duty_template_rotation_baselines(template_id, rotation_pool_key, person_id);

ALTER TABLE public.duty_template_rotation_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view duty template rotation baselines if they can view calendar data"
  ON public.duty_template_rotation_baselines
  FOR SELECT
  USING (public.can_view_calendar(organization_id));

CREATE POLICY "Org admins can manage duty template rotation baselines"
  ON public.duty_template_rotation_baselines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_template_rotation_baselines.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_template_rotation_baselines.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  );

GRANT ALL ON TABLE public.duty_template_rotation_baselines TO anon;
GRANT ALL ON TABLE public.duty_template_rotation_baselines TO authenticated;
GRANT ALL ON TABLE public.duty_template_rotation_baselines TO service_role;

ALTER TABLE public.duty_event_slots
  ADD COLUMN IF NOT EXISTS fairness_confidence TEXT NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS selection_reason TEXT;

ALTER TABLE public.duty_event_slots
  DROP CONSTRAINT IF EXISTS duty_event_slots_fairness_confidence_check;

ALTER TABLE public.duty_event_slots
  ADD CONSTRAINT duty_event_slots_fairness_confidence_check
  CHECK (fairness_confidence IN ('high', 'low'));
