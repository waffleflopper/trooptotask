ALTER TABLE public.duty_template_slots
ADD COLUMN IF NOT EXISTS blocking_mode TEXT NOT NULL DEFAULT 'inherit';

ALTER TABLE public.duty_template_slots
DROP CONSTRAINT IF EXISTS duty_template_slots_blocking_mode_check;

ALTER TABLE public.duty_template_slots
ADD CONSTRAINT duty_template_slots_blocking_mode_check
CHECK (blocking_mode IN ('inherit', 'blocking', 'non-blocking'));

UPDATE public.duty_template_slots
SET blocking_mode = 'inherit'
WHERE blocking_mode IS NULL;
