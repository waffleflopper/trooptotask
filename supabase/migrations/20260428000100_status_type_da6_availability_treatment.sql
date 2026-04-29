ALTER TABLE public.status_types
ADD COLUMN IF NOT EXISTS da6_availability_treatment text;

ALTER TABLE public.status_types
DROP CONSTRAINT IF EXISTS status_types_da6_availability_treatment_check;

ALTER TABLE public.status_types
ADD CONSTRAINT status_types_da6_availability_treatment_check
CHECK (
	da6_availability_treatment IS NULL
	OR da6_availability_treatment IN ('authorized-absence', 'other-duty', 'misconduct-unavailable')
);

UPDATE public.status_types
SET da6_availability_treatment =
	CASE
		WHEN lower(trim(name)) IN ('leave', 'school', 'tdy', 'training / tdy', 'sick') THEN 'authorized-absence'
		WHEN lower(trim(name)) IN ('cq/sd', 'cq / sd', 'other duty', 'other duty / detail', 'detail') THEN 'other-duty'
		ELSE NULL
	END
WHERE da6_availability_treatment IS NULL;
