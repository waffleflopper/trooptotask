-- Saved Calendar assignments are authoritative. D01 captured old run/date
-- provenance before this migration; retain every assignment and type row.
ALTER TABLE public.daily_assignments
  DROP CONSTRAINT daily_assignments_duty_roster_template_run_id_fkey;

DROP INDEX public.daily_assignments_duty_roster_template_run_idx;

ALTER TABLE public.daily_assignments
  DROP COLUMN duty_roster_template_run_id,
  DROP COLUMN duty_roster_template_run_row_date;
