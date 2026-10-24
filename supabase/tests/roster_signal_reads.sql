-- The roster signals read returns, as the signed-in caller, exactly the active People and facts that caller may see.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  WHERE p.proname = 'roster_signals' AND p.pronamespace = 'public'::regnamespace
    AND acl.privilege_type = 'EXECUTE' AND (acl.grantee = 0 OR acl.grantee = 'anon'::regrole)
), 'the roster signals read has no PUBLIC or anon execute grant');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p
  WHERE p.proname = 'roster_signals' AND p.pronamespace = 'public'::regnamespace AND p.prosecdef
), 'the roster signals read runs as the caller');

INSERT INTO auth.users (id, email)
SELECT ('c9000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'roster-signal-' || n || '@example.test'
FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('c9000000-0000-4000-8000-000000000101', 'Signals Alpha', 'c9000000-0000-4000-8000-000000000001'),
('c9000000-0000-4000-8000-000000000102', 'Signals Bravo', 'c9000000-0000-4000-8000-000000000004');
INSERT INTO public.groups (id, organization_id, name) VALUES
('c9000000-0000-4000-8000-000000000201', 'c9000000-0000-4000-8000-000000000101', 'Alpha One'),
('c9000000-0000-4000-8000-000000000202', 'c9000000-0000-4000-8000-000000000101', 'Alpha Two');
-- 1 Organization-wide reader of every lane and configurer of Personnel; 2 the same scoped to Alpha One;
-- 3 Organization-wide with every other lane off and Personnel view only; 4 owner of Bravo only.
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000001', 'member', 'viewer',
 '{"calendar":"view","training":"view","criticalTasks":"view","ratingScheme":"view","personnel":"configure"}',
 'organization', ARRAY[]::uuid[]),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000002', 'member', 'viewer',
 '{"calendar":"view","training":"view","criticalTasks":"view","ratingScheme":"view","personnel":"configure"}',
 'groups', ARRAY['c9000000-0000-4000-8000-000000000201']::uuid[]),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000003', 'member', 'viewer',
 '{"calendar":"none","training":"none","criticalTasks":"none","ratingScheme":"none","personnel":"view"}',
 'organization', ARRAY[]::uuid[]),
('c9000000-0000-4000-8000-000000000102', 'c9000000-0000-4000-8000-000000000004', 'owner', 'editor', '{}',
 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, mos, clinic_role, archived_at) VALUES
