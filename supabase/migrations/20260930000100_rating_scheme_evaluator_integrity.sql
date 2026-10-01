-- #1364: new or changed internal evaluator links stay within their Organization.
-- Preserve historical mismatches for separate review; do not rewrite saved rows.
BEGIN;

ALTER TABLE public.personnel
  ADD CONSTRAINT personnel_organization_id_id_key UNIQUE (organization_id, id);

-- Both composite deletion effects and retained global ID guards probe these
-- nullable columns. Avoid repeated full-table scans during Person deletion.
CREATE INDEX rating_scheme_entries_rater_idx ON public.rating_scheme_entries (rater_person_id)
  WHERE rater_person_id IS NOT NULL;
CREATE INDEX rating_scheme_entries_senior_rater_idx ON public.rating_scheme_entries (senior_rater_person_id)
  WHERE senior_rater_person_id IS NOT NULL;
CREATE INDEX rating_scheme_entries_intermediate_rater_idx ON public.rating_scheme_entries (intermediate_rater_person_id)
  WHERE intermediate_rater_person_id IS NOT NULL;
CREATE INDEX rating_scheme_entries_reviewer_idx ON public.rating_scheme_entries (reviewer_person_id)
  WHERE reviewer_person_id IS NOT NULL;

ALTER TABLE public.rating_scheme_entries
  ADD CONSTRAINT rating_scheme_entries_organization_rater_fkey
  FOREIGN KEY (organization_id, rater_person_id)
  REFERENCES public.personnel (organization_id, id)
  ON DELETE SET NULL (rater_person_id) NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_organization_senior_rater_fkey
  FOREIGN KEY (organization_id, senior_rater_person_id)
  REFERENCES public.personnel (organization_id, id)
  ON DELETE SET NULL (senior_rater_person_id) NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_organization_intermediate_rater_fkey
  FOREIGN KEY (organization_id, intermediate_rater_person_id)
  REFERENCES public.personnel (organization_id, id)
  ON DELETE SET NULL (intermediate_rater_person_id) NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_organization_reviewer_fkey
  FOREIGN KEY (organization_id, reviewer_person_id)
  REFERENCES public.personnel (organization_id, id)
  ON DELETE SET NULL (reviewer_person_id) NOT VALID;

-- Global SET NULL could alter another Organization's historical evaluation.
-- Keep each ID reference, deferring its check so all valid composite SET NULL
-- actions can finish. A legacy foreign link rejects the entire Person deletion
-- at transaction end, including any local clearing or dependent cascades.
ALTER TABLE public.rating_scheme_entries
  DROP CONSTRAINT rating_scheme_entries_rater_person_id_fkey,
  DROP CONSTRAINT rating_scheme_entries_senior_rater_person_id_fkey,
  DROP CONSTRAINT rating_scheme_entries_intermediate_rater_person_id_fkey,
  DROP CONSTRAINT rating_scheme_entries_reviewer_person_id_fkey;
ALTER TABLE public.rating_scheme_entries
  ADD CONSTRAINT rating_scheme_entries_rater_person_id_fkey
  FOREIGN KEY (rater_person_id) REFERENCES public.personnel (id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_senior_rater_person_id_fkey
  FOREIGN KEY (senior_rater_person_id) REFERENCES public.personnel (id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_intermediate_rater_person_id_fkey
  FOREIGN KEY (intermediate_rater_person_id) REFERENCES public.personnel (id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT rating_scheme_entries_reviewer_person_id_fkey
  FOREIGN KEY (reviewer_person_id) REFERENCES public.personnel (id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;

NOTIFY pgrst, 'reload schema';
COMMIT;
