-- #1360: new Personnel Group links must stay within their Organization.
-- Retain historical mismatches for separate review; do not reassign or remove rows.
BEGIN;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_organization_id_id_key UNIQUE (organization_id, id);

-- Existing idx_personnel_group supports both Group reference lookups. Only
-- group_id clears on a valid parent deletion; Personnel identity and history stay.
ALTER TABLE public.personnel
  ADD CONSTRAINT personnel_organization_group_fkey
  FOREIGN KEY (organization_id, group_id)
  REFERENCES public.groups (organization_id, id)
  ON DELETE SET NULL (group_id)
  NOT VALID;

-- The old global SET NULL action could alter another Organization's historical
-- rows. Keep the ID reference without that action. Defer its check so the
-- composite action can clear valid links, while a legacy foreign link rejects
-- the entire parent deletion at transaction end.
ALTER TABLE public.personnel
  DROP CONSTRAINT personnel_group_id_fkey;
ALTER TABLE public.personnel
  ADD CONSTRAINT personnel_group_id_fkey
  FOREIGN KEY (group_id)
  REFERENCES public.groups (id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED
  NOT VALID;

-- Personnel readers select this relationship by its composite constraint name.
NOTIFY pgrst, 'reload schema';

COMMIT;
