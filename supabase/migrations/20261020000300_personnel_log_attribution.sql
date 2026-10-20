-- The Log and Archived tabs show who completed a follow-up, who archived an item, and when a note changed.
-- completed_by and archived_by store the acting member's user id; readers resolve it to a label.
-- The database stamps both columns from auth.uid() on the transition, so an API caller cannot forge or keep them.
-- Server code runs with the service role, where auth.uid() is null, and supplies the value itself.
BEGIN;

ALTER TABLE public.personnel_follow_ups
  ADD COLUMN completed_by text NULL,
  ADD COLUMN archived_by text NULL;

ALTER TABLE public.counseling_records ADD COLUMN archived_by text NULL;

ALTER TABLE public.personnel_documents ADD COLUMN archived_by text NULL;

ALTER TABLE public.leader_notes
  ADD COLUMN archived_by text NULL,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();

-- A note that was never edited was last changed when it was written.
UPDATE public.leader_notes SET updated_at = created_at;

CREATE TRIGGER update_leader_notes_updated_at
  BEFORE UPDATE ON public.leader_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION organization_private.stamp_archived_by() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_actor text := auth.uid()::text;
BEGIN
  IF NEW.archived_at IS NULL THEN
    NEW.archived_by := NULL;
  ELSIF v_actor IS NOT NULL THEN
    NEW.archived_by := CASE
      WHEN TG_OP = 'UPDATE' AND OLD.archived_at IS NOT NULL THEN OLD.archived_by
      ELSE v_actor
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION organization_private.stamp_follow_up_completed_by() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_actor text := auth.uid()::text;
  v_keeps_completion boolean := TG_OP = 'UPDATE' AND OLD.status <> 'open';
BEGIN
  -- status owns the lifecycle: reopening clears the completion, archiving and restoring keep it,
  -- and only an open (or new) follow-up becomes completed by the caller.
  IF NEW.status = 'open' THEN
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  ELSIF v_actor IS NULL THEN
    IF NEW.status = 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
  ELSIF v_keeps_completion THEN
    NEW.completed_at := OLD.completed_at;
    NEW.completed_by := OLD.completed_by;
  ELSIF NEW.status = 'completed' THEN
    NEW.completed_at := now();
    NEW.completed_by := v_actor;
  ELSE
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION organization_private.stamp_archived_by() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION organization_private.stamp_follow_up_completed_by() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.personnel_follow_ups
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();
CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.counseling_records
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();
CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.personnel_documents
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();
CREATE TRIGGER stamp_archived_by BEFORE INSERT OR UPDATE ON public.leader_notes
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_archived_by();
CREATE TRIGGER stamp_completed_by BEFORE INSERT OR UPDATE ON public.personnel_follow_ups
  FOR EACH ROW EXECUTE FUNCTION organization_private.stamp_follow_up_completed_by();

COMMIT;
