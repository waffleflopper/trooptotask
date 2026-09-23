-- D02 06-02b populated upgrade oracle. Run after the D01 fixture/before
-- suite and both forward migrations on that same disposable database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT results_eq(
  $$SELECT id, organization_id, assignment_type_id, date, assignee_id, created_at
    FROM public.daily_assignments
    WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609'
    ORDER BY id$$,
  $$VALUES
    ('a6010000-0000-4000-8000-000000000601'::uuid,'a6010000-0000-4000-8000-000000000101'::uuid,'a6010000-0000-4000-8000-000000000401'::uuid,'2030-03-09'::date,'a6010000-0000-4000-8000-000000000301'::text,'2030-01-01 00:00:01+00'::timestamptz),
    ('a6010000-0000-4000-8000-000000000602','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000402','2030-03-10','a6010000-0000-4000-8000-000000000302','2030-01-01 00:00:02+00'),
    ('a6010000-0000-4000-8000-000000000603','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000402','2030-03-11','a6010000-0000-4000-8000-000000000301','2030-01-01 00:00:03+00'),
    ('a6010000-0000-4000-8000-000000000604','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000403','2030-03-12','a6010000-0000-4000-8000-000000000202','2030-01-01 00:00:04+00'),
    ('a6010000-0000-4000-8000-000000000605','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000402','2030-03-12','a6010000-0000-4000-8000-000000000301','2030-01-01 00:00:05+00'),
    ('a6010000-0000-4000-8000-000000000606','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000402','2030-03-13','a6010000-0000-4000-8000-000000000302','2030-01-01 00:00:06+00'),
    ('a6010000-0000-4000-8000-000000000607','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000401','2030-03-10','a6010000-0000-4000-8000-000000000303','2030-01-01 00:00:07+00'),
    ('a6010000-0000-4000-8000-000000000608','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000402','2030-03-14','a6010000-0000-4000-8000-000000000301','2030-01-01 00:00:08+00'),
    ('a6010000-0000-4000-8000-000000000609','a6010000-0000-4000-8000-000000000102','a6010000-0000-4000-8000-000000000404','2030-03-10','a6010000-0000-4000-8000-000000000304','2030-01-01 00:00:09+00')$$,
  'Calendar lineage detachment preserves every independently specified saved Calendar ID, tenant, type, date, assignee and creation time'
);

SELECT results_eq(
  $$SELECT id, organization_id, name, short_name, assign_to, color, sort_order, show_in_date_header
    FROM public.assignment_types
    WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000401' AND 'a6010000-0000-4000-8000-000000000405'
    ORDER BY id$$,
  $$VALUES
    ('a6010000-0000-4000-8000-000000000401'::uuid,'a6010000-0000-4000-8000-000000000101'::uuid,'Manual Clinic'::text,'MC'::text,'personnel'::text,'#123456'::text,1::integer,false::boolean),
    ('a6010000-0000-4000-8000-000000000402','a6010000-0000-4000-8000-000000000101','Current Clinical Coverage','COV','personnel','#654321',2,true),
    ('a6010000-0000-4000-8000-000000000403','a6010000-0000-4000-8000-000000000101','Group Coverage','GC','group','#abcdef',3,false),
    ('a6010000-0000-4000-8000-000000000404','a6010000-0000-4000-8000-000000000102','Foreign Clinic','FC','personnel','#fedcba',1,false),
    ('a6010000-0000-4000-8000-000000000405','a6010000-0000-4000-8000-000000000101','Unused Generated','UG','personnel','#333333',4,false)$$,
  'Calendar lineage detachment preserves all current Calendar type labels and settings, including former generated and unused types'
);
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE date='2030-03-20'),0,'computed-only March 20 event never becomes a saved Calendar slot');
SELECT is((SELECT count(*)::integer FROM information_schema.columns
  WHERE table_schema='public' AND table_name='daily_assignments'
    AND column_name IN ('duty_roster_template_run_id','duty_roster_template_run_row_date')),
  0, 'retired run lineage columns are absent from saved Calendar assignments');
SELECT is((SELECT count(*)::integer FROM pg_constraint
  WHERE conrelid='public.daily_assignments'::regclass
    AND confrelid='public.duty_roster_template_runs'::regclass),
  0, 'no Calendar foreign key references the Duty run table');
SELECT ok(to_regclass('public.daily_assignments_duty_roster_template_run_idx') IS NULL,
  'retired run lineage index is absent');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a6010000-0000-4000-8000-000000000002',true);
