BEGIN;

ALTER TABLE public.personnel_extended_info
  ADD COLUMN dod_id text NULL,
  ADD CONSTRAINT personnel_extended_info_dod_id_check CHECK (dod_id ~ '^[0-9]{10}$');

CREATE UNIQUE INDEX personnel_extended_info_organization_dod_id_key
  ON public.personnel_extended_info (organization_id, dod_id)
  WHERE dod_id IS NOT NULL;

GRANT SELECT (dod_id), INSERT (dod_id), UPDATE (dod_id)
  ON public.personnel_extended_info TO authenticated;

COMMIT;
