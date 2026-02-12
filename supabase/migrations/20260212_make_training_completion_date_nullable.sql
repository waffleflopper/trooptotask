-- Make completion_date nullable for never-expires training types
-- This allows marking training as complete without specifying a date

ALTER TABLE public.personnel_trainings
ALTER COLUMN completion_date DROP NOT NULL;

COMMENT ON COLUMN public.personnel_trainings.completion_date IS 'Date training was completed. NULL is allowed for never-expires training when marked complete without a specific date.';
