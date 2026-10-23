-- Every status type says what it does to a person's place on a duty roster:
-- they can still be picked, or one of the three DA PAM 220-45 codes. Existing
-- and new status types read A (away, the count holds), which is how the planner
-- treats every status today. The same policies that govern the rest of
-- status_types govern the column.
BEGIN;

ALTER TABLE public.status_types
  ADD COLUMN roster_effect text NOT NULL DEFAULT 'A'
    CONSTRAINT status_types_roster_effect_check CHECK (roster_effect IN ('available', 'A', 'D', 'U'));

COMMIT;