('c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000201', 'SGT', 'One', 'Alpha', 'signal-one', '68W', 'Medic', NULL),
('c9000000-0000-4000-8000-000000000302', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000201', 'SPC', 'Archived', 'Alpha', 'signal-archived', '68W', '', '2026-01-01'),
('c9000000-0000-4000-8000-000000000303', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000202', 'SPC', 'Two', 'Alpha', 'signal-two', '68W', '', NULL),
('c9000000-0000-4000-8000-000000000304', 'c9000000-0000-4000-8000-000000000101', NULL, 'PFC', 'Unassigned', 'Alpha', 'signal-unassigned', '68W', '', NULL),
('c9000000-0000-4000-8000-000000000305', 'c9000000-0000-4000-8000-000000000102', NULL, 'SPC', 'Other', 'Bravo', 'signal-bravo', '68W', '', NULL);

INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order) VALUES
('c9000000-0000-4000-8000-000000000401', 'c9000000-0000-4000-8000-000000000101', 'Leave', '#16a34a', '#ffffff', 1),
('c9000000-0000-4000-8000-000000000402', 'c9000000-0000-4000-8000-000000000101', 'TDY', '#2563eb', '#ffffff', 0),
('c9000000-0000-4000-8000-000000000403', 'c9000000-0000-4000-8000-000000000102', 'Bravo leave', '#16a34a', '#ffffff', 0);
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
('c9000000-0000-4000-8000-000000000501', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000401', '2026-10-20', '2026-10-25'),
('c9000000-0000-4000-8000-000000000502', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000402', '2026-09-01', '2026-10-22'),
('c9000000-0000-4000-8000-000000000503', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000302', 'c9000000-0000-4000-8000-000000000401', '2026-10-23', '2026-10-23'),
('c9000000-0000-4000-8000-000000000504', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000303', 'c9000000-0000-4000-8000-000000000402', '2026-10-23', '2026-10-23'),
('c9000000-0000-4000-8000-000000000505', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000304', 'c9000000-0000-4000-8000-000000000401', '2026-10-24', '2026-10-30'),
('c9000000-0000-4000-8000-000000000506', 'c9000000-0000-4000-8000-000000000102', 'c9000000-0000-4000-8000-000000000305', 'c9000000-0000-4000-8000-000000000403', '2026-10-23', '2026-10-23');

INSERT INTO public.training_types (id, organization_id, name, expiration_months, sort_order) VALUES
('c9000000-0000-4000-8000-000000000601', 'c9000000-0000-4000-8000-000000000101', 'CPR/BLS', 24, 0);
INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id, completion_date, expiration_date) VALUES
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000601', '2024-10-01', '2026-10-01'),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000303', 'c9000000-0000-4000-8000-000000000601', '2026-01-10', '2028-01-10');

INSERT INTO public.ict_tasks (id, organization_id, task_code, title, mos, archived_at) VALUES
('c9000000-0000-4000-8000-000000000701', 'c9000000-0000-4000-8000-000000000101', 'A-001', 'Airway', ARRAY['68W'], NULL),
('c9000000-0000-4000-8000-000000000702', 'c9000000-0000-4000-8000-000000000101', 'A-002', 'Retired task', ARRAY['68W'], '2026-01-01');
INSERT INTO public.personnel_ict_completions
  (organization_id, personnel_id, ict_task_id, completed_at, validation_method, validated_by, created_at) VALUES
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000701', '2026-07-01', 'Practical Exercise', 'SFC Later', '2026-07-02 08:00+00'),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000701', '2026-06-01', 'Practical Exercise', 'SFC Older', '2026-07-03 08:00+00'),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000702', '2026-06-01', 'Practical Exercise', NULL, '2026-06-01 08:00+00');

INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end, status, workflow_status) VALUES
('c9000000-0000-4000-8000-000000000801', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'NCOER', '2026-01-01', '2027-01-01', 'completed', 'completed'),
('c9000000-0000-4000-8000-000000000802', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'NCOER', '2025-12-01', '2026-12-01', 'active', 'drafting'),
('c9000000-0000-4000-8000-000000000803', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'NCOER', '2025-06-01', '2026-06-01', 'active', NULL),
('c9000000-0000-4000-8000-000000000804', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000303', 'NCOER', '2025-12-01', '2026-12-01', 'active', NULL);

INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, due_date, status, created_by, created_at) VALUES
('c9000000-0000-4000-8000-000000000901', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'Undated', NULL, 'open', 'SFC Lead', '2026-10-01 08:00+00'),
('c9000000-0000-4000-8000-000000000902', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'Call home', '2026-10-20', 'open', 'SFC Lead', '2026-10-02 08:00+00'),
('c9000000-0000-4000-8000-000000000903', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', 'Done', '2026-10-01', 'completed', 'SFC Lead', '2026-10-03 08:00+00'),
('c9000000-0000-4000-8000-000000000904', 'c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000303', 'Two follow-up', '2026-10-25', 'open', 'SFC Lead', '2026-10-04 08:00+00');

INSERT INTO public.counseling_records (organization_id, personnel_id, date_conducted, subject, title, uploaded_by, archived_at) VALUES
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', '2025-12-15', 'Monthly', 'Monthly', 'SFC Lead', NULL),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', '2026-03-10', 'Monthly', 'Monthly', 'SFC Lead', NULL),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', '2026-09-01', 'Monthly', 'Monthly', 'SFC Lead', now()),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000301', '2026-11-01', 'Planned', 'Planned', 'SFC Lead', NULL),
('c9000000-0000-4000-8000-000000000101', 'c9000000-0000-4000-8000-000000000303', '2025-10-31', 'Monthly', 'Monthly', 'SFC Lead', NULL);

CREATE FUNCTION pg_temp.ids(p jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(CASE jsonb_typeof(v) WHEN 'array' THEN v->>0 ELSE v #>> '{}' END ORDER BY 1), ARRAY[]::text[])
  FROM jsonb_array_elements(p) v
$$;

-- One source of the single statement, as the dispatcher asks for it.
CREATE FUNCTION pg_temp.sig(p_source text, p_ids uuid[] DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.roster_signals('c9000000-0000-4000-8000-000000000101', '2026-10-23', '2025-11-01', ARRAY[p_source], p_ids) -> p_source
$$;

SET LOCAL ROLE authenticated;

-- Organization-wide reader.
SELECT set_config('request.jwt.claim.sub', 'c9000000-0000-4000-8000-000000000001', true);
SELECT is(pg_temp.ids(pg_temp.sig('availability') -> 'cohort'),
  ARRAY['c9000000-0000-4000-8000-000000000301', 'c9000000-0000-4000-8000-000000000303', 'c9000000-0000-4000-8000-000000000304'],
  'presence cohort is every active Person, not the archived one');
SELECT is(pg_temp.sig('availability') -> 'entries',
  '[["c9000000-0000-4000-8000-000000000501", "c9000000-0000-4000-8000-000000000301", "c9000000-0000-4000-8000-000000000401", "2026-10-20"],
    ["c9000000-0000-4000-8000-000000000504", "c9000000-0000-4000-8000-000000000303", "c9000000-0000-4000-8000-000000000402", "2026-10-23"]]'::jsonb,
  'presence entries are those covering the day, for active People only');
SELECT is(pg_temp.sig('availability') -> 'statusTypes',
  '[{"id": "c9000000-0000-4000-8000-000000000402", "name": "TDY", "color": "#2563eb", "textColor": "#ffffff", "sortOrder": 0},
    {"id": "c9000000-0000-4000-8000-000000000401", "name": "Leave", "color": "#16a34a", "textColor": "#ffffff", "sortOrder": 1}]'::jsonb,
  'status types come in catalog order, this Organization only');
SELECT is(pg_temp.sig('availability',
    ARRAY['c9000000-0000-4000-8000-000000000303']::uuid[]) -> 'cohort',
  '["c9000000-0000-4000-8000-000000000303"]'::jsonb, 'a Person list narrows the cohort');

SELECT is(public.roster_signals('c9000000-0000-4000-8000-000000000101', '2026-10-23', '2025-11-01',
    ARRAY['availability', 'followUps']) ->> 'training', NULL, 'a source the caller did not name is not computed');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_each(public.roster_signals(
    'c9000000-0000-4000-8000-000000000101', '2026-10-23', '2025-11-01', ARRAY['availability', 'followUps'])) AS e(k, v)
    WHERE jsonb_typeof(v) = 'object'),
  ARRAY['availability', 'followUps'], 'the named sources come back together from one statement');

