-- ============================================================
-- Add exempt_personnel_ids to duty_templates
-- Allows permanently exempting individual personnel from being
-- selected by the advanced duty generation engine.
-- Run manually after deploying the app code changes.
-- ============================================================

ALTER TABLE public.duty_templates
  ADD COLUMN IF NOT EXISTS exempt_personnel_ids UUID[] NOT NULL DEFAULT '{}';
