-- Record when each Onboarding step last moved, so the List can flag a
-- Paperwork step stuck on one stage. A note append is not progress, so
-- updated_at is not reused. Existing rows start counting at this migration.
ALTER TABLE public.onboarding_step_progress
	ADD COLUMN progress_changed_at timestamptz NOT NULL DEFAULT now();

CREATE FUNCTION onboarding_private.touch_step_progress_changed_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
	IF (NEW.completed, NEW.current_stage) IS DISTINCT FROM (OLD.completed, OLD.current_stage) THEN
		NEW.progress_changed_at := now();
	END IF;
	RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION onboarding_private.touch_step_progress_changed_at()
	FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER touch_step_progress_changed_at
	BEFORE UPDATE ON public.onboarding_step_progress
	FOR EACH ROW EXECUTE FUNCTION onboarding_private.touch_step_progress_changed_at();
