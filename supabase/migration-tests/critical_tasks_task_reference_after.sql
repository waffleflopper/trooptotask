-- A populated upgrade keeps historical mismatches but fences all new task references.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version = '20260926000500'),
          1, 'Critical Tasks task-reference migration was recorded by the local runner');
SELECT is((SELECT convalidated FROM pg_constraint WHERE conname = 'personnel_ict_completions_org_task_fkey'),
          false, 'historical completion rows were not silently validated or changed');
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions c
           JOIN public.ict_tasks t ON t.id = c.ict_task_id
           WHERE c.id = 'b9000000-0000-4000-8000-000000000503'
             AND c.organization_id <> t.organization_id),
          1, 'preexisting foreign-Organization task reference remains historical');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b9000000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$ INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
  VALUES ('b9000000-0000-4000-8000-000000000504', 'b9000000-0000-4000-8000-000000000101',
          'b9000000-0000-4000-8000-000000000301', 'b9000000-0000-4000-8000-000000000401',
          '2026-07-01', 'Practical Exercise') $$,
  'Critical Tasks-only Group operator can write an in-Organization task reference');
SELECT throws_ok($$ INSERT INTO public.personnel_ict_completions
  (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method)
  VALUES ('b9000000-0000-4000-8000-000000000505', 'b9000000-0000-4000-8000-000000000101',
          'b9000000-0000-4000-8000-000000000301', 'b9000000-0000-4000-8000-000000000402',
          '2026-07-02', 'Practical Exercise') $$,
  '23503', NULL, 'foreign-Organization task insert fails the composite foreign key');
SELECT throws_ok($$ UPDATE public.personnel_ict_completions
  SET ict_task_id = 'b9000000-0000-4000-8000-000000000402'
  WHERE id = 'b9000000-0000-4000-8000-000000000504' $$,
  '23503', NULL, 'foreign-Organization task change fails the composite foreign key');
SELECT is((SELECT ict_task_id FROM public.personnel_ict_completions
           WHERE id = 'b9000000-0000-4000-8000-000000000504'),
          'b9000000-0000-4000-8000-000000000401'::uuid,
          'failed task reassignment leaves the allowed completion unchanged');
RESET ROLE;
SELECT lives_ok($$ DELETE FROM public.ict_tasks
  WHERE id = 'b9000000-0000-4000-8000-000000000402' $$,
  'deleting the foreign task still cascades its historical mismatch');
SELECT is((SELECT count(*)::integer FROM public.personnel_ict_completions
           WHERE id = 'b9000000-0000-4000-8000-000000000503'),
          0, 'existing task-ID relationship still removes linked historical completion');
SELECT * FROM finish();
ROLLBACK;
