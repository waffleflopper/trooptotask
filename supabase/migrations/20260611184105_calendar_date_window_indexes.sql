CREATE INDEX IF NOT EXISTS idx_availability_entries_org_end_start
ON public.availability_entries USING btree (organization_id, end_date, start_date);

CREATE INDEX IF NOT EXISTS idx_availability_entries_org_start_end
ON public.availability_entries USING btree (organization_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_daily_assignments_org_date
ON public.daily_assignments USING btree (organization_id, date);

CREATE INDEX IF NOT EXISTS idx_special_days_org_date
ON public.special_days USING btree (organization_id, date);
