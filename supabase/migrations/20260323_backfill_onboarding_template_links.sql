-- Issue #348: Stamp template steps onto legacy onboardings that have no step progress rows
--
-- The old onboarding system's step progress data was lost. Existing in-progress
-- onboardings have a template_id but zero onboarding_step_progress rows,
-- so they show as 0/0 in the UI.
--
-- This migration snapshots each onboarding's template steps into step progress rows,
-- the same way startOnboarding() does for new onboardings.
--
-- Only affects onboardings that have a template_id AND zero existing step progress rows.
-- Safe to re-run.

INSERT INTO onboarding_step_progress (
  onboarding_id,
  organization_id,
  template_step_id,
  step_name,
  step_type,
  training_type_id,
  stages,
  sort_order,
  completed,
  current_stage,
  notes,
  active
)
SELECT
  po.id AS onboarding_id,
  po.organization_id,
  ots.id AS template_step_id,
  ots.name AS step_name,
  ots.step_type,
  ots.training_type_id,
  ots.stages,
  ots.sort_order,
  false AS completed,
  CASE
    WHEN ots.step_type = 'paperwork' AND ots.stages IS NOT NULL AND jsonb_array_length(ots.stages) > 0
    THEN ots.stages->>0
    ELSE NULL
  END AS current_stage,
  '[]'::jsonb AS notes,
  true AS active
FROM personnel_onboardings po
JOIN onboarding_template_steps ots ON ots.template_id = po.template_id
WHERE po.template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM onboarding_step_progress osp
    WHERE osp.onboarding_id = po.id
  );
