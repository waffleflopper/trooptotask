-- A preceding populated schema; Start must add no automatic data changes.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.start_onboarding_packet(uuid,uuid,uuid,date,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Start fixture requires preceding schema'; END IF; END; $$;
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
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
CREATE TABLE upgrade_fixture.onboarding_start_before AS
SELECT 'personnel'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'organization_memberships'::text table_name,organization_id::text||'/'||user_id::text row_id,to_jsonb(p) row_data FROM public.organization_memberships p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_templates'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_templates p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_template_steps'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_template_steps p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'training_types'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.training_types p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'personnel_trainings'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel_trainings p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'personnel_onboardings'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.personnel_onboardings p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102')
UNION ALL SELECT 'onboarding_step_progress'::text table_name,id::text row_id,to_jsonb(p) row_data FROM public.onboarding_step_progress p WHERE organization_id IN ('d1508000-0000-4000-8000-000000000101','d1508000-0000-4000-8000-000000000102');
COMMIT;
