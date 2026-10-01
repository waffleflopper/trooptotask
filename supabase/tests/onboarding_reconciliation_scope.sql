-- Direct reconciliation requests keep Configure and the saved Person's scope.
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
CREATE TEMP TABLE scope_packets_before AS SELECT id,to_jsonb(p) AS row_data FROM public.personnel_onboardings p
  WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102');
CREATE TEMP TABLE scope_progress_before AS SELECT id,to_jsonb(p) AS row_data FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401') $$,
  '42501', NULL, 'a missing authenticated identity cannot configure a packet');
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000002', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401') $$,
  '42501', NULL, 'Operate does not imply Configure');
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000003', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401') $$,
  '42501', NULL, 'View does not imply Configure');
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000004', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401') $$,
  '42501', NULL, 'no Onboarding capability cannot configure');
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000005', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000702','d1503000-0000-4000-8000-000000000401') $$,
  'P0002', 'Onboarding not found', 'a different Group is an invisible direct-call target');
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000703','d1503000-0000-4000-8000-000000000401') $$,
  'P0002', 'Onboarding not found', 'Group-scoped Configure does not include Unassigned Personnel');
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000006', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401') $$,
  'P0002', 'Onboarding not found', 'an empty Group scope has no packet targets');
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000007', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000102',
  'd1503000-0000-4000-8000-000000000705','d1503000-0000-4000-8000-000000000404') $$,
  '42501', NULL, 'membership in Alpha grants no Configure capability in Bravo');
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000001', true);
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000705','d1503000-0000-4000-8000-000000000401') $$,
  'P0002', 'Onboarding not found', 'dual membership cannot attach a foreign packet to Alpha');
SELECT throws_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000799','d1503000-0000-4000-8000-000000000401') $$,
  'P0002', 'Onboarding not found', 'a genuinely missing packet uses the same invisible-target result');
RESET ROLE;
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.personnel_onboardings p WHERE organization_id IN
  ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,row_data FROM scope_packets_before ORDER BY id $$, 'every denied request retains all packet fields in both Organizations');
SELECT results_eq($$ SELECT id,to_jsonb(p) FROM public.onboarding_step_progress p WHERE organization_id IN
  ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102') ORDER BY id $$,
  $$ SELECT id,row_data FROM scope_progress_before ORDER BY id $$, 'every denied request retains all progress fields in both Organizations');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000005', true);
SELECT is(public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000701','d1503000-0000-4000-8000-000000000401')->>'template_id',
  'd1503000-0000-4000-8000-000000000401', 'Group-scoped Configure can assign an in-scope packet without Personnel or Training lanes');
SELECT is((SELECT completed FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000801'),
  true, 'the Group-scoped assignment retains saved work');
RESET ROLE;
UPDATE public.organization_memberships SET role='admin' WHERE organization_id='d1503000-0000-4000-8000-000000000101'
  AND user_id='d1503000-0000-4000-8000-000000000004';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1503000-0000-4000-8000-000000000004', true);
SELECT lives_ok($$ SELECT public.reconcile_onboarding_packet('d1503000-0000-4000-8000-000000000101',
  'd1503000-0000-4000-8000-000000000703','d1503000-0000-4000-8000-000000000401') $$,
  'an Organization admin keeps access to Unassigned Personnel');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
