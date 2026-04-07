-- Add template-level calendar status exemptions for advanced duty generation.
-- These status type ids mark personnel as day-scoped exempt when a status is active on the duty date.

ALTER TABLE public.duty_templates
  ADD COLUMN IF NOT EXISTS exempt_status_type_ids UUID[] NOT NULL DEFAULT '{}';
