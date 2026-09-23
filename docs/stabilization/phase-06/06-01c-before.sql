-- Run as a pgTAP suite against the committed 06-01c-fixture.sql, before any
-- Phase 06 retirement migration. The transaction makes CRUD probes reversible.
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
  'all nine saved slots have the independently specified IDs, tenants, types, dates, assignees and creation times'
);

SELECT results_eq(
  $$SELECT id, name, short_name, assign_to, color, sort_order, show_in_date_header
    FROM public.assignment_types
    WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000401' AND 'a6010000-0000-4000-8000-000000000405'
    ORDER BY id$$,
  $$VALUES
    ('a6010000-0000-4000-8000-000000000401'::uuid,'Manual Clinic'::text,'MC'::text,'personnel'::text,'#123456'::text,1::integer,false::boolean),
    ('a6010000-0000-4000-8000-000000000402','Current Clinical Coverage','COV','personnel','#654321',2,true),
    ('a6010000-0000-4000-8000-000000000403','Group Coverage','GC','group','#abcdef',3,false),
    ('a6010000-0000-4000-8000-000000000404','Foreign Clinic','FC','personnel','#fedcba',1,false),
    ('a6010000-0000-4000-8000-000000000405','Unused Generated','UG','personnel','#333333',4,false)$$,
  'all Calendar type IDs, current labels and ordinary settings are retained, including unused former generated type'
);

SELECT results_eq(
  $$SELECT id, duty_roster_template_run_id, duty_roster_template_run_row_date
    FROM public.daily_assignments
    WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609'
    ORDER BY id$$,
  $$VALUES
    ('a6010000-0000-4000-8000-000000000601'::uuid,NULL::uuid,NULL::date),
    ('a6010000-0000-4000-8000-000000000602','a6010000-0000-4000-8000-000000000503','2030-03-10'),
    ('a6010000-0000-4000-8000-000000000603',NULL,NULL),
    ('a6010000-0000-4000-8000-000000000604',NULL,NULL),
    ('a6010000-0000-4000-8000-000000000605',NULL,'2030-03-12'),
    ('a6010000-0000-4000-8000-000000000606','a6010000-0000-4000-8000-000000000503','2030-04-01'),
    ('a6010000-0000-4000-8000-000000000607',NULL,NULL),
    ('a6010000-0000-4000-8000-000000000608','a6010000-0000-4000-8000-000000000503',NULL),
    ('a6010000-0000-4000-8000-000000000609',NULL,NULL)$$,
  'pre-removal provenance records valid, missing and inconsistent lineage without rewriting saved facts'
);
SELECT is((SELECT assignment_type_id FROM public.duty_roster_templates WHERE id='a6010000-0000-4000-8000-000000000501'),'a6010000-0000-4000-8000-000000000402'::uuid,'former template links to the reused and renamed Calendar type');
SELECT is((SELECT template_id FROM public.duty_roster_template_runs WHERE id='a6010000-0000-4000-8000-000000000503'),'a6010000-0000-4000-8000-000000000501'::uuid,'accepted run links to former template');
SELECT is((SELECT snapshot_payload FROM public.duty_roster_template_runs WHERE id='a6010000-0000-4000-8000-000000000503'),'{"assignments":[{"date":"2030-03-10","personnelId":"a6010000-0000-4000-8000-000000000301"}]}'::jsonb,'run snapshot names original Alpha person while edited saved slot names Bravo person');
SELECT is((SELECT count(*)::integer FROM public.duty_events WHERE id='a6010000-0000-4000-8000-000000000511'),1,'legacy computed-only event exists before retirement');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE date='2030-03-20'),0,'computed-only event has no saved Calendar slot');
SELECT is((SELECT da6_availability_treatment FROM public.status_types WHERE id='a6010000-0000-4000-8000-000000000701'),'other-duty','former DA6 metadata exists before retirement');
SELECT is((SELECT name FROM public.status_types WHERE id='a6010000-0000-4000-8000-000000000701'),'Clinic Available','retained status label is fixed before retirement');
SELECT is((SELECT color FROM public.status_types WHERE id='a6010000-0000-4000-8000-000000000701'),'#112233','retained status color is fixed before retirement');
SELECT is((SELECT text_color FROM public.status_types WHERE id='a6010000-0000-4000-8000-000000000701'),'#ffffff','retained status text color is fixed before retirement');
SELECT is((SELECT clinic_role FROM public.personnel WHERE id='a6010000-0000-4000-8000-000000000301'),'Medic','Personnel Duty Role stays independent');
SELECT is((SELECT signed_file_path FROM public.sign_in_rosters WHERE id='a6010000-0000-4000-8000-000000000901'),'a6010000-0000-4000-8000-000000000101/sign-in-rosters/a6010000-0000-4000-8000-000000000901/signed.pdf','independent signed Sign-In Roster path is retained');
SELECT is((SELECT personnel_snapshot FROM public.sign_in_rosters WHERE id='a6010000-0000-4000-8000-000000000901'),'[{"id":"a6010000-0000-4000-8000-000000000301","rank":"KEEP","groupId":"a6010000-0000-4000-8000-000000000201"}]'::jsonb,'independent signed roster snapshot and rank are fixed before retirement');
SELECT is((SELECT scope_group_ids FROM public.sign_in_rosters WHERE id='a6010000-0000-4000-8000-000000000901'),ARRAY['a6010000-0000-4000-8000-000000000201']::uuid[],'independent signed roster Group scope is fixed before retirement');

