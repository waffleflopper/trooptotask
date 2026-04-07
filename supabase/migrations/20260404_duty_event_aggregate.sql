-- ============================================================
-- Advanced duty event aggregate
-- Run manually after deploying the app code changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.duty_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.duty_templates(id) ON DELETE RESTRICT,
  template_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  coverage_mode TEXT NOT NULL DEFAULT 'timed',
  coverage_start TEXT NOT NULL,
  coverage_end TEXT NOT NULL,
  is_blocking BOOLEAN NOT NULL DEFAULT false,
  cooldown_hours INTEGER NOT NULL DEFAULT 0,
  rules_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  fill_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  collision_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duty_events_coverage_mode_check CHECK (coverage_mode IN ('all-day', 'timed')),
  CONSTRAINT duty_events_cooldown_hours_check CHECK (cooldown_hours >= 0)
);

CREATE INDEX IF NOT EXISTS duty_events_org_idx ON public.duty_events(organization_id);
CREATE INDEX IF NOT EXISTS duty_events_org_start_idx ON public.duty_events(organization_id, coverage_start DESC);
CREATE INDEX IF NOT EXISTS duty_events_template_idx ON public.duty_events(template_id);

CREATE TABLE IF NOT EXISTS public.duty_event_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  duty_event_id UUID NOT NULL REFERENCES public.duty_events(id) ON DELETE CASCADE,
  template_slot_id UUID REFERENCES public.duty_template_slots(id) ON DELETE SET NULL,
  role_label TEXT NOT NULL,
  slot_index INTEGER NOT NULL DEFAULT 0,
  assignee_id UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  assignment_source TEXT NOT NULL DEFAULT 'generated',
  warning_state TEXT NOT NULL DEFAULT 'none',
  unfilled_reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duty_event_slots_slot_index_check CHECK (slot_index >= 0),
  CONSTRAINT duty_event_slots_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT duty_event_slots_assignment_source_check CHECK (assignment_source IN ('generated', 'manual', 'locked')),
  CONSTRAINT duty_event_slots_warning_state_check CHECK (warning_state IN ('none', 'warning'))
);

CREATE INDEX IF NOT EXISTS duty_event_slots_org_idx ON public.duty_event_slots(organization_id);
CREATE INDEX IF NOT EXISTS duty_event_slots_event_idx ON public.duty_event_slots(duty_event_id, sort_order);
CREATE INDEX IF NOT EXISTS duty_event_slots_assignee_idx ON public.duty_event_slots(assignee_id);

ALTER TABLE public.duty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_event_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view duty events if they can view calendar data"
  ON public.duty_events
  FOR SELECT
  USING (public.can_view_calendar(organization_id));

CREATE POLICY "Org admins can manage duty events"
  ON public.duty_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_events.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_events.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can view duty event slots if they can view calendar data"
  ON public.duty_event_slots
  FOR SELECT
  USING (public.can_view_calendar(organization_id));

CREATE POLICY "Org admins can manage duty event slots"
  ON public.duty_event_slots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_event_slots.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_event_slots.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  );

GRANT ALL ON TABLE public.duty_events TO anon;
GRANT ALL ON TABLE public.duty_events TO authenticated;
GRANT ALL ON TABLE public.duty_events TO service_role;

GRANT ALL ON TABLE public.duty_event_slots TO anon;
GRANT ALL ON TABLE public.duty_event_slots TO authenticated;
GRANT ALL ON TABLE public.duty_event_slots TO service_role;
