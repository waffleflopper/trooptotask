-- Fix special_days type constraint: rename 'clinic-closure' to 'org-closure'
-- This was missed during the clinic -> organization rename

-- Step 1: Drop the old constraint first (it only allows 'clinic-closure')
ALTER TABLE public.special_days DROP CONSTRAINT IF EXISTS special_days_type_check;

-- Step 2: Update any existing records that have the old value
UPDATE public.special_days
SET type = 'org-closure'
WHERE type = 'clinic-closure';

-- Step 3: Add the new constraint with correct value
ALTER TABLE public.special_days
ADD CONSTRAINT special_days_type_check
CHECK (type IN ('federal-holiday', 'org-closure'));
