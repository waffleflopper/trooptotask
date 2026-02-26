-- Add expiration_date_only flag to training_types
-- When true, records store an expiration date directly rather than a completion date + duration

ALTER TABLE training_types
  ADD COLUMN IF NOT EXISTS expiration_date_only BOOLEAN NOT NULL DEFAULT FALSE;
