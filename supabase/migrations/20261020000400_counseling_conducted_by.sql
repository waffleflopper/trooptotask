-- A counseling record names the leader who held the session, which is often not the member who uploaded it.
-- conducted_by is free text typed by the uploader, not an attribution column, so it is not stamped from auth.uid().
BEGIN;

ALTER TABLE public.counseling_records
  ADD COLUMN conducted_by text NULL
  CONSTRAINT counseling_records_conducted_by_check
  CHECK (conducted_by IS NULL OR (conducted_by = btrim(conducted_by) AND char_length(conducted_by) BETWEEN 1 AND 120));

COMMIT;
