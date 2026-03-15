-- ============================================================
-- Multi-Template Onboarding Migration
-- Run manually after deploying the app code changes.
-- ============================================================

-- 1. New onboarding_templates table
CREATE TABLE onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT onboarding_templates_org_name_unique UNIQUE (organization_id, name)
);

CREATE INDEX onboarding_templates_org_idx ON onboarding_templates(organization_id);
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view onboarding templates"
  ON onboarding_templates FOR SELECT
  USING (can_view_personnel(organization_id));

CREATE POLICY "org editors can manage onboarding templates"
  ON onboarding_templates FOR ALL
  USING (can_edit_personnel(organization_id))
  WITH CHECK (can_edit_personnel(organization_id));

-- 2. Add template_id FK to onboarding_template_steps
ALTER TABLE onboarding_template_steps
  ADD COLUMN template_id UUID REFERENCES onboarding_templates(id) ON DELETE CASCADE;

-- 3. Add template_id FK to personnel_onboardings (nullable for historical rows)
ALTER TABLE personnel_onboardings
  ADD COLUMN template_id UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL;

-- 4. Add template_step_id FK to onboarding_step_progress (nullable for historical rows)
--    ON DELETE SET NULL: deleting a template step leaves progress row intact but unlinked
ALTER TABLE onboarding_step_progress
  ADD COLUMN template_step_id UUID REFERENCES onboarding_template_steps(id) ON DELETE SET NULL;

-- 5. Data migration: create a "Default" template per org and link existing steps
INSERT INTO onboarding_templates (id, organization_id, name)
SELECT gen_random_uuid(), organization_id, 'Default'
FROM (SELECT DISTINCT organization_id FROM onboarding_template_steps) orgs;

UPDATE onboarding_template_steps ots
SET template_id = t.id
FROM onboarding_templates t
WHERE t.organization_id = ots.organization_id
  AND ots.template_id IS NULL;

-- 6. Make template_id NOT NULL on onboarding_template_steps after backfill
ALTER TABLE onboarding_template_steps
  ALTER COLUMN template_id SET NOT NULL;

-- NOTE: personnel_onboardings.template_id and onboarding_step_progress.template_step_id
-- intentionally remain nullable for historical rows.
