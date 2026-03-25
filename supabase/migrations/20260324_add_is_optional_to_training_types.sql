-- Add is_optional column to training_types
-- When true, the training type is tracked but not required for anyone.
-- People without records show N/A; people with records show their actual status.
ALTER TABLE training_types ADD COLUMN is_optional boolean NOT NULL DEFAULT false;
