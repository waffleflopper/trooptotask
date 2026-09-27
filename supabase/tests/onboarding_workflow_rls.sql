-- Operational Onboarding rows, scoped Calendar markers, and cross-tenant references.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email)
SELECT ('a5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'workflow-rls-' || n || '@example.test'
FROM generate_series(1, 8) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('a5000000-0000-4000-8000-000000000101', 'Workflow Alpha', 'a5000000-0000-4000-8000-000000000001'),
('a5000000-0000-4000-8000-000000000102', 'Workflow Bravo', 'a5000000-0000-4000-8000-000000000008');
INSERT INTO public.groups (id, organization_id, name) VALUES
('a5000000-0000-4000-8000-000000000201', 'a5000000-0000-4000-8000-000000000101', 'Alpha One'),
('a5000000-0000-4000-8000-000000000202', 'a5000000-0000-4000-8000-000000000101', 'Alpha Two');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) SELECT 'a5000000-0000-4000-8000-000000000101'::uuid,
  ('a5000000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer', overrides::jsonb, scope_kind,
  CASE WHEN scope_kind = 'groups' THEN ARRAY['a5000000-0000-4000-8000-000000000201']::uuid[]
       ELSE ARRAY[]::uuid[] END
FROM (VALUES
  (1, '{"onboarding":"operate","personnel":"none","calendar":"none"}', 'organization'),
  (2, '{"onboarding":"view","personnel":"none","calendar":"none"}', 'organization'),
  (3, '{"onboarding":"none","personnel":"operate","calendar":"none"}', 'organization'),
  (4, '{"onboarding":"none","personnel":"none","calendar":"view"}', 'organization'),
  (5, '{"onboarding":"operate","personnel":"none","calendar":"none"}', 'groups'),
  (6, '{"onboarding":"none","personnel":"none","calendar":"view"}', 'groups'),
  (7, '{"onboarding":"operate","personnel":"none","calendar":"none"}', 'organization')
) AS actors(actor, overrides, scope_kind);
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
('a5000000-0000-4000-8000-000000000102', 'a5000000-0000-4000-8000-000000000007',
 'member', 'viewer', '{"onboarding":"operate","personnel":"none"}', 'organization', ARRAY[]::uuid[]),
('a5000000-0000-4000-8000-000000000102', 'a5000000-0000-4000-8000-000000000008',
 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);

INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
('a5000000-0000-4000-8000-000000000301', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000201', 'SPC', 'One', 'Alpha', 'workflow-one'),
('a5000000-0000-4000-8000-000000000302', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000202', 'SPC', 'Two', 'Alpha', 'workflow-two'),
('a5000000-0000-4000-8000-000000000303', 'a5000000-0000-4000-8000-000000000101', NULL, 'SPC', 'Free', 'Alpha', 'workflow-free'),
('a5000000-0000-4000-8000-000000000304', 'a5000000-0000-4000-8000-000000000102', NULL, 'SPC', 'One', 'Bravo', 'workflow-bravo');
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
('a5000000-0000-4000-8000-000000000401', 'a5000000-0000-4000-8000-000000000101', 'Alpha Packet'),
('a5000000-0000-4000-8000-000000000402', 'a5000000-0000-4000-8000-000000000102', 'Bravo Packet');
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type) VALUES
('a5000000-0000-4000-8000-000000000501', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000401', 'Alpha Step', 'checkbox'),
('a5000000-0000-4000-8000-000000000502', 'a5000000-0000-4000-8000-000000000102', 'a5000000-0000-4000-8000-000000000402', 'Bravo Step', 'checkbox');
INSERT INTO public.training_types (id, organization_id, name) VALUES
('a5000000-0000-4000-8000-000000000601', 'a5000000-0000-4000-8000-000000000101', 'Alpha Training'),
('a5000000-0000-4000-8000-000000000602', 'a5000000-0000-4000-8000-000000000102', 'Bravo Training');
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id) VALUES
('a5000000-0000-4000-8000-000000000701', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000301', 'a5000000-0000-4000-8000-000000000401'),
('a5000000-0000-4000-8000-000000000702', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000302', 'a5000000-0000-4000-8000-000000000401'),
('a5000000-0000-4000-8000-000000000703', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000303', 'a5000000-0000-4000-8000-000000000401'),
('a5000000-0000-4000-8000-000000000704', 'a5000000-0000-4000-8000-000000000102', 'a5000000-0000-4000-8000-000000000304', 'a5000000-0000-4000-8000-000000000402');
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, template_step_id, step_name, step_type) VALUES
('a5000000-0000-4000-8000-000000000801', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000701', 'a5000000-0000-4000-8000-000000000501', 'One', 'checkbox'),
('a5000000-0000-4000-8000-000000000802', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000702', 'a5000000-0000-4000-8000-000000000501', 'Two', 'checkbox'),
('a5000000-0000-4000-8000-000000000803', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000703', 'a5000000-0000-4000-8000-000000000501', 'Free', 'checkbox');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_onboardings), 3, 'Onboarding-only operator reads own Organization workflows');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress), 3, 'Onboarding-only operator reads step progress');
SELECT lives_ok($$ UPDATE public.personnel_onboardings SET status = 'completed' WHERE id = 'a5000000-0000-4000-8000-000000000702' $$, 'Onboarding-only operator updates workflow');
SELECT lives_ok($$ UPDATE public.onboarding_step_progress SET completed = true WHERE id = 'a5000000-0000-4000-8000-000000000801' $$, 'Onboarding-only operator updates progress');
SELECT lives_ok($$ INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, status) VALUES ('a5000000-0000-4000-8000-000000000705', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000301', 'cancelled') $$, 'Onboarding-only operator inserts workflow');
SELECT lives_ok($$ INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, step_name, step_type) VALUES ('a5000000-0000-4000-8000-000000000805', 'a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000705', 'New', 'checkbox') $$, 'Onboarding-only operator inserts progress');
SELECT lives_ok($$ DELETE FROM public.onboarding_step_progress WHERE id = 'a5000000-0000-4000-8000-000000000805' $$, 'Onboarding-only operator deletes progress');
SELECT lives_ok($$ DELETE FROM public.personnel_onboardings WHERE id = 'a5000000-0000-4000-8000-000000000705' $$, 'Onboarding-only operator deletes workflow');

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_onboardings), 3, 'Onboarding viewer reads workflow');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress), 3, 'Onboarding viewer reads progress');
SELECT throws_ok($$ INSERT INTO public.personnel_onboardings (organization_id, personnel_id, status) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000301', 'cancelled') $$, '42501', NULL, 'Onboarding viewer cannot insert workflow');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (organization_id, onboarding_id, step_name, step_type) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000701', 'Forbidden', 'checkbox') $$, '42501', NULL, 'Onboarding viewer cannot insert progress');

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_onboardings), 3, 'Personnel viewer retains Dashboard workflow reads');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress), 3, 'Personnel viewer retains Dashboard progress reads');
SELECT throws_ok($$ INSERT INTO public.personnel_onboardings (organization_id, personnel_id, status) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000301', 'cancelled') $$, '42501', NULL, 'Personnel-only operator cannot write Onboarding workflow');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (organization_id, onboarding_id, step_name, step_type) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000701', 'Forbidden', 'checkbox') $$, '42501', NULL, 'Personnel-only operator cannot write Onboarding progress');

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_onboardings), 0, 'Calendar-only viewer cannot read full workflows');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress), 0, 'Calendar-only viewer cannot read progress notes');
SELECT is((SELECT string_agg(personnel_id::text, ',' ORDER BY personnel_id) FROM public.active_onboarding_calendar_personnel_ids('a5000000-0000-4000-8000-000000000101')), 'a5000000-0000-4000-8000-000000000301,a5000000-0000-4000-8000-000000000303', 'Calendar-only viewer gets exact active marker IDs but excludes completed workflow');
SELECT is((SELECT count(*)::integer FROM public.active_onboarding_calendar_personnel_ids('a5000000-0000-4000-8000-000000000102')), 0, 'Calendar marker function denies foreign Organization');

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true);
SELECT is((SELECT count(*)::integer FROM public.personnel_onboardings), 1, 'Group-scoped Onboarding operator sees only own Group');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress), 1, 'Group-scoped operator cannot read other or unassigned progress');
SELECT throws_ok($$ INSERT INTO public.personnel_onboardings (organization_id, personnel_id, status) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000303', 'cancelled') $$, '42501', NULL, 'Group-scoped operator cannot start unassigned Personnel workflow');
SELECT throws_ok($$ INSERT INTO public.personnel_onboardings (organization_id, personnel_id, status) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000302', 'cancelled') $$, '42501', NULL, 'Group-scoped operator cannot start other Group workflow');

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000006', true);
SELECT is((SELECT string_agg(personnel_id::text, ',' ORDER BY personnel_id) FROM public.active_onboarding_calendar_personnel_ids('a5000000-0000-4000-8000-000000000101')), 'a5000000-0000-4000-8000-000000000301', 'Group-scoped Calendar markers exclude other and unassigned Personnel');

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000007', true);
SELECT throws_ok($$ INSERT INTO public.personnel_onboardings (organization_id, personnel_id, template_id, status) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000301', 'a5000000-0000-4000-8000-000000000402', 'cancelled') $$, '42501', NULL, 'Dual-Organization operator cannot attach foreign template');
SELECT throws_ok($$ INSERT INTO public.personnel_onboardings (organization_id, personnel_id, status) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000304', 'cancelled') $$, '42501', NULL, 'Dual-Organization operator cannot attach foreign Personnel');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (organization_id, onboarding_id, template_step_id, step_name, step_type) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000704', 'a5000000-0000-4000-8000-000000000501', 'Foreign parent', 'checkbox') $$, '42501', NULL, 'Dual-Organization operator cannot attach foreign onboarding parent');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (organization_id, onboarding_id, template_step_id, step_name, step_type) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000701', 'a5000000-0000-4000-8000-000000000502', 'Foreign step', 'checkbox') $$, '42501', NULL, 'Dual-Organization operator cannot attach foreign template step');
SELECT throws_ok($$ INSERT INTO public.onboarding_step_progress (organization_id, onboarding_id, training_type_id, step_name, step_type) VALUES ('a5000000-0000-4000-8000-000000000101', 'a5000000-0000-4000-8000-000000000701', 'a5000000-0000-4000-8000-000000000602', 'Foreign training', 'training') $$, '42501', NULL, 'Dual-Organization operator cannot attach foreign Training type');
SELECT throws_ok($$ UPDATE public.personnel_onboardings SET organization_id = 'a5000000-0000-4000-8000-000000000102', personnel_id = 'a5000000-0000-4000-8000-000000000304' WHERE id = 'a5000000-0000-4000-8000-000000000701' $$, '23514', NULL, 'Dual-Organization operator cannot move workflow identity');
SELECT throws_ok($$ UPDATE public.onboarding_step_progress SET organization_id = 'a5000000-0000-4000-8000-000000000102', onboarding_id = 'a5000000-0000-4000-8000-000000000704' WHERE id = 'a5000000-0000-4000-8000-000000000801' $$, '23514', NULL, 'Dual-Organization operator cannot move step identity');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.personnel_onboardings), 0, 'Anonymous cannot read workflows');
SELECT is((SELECT count(*)::integer FROM public.onboarding_step_progress), 0, 'Anonymous cannot read progress');
SELECT throws_ok($$ SELECT * FROM public.active_onboarding_calendar_personnel_ids('a5000000-0000-4000-8000-000000000101') $$, '42501', NULL, 'Anonymous cannot call Calendar marker function');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
