-- The Data sheet shows when a marital status began and who last saved the sheet.
-- updated_by stores the saving member's user id; readers resolve it to a label.
BEGIN;

ALTER TABLE public.personnel_extended_info
  ADD COLUMN marital_status_date date NULL,
  ADD COLUMN updated_by text NULL;

COMMIT;
