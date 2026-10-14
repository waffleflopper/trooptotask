-- Upgrade preserves old facts and exposes the same scoped atomic operation.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261001000200'),
  1,'packet reconciliation migration is applied');
CREATE TEMP VIEW upgraded_packet_rows AS
  SELECT 'personnel'::text AS table_name,id AS row_id,to_jsonb(p) AS row_data FROM public.personnel p
    WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102')
  UNION ALL SELECT 'packet',id,to_jsonb(p) FROM public.personnel_onboardings p
    WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102')
  UNION ALL SELECT 'template',id,to_jsonb(p) FROM public.onboarding_templates p
    WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102')
  UNION ALL SELECT 'definition',id,to_jsonb(p) FROM public.onboarding_template_steps p
    WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102')
  UNION ALL SELECT 'progress',id,to_jsonb(p) - 'progress_changed_at' FROM public.onboarding_step_progress p
    WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102')
  UNION ALL SELECT 'training',id,to_jsonb(p) FROM public.training_types p
    WHERE organization_id='d1503000-0000-4000-8000-000000000101';
SELECT results_eq($$ SELECT * FROM upgraded_packet_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.onboarding_reconciliation_before ORDER BY table_name,row_id $$,
  'all thirty populated packet/dependency rows retain every field on upgrade');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1503000-0000-4000-8000-000000000005',true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000702','d1503000-0000-4000-8000-000000000401') $$,
  'P0002',NULL,'upgraded Group Configure still excludes another Group');
SELECT set_config('request.jwt.claim.sub','d1503000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401') $$,
  '42501',NULL,'upgraded Operate cannot perform Configure');
SELECT set_config('request.jwt.claim.sub','d1503000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000404') $$,
  'P0002',NULL,'upgraded dual membership cannot select a foreign template');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM upgraded_packet_rows ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.onboarding_reconciliation_before ORDER BY table_name,row_id $$,
  'upgraded denied requests leave all thirty populated rows unchanged');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1503000-0000-4000-8000-000000000005',true);
SELECT is(jsonb_array_length(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401')->'steps'),
  9,'upgraded in-scope Group Configure receives the complete saved history');
SELECT results_eq($$ SELECT template_step_id,completed,notes->0->>'text' FROM public.onboarding_step_progress
  WHERE id='d1503000-0000-4000-8000-000000000801' $$,
  $$ VALUES ('d1503000-0000-4000-8000-000000000504'::uuid,true,'Retained note 801'::text) $$,
  'upgraded first assignment retains the original legacy identity, completed work and attribution');
SELECT is((SELECT current_stage FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000807'),
  'Reviewed','upgraded reconciliation reuses the linked inactive paperwork stage');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