SELECT is(pg_temp.sig('training') -> 'completions',
  '[["c9000000-0000-4000-8000-000000000301", "c9000000-0000-4000-8000-000000000601", "2024-10-01", "2026-10-01"],
    ["c9000000-0000-4000-8000-000000000303", "c9000000-0000-4000-8000-000000000601", "2026-01-10", "2028-01-10"]]'::jsonb,
  'training completions cover the visible active People');
SELECT is((pg_temp.sig('training') -> 'cohort') -> 0,
  '["c9000000-0000-4000-8000-000000000301", "SGT", "68W", "Medic"]'::jsonb, 'training cohort carries rank, MOS and role');
SELECT is(pg_temp.sig('training') #>> '{types,0,name}', 'CPR/BLS',
  'training types come with the read');

SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
    pg_temp.sig('training') -> 'types' -> 0) k),
  ARRAY['applies_to_mos', 'applies_to_ranks', 'applies_to_roles', 'can_be_exempted', 'excluded_mos', 'excluded_ranks',
    'excluded_roles', 'exempt_personnel_ids', 'expiration_date_only', 'expiration_months', 'id', 'is_optional', 'name',
    'warning_days_orange', 'warning_days_yellow'],
  'training types carry only the columns readiness reads');

SELECT is(pg_temp.sig('criticalTasks') -> 'completions',
  '[["c9000000-0000-4000-8000-000000000301", "c9000000-0000-4000-8000-000000000701", "2026-07-01", "2026-07-02T08:00:00+00:00", "SFC Later"]]'::jsonb,
  'critical tasks give the newest validation per active task, by date before record time');
SELECT is(jsonb_array_length(pg_temp.sig('criticalTasks') -> 'tasks'), 1,
  'retired tasks are left out');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
    pg_temp.sig('criticalTasks') -> 'tasks' -> 0) k),
  ARRAY['expiration_months', 'id', 'mos', 'task_code', 'title'],
  'critical tasks carry only the columns readiness reads');