SELECT results_eq($$SELECT id FROM public.daily_assignments WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609' ORDER BY id$$,
  $$VALUES ('a6010000-0000-4000-8000-000000000601'::uuid),('a6010000-0000-4000-8000-000000000602'),('a6010000-0000-4000-8000-000000000603'),('a6010000-0000-4000-8000-000000000604'),('a6010000-0000-4000-8000-000000000605'),('a6010000-0000-4000-8000-000000000606'),('a6010000-0000-4000-8000-000000000608')$$,
  'Alpha/Bravo operator still reads exactly seven in-scope saved person and Group slots');
SELECT results_eq($$SELECT id FROM public.sign_in_rosters WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901' AND 'a6010000-0000-4000-8000-000000000903' ORDER BY id$$,
  $$VALUES ('a6010000-0000-4000-8000-000000000901'::uuid)$$,'scoped operator still reads only Alpha Sign-In Roster');
WITH changed AS (UPDATE public.daily_assignments SET date='2030-03-25' WHERE id='a6010000-0000-4000-8000-000000000607' RETURNING id)
SELECT is(count(*)::integer,0,'scoped operator still cannot update hidden Charlie slot') FROM changed;
WITH removed AS (DELETE FROM public.daily_assignments WHERE id='a6010000-0000-4000-8000-000000000609' RETURNING id)
SELECT is(count(*)::integer,0,'scoped operator still cannot delete foreign Organization slot') FROM removed;
SELECT throws_ok($$INSERT INTO public.daily_assignments(organization_id,assignment_type_id,date,assignee_id) VALUES ('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000401','2030-03-16','a6010000-0000-4000-8000-000000000303')$$,'42501',NULL,'scoped operator still cannot insert Charlie person slot');
SELECT throws_ok($$UPDATE public.daily_assignments SET assignee_id='a6010000-0000-4000-8000-000000000203' WHERE id='a6010000-0000-4000-8000-000000000604'$$,'42501',NULL,'scoped operator still cannot move visible Group slot outside its scope');
WITH changed AS (UPDATE public.daily_assignments SET assignee_id='a6010000-0000-4000-8000-000000000302' WHERE id='a6010000-0000-4000-8000-000000000601' RETURNING assignee_id)
SELECT is((SELECT assignee_id FROM changed),'a6010000-0000-4000-8000-000000000302','scoped operator can still edit an in-scope person slot');
WITH changed AS (UPDATE public.daily_assignments SET assignee_id='a6010000-0000-4000-8000-000000000201' WHERE id='a6010000-0000-4000-8000-000000000604' RETURNING assignee_id)
SELECT is((SELECT assignee_id FROM changed),'a6010000-0000-4000-8000-000000000201','scoped operator can still edit an in-scope Group slot');
WITH created AS (INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES ('a6010000-0000-4000-8000-000000000610','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000401','2030-03-16','a6010000-0000-4000-8000-000000000301') RETURNING id)
SELECT is((SELECT id FROM created),'a6010000-0000-4000-8000-000000000610'::uuid,'scoped operator can still create an in-scope Calendar slot');
WITH removed AS (DELETE FROM public.daily_assignments WHERE id='a6010000-0000-4000-8000-000000000610' RETURNING id)
SELECT is((SELECT id FROM removed),'a6010000-0000-4000-8000-000000000610'::uuid,'scoped operator can still remove its new Calendar slot');
WITH changed AS (UPDATE public.sign_in_rosters SET title='Denied' WHERE id='a6010000-0000-4000-8000-000000000902' RETURNING id)
SELECT is(count(*)::integer,0,'scoped operator still cannot edit Charlie Sign-In Roster') FROM changed;
WITH changed AS (UPDATE public.sign_in_rosters SET title='Allowed Alpha Edit' WHERE id='a6010000-0000-4000-8000-000000000901' RETURNING title)
SELECT is((SELECT title FROM changed),'Allowed Alpha Edit','scoped operator can still edit its independent Sign-In Roster');
SELECT set_config('request.jwt.claim.sub','a6010000-0000-4000-8000-000000000003',true);
SELECT results_eq($$SELECT id FROM public.daily_assignments WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609'$$,$$VALUES ('a6010000-0000-4000-8000-000000000609'::uuid)$$,'foreign owner still sees only its Calendar slot');
SELECT results_eq($$SELECT id FROM public.sign_in_rosters WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901' AND 'a6010000-0000-4000-8000-000000000903'$$,$$VALUES ('a6010000-0000-4000-8000-000000000903'::uuid)$$,'foreign owner still sees only its Sign-In Roster');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609'),0,'anonymous caller still sees no fixture slots');
SELECT is((SELECT count(*)::integer FROM public.sign_in_rosters WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901' AND 'a6010000-0000-4000-8000-000000000903'),0,'anonymous caller still sees no fixture rosters');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