SELECT throws_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000801','KEEP')$$,'23503',NULL,'retained Personnel and Sign-In references protect KEEP rank');
SELECT throws_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000802','OLD-DUTY')$$,'23503',NULL,'former active template alone protects OLD-DUTY rank before cutover');
SELECT lives_ok($$SELECT public.delete_unused_organization_rank_catalog_entry('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000803','UNUSED')$$,'unreferenced rank can be deleted before cutover');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a6010000-0000-4000-8000-000000000002',true);
SELECT results_eq($$SELECT id FROM public.daily_assignments WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609' ORDER BY id$$,
  $$VALUES ('a6010000-0000-4000-8000-000000000601'::uuid),('a6010000-0000-4000-8000-000000000602'),('a6010000-0000-4000-8000-000000000603'),('a6010000-0000-4000-8000-000000000604'),('a6010000-0000-4000-8000-000000000605'),('a6010000-0000-4000-8000-000000000606'),('a6010000-0000-4000-8000-000000000608')$$,
  'Alpha/Bravo operator reads exactly seven in-scope saved person and Group slots');
SELECT results_eq($$SELECT id FROM public.sign_in_rosters WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901' AND 'a6010000-0000-4000-8000-000000000903' ORDER BY id$$,
  $$VALUES ('a6010000-0000-4000-8000-000000000901'::uuid)$$,'scoped operator reads only Alpha Sign-In Roster');
WITH changed AS (UPDATE public.daily_assignments SET date='2030-03-25' WHERE id='a6010000-0000-4000-8000-000000000607' RETURNING id)
SELECT is(count(*)::integer,0,'scoped operator cannot update hidden Charlie slot') FROM changed;
WITH removed AS (DELETE FROM public.daily_assignments WHERE id='a6010000-0000-4000-8000-000000000609' RETURNING id)
SELECT is(count(*)::integer,0,'scoped operator cannot delete foreign Organization slot') FROM removed;
SELECT throws_ok($$INSERT INTO public.daily_assignments(organization_id,assignment_type_id,date,assignee_id) VALUES ('a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000401','2030-03-16','a6010000-0000-4000-8000-000000000303')$$,'42501',NULL,'scoped operator cannot insert Charlie person slot');
SELECT throws_ok($$UPDATE public.daily_assignments SET assignee_id='a6010000-0000-4000-8000-000000000203' WHERE id='a6010000-0000-4000-8000-000000000604'$$,'42501',NULL,'scoped operator cannot move visible Group slot to hidden Charlie Group');
WITH changed AS (UPDATE public.daily_assignments SET assignee_id='a6010000-0000-4000-8000-000000000302' WHERE id='a6010000-0000-4000-8000-000000000601' RETURNING assignee_id)
SELECT is((SELECT assignee_id FROM changed),'a6010000-0000-4000-8000-000000000302','scoped operator can edit an in-scope person slot');
WITH changed AS (UPDATE public.daily_assignments SET assignee_id='a6010000-0000-4000-8000-000000000201' WHERE id='a6010000-0000-4000-8000-000000000604' RETURNING assignee_id)
SELECT is((SELECT assignee_id FROM changed),'a6010000-0000-4000-8000-000000000201','scoped operator can edit an in-scope Group slot');
WITH created AS (INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES ('a6010000-0000-4000-8000-000000000610','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000401','2030-03-16','a6010000-0000-4000-8000-000000000301') RETURNING id)
SELECT is((SELECT id FROM created),'a6010000-0000-4000-8000-000000000610'::uuid,'scoped operator can create an in-scope Calendar slot');
WITH removed AS (DELETE FROM public.daily_assignments WHERE id='a6010000-0000-4000-8000-000000000610' RETURNING id)
SELECT is((SELECT id FROM removed),'a6010000-0000-4000-8000-000000000610'::uuid,'scoped operator can remove its new Calendar slot');
WITH changed AS (UPDATE public.sign_in_rosters SET title='Denied' WHERE id='a6010000-0000-4000-8000-000000000902' RETURNING id)
SELECT is(count(*)::integer,0,'scoped operator cannot edit Charlie Sign-In Roster') FROM changed;
WITH changed AS (UPDATE public.sign_in_rosters SET title='Allowed Alpha Edit' WHERE id='a6010000-0000-4000-8000-000000000901' RETURNING title)
SELECT is((SELECT title FROM changed),'Allowed Alpha Edit','scoped operator can edit in-scope independent Sign-In Roster');
SELECT set_config('request.jwt.claim.sub','a6010000-0000-4000-8000-000000000003',true);
SELECT results_eq($$SELECT id FROM public.daily_assignments WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609'$$,$$VALUES ('a6010000-0000-4000-8000-000000000609'::uuid)$$,'foreign owner sees only its own Calendar slot');
SELECT results_eq($$SELECT id FROM public.sign_in_rosters WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901' AND 'a6010000-0000-4000-8000-000000000903'$$,$$VALUES ('a6010000-0000-4000-8000-000000000903'::uuid)$$,'foreign owner sees only its own Sign-In Roster');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000601' AND 'a6010000-0000-4000-8000-000000000609'),0,'anonymous caller sees no saved fixture slots');
SELECT is((SELECT count(*)::integer FROM public.sign_in_rosters WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000901' AND 'a6010000-0000-4000-8000-000000000903'),0,'anonymous caller sees no fixture rosters');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
