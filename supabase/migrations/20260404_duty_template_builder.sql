-- ============================================================
-- Advanced duty template foundation
-- Run manually after deploying the app code changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.duty_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'advanced',
  status TEXT NOT NULL DEFAULT 'draft',
  name TEXT NOT NULL,
  description TEXT,
  scope_type TEXT NOT NULL DEFAULT 'organization',
  scope_group_ids UUID[] NOT NULL DEFAULT '{}',
  coverage_mode TEXT NOT NULL DEFAULT 'all-day',
  start_time TEXT,
  end_time TEXT,
  is_blocking BOOLEAN NOT NULL DEFAULT false,
  cooldown_hours INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duty_templates_mode_check CHECK (mode IN ('simple', 'advanced')),
  CONSTRAINT duty_templates_status_check CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT duty_templates_scope_type_check CHECK (scope_type IN ('organization', 'groups')),
  CONSTRAINT duty_templates_coverage_mode_check CHECK (coverage_mode IN ('all-day', 'timed')),
  CONSTRAINT duty_templates_cooldown_hours_check CHECK (cooldown_hours >= 0)
);

CREATE INDEX IF NOT EXISTS duty_templates_org_idx ON public.duty_templates(organization_id);
CREATE INDEX IF NOT EXISTS duty_templates_org_mode_idx ON public.duty_templates(organization_id, mode);

CREATE TABLE IF NOT EXISTS public.duty_template_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.duty_templates(id) ON DELETE CASCADE,
  role_label TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  allowed_ranks TEXT[] NOT NULL DEFAULT '{}',
  allowed_group_ids UUID[] NOT NULL DEFAULT '{}',
  allowed_mos_values TEXT[] NOT NULL DEFAULT '{}',
  allowed_role_values TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duty_template_slots_quantity_check CHECK (quantity >= 1),
  CONSTRAINT duty_template_slots_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS duty_template_slots_org_idx ON public.duty_template_slots(organization_id);
CREATE INDEX IF NOT EXISTS duty_template_slots_template_idx ON public.duty_template_slots(template_id, sort_order);

ALTER TABLE public.duty_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_template_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view duty templates if they can view calendar data"
  ON public.duty_templates
  FOR SELECT
  USING (public.can_view_calendar(organization_id));

CREATE POLICY "Org admins can manage duty templates"
  ON public.duty_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_templates.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_templates.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can view duty template slots if they can view calendar data"
  ON public.duty_template_slots
  FOR SELECT
  USING (public.can_view_calendar(organization_id));

CREATE POLICY "Org admins can manage duty template slots"
  ON public.duty_template_slots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_template_slots.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_template_slots.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  );

GRANT ALL ON TABLE public.duty_templates TO anon;
GRANT ALL ON TABLE public.duty_templates TO authenticated;
GRANT ALL ON TABLE public.duty_templates TO service_role;

GRANT ALL ON TABLE public.duty_template_slots TO anon;
GRANT ALL ON TABLE public.duty_template_slots TO authenticated;
GRANT ALL ON TABLE public.duty_template_slots TO service_role;
