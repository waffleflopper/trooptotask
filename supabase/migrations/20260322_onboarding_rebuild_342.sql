-- Issue #342: Onboarding Rebuild - Start Onboarding + Checkbox Steps
-- Adds cancelled_at for lifecycle tracking, active flag for resync step deactivation,
-- and organization_id on step progress to align with DataStore port convention.

-- 1. Add cancelled_at to personnel_onboardings (nullable, used when status = 'cancelled')
ALTER TABLE personnel_onboardings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 2. Add active flag to onboarding_step_progress (default true, false = deactivated by resync)
ALTER TABLE onboarding_step_progress
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Add organization_id to onboarding_step_progress for DataStore port compatibility
--    All tables accessed through DataStore must have organization_id for scoped queries.
ALTER TABLE onboarding_step_progress
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from parent personnel_onboardings
UPDATE onboarding_step_progress osp
SET organization_id = po.organization_id
FROM personnel_onboardings po
WHERE osp.onboarding_id = po.id
  AND osp.organization_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE onboarding_step_progress
  ALTER COLUMN organization_id SET NOT NULL;
