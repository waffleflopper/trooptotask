ALTER TABLE training_types ADD COLUMN can_be_exempted boolean NOT NULL DEFAULT false;
ALTER TABLE training_types ADD COLUMN exempt_personnel_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
