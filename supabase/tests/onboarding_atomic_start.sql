-- Actual invoker persistence: prepared snapshots, scope and transactional failure.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email)
SELECT ('d1508000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'atomic-start-'||n||'@example.test' FROM generate_series(1,8) n;
INSERT INTO public.organizations(id,name,created_by) VALUES
('d1508000-0000-4000-8000-000000000101','Atomic Start Alpha','d1508000-0000-4000-8000-000000000001'),('d1508000-0000-4000-8000-000000000102','Atomic Start Foreign','d1508000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id,organization_id,name) VALUES
('d1508000-0000-4000-8000-000000000201','d1508000-0000-4000-8000-000000000101','Alpha'),('d1508000-0000-4000-8000-000000000202','d1508000-0000-4000-8000-000000000101','Bravo');
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids)
SELECT 'd1508000-0000-4000-8000-000000000101',('d1508000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid,'member'::public.organization_role,'viewer',
 jsonb_build_object('onboarding',capability,'personnel',CASE WHEN actor=4 THEN 'operate' ELSE 'none' END,
 'training',CASE WHEN actor=8 THEN 'operate' ELSE 'none' END,'calendar','none'),scope,
 CASE WHEN actor IN (5,7) THEN ARRAY['d1508000-0000-4000-8000-000000000201']::uuid[] ELSE ARRAY[]::uuid[] END
FROM (VALUES(1,'operate','organization'),(2,'configure','organization'),(3,'view','organization'),
 (4,'none','organization'),(5,'operate','groups'),(6,'operate','groups'),(7,'configure','groups'),(8,'none','organization')) a(actor,capability,scope);
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids)
VALUES('d1508000-0000-4000-8000-000000000102','d1508000-0000-4000-8000-000000000001','member','viewer','{"onboarding":"operate","personnel":"none","training":"none"}','organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,slug,archived_at)
SELECT ('d1508000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=304 THEN 'd1508000-0000-4000-8000-000000000102' ELSE 'd1508000-0000-4000-8000-000000000101' END::uuid,
 CASE WHEN n IN(303,304,307) THEN NULL WHEN n IN(302,306) THEN 'd1508000-0000-4000-8000-000000000202' ELSE 'd1508000-0000-4000-8000-000000000201' END::uuid,
 'SPC','Start',n::text,'atomic-start-'||n,CASE WHEN n=308 THEN '2026-08-01T12:00:00Z'::timestamptz ELSE NULL END
FROM generate_series(301,311) n;
INSERT INTO public.onboarding_templates(id,organization_id,name) VALUES
('d1508000-0000-4000-8000-000000000401','d1508000-0000-4000-8000-000000000101','Prepared template'),('d1508000-0000-4000-8000-000000000402','d1508000-0000-4000-8000-000000000101','Other template'),
('d1508000-0000-4000-8000-000000000403','d1508000-0000-4000-8000-000000000101','Empty template'),('d1508000-0000-4000-8000-000000000404','d1508000-0000-4000-8000-000000000102','Foreign template');
INSERT INTO public.training_types(id,organization_id,name) VALUES
('d1508000-0000-4000-8000-000000000601','d1508000-0000-4000-8000-000000000101','Expired matching Training'),('d1508000-0000-4000-8000-000000000602','d1508000-0000-4000-8000-000000000101','Missing Training'),('d1508000-0000-4000-8000-000000000603','d1508000-0000-4000-8000-000000000102','Foreign Training');
INSERT INTO public.personnel_trainings(id,organization_id,personnel_id,training_type_id,completion_date,expiration_date)
VALUES('d1508000-0000-4000-8000-000000000901','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000305','d1508000-0000-4000-8000-000000000601','2020-01-01','2020-02-01');
INSERT INTO public.onboarding_template_steps(id,organization_id,template_id,name,step_type,training_type_id,stages,sort_order) VALUES
('d1508000-0000-4000-8000-000000000501','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000401','Current Orientation','checkbox',NULL,NULL,10),
('d1508000-0000-4000-8000-000000000502','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000401','Current Paperwork','paperwork',NULL,'["Draft","Reviewed"]',20),
('d1508000-0000-4000-8000-000000000503','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000401','Current expired Training','training','d1508000-0000-4000-8000-000000000601',NULL,30),
('d1508000-0000-4000-8000-000000000504','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000401','Current missing Training','training','d1508000-0000-4000-8000-000000000602',NULL,40),
('d1508000-0000-4000-8000-000000000505','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000401','Training without type','training',NULL,NULL,50),
('d1508000-0000-4000-8000-000000000506','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000401','Paperwork empty stages','paperwork',NULL,'[]',60),
('d1508000-0000-4000-8000-000000000507','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000401','Paperwork null stages','paperwork',NULL,NULL,70),
('d1508000-0000-4000-8000-000000000511','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000402','Other checkbox','checkbox',NULL,NULL,0),
('d1508000-0000-4000-8000-000000000521','d1508000-0000-4000-8000-000000000102','d1508000-0000-4000-8000-000000000404','Foreign checkbox','checkbox',NULL,NULL,0);
INSERT INTO public.personnel_onboardings(id,organization_id,personnel_id,template_id,started_at,status,completed_at,cancelled_at) VALUES
('d1508000-0000-4000-8000-000000000701','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000301','d1508000-0000-4000-8000-000000000401','2026-01-01','in_progress',NULL,NULL),
('d1508000-0000-4000-8000-000000000702','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000302',NULL,'2026-01-01','completed','2026-01-03',NULL),
('d1508000-0000-4000-8000-000000000703','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000303','d1508000-0000-4000-8000-000000000401','2026-01-01','cancelled',NULL,'2026-01-04T12:00:00.123Z'),
('d1508000-0000-4000-8000-000000000704','d1508000-0000-4000-8000-000000000102','d1508000-0000-4000-8000-000000000304','d1508000-0000-4000-8000-000000000404','2026-01-01','in_progress',NULL,NULL);
INSERT INTO public.onboarding_step_progress(id,organization_id,onboarding_id,template_step_id,step_name,step_type,training_type_id,stages,sort_order,completed,current_stage,notes,active) VALUES
('d1508000-0000-4000-8000-000000000801','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000701','d1508000-0000-4000-8000-000000000501','Saved Orientation','checkbox',NULL,NULL,1,true,NULL,'[{"text":"Original work","timestamp":"2026-01-01T01:00:00.123Z","userId":"d1508000-0000-4000-8000-000000000002","extra":[true,null]}]',true),
('d1508000-0000-4000-8000-000000000802','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000702',NULL,'Deleted definition history','paperwork',NULL,'["Draft","Archived review"]',2,true,'Archived review','[{"text":"Saved complete note","timestamp":"2026-01-02T01:00:00.123Z","userId":"d1508000-0000-4000-8000-000000000002"}]',false),
('d1508000-0000-4000-8000-000000000803','d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000703','d1508000-0000-4000-8000-000000000503','Cancelled Training snapshot','training','d1508000-0000-4000-8000-000000000601',NULL,3,false,NULL,'[{"text":"Saved cancelled note","timestamp":"2026-01-02T01:00:00.123Z"}]',false),
('d1508000-0000-4000-8000-000000000804','d1508000-0000-4000-8000-000000000102','d1508000-0000-4000-8000-000000000704','d1508000-0000-4000-8000-000000000521','Foreign saved work','checkbox',NULL,NULL,4,false,NULL,'[]',true);
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
CREATE TEMP VIEW saved_start_rows AS
SELECT 'personnel'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'organization_memberships'::text table_name,organization_id::text||'/'||user_id::text row_id,to_jsonb(p) row_data FROM public.organization_memberships p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_templates'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_templates p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_template_steps'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_template_steps p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'training_types'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.training_types p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'personnel_trainings'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel_trainings p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'personnel_onboardings'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel_onboardings p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_step_progress'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_step_progress p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102');
CREATE TEMP TABLE original_rows AS SELECT * FROM saved_start_rows;
CREATE TEMP TABLE returned(label text,value jsonb);
GRANT SELECT,INSERT ON returned TO authenticated;
SELECT ok(has_function_privilege('authenticated','public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)','EXECUTE'),'ordinary authenticated Start is granted');
SELECT ok(NOT has_function_privilege('anon','public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)','EXECUTE'),'anonymous and service roles have no Start grant');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid='public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)'::regprocedure AND a.grantee=0),'PUBLIC has no effective Start grant');
SELECT ok((SELECT provolatile='v' AND prosecdef AND proconfig=ARRAY['search_path=""']::text[] AND proargnames=ARRAY['p_organization_id','p_personnel_id','p_template_id','p_started_at','p_steps'] FROM pg_proc WHERE oid='public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)'::regprocedure),'Start is the volatile command that creates packets, with empty search path and only prepared inputs');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'missing identity cannot start');
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000003',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'View cannot start');
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000004',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'Personnel alone cannot start');
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000008',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'Training alone cannot start');
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000006',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'empty Group scope cannot start');
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000005',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000306','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'Group scope excludes Bravo');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000307','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'Group scope excludes Unassigned');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000304','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'foreign Person denied');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000399','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'42501',NULL,'missing Person denied without existence bypass');
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000001',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000404','2026-02-03',pg_temp.start_steps()) $q$,'P0002',NULL,'dual membership cannot borrow foreign template');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000499','2026-02-03',pg_temp.start_steps()) $q$,'P0002',NULL,'missing template is explicit');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{0,template_step_id}',to_jsonb('d1508000-0000-4000-8000-000000000511'::text))) $q$,'P0002',NULL,'same Organization other-template definition denied');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{0,template_step_id}',to_jsonb('d1508000-0000-4000-8000-000000000521'::text))) $q$,'P0002',NULL,'foreign definition denied');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{0,template_step_id}',to_jsonb('d1508000-0000-4000-8000-000000000599'::text))) $q$,'P0002',NULL,'deleted definition denied');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{2,training_type_id}',to_jsonb('d1508000-0000-4000-8000-000000000603'::text))) $q$,'42501',NULL,'foreign Training reference denied');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',NULL) $q$,'22023',NULL,'null prepared snapshot rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03','{}'::jsonb) $q$,'22023',NULL,'non-array prepared snapshot rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()||jsonb_build_array(pg_temp.start_steps()->0)) $q$,'22023',NULL,'duplicate prepared definition rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{0,template_step_id}','null'::jsonb)) $q$,'22023',NULL,'null prepared definition rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{0,sort_order}','0.5'::jsonb)) $q$,'22023',NULL,'noninteger order rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{0,sort_order}','99999999999999999999'::jsonb)) $q$,'22023',NULL,'overflow order rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{0,notes}','[]'::jsonb)) $q$,'22023',NULL,'caller note array rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{0,step_type}','"unknown"'::jsonb)) $q$,'22023',NULL,'unknown step type rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',jsonb_set(pg_temp.start_steps(),'{1,stages}','[1]'::jsonb)) $q$,'22023',NULL,'malformed prepared stages rejected');
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000301','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'23505','duplicate key value violates unique constraint "personnel_onboardings_active_idx"','named active index retains duplicate guard');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM saved_start_rows ORDER BY table_name,row_id $$,$$ SELECT * FROM original_rows ORDER BY table_name,row_id $$,'all valid denied and malformed requests retain every original row field');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000001',true);
INSERT INTO returned VALUES('operate',(public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000305','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps())));
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000005',true);
INSERT INTO returned VALUES('group-operate',(public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000309','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps())));
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000007',true);
INSERT INTO returned VALUES('group-configure-archived',(public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000308','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps())));
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000002',true);
INSERT INTO returned VALUES('configure-unassigned-empty',(public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000307','d1508000-0000-4000-8000-000000000403','2026-02-03','[]'::jsonb)));
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000001',true);
INSERT INTO returned VALUES('after-completed',(public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000302','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps())));
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000001',true);
INSERT INTO returned VALUES('after-cancelled',(public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000303','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps())));
RESET ROLE;
SELECT results_eq($$ SELECT label,value->'onboarding' FROM returned ORDER BY label $$,$$ SELECT r.label,to_jsonb(p) FROM returned r JOIN public.personnel_onboardings p ON p.id=(r.value->'onboarding'->>'id')::uuid ORDER BY label $$,'raw parent responses equal every actual saved field');
SELECT results_eq($$ SELECT label,value->'steps' FROM returned ORDER BY label $$,$$ SELECT r.label,coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.sort_order,p.id) FILTER(WHERE p.id IS NOT NULL),'[]'::jsonb) FROM returned r LEFT JOIN public.onboarding_step_progress p ON p.onboarding_id=(r.value->'onboarding'->>'id')::uuid GROUP BY r.label ORDER BY r.label $$,'raw step responses equal every actual saved field in stable saved order');
SELECT ok((SELECT bool_and(p.status='in_progress' AND p.started_at='2026-02-03' AND p.completed_at IS NULL AND p.cancelled_at IS NULL AND p.id NOT IN(SELECT row_id::uuid FROM original_rows WHERE table_name='personnel_onboardings')) FROM returned r JOIN public.personnel_onboardings p ON p.id=(r.value->'onboarding'->>'id')::uuid),'new parents have fresh IDs chosen date and fixed initial lifecycle');
SELECT ok((SELECT bool_and(p.notes='[]'::jsonb AND p.active AND p.organization_id='d1508000-0000-4000-8000-000000000101'::uuid AND p.id NOT IN(SELECT row_id::uuid FROM original_rows WHERE table_name='onboarding_step_progress')) FROM returned r JOIN public.onboarding_step_progress p ON p.onboarding_id=(r.value->'onboarding'->>'id')::uuid),'new steps have fresh IDs fixed parent Organization active state and empty notes');
SELECT results_eq($$ SELECT p.step_name,p.completed,p.current_stage,p.stages,p.sort_order FROM returned r JOIN public.onboarding_step_progress p ON p.onboarding_id=(r.value->'onboarding'->>'id')::uuid WHERE r.label='operate' ORDER BY p.sort_order $$,$$ VALUES
('Prepared Orientation'::text,false,NULL::text,NULL::jsonb,10),('Prepared Paperwork',false,'Submitted','["Submitted","Reviewed","Filed"]'::jsonb,20),('Prepared expired Training',true,NULL,NULL,30),('Prepared missing Training',false,NULL,NULL,40),('Training without type',false,NULL,NULL,50),('Paperwork empty stages',false,NULL,'[]'::jsonb,60),('Paperwork null stages',false,NULL,NULL,70) $$,'prepared metadata is preserved without catalog equality and initial completion/stages follow the retained rules');
SELECT is((SELECT jsonb_array_length(value->'steps') FROM returned WHERE label='configure-unassigned-empty'),0,'an existing empty template admits an empty snapshot');
SELECT results_eq($$ SELECT s.* FROM saved_start_rows s JOIN original_rows o USING(table_name,row_id) ORDER BY s.table_name,s.row_id $$,$$ SELECT * FROM original_rows ORDER BY table_name,row_id $$,'every old packet dependency and saved history field remains unchanged');
CREATE TEMP TABLE before_fault AS SELECT * FROM saved_start_rows;
CREATE FUNCTION pg_temp.start_partial_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.step_name='Prepared Paperwork' AND EXISTS(SELECT 1 FROM public.personnel_onboardings WHERE id=NEW.onboarding_id AND personnel_id='d1508000-0000-4000-8000-000000000310') THEN
  IF NOT EXISTS(SELECT 1 FROM public.onboarding_step_progress WHERE onboarding_id=NEW.onboarding_id AND step_name='Prepared Orientation') THEN RAISE EXCEPTION 'Partial fault did not witness prior child' USING ERRCODE='XX000'; END IF;
  RAISE EXCEPTION 'Controlled Start fault witnessed parent and prior child' USING ERRCODE='23514';
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER atomic_start_partial_fault BEFORE INSERT ON public.onboarding_step_progress FOR EACH ROW EXECUTE FUNCTION pg_temp.start_partial_fault();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1508000-0000-4000-8000-000000000001',true);
SELECT throws_ok($q$ SELECT public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000310','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps()) $q$,'23514','Controlled Start fault witnessed parent and prior child','fault after prior inserts is propagated');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM saved_start_rows ORDER BY table_name,row_id $$,$$ SELECT * FROM before_fault ORDER BY table_name,row_id $$,'partial child failure rolls back every new row and retains every original field');
DROP TRIGGER atomic_start_partial_fault ON public.onboarding_step_progress;
CREATE FUNCTION pg_temp.start_deferred_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.personnel_onboardings WHERE id=NEW.onboarding_id AND personnel_id='d1508000-0000-4000-8000-000000000311') THEN
  IF (SELECT count(*) FROM public.onboarding_step_progress WHERE onboarding_id=NEW.onboarding_id)<>7 THEN RAISE EXCEPTION 'Deferred fault did not witness full packet' USING ERRCODE='XX000'; END IF;
  RAISE EXCEPTION 'Controlled deferred Start failure witnessed full packet' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE CONSTRAINT TRIGGER atomic_start_deferred_fault AFTER INSERT ON public.onboarding_step_progress DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pg_temp.start_deferred_fault();
