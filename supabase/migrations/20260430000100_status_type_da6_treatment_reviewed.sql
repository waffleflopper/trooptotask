ALTER TABLE public.status_types
ADD COLUMN IF NOT EXISTS da6_treatment_reviewed boolean NOT NULL DEFAULT false;

UPDATE public.status_types
SET da6_treatment_reviewed = true
WHERE da6_availability_treatment IS NOT NULL
	OR lower(trim(name)) IN ('appointment', 'appointments');
