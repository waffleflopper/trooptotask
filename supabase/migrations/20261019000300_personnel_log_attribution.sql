-- The Log and Archived tabs show who completed a follow-up, who archived an item, and when a note changed.
-- completed_by and archived_by store the acting member's user id; readers resolve it to a label.
-- Only an archive through the Personnel detail page records archived_by; a Person archive leaves it null.
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

COMMIT;
