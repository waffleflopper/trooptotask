-- Packet assignment/resync is atomic; retained work is independent of definitions.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
-- Synthetic packet fixture; all saved work and attribution are independently specified.
INSERT INTO auth.users(id, email)
SELECT ('d1503000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'packet-reconciliation-' || n || '@example.test' FROM generate_series(1, 7) n;
INSERT INTO public.organizations(id, name, created_by) VALUES
('d1503000-0000-4000-8000-000000000101', 'Packet Alpha', 'd1503000-0000-4000-8000-000000000001'),
('d1503000-0000-4000-8000-000000000102', 'Packet Bravo', 'd1503000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id, organization_id, name) VALUES
('d1503000-0000-4000-8000-000000000201', 'd1503000-0000-4000-8000-000000000101', 'Alpha'),
('d1503000-0000-4000-8000-000000000202', 'd1503000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1503000-0000-4000-8000-000000000101'::uuid,
  ('d1503000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer', jsonb_build_object('onboarding', capability,
    'personnel', 'none', 'training', 'none', 'calendar', 'none'), scope_kind,
  CASE WHEN actor = 5 THEN ARRAY['d1503000-0000-4000-8000-000000000201']::uuid[] ELSE ARRAY[]::uuid[] END
FROM (VALUES (1, 'configure', 'organization'), (2, 'operate', 'organization'),
  (3, 'view', 'organization'), (4, 'none', 'organization'),
  (5, 'configure', 'groups'), (6, 'configure', 'groups'), (7, 'configure', 'organization')) a(actor, capability, scope_kind);
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES ('d1503000-0000-4000-8000-000000000102', 'd1503000-0000-4000-8000-000000000001',
  'member', 'viewer', '{"onboarding":"configure","personnel":"none","training":"none"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel(id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
('d1503000-0000-4000-8000-000000000301', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Person', 'packet-alpha'),
('d1503000-0000-4000-8000-000000000302', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000202', 'SPC', 'Bravo', 'Person', 'packet-bravo'),
('d1503000-0000-4000-8000-000000000303', 'd1503000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Person', 'packet-unassigned'),
('d1503000-0000-4000-8000-000000000304', 'd1503000-0000-4000-8000-000000000102', NULL, 'SPC', 'Foreign', 'Person', 'packet-foreign');
INSERT INTO public.onboarding_templates(id, organization_id, name) VALUES
('d1503000-0000-4000-8000-000000000401', 'd1503000-0000-4000-8000-000000000101', 'Template A'),
('d1503000-0000-4000-8000-000000000402', 'd1503000-0000-4000-8000-000000000101', 'Template B'),
('d1503000-0000-4000-8000-000000000403', 'd1503000-0000-4000-8000-000000000101', 'Empty template'),
('d1503000-0000-4000-8000-000000000404', 'd1503000-0000-4000-8000-000000000102', 'Foreign template');
INSERT INTO public.training_types(id, organization_id, name) VALUES
('d1503000-0000-4000-8000-000000000601', 'd1503000-0000-4000-8000-000000000101', 'Saved Training');
INSERT INTO public.onboarding_template_steps(id, organization_id, template_id, name, step_type, stages, sort_order, training_type_id) VALUES
('d1503000-0000-4000-8000-000000000501', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Orientation', 'checkbox', NULL, 20, NULL),
('d1503000-0000-4000-8000-000000000502', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Paperwork', 'paperwork', '["Draft","Reviewed"]', 30, NULL),
('d1503000-0000-4000-8000-000000000503', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Training', 'training', NULL, 40, 'd1503000-0000-4000-8000-000000000601'),
('d1503000-0000-4000-8000-000000000504', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Orientation', 'checkbox', NULL, 10, NULL),
('d1503000-0000-4000-8000-000000000511', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000402', 'Orientation', 'checkbox', NULL, 20, NULL),
('d1503000-0000-4000-8000-000000000512', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000402', 'Paperwork', 'paperwork', '["Draft","Reviewed"]', 30, NULL),
('d1503000-0000-4000-8000-000000000513', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000402', 'Training', 'training', NULL, 40, 'd1503000-0000-4000-8000-000000000601');
INSERT INTO public.personnel_onboardings(id, organization_id, personnel_id, status) VALUES
('d1503000-0000-4000-8000-000000000701', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000301', 'in_progress'),
('d1503000-0000-4000-8000-000000000702', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000302', 'in_progress'),
('d1503000-0000-4000-8000-000000000703', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000303', 'in_progress'),
('d1503000-0000-4000-8000-000000000704', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000301', 'cancelled'),
('d1503000-0000-4000-8000-000000000705', 'd1503000-0000-4000-8000-000000000102', 'd1503000-0000-4000-8000-000000000304', 'in_progress');
INSERT INTO public.personnel_onboardings(id, organization_id, personnel_id, template_id, status, started_at, completed_at) VALUES
('d1503000-0000-4000-8000-000000000706', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000301',
 'd1503000-0000-4000-8000-000000000401', 'completed', '2030-01-01', '2030-02-01');
INSERT INTO public.onboarding_step_progress(id, organization_id, onboarding_id, template_step_id, step_name, step_type, completed, notes) VALUES
('d1503000-0000-4000-8000-000000000810', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000706',
 'd1503000-0000-4000-8000-000000000501', 'Completed Orientation', 'checkbox', true,
 '[{"text":"Completed packet note","timestamp":"2030-02-01T00:00:00Z","userId":"d1503000-0000-4000-8000-000000000002"}]');
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, template_step_id, step_name, step_type, sort_order, completed, current_stage, notes, active
) SELECT ('d1503000-0000-4000-8000-' || lpad(step_id::text, 12, '0'))::uuid,
  'd1503000-0000-4000-8000-000000000101'::uuid, 'd1503000-0000-4000-8000-000000000701'::uuid,
  CASE WHEN step_id = 807 THEN 'd1503000-0000-4000-8000-000000000502'::uuid ELSE NULL END,
  step_name, step_type, step_id - 800, true, current_stage,
  jsonb_build_array(jsonb_build_object('text', 'Retained note ' || step_id,
    'timestamp', '2030-01-01T00:00:00Z', 'userId', 'd1503000-0000-4000-8000-000000000002')), active
FROM (VALUES
  (801, 'Orientation', 'checkbox', NULL::text, true),
  (802, 'Paperwork', 'paperwork', 'Reviewed', true),
  (803, 'Historic task', 'checkbox', NULL, true),
  (804, 'Orientation', 'paperwork', 'Reviewed', true),
  (805, 'Training', 'training', NULL, false),
  (806, 'Orientation', 'checkbox', NULL, false),
  (807, 'Paperwork', 'paperwork', 'Reviewed', false)
) s(step_id, step_name, step_type, current_stage, active);
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, step_name, step_type, completed, notes
) VALUES
('d1503000-0000-4000-8000-000000000808', 'd1503000-0000-4000-8000-000000000102', 'd1503000-0000-4000-8000-000000000705', 'Foreign saved work', 'checkbox', true,
 '[{"text":"Foreign note","timestamp":"2030-01-01T00:00:00Z","userId":"d1503000-0000-4000-8000-000000000001"}]'),
('d1503000-0000-4000-8000-000000000809', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000703', 'Orientation', 'checkbox', true,
 '[{"text":"Retry note","timestamp":"2030-01-01T00:00:00Z","userId":"d1503000-0000-4000-8000-000000000002"}]');

SELECT is((SELECT prosecdef FROM pg_proc WHERE oid = 'public.reconcile_onboarding_packet(uuid,uuid,uuid)'::regprocedure),
  true, 'reconciliation is the command that writes step shape after checking the caller');
SELECT ok(has_function_privilege('authenticated', 'public.reconcile_onboarding_packet(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated callers can request reconciliation');
SELECT ok(NOT has_function_privilege('anon', 'public.reconcile_onboarding_packet(uuid,uuid,uuid)', 'EXECUTE'),
  'anonymous callers cannot invoke reconciliation');
SELECT ok(NOT has_function_privilege('service_role', 'public.reconcile_onboarding_packet(uuid,uuid,uuid)', 'EXECUTE'),
  'the new operation does not grant a privileged provider path');
CREATE TEMP TABLE packet_before AS SELECT to_jsonb(p) AS row_data FROM public.personnel_onboardings p
  WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102');
CREATE TEMP TABLE progress_before AS SELECT to_jsonb(p) AS row_data FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000404') $$,
  'P0002', 'Onboarding template not found', 'even a dual-Organization configurator cannot select a foreign template');
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000704','d1503000-0000-4000-8000-000000000401') $$,
  'P0001', NULL, 'a cancelled packet cannot be reconciled');
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000706','d1503000-0000-4000-8000-000000000402') $$,
  'P0001', NULL, 'a completed packet cannot switch templates');
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000706') $$,
  'P0001', NULL, 'a completed packet cannot resync its saved template');
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701') $$,
  'P0001', 'Cannot resync: template has been deleted', 'resync cannot guess a template for an unassigned packet');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(p) FROM public.personnel_onboardings p WHERE organization_id IN
  ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT row_data FROM packet_before ORDER BY row_data->>'id' $$, 'rejected requests retain every packet field, including completed dates and template');
SELECT results_eq($$ SELECT to_jsonb(p) FROM public.onboarding_step_progress p WHERE organization_id IN
  ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT row_data FROM progress_before ORDER BY row_data->>'id' $$, 'rejected requests retain every saved progress field, including completed work and attributed notes');

CREATE FUNCTION pg_temp.fail_packet_training_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.onboarding_id = 'd1503000-0000-4000-8000-000000000703'
    AND NEW.template_step_id = 'd1503000-0000-4000-8000-000000000503' THEN
    RAISE EXCEPTION 'synthetic packet insert failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER fail_packet_training_insert BEFORE INSERT ON public.onboarding_step_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_packet_training_insert();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000703','d1503000-0000-4000-8000-000000000401') $$,
  '23514', 'synthetic packet insert failure', 'a genuine insert failure propagates');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(p) FROM public.personnel_onboardings p WHERE organization_id IN
  ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT row_data FROM packet_before ORDER BY row_data->>'id' $$, 'failed first assignment rolls back the parent selection');
SELECT results_eq($$ SELECT to_jsonb(p) FROM public.onboarding_step_progress p WHERE organization_id IN
  ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT row_data FROM progress_before ORDER BY row_data->>'id' $$, 'failed first assignment rolls back adoption, metadata and earlier inserts');
DROP TRIGGER fail_packet_training_insert ON public.onboarding_step_progress;
CREATE FUNCTION pg_temp.fail_packet_parent_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 'd1503000-0000-4000-8000-000000000703' AND NEW.template_id IS NOT NULL THEN
    RAISE EXCEPTION 'synthetic packet parent failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER fail_packet_parent_assignment BEFORE UPDATE ON public.personnel_onboardings
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_packet_parent_assignment();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000703','d1503000-0000-4000-8000-000000000401') $$,
  '23514', 'synthetic packet parent failure', 'a parent assignment failure propagates after the step diff');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(p) FROM public.onboarding_step_progress p WHERE organization_id IN
  ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT row_data FROM progress_before ORDER BY row_data->>'id' $$, 'failed parent assignment rolls back the entire completed step diff');
SELECT results_eq($$ SELECT to_jsonb(p) FROM public.personnel_onboardings p WHERE organization_id IN
  ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT row_data FROM packet_before ORDER BY row_data->>'id' $$, 'failed parent assignment retains every original packet field');
DROP TRIGGER fail_packet_parent_assignment ON public.personnel_onboardings;
SET LOCAL ROLE authenticated;
SELECT is(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000703','d1503000-0000-4000-8000-000000000401')->>'template_id',
  'd1503000-0000-4000-8000-000000000401', 'retry selects the requested template');
SELECT is((SELECT completed FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000809'),
  true, 'retry adopts the original completed step');
SELECT is((SELECT notes->0->>'text' FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000809'),
  'Retry note', 'retry keeps the original attributed note');
SELECT is((SELECT current_stage FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000703'
  AND template_step_id='d1503000-0000-4000-8000-000000000502'), 'Draft', 'new paperwork starts at the first saved template stage');
RESET ROLE;
CREATE TEMP TABLE retry_ids AS SELECT id FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000703';
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000703','d1503000-0000-4000-8000-000000000401')->'steps'), 4, 'replay returns four steps without duplicates');
RESET ROLE;
SELECT results_eq($$ SELECT id FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000703' ORDER BY id $$,
  $$ SELECT id FROM retry_ids ORDER BY id $$, 'replay retains every saved identity');

CREATE TEMP TABLE response(value jsonb);
GRANT ALL ON TABLE response TO authenticated;
SET LOCAL ROLE authenticated;
INSERT INTO response VALUES(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401'));
SELECT is((SELECT value->'old_template_id' FROM response), 'null'::jsonb, 'first assignment reports the locked unassigned parent');
SELECT is((SELECT jsonb_array_length(value->'steps') FROM response), 9, 'the immediate response includes retained inactive history');
SELECT results_eq($$ SELECT (item->>'sort_order')::integer, (item->>'id')::uuid
  FROM response, jsonb_array_elements(value->'steps') WITH ORDINALITY AS entries(item,n) ORDER BY n $$,
  $$ SELECT sort_order, id FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000701' ORDER BY sort_order,id $$,
  'response order agrees with saved progress order');
SELECT results_eq($$ SELECT template_step_id, completed FROM public.onboarding_step_progress
  WHERE onboarding_id='d1503000-0000-4000-8000-000000000701' AND active ORDER BY sort_order $$,
  $$ VALUES ('d1503000-0000-4000-8000-000000000504'::uuid,true),
    ('d1503000-0000-4000-8000-000000000501'::uuid,false),
    ('d1503000-0000-4000-8000-000000000502'::uuid,true),
    ('d1503000-0000-4000-8000-000000000503'::uuid,false) $$,
  'one legacy checkbox is adopted at most once; inactive linked work is reused and new steps start incomplete');
SELECT is((SELECT current_stage FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000807'),
  'Reviewed', 'a valid saved paperwork stage survives reactivation');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000701'
  AND id IN ('d1503000-0000-4000-8000-000000000802','d1503000-0000-4000-8000-000000000803','d1503000-0000-4000-8000-000000000804',
    'd1503000-0000-4000-8000-000000000805','d1503000-0000-4000-8000-000000000806') AND NOT active),
  5, 'unmatched, wrong-type and already inactive legacy rows remain history');
RESET ROLE;
SELECT results_eq($$ SELECT id,completed,current_stage,notes FROM public.onboarding_step_progress
  WHERE id BETWEEN 'd1503000-0000-4000-8000-000000000801' AND 'd1503000-0000-4000-8000-000000000807' ORDER BY id $$,
  $$ SELECT (row_data->>'id')::uuid,(row_data->>'completed')::boolean,row_data->>'current_stage',row_data->'notes'
    FROM progress_before WHERE row_data->>'onboarding_id'='d1503000-0000-4000-8000-000000000701' ORDER BY row_data->>'id' $$,
  'first assignment retains all seven original identities, work and attributed notes');
UPDATE public.onboarding_template_steps SET name='Renamed Orientation',sort_order=5 WHERE id='d1503000-0000-4000-8000-000000000504';
UPDATE public.onboarding_template_steps SET stages='["Submitted","Approved"]',sort_order=15 WHERE id='d1503000-0000-4000-8000-000000000502';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000701') $$,
  'ordinary resync applies edited metadata');
SELECT results_eq($$ SELECT step_name,sort_order,completed FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000801' $$,
  $$ VALUES ('Renamed Orientation'::text,5,true) $$, 'rename/reorder preserve completed checkbox work');
SELECT results_eq($$ SELECT current_stage,completed,notes->0->>'text' FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000807' $$,
  $$ VALUES ('Submitted'::text,false,'Retained note 807'::text) $$, 'invalid paperwork stage resets to the new first stage without losing notes');
RESET ROLE;
DELETE FROM public.onboarding_template_steps WHERE id='d1503000-0000-4000-8000-000000000504';
INSERT INTO public.onboarding_template_steps(id,organization_id,template_id,name,step_type,sort_order) VALUES
  ('d1503000-0000-4000-8000-000000000505','d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000401','Renamed Orientation','checkbox',5);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000701')->'steps'),
  10, 'a replacement definition receives a fresh saved step');
SELECT results_eq($$ SELECT template_step_id,active,completed,notes->0->>'text' FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000801' $$,
  $$ VALUES (NULL::uuid,false,true,'Retained note 801'::text) $$, 'deleted-definition work remains inactive history, even when its name matches');
SELECT is((SELECT completed FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000701' AND template_step_id='d1503000-0000-4000-8000-000000000505'),
  false, 'replacement definition does not inherit completed historical work');
SELECT is(jsonb_array_length(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000402')->'steps'),
  13, 'switch retains prior history and creates three distinct target steps');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000701' AND active),
  3, 'switch exposes only the selected template steps');
SELECT is(jsonb_array_length(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401')->'steps'),
  13, 'switching back reuses linked saved rows');
SELECT is(jsonb_array_length(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000403')->'steps'),
  13, 'an empty template keeps every saved row as history');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000701' AND active),
  0, 'an empty template leaves no active definitions');
RESET ROLE;
SELECT results_eq($$ SELECT to_jsonb(p) FROM public.onboarding_step_progress p WHERE id='d1503000-0000-4000-8000-000000000808' $$,
  $$ SELECT row_data FROM progress_before WHERE row_data->>'id'='d1503000-0000-4000-8000-000000000808' $$,
  'all successful local reconciliations retain the foreign packet sentinel');
SELECT * FROM finish();
ROLLBACK;
