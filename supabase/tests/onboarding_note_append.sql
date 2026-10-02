-- Atomic note append retains work and existing attribution under ordinary RLS.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SET LOCAL TIME ZONE 'Pacific/Honolulu';
INSERT INTO auth.users(id, email)
SELECT ('d1504000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'onboarding-note-' || n || '@example.test' FROM generate_series(1, 7) n;
INSERT INTO public.organizations(id, name, created_by) VALUES
('d1504000-0000-4000-8000-000000000101', 'Note Alpha', 'd1504000-0000-4000-8000-000000000001'),
('d1504000-0000-4000-8000-000000000102', 'Note Foreign', 'd1504000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id, organization_id, name) VALUES
('d1504000-0000-4000-8000-000000000201', 'd1504000-0000-4000-8000-000000000101', 'Alpha'),
('d1504000-0000-4000-8000-000000000202', 'd1504000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1504000-0000-4000-8000-000000000101'::uuid,
  ('d1504000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer',
  jsonb_build_object('onboarding', capability, 'personnel', CASE WHEN actor=4 THEN 'operate' ELSE 'none' END,
    'training', 'none', 'calendar', 'none'), scope_kind,
  CASE WHEN actor=5 THEN ARRAY['d1504000-0000-4000-8000-000000000201']::uuid[] ELSE ARRAY[]::uuid[] END
FROM (VALUES (1,'operate','organization'), (2,'configure','organization'),
  (3,'view','organization'), (4,'none','organization'), (5,'operate','groups'),
  (6,'operate','groups'), (7,'operate','organization')) a(actor,capability,scope_kind);
INSERT INTO public.organization_memberships (
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES ('d1504000-0000-4000-8000-000000000102','d1504000-0000-4000-8000-000000000001',
  'member','viewer','{"onboarding":"operate","personnel":"none","training":"none","calendar":"none"}',
  'organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,slug) VALUES
('d1504000-0000-4000-8000-000000000301','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000201','SPC','Alpha','Note','note-alpha'),
('d1504000-0000-4000-8000-000000000302','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000202','SPC','Bravo','Note','note-bravo'),
('d1504000-0000-4000-8000-000000000303','d1504000-0000-4000-8000-000000000101',NULL,'SPC','Unassigned','Note','note-unassigned'),
('d1504000-0000-4000-8000-000000000304','d1504000-0000-4000-8000-000000000102',NULL,'SPC','Foreign','Note','note-foreign');
INSERT INTO public.personnel_onboardings(id,organization_id,personnel_id,status,started_at,completed_at,cancelled_at) VALUES
('d1504000-0000-4000-8000-000000000701','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000301','in_progress','2030-01-01T00:00:00Z',NULL,NULL),
('d1504000-0000-4000-8000-000000000702','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000302','in_progress','2030-01-01T00:00:00Z',NULL,NULL),
('d1504000-0000-4000-8000-000000000703','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000303','in_progress','2030-01-01T00:00:00Z',NULL,NULL),
('d1504000-0000-4000-8000-000000000704','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000301','completed','2030-01-01T00:00:00Z','2030-01-03T00:00:00Z',NULL),
('d1504000-0000-4000-8000-000000000705','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000301','cancelled','2030-01-01T00:00:00Z',NULL,'2030-01-03T00:00:00Z'),
('d1504000-0000-4000-8000-000000000706','d1504000-0000-4000-8000-000000000102','d1504000-0000-4000-8000-000000000304','in_progress','2030-01-01T00:00:00Z',NULL,NULL);
INSERT INTO public.onboarding_step_progress (
  id,organization_id,onboarding_id,step_name,step_type,sort_order,completed,current_stage,stages,notes,active
) SELECT ('d1504000-0000-4000-8000-' || lpad(step_id::text,12,'0'))::uuid,
  CASE WHEN step_id=807 THEN 'd1504000-0000-4000-8000-000000000102' ELSE 'd1504000-0000-4000-8000-000000000101' END::uuid,
  ('d1504000-0000-4000-8000-' || lpad(parent_id::text,12,'0'))::uuid,
  step_name,step_type,step_id-800,true,current_stage,
  CASE WHEN step_type='paperwork' THEN '["Draft","Reviewed","Filed"]'::jsonb ELSE NULL END,
  CASE WHEN step_id=808 THEN '{"unexpected":"object"}'::jsonb WHEN step_id=809 THEN '[]'::jsonb ELSE
    '[{"text":"Original saved note","timestamp":"2030-01-01T00:00:00Z","userId":"d1504000-0000-4000-8000-000000000002","extra":{"retained":[1,true,null]}}]'::jsonb END,active
FROM (VALUES (801,701,'Orientation','checkbox',NULL::text,true),
  (802,701,'Paperwork','paperwork','Reviewed',true),
  (803,704,'Completed retained work','checkbox',NULL,false),
  (804,705,'Cancelled retained Training','training',NULL,false),
  (805,702,'Bravo work','checkbox',NULL,true),
  (806,703,'Unassigned work','checkbox',NULL,true),
  (807,706,'Foreign work','checkbox',NULL,true),
  (808,701,'Malformed saved notes','checkbox',NULL,true),
  (809,701,'Empty saved notes','checkbox',NULL,true)) s(step_id,parent_id,step_name,step_type,current_stage,active);

CREATE TEMP TABLE parents_before AS SELECT id,to_jsonb(p) AS row_data FROM public.personnel_onboardings p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102');
CREATE TEMP TABLE progress_before AS SELECT id,to_jsonb(p) AS row_data FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102');
CREATE TEMP TABLE returned(label text,value jsonb);
GRANT INSERT ON returned TO authenticated;
SELECT ok(has_function_privilege('authenticated','public.append_onboarding_step_note(uuid,uuid,text)','EXECUTE'),
  'ordinary authenticated callers can invoke append');
SELECT ok(NOT has_function_privilege('anon','public.append_onboarding_step_note(uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.append_onboarding_step_note(uuid,uuid,text)','EXECUTE'),
  'anonymous and service roles have no append grant');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.oid='public.append_onboarding_step_note(uuid,uuid,text)'::regprocedure AND a.grantee=0),
  'PUBLIC has no effective append grant');
SELECT ok((SELECT provolatile='v' AND NOT prosecdef AND proconfig=ARRAY['search_path=""']::text[]
  AND pronargs=3 AND proargnames=ARRAY['p_organization_id','p_step_id','p_text']::text[] FROM pg_proc
  WHERE oid='public.append_onboarding_step_note(uuid,uuid,text)'::regprocedure),
  'append is volatile invoker with empty search path and no caller-supplied attribution');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000801','denied') $$,'42501',NULL,'missing identity cannot append');
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000801','denied') $$,'42501',NULL,'View cannot append');
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000004',true);
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000801','denied') $$,'42501',NULL,'Personnel operation does not grant Onboarding operation');
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000005',true);
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000805','denied') $$,'P0002','Step not found','another Group is invisible');
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000806','denied') $$,'P0002','Step not found','Group scope excludes Unassigned');
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000006',true);
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000801','denied') $$,'P0002','Step not found','empty Group scope has no targets');
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000007',true);
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000102',
  'd1504000-0000-4000-8000-000000000807','denied') $$,'42501',NULL,'Alpha membership grants no foreign capability');
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000807','denied') $$,'P0002','Step not found','dual membership cannot cross an explicit Organization');
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000899','missing') $$,'P0002','Step not found','missing step has the same invisible-target status');
SELECT throws_ok($$ SELECT public.append_onboarding_step_note(NULL,
  'd1504000-0000-4000-8000-000000000801','denied') $$,'42501',NULL,'null Organization cannot append');
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000808','no replacement') $$,'22023',NULL,'non-array saved notes fail without repair');
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.personnel_onboardings p WHERE organization_id IN
  ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,row_data FROM parents_before ORDER BY id $$,'denials preserve every parent field');
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.onboarding_step_progress p WHERE organization_id IN
  ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,row_data FROM progress_before ORDER BY id $$,'denials and malformed data preserve every progress field');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000001',true);
