-- A step's progress timestamp moves only when its completion or stage changes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id, email) VALUES
('d1665000-0000-4000-8000-000000000001', 'onboarding-moved-operate@example.test'),
('d1665000-0000-4000-8000-000000000002', 'onboarding-moved-configure@example.test');
INSERT INTO public.organizations(id, name, created_by) VALUES
('d1665000-0000-4000-8000-000000000101', 'Moved Alpha', 'd1665000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1665000-0000-4000-8000-000000000101'::uuid,
  ('d1665000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer',
  jsonb_build_object('onboarding', capability, 'personnel', 'none', 'training', 'none', 'calendar', 'none'),
  'organization', ARRAY[]::uuid[]
FROM (VALUES (1, 'operate'), (2, 'configure')) a(actor, capability);
INSERT INTO public.personnel(id, organization_id, rank, first_name, last_name, slug) VALUES
('d1665000-0000-4000-8000-000000000301', 'd1665000-0000-4000-8000-000000000101', 'SPC', 'Moved', 'Alpha', 'moved-alpha'),
('d1665000-0000-4000-8000-000000000302', 'd1665000-0000-4000-8000-000000000101', 'SPC', 'Started', 'Bravo', 'started-bravo');
INSERT INTO public.onboarding_templates(id, organization_id, name) VALUES
('d1665000-0000-4000-8000-000000000401', 'd1665000-0000-4000-8000-000000000101', 'Moved template');
INSERT INTO public.onboarding_template_steps(id, organization_id, template_id, name, step_type, stages, sort_order) VALUES
('d1665000-0000-4000-8000-000000000501', 'd1665000-0000-4000-8000-000000000101', 'd1665000-0000-4000-8000-000000000401', 'Orientation', 'checkbox', NULL, 0),
('d1665000-0000-4000-8000-000000000502', 'd1665000-0000-4000-8000-000000000101', 'd1665000-0000-4000-8000-000000000401', 'Finance', 'paperwork', '["Submitted","At Finance","Confirmed"]', 1);
INSERT INTO public.personnel_onboardings(id, organization_id, personnel_id, template_id, status, started_at) VALUES
('d1665000-0000-4000-8000-000000000701', 'd1665000-0000-4000-8000-000000000101', 'd1665000-0000-4000-8000-000000000301', 'd1665000-0000-4000-8000-000000000401', 'in_progress', '2030-01-01');
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, template_step_id, step_name, step_type, stages, sort_order, completed, current_stage, notes, active
) VALUES
('d1665000-0000-4000-8000-000000000801', 'd1665000-0000-4000-8000-000000000101', 'd1665000-0000-4000-8000-000000000701', 'd1665000-0000-4000-8000-000000000501', 'Orientation', 'checkbox', NULL, 0, false, NULL, '[]', true),
('d1665000-0000-4000-8000-000000000802', 'd1665000-0000-4000-8000-000000000101', 'd1665000-0000-4000-8000-000000000701', 'd1665000-0000-4000-8000-000000000502', 'Finance', 'paperwork', '["Submitted","At Finance","Confirmed"]', 1, false, 'Submitted', '[]', true);

SELECT col_not_null('public', 'onboarding_step_progress', 'progress_changed_at', 'progress_changed_at is required');
SELECT col_default_is('public', 'onboarding_step_progress', 'progress_changed_at', 'now()', 'progress_changed_at defaults to now()');
SELECT ok(NOT has_column_privilege('authenticated', 'public.onboarding_step_progress', 'progress_changed_at', 'UPDATE')
  AND NOT has_column_privilege('anon', 'public.onboarding_step_progress', 'progress_changed_at', 'UPDATE'),
  'clients cannot write progress_changed_at directly');

-- Backdate both steps so a move to now() is observable inside one transaction.
UPDATE public.onboarding_step_progress SET progress_changed_at = '2030-01-01T00:00:00Z'
WHERE onboarding_id = 'd1665000-0000-4000-8000-000000000701';
SELECT is((SELECT count(*)::int FROM public.onboarding_step_progress
  WHERE onboarding_id = 'd1665000-0000-4000-8000-000000000701' AND progress_changed_at = '2030-01-01T00:00:00Z'),
  2, 'a write that leaves completion and stage alone keeps the written timestamp');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1665000-0000-4000-8000-000000000001', true);

UPDATE public.onboarding_step_progress SET current_stage = 'Submitted'
WHERE id = 'd1665000-0000-4000-8000-000000000802';
SELECT is((SELECT progress_changed_at FROM public.onboarding_step_progress WHERE id = 'd1665000-0000-4000-8000-000000000802'),
  '2030-01-01T00:00:00Z'::timestamptz, 'writing the same stage leaves the timestamp alone');

SELECT lives_ok($$ SELECT public.append_onboarding_step_note('d1665000-0000-4000-8000-000000000101',
  'd1665000-0000-4000-8000-000000000802', 'Waiting on Finance') $$, 'operate appends a note');
SELECT is((SELECT progress_changed_at FROM public.onboarding_step_progress WHERE id = 'd1665000-0000-4000-8000-000000000802'),
  '2030-01-01T00:00:00Z'::timestamptz, 'a note-only change leaves the timestamp alone');

UPDATE public.onboarding_step_progress SET current_stage = 'At Finance'
WHERE id = 'd1665000-0000-4000-8000-000000000802';
SELECT is((SELECT progress_changed_at FROM public.onboarding_step_progress WHERE id = 'd1665000-0000-4000-8000-000000000802'),
  now(), 'a stage change moves the timestamp');

UPDATE public.onboarding_step_progress SET completed = true
WHERE id = 'd1665000-0000-4000-8000-000000000801';
SELECT is((SELECT progress_changed_at FROM public.onboarding_step_progress WHERE id = 'd1665000-0000-4000-8000-000000000801'),
  now(), 'a completion change moves the timestamp');

SELECT throws_ok($$ UPDATE public.onboarding_step_progress SET progress_changed_at = '2000-01-01T00:00:00Z'
  WHERE id = 'd1665000-0000-4000-8000-000000000801' $$, '42501', NULL, 'operate cannot set the timestamp directly');

SELECT ok((SELECT bool_and(step ? 'progress_changed_at') FROM jsonb_array_elements(
  public.start_onboarding_packet('d1665000-0000-4000-8000-000000000101', 'd1665000-0000-4000-8000-000000000302',
    'd1665000-0000-4000-8000-000000000401', '2030-02-01', '[]'::jsonb) -> 'steps') step),
  'Start returns progress_changed_at on every saved step');

RESET ROLE;
UPDATE public.onboarding_step_progress SET progress_changed_at = '2030-01-01T00:00:00Z'
WHERE onboarding_id = 'd1665000-0000-4000-8000-000000000701';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1665000-0000-4000-8000-000000000002', true);
SELECT ok((SELECT bool_and(step ? 'progress_changed_at') FROM jsonb_array_elements(
  public.reconcile_onboarding_packet('d1665000-0000-4000-8000-000000000101', 'd1665000-0000-4000-8000-000000000701') -> 'steps') step),
  'reconciliation returns progress_changed_at on every step');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.onboarding_step_progress
  WHERE onboarding_id = 'd1665000-0000-4000-8000-000000000701' AND progress_changed_at = '2030-01-01T00:00:00Z'),
  2, 'reconciliation that keeps completion and stages leaves the timestamps alone');

SELECT * FROM finish();
ROLLBACK;