SELECT is(pg_temp.sig('evaluations') -> 'entries',
  '[["c9000000-0000-4000-8000-000000000301", "c9000000-0000-4000-8000-000000000802", "NCOER", null, "2025-12-01", "2026-12-01", "active", "drafting"],
    ["c9000000-0000-4000-8000-000000000303", "c9000000-0000-4000-8000-000000000804", "NCOER", null, "2025-12-01", "2026-12-01", "active", null]]'::jsonb,
  'the active evaluation is the latest-ending entry not completed');

SELECT is(pg_temp.sig('followUps') -> 'open',
  '[["c9000000-0000-4000-8000-000000000902", "c9000000-0000-4000-8000-000000000301", "Call home", "2026-10-20"],
    ["c9000000-0000-4000-8000-000000000904", "c9000000-0000-4000-8000-000000000303", "Two follow-up", "2026-10-25"],
    ["c9000000-0000-4000-8000-000000000901", "c9000000-0000-4000-8000-000000000301", "Undated", null]]'::jsonb,
  'open follow-ups come soonest due first, undated last');

SELECT is(pg_temp.sig('counseling') -> 'latest',
  '[["c9000000-0000-4000-8000-000000000301", "2026-03-10"]]'::jsonb,
  'counseling gives the latest held, unarchived record inside the window');

-- Group-scoped reader sees Alpha One only.
SELECT set_config('request.jwt.claim.sub', 'c9000000-0000-4000-8000-000000000002', true);
SELECT is(pg_temp.sig('availability') -> 'cohort',
  '["c9000000-0000-4000-8000-000000000301"]'::jsonb, 'Group reader: presence cohort is its Group');
SELECT is(jsonb_array_length(pg_temp.sig('availability') -> 'entries'), 1,
  'Group reader: presence entries are its Group''s');
SELECT is(pg_temp.ids(pg_temp.sig('training') -> 'completions'),
  ARRAY['c9000000-0000-4000-8000-000000000301'], 'Group reader: training is its Group''s');
SELECT is(pg_temp.ids(pg_temp.sig('evaluations') -> 'entries'),
  ARRAY['c9000000-0000-4000-8000-000000000301'], 'Group reader: evaluations are its Group''s');
SELECT is(pg_temp.ids(pg_temp.sig('followUps') -> 'cohort'),
  ARRAY['c9000000-0000-4000-8000-000000000301'], 'Group reader: follow-up cohort is its Group');
SELECT is(jsonb_array_length(pg_temp.sig('followUps') -> 'open'), 2,
  'Group reader: open follow-ups are its Group''s');

-- Lanes off and Personnel view without configure read nothing, and say so with an empty cohort.
SELECT set_config('request.jwt.claim.sub', 'c9000000-0000-4000-8000-000000000003', true);
SELECT is(pg_temp.sig('availability') -> 'cohort', '[]'::jsonb,
  'no Calendar view: empty presence cohort');
SELECT is(pg_temp.sig('availability') -> 'entries', '[]'::jsonb,
  'no Calendar view: no entries');
SELECT is(pg_temp.sig('training') -> 'completions', '[]'::jsonb,
  'no Training view: no completions');
SELECT is(pg_temp.sig('followUps'),
  '{"cohort": [], "open": []}'::jsonb, 'Personnel view without configure: no follow-ups');
SELECT is(pg_temp.sig('counseling'),
  '{"cohort": [], "latest": []}'::jsonb, 'Personnel view without configure: no counseling');

-- Another Organization's owner reads nothing here.
SELECT set_config('request.jwt.claim.sub', 'c9000000-0000-4000-8000-000000000004', true);
SELECT is(pg_temp.sig('availability') -> 'cohort', '[]'::jsonb,
  'foreign owner: empty presence cohort');
SELECT is(pg_temp.sig('followUps') -> 'cohort', '[]'::jsonb,
  'foreign owner: empty follow-up cohort');
SELECT is(pg_temp.sig('evaluations') -> 'cohort', '[]'::jsonb,
  'foreign owner: empty evaluation cohort');

-- A turned-off feature reads nothing even if called.
RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY['training'] WHERE id = 'c9000000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c9000000-0000-4000-8000-000000000001', true);
SELECT is(pg_temp.sig('training') -> 'cohort', '[]'::jsonb,
  'Training off: empty training cohort');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.roster_signals('c9000000-0000-4000-8000-000000000101', '2026-10-23', '2025-11-01', ARRAY['availability']) $$,
  '42501', NULL, 'anonymous callers cannot run the roster signals read');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