INSERT INTO returned VALUES ('operate',public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000801','First appended note'));
INSERT INTO returned VALUES ('empty',public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000809','First note on empty step'));
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000002',true);
INSERT INTO returned VALUES ('configure',public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000801','Second appended note'));
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000005',true);
INSERT INTO returned VALUES ('scoped',public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000802',' Scoped text '));
INSERT INTO returned VALUES ('completed',public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000803',''));
INSERT INTO returned VALUES ('cancelled',public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000804',E' \t\n'));
INSERT INTO returned VALUES ('null-text',public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000804',NULL));
RESET ROLE;
SELECT is((SELECT jsonb_array_length(notes) FROM public.onboarding_step_progress WHERE id='d1504000-0000-4000-8000-000000000809'),
  1,'an empty saved array receives exactly one new note');
SELECT results_eq($$ SELECT notes->0->>'text',notes->0->>'userId' FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000809' $$,
  $$ VALUES ('First note on empty step'::text,'d1504000-0000-4000-8000-000000000001'::text) $$,
  'first note uses the original text and authenticated identity');
SELECT results_eq($$ SELECT n.value->>'text',n.value->>'userId' FROM public.onboarding_step_progress p,
  LATERAL jsonb_array_elements(p.notes) WITH ORDINALITY n(value,position)
  WHERE p.id='d1504000-0000-4000-8000-000000000801' AND n.position>1 ORDER BY n.position $$,
  $$ VALUES ('First appended note'::text,'d1504000-0000-4000-8000-000000000001'::text),
    ('Second appended note'::text,'d1504000-0000-4000-8000-000000000002'::text) $$,
  'repeated ordinary calls retain both texts and authenticated authors');
SELECT results_eq($$ SELECT id,notes->0 FROM public.onboarding_step_progress
  WHERE id IN ('d1504000-0000-4000-8000-000000000801','d1504000-0000-4000-8000-000000000802',
    'd1504000-0000-4000-8000-000000000803','d1504000-0000-4000-8000-000000000804') ORDER BY id $$,
  $$ SELECT id,row_data->'notes'->0 FROM progress_before WHERE id IN
  ('d1504000-0000-4000-8000-000000000801','d1504000-0000-4000-8000-000000000802',
    'd1504000-0000-4000-8000-000000000803','d1504000-0000-4000-8000-000000000804') ORDER BY id $$,
  'all original note attributes and nested legacy values survive');
SELECT is((SELECT notes->1->>'text' FROM public.onboarding_step_progress WHERE id='d1504000-0000-4000-8000-000000000802'),
  ' Scoped text ','Group-scoped operation preserves surrounding whitespace');
SELECT is((SELECT notes->1->>'text' FROM public.onboarding_step_progress WHERE id='d1504000-0000-4000-8000-000000000803'),
  '','completed inactive history admits the existing empty-text behavior');
SELECT is((SELECT notes->1->>'text' FROM public.onboarding_step_progress WHERE id='d1504000-0000-4000-8000-000000000804'),
  E' \t\n','cancelled inactive Training admits unchanged whitespace text');
SELECT is((SELECT notes->2->'text' FROM public.onboarding_step_progress WHERE id='d1504000-0000-4000-8000-000000000804'),
  'null'::jsonb,'null text stays JSON null rather than being trimmed or rewritten');
SELECT ok((SELECT bool_and(n.value->>'timestamp' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  AND (n.value->>'timestamp')::timestamptz BETWEEN transaction_timestamp()-interval '1 second' AND clock_timestamp())
  FROM public.onboarding_step_progress p,LATERAL jsonb_array_elements(p.notes) WITH ORDINALITY n(value,position)
  WHERE p.id IN ('d1504000-0000-4000-8000-000000000801','d1504000-0000-4000-8000-000000000802',
    'd1504000-0000-4000-8000-000000000803','d1504000-0000-4000-8000-000000000804') AND n.position>1),
  'new timestamps are current server UTC with exactly millisecond precision');
SELECT results_eq($$ SELECT label,value FROM returned WHERE label IN ('configure','scoped','completed','null-text','empty') ORDER BY label $$,
  $$ SELECT label,jsonb_build_object('id',p.id,'notes',p.notes) FROM returned r JOIN public.onboarding_step_progress p
    ON p.id=(r.value->>'id')::uuid WHERE label IN ('configure','scoped','completed','null-text','empty') ORDER BY label $$,
  'each final response is exactly the saved id and complete notes array');
SELECT results_eq($$ SELECT id,to_jsonb(p)-'notes'-'updated_at' FROM public.onboarding_step_progress p WHERE organization_id IN
  ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,row_data-'notes'-'updated_at' FROM progress_before ORDER BY id $$,
  'append does not change identity, snapshots, stages, order or completed/active work');
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.personnel_onboardings p WHERE organization_id IN
  ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,row_data FROM parents_before ORDER BY id $$,'all parents remain byte-for-field unchanged');
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.onboarding_step_progress p WHERE id IN
  ('d1504000-0000-4000-8000-000000000805','d1504000-0000-4000-8000-000000000806',
    'd1504000-0000-4000-8000-000000000807','d1504000-0000-4000-8000-000000000808') ORDER BY id $$,
  $$ SELECT id,row_data FROM progress_before WHERE id IN
  ('d1504000-0000-4000-8000-000000000805','d1504000-0000-4000-8000-000000000806',
    'd1504000-0000-4000-8000-000000000807','d1504000-0000-4000-8000-000000000808') ORDER BY id $$,
  'unselected, foreign and malformed rows remain fully unchanged');

-- A genuine post-write failure rolls back the append, including updated_at.
CREATE TEMP TABLE before_failure AS SELECT to_jsonb(p) row_data FROM public.onboarding_step_progress p
  WHERE id='d1504000-0000-4000-8000-000000000801';
CREATE FUNCTION public.t3_fail_note_append() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Synthetic saved-note failure' USING ERRCODE='P0001'; END; $$;
CREATE TRIGGER t3_fail_note_append AFTER UPDATE ON public.onboarding_step_progress
  FOR EACH ROW WHEN (NEW.id='d1504000-0000-4000-8000-000000000801'::uuid)
  EXECUTE FUNCTION public.t3_fail_note_append();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000801','must roll back') $$,'P0001','Synthetic saved-note failure','genuine append failure is propagated');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(p) FROM public.onboarding_step_progress p
  WHERE id='d1504000-0000-4000-8000-000000000801' $$,$$ SELECT row_data FROM before_failure $$,
  'failed append retains the entire original row including timestamps');
DROP TRIGGER t3_fail_note_append ON public.onboarding_step_progress;
DROP FUNCTION public.t3_fail_note_append();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1504000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$ SELECT public.append_onboarding_step_note('d1504000-0000-4000-8000-000000000101',
  'd1504000-0000-4000-8000-000000000801','retry after failure') $$,'same ordinary caller can retry after fault restoration');
RESET ROLE;
SELECT is((SELECT notes->3->>'text' FROM public.onboarding_step_progress WHERE id='d1504000-0000-4000-8000-000000000801'),
  'retry after failure','retry creates one saved note after the two earlier successful appends');
SELECT is((SELECT jsonb_array_length(notes) FROM public.onboarding_step_progress WHERE id='d1504000-0000-4000-8000-000000000801'),
  4,'the failed request contributes no note');
SELECT * FROM finish();
ROLLBACK;
