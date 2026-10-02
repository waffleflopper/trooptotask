-- Populated upgrade changes no saved facts and admits the new ordinary operation.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261002001100'),1,'atomic Start migration is applied');
CREATE TEMP VIEW upgraded_start_rows AS
SELECT 'personnel'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'organization_memberships'::text table_name,organization_id::text||'/'||user_id::text row_id,to_jsonb(p) row_data FROM public.organization_memberships p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_templates'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_templates p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_template_steps'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_template_steps p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'training_types'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.training_types p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'personnel_trainings'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel_trainings p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'personnel_onboardings'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel_onboardings p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_step_progress'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_step_progress p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102');
SELECT results_eq($$ SELECT * FROM upgraded_start_rows ORDER BY table_name,row_id $$,$$ SELECT * FROM upgrade_fixture.onboarding_start_before ORDER BY table_name,row_id $$,'upgrade preserves the exact populated row set and every stored value');
SELECT ok((SELECT provolatile='v' AND NOT prosecdef AND proconfig=ARRAY['search_path=""']::text[] FROM pg_proc WHERE oid='public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)'::regprocedure),'upgraded function retains invoker volatility and empty search path');
SELECT ok(has_function_privilege('authenticated','public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)','EXECUTE'),'upgraded ordinary execution grant excludes anonymous and service roles');
CREATE FUNCTION pg_temp.start_steps() RETURNS jsonb LANGUAGE sql AS $snapshot$
 SELECT '[
 {"template_step_id":"d1508000-0000-4000-8000-000000000501","step_name":"Prepared Orientation","step_type":"checkbox","training_type_id":null,"stages":null,"sort_order":10,"completed":true},
 {"template_step_id":"d1508000-0000-4000-8000-000000000502","step_name":"Prepared Paperwork","step_type":"paperwork","training_type_id":null,"stages":["Submitted","Reviewed","Filed"],"sort_order":20,"completed":true},
 {"template_step_id":"d1508000-0000-4000-8000-000000000503","step_name":"Prepared expired Training","step_type":"training","training_type_id":"d1508000-0000-4000-8000-000000000601","stages":null,"sort_order":30,"completed":true},
 {"template_step_id":"d1508000-0000-4000-8000-000000000504","step_name":"Prepared missing Training","step_type":"training","training_type_id":"d1508000-0000-4000-8000-000000000602","stages":null,"sort_order":40,"completed":false},
 {"template_step_id":"d1508000-0000-4000-8000-000000000505","step_name":"Training without type","step_type":"training","training_type_id":null,"stages":null,"sort_order":50,"completed":true},
 {"template_step_id":"d1508000-0000-4000-8000-000000000506","step_name":"Paperwork empty stages","step_type":"paperwork","training_type_id":null,"stages":[],"sort_order":60,"completed":false},
 {"template_step_id":"d1508000-0000-4000-8000-000000000507","step_name":"Paperwork null stages","step_type":"paperwork","training_type_id":null,"stages":null,"sort_order":70,"completed":false}
 ]'::jsonb;
$snapshot$;
CREATE TEMP TABLE returned(value jsonb); GRANT INSERT ON returned TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000003',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'upgraded View cannot start');
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000005',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000306','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'upgraded Group excludes Bravo');
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000001',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000404','2026-02-03',pg_temp.start_steps()) $q$,'P0002',NULL,'upgraded same Organization template remains required');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM upgraded_start_rows ORDER BY table_name,row_id $$,$$ SELECT * FROM upgrade_fixture.onboarding_start_before ORDER BY table_name,row_id $$,'upgraded denied requests retain every populated field');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000007',true);
INSERT INTO returned VALUES((public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000305','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps())));
RESET ROLE;
SELECT is((SELECT jsonb_array_length(value->'steps') FROM returned),7,'upgraded Group Configure saves every prepared step');
SELECT results_eq($$ SELECT step_name,completed,current_stage FROM public.onboarding_step_progress WHERE onboarding_id=(SELECT(value->'onboarding'->>'id')::uuid FROM returned) ORDER BY sort_order $$,$$ VALUES ('Prepared Orientation'::text,false,NULL::text),('Prepared Paperwork',false,'Submitted'),('Prepared expired Training',true,NULL),('Prepared missing Training',false,NULL),('Training without type',false,NULL),('Paperwork empty stages',false,NULL),('Paperwork null stages',false,NULL) $$,'upgraded prepared snapshots retain default state and supplied Training presence');
SELECT results_eq($$ SELECT s.* FROM upgraded_start_rows s JOIN upgrade_fixture.onboarding_start_before o USING(table_name,row_id) ORDER BY s.table_name,s.row_id $$,$$ SELECT * FROM upgrade_fixture.onboarding_start_before ORDER BY table_name,row_id $$,'upgraded successful Start leaves every pre-existing value unchanged');
SELECT * FROM finish(); ROLLBACK;
