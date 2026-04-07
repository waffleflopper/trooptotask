-- ============================================================
-- Advanced duty preview override audit and conflict persistence
-- Run manually after deploying the app code changes.
-- ============================================================

ALTER TABLE public.duty_events
  ADD COLUMN IF NOT EXISTS original_proposal JSONB;

ALTER TABLE public.duty_event_slots
  DROP CONSTRAINT IF EXISTS duty_event_slots_warning_state_check;

DO $$
BEGIN
  ALTER TABLE public.duty_event_slots
    ADD CONSTRAINT duty_event_slots_warning_state_check
    CHECK (warning_state IN ('none', 'warning', 'conflict'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