CREATE FUNCTION pg_temp.start_and_check_deferred() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000311','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps());
 SET CONSTRAINTS atomic_start_deferred_fault IMMEDIATE; END; $$;
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$ SELECT pg_temp.start_and_check_deferred() $q$,'23514','Controlled deferred Start failure witnessed full packet','deferred transaction failure is propagated');
RESET ROLE;
SELECT results_eq($$ SELECT * FROM saved_start_rows ORDER BY table_name,row_id $$,$$ SELECT * FROM before_fault ORDER BY table_name,row_id $$,'deferred failure rolls back parent and all steps with original fields unchanged');
DROP TRIGGER atomic_start_deferred_fault ON public.onboarding_step_progress;
SET LOCAL ROLE authenticated;
INSERT INTO returned VALUES('retry',(public.start_onboarding_packet('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000310','d1508000-0000-4000-8000-000000000401','2026-02-03',pg_temp.start_steps())));
RESET ROLE;
SELECT is((SELECT jsonb_array_length(value->'steps') FROM returned WHERE label='retry'),7,'a restored genuine failure permits one complete retry');
SELECT results_eq($$ SELECT s.* FROM saved_start_rows s JOIN original_rows o USING(table_name,row_id) ORDER BY s.table_name,s.row_id $$,$$ SELECT * FROM original_rows ORDER BY table_name,row_id $$,'successful retry still preserves all original identities and fields');
SELECT * FROM finish();
ROLLBACK;
