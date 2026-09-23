-- Calendar availability keeps its status rows and ordinary presentation fields.
-- The retired DA6 classifier and its check have no retained consumers.
ALTER TABLE public.status_types
  DROP CONSTRAINT status_types_da6_availability_treatment_check,
  DROP COLUMN da6_availability_treatment,
  DROP COLUMN da6_treatment_reviewed;
