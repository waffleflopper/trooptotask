-- ============================================================
-- Advanced duty run history
-- Run manually after deploying the app code changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.duty_event_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.duty_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  pattern TEXT NOT NULL DEFAULT 'single',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  is_legacy BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duty_event_runs_pattern_check CHECK (pattern IN ('single', 'daily', 'weekday-only', 'weekend-only', 'selected-weekdays', 'holiday-closure-only', 'custom-dates')),
  CONSTRAINT duty_event_runs_event_count_check CHECK (event_count >= 0),
  CONSTRAINT duty_event_runs_date_order_check CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS duty_event_runs_org_idx ON public.duty_event_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS duty_event_runs_template_idx ON public.duty_event_runs(template_id);
CREATE INDEX IF NOT EXISTS duty_event_runs_legacy_idx ON public.duty_event_runs(organization_id, is_legacy);

ALTER TABLE public.duty_events
  ADD COLUMN IF NOT EXISTS run_id UUID;

DO $$
BEGIN
  ALTER TABLE public.duty_events
    ADD CONSTRAINT duty_events_run_id_fkey
    FOREIGN KEY (run_id) REFERENCES public.duty_event_runs(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS duty_events_run_idx ON public.duty_events(run_id, event_date);

-- Backfill existing duty events into one legacy run per org/template so prior data
-- appears in history without disappearing from the UI.
INSERT INTO public.duty_event_runs (
  organization_id,
  template_id,
  template_name,
  pattern,
  start_date,
  end_date,
  event_count,
  is_legacy,
  created_at,
  updated_at
)
SELECT
  grouped.organization_id,
  grouped.template_id,
  grouped.template_name,
  'custom-dates',
  grouped.start_date,
  grouped.end_date,
  grouped.event_count,
  true,
  now(),
  now()
FROM (
  SELECT
    organization_id,
    template_id,
    template_name,
    MIN(event_date) AS start_date,
    MAX(event_date) AS end_date,
    COUNT(*)::INTEGER AS event_count
  FROM public.duty_events
  WHERE run_id IS NULL
  GROUP BY organization_id, template_id, template_name
) AS grouped
WHERE NOT EXISTS (
  SELECT 1
  FROM public.duty_event_runs existing
  WHERE existing.organization_id = grouped.organization_id
    AND existing.template_id IS NOT DISTINCT FROM grouped.template_id
    AND existing.is_legacy = true
);

UPDATE public.duty_events events
SET run_id = runs.id
FROM public.duty_event_runs runs
WHERE events.run_id IS NULL
  AND runs.organization_id = events.organization_id
  AND runs.template_id IS NOT DISTINCT FROM events.template_id
  AND runs.is_legacy = true;

ALTER TABLE public.duty_event_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view duty event runs if they can view calendar data"
  ON public.duty_event_runs
  FOR SELECT
  USING (public.can_view_calendar(organization_id));

CREATE POLICY "Org admins can manage duty event runs"
  ON public.duty_event_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_event_runs.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships
      WHERE organization_memberships.organization_id = duty_event_runs.organization_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('owner', 'admin')
    )
  );

GRANT ALL ON TABLE public.duty_event_runs TO anon;
GRANT ALL ON TABLE public.duty_event_runs TO authenticated;
GRANT ALL ON TABLE public.duty_event_runs TO service_role;
