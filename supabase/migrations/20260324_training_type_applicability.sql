-- Expand training type applicability from role-only to multi-dimensional rules
-- Issue #370: Expanded Applicability Rules

-- Step 1: Rename required_for_roles -> applies_to_roles
ALTER TABLE training_types RENAME COLUMN required_for_roles TO applies_to_roles;

-- Step 2: Convert wildcard ['*'] to empty array (empty = everyone in new model)
UPDATE training_types
SET applies_to_roles = '{}'
WHERE applies_to_roles = ARRAY['*'];

-- Step 3: Add new applicability columns
ALTER TABLE training_types
  ADD COLUMN applies_to_mos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN applies_to_ranks text[] NOT NULL DEFAULT '{}',
  ADD COLUMN excluded_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN excluded_mos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN excluded_ranks text[] NOT NULL DEFAULT '{}';
