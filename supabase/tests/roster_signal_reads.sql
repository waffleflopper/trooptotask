BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(actor text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT id::uuid FROM (VALUES
    ('org_wide_leader', 'c9000000-0000-4000-8000-000000000001'),
    ('group_scoped_leader', 'c9000000-0000-4000-8000-000000000002'),
    ('personnel_viewer', 'c9000000-0000-4000-8000-000000000003'),
    ('bravo_owner', 'c9000000-0000-4000-8000-000000000004'),
    ('non_member', 'c9000000-0000-4000-8000-000000000005'),
    ('training_only_viewer', 'c9000000-0000-4000-8000-000000000006'),
    ('alpha_org', 'c9000000-0000-4000-8000-000000000101'),
    ('bravo_org', 'c9000000-0000-4000-8000-000000000102'),
    ('alpha_one_group', 'c9000000-0000-4000-8000-000000000201'),
    ('alpha_two_group', 'c9000000-0000-4000-8000-000000000202'),
    ('alpha_one_person', 'c9000000-0000-4000-8000-000000000301'),
    ('archived_alpha_person', 'c9000000-0000-4000-8000-000000000302'),
    ('alpha_two_person', 'c9000000-0000-4000-8000-000000000303'),
    ('unassigned_alpha_person', 'c9000000-0000-4000-8000-000000000304'),
    ('bravo_person', 'c9000000-0000-4000-8000-000000000305'),
    ('leave_status', 'c9000000-0000-4000-8000-000000000401'),
    ('tdy_status', 'c9000000-0000-4000-8000-000000000402'),
    ('bravo_leave_status', 'c9000000-0000-4000-8000-000000000403'),
    ('alpha_one_leave', 'c9000000-0000-4000-8000-000000000501'),
    ('past_alpha_one_tdy', 'c9000000-0000-4000-8000-000000000502'),
    ('archived_alpha_leave', 'c9000000-0000-4000-8000-000000000503'),
    ('alpha_two_tdy', 'c9000000-0000-4000-8000-000000000504'),
    ('future_unassigned_leave', 'c9000000-0000-4000-8000-000000000505'),
    ('bravo_leave', 'c9000000-0000-4000-8000-000000000506'),
    ('cpr_training', 'c9000000-0000-4000-8000-000000000601'),
    ('bravo_cpr_training', 'c9000000-0000-4000-8000-000000000602'),
    ('airway_task', 'c9000000-0000-4000-8000-000000000701'),
    ('retired_task', 'c9000000-0000-4000-8000-000000000702'),
    ('bravo_airway_task', 'c9000000-0000-4000-8000-000000000703'),
    ('completed_evaluation', 'c9000000-0000-4000-8000-000000000801'),
    ('current_alpha_one_evaluation', 'c9000000-0000-4000-8000-000000000802'),
    ('older_alpha_one_evaluation', 'c9000000-0000-4000-8000-000000000803'),
    ('current_alpha_two_evaluation', 'c9000000-0000-4000-8000-000000000804'),
    ('undated_follow_up', 'c9000000-0000-4000-8000-000000000901'),
    ('overdue_follow_up', 'c9000000-0000-4000-8000-000000000902'),
    ('completed_follow_up', 'c9000000-0000-4000-8000-000000000903'),
    ('alpha_two_follow_up', 'c9000000-0000-4000-8000-000000000904')
  ) AS fixtures(name, id) WHERE name = actor;
$$;

SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
  WHERE p.proname = 'roster_signals' AND p.pronamespace = 'public'::regnamespace
    AND acl.privilege_type = 'EXECUTE' AND (acl.grantee = 0 OR acl.grantee = 'anon'::regrole OR acl.grantee = 'service_role'::regrole)
), 'the roster signals read has no PUBLIC, anon or service_role execute grant');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p
  WHERE p.proname = 'roster_signals' AND p.pronamespace = 'public'::regnamespace
    AND p.prosecdef AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=""']
), 'the roster signals definer read is stable with an empty search path');

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(actor), 'roster-signal-' || n || '@example.test'
FROM (VALUES
  ('org_wide_leader', 1),
  ('group_scoped_leader', 2),
  ('personnel_viewer', 3),
  ('bravo_owner', 4),
  ('non_member', 5),
  ('training_only_viewer', 6)
) AS users(actor, n);
INSERT INTO public.organizations (id, name, created_by) VALUES
(pg_temp.id('alpha_org'), 'Signals Alpha', pg_temp.id('org_wide_leader')),
(pg_temp.id('bravo_org'), 'Signals Bravo', pg_temp.id('bravo_owner'));
INSERT INTO public.groups (id, organization_id, name) VALUES
(pg_temp.id('alpha_one_group'), pg_temp.id('alpha_org'), 'Alpha One'),
(pg_temp.id('alpha_two_group'), pg_temp.id('alpha_org'), 'Alpha Two');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
(pg_temp.id('alpha_org'), pg_temp.id('org_wide_leader'), 'member', 'viewer',
 '{"calendar":"view","training":"view","criticalTasks":"view","ratingScheme":"view","personnel":"configure"}',
 'organization', ARRAY[]::uuid[]),
(pg_temp.id('alpha_org'), pg_temp.id('group_scoped_leader'), 'member', 'viewer',
 '{"calendar":"view","training":"view","criticalTasks":"view","ratingScheme":"view","personnel":"configure"}',
 'groups', ARRAY[pg_temp.id('alpha_one_group')]::uuid[]),
(pg_temp.id('alpha_org'), pg_temp.id('personnel_viewer'), 'member', 'viewer',
 '{"calendar":"none","training":"none","criticalTasks":"none","ratingScheme":"none","personnel":"view"}',
 'organization', ARRAY[]::uuid[]),
(pg_temp.id('bravo_org'), pg_temp.id('bravo_owner'), 'owner', 'editor', '{}',
 'organization', ARRAY[]::uuid[]),
(pg_temp.id('alpha_org'), pg_temp.id('training_only_viewer'), 'member', 'viewer',
 '{"personnel":"none","training":"view","calendar":"none","criticalTasks":"none","ratingScheme":"none"}',
 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, mos, clinic_role, archived_at) VALUES
(pg_temp.id('alpha_one_person'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_group'), 'SGT', 'One', 'Alpha', 'signal-one', '68W', 'Medic', NULL),
(pg_temp.id('archived_alpha_person'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_group'), 'SPC', 'Archived', 'Alpha', 'signal-archived', '68W', '', '2026-01-01'),
(pg_temp.id('alpha_two_person'), pg_temp.id('alpha_org'), pg_temp.id('alpha_two_group'), 'SPC', 'Two', 'Alpha', 'signal-two', '68W', '', NULL),
(pg_temp.id('unassigned_alpha_person'), pg_temp.id('alpha_org'), NULL, 'PFC', 'Unassigned', 'Alpha', 'signal-unassigned', '68W', '', NULL),
(pg_temp.id('bravo_person'), pg_temp.id('bravo_org'), NULL, 'SPC', 'Other', 'Bravo', 'signal-bravo', '68W', '', NULL);

INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order) VALUES
(pg_temp.id('leave_status'), pg_temp.id('alpha_org'), 'Leave', '#16a34a', '#ffffff', 1),
(pg_temp.id('tdy_status'), pg_temp.id('alpha_org'), 'TDY', '#2563eb', '#ffffff', 0),
(pg_temp.id('bravo_leave_status'), pg_temp.id('bravo_org'), 'Bravo leave', '#16a34a', '#ffffff', 0);
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
(pg_temp.id('alpha_one_leave'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), pg_temp.id('leave_status'), '2026-10-20', '2026-10-25'),
(pg_temp.id('past_alpha_one_tdy'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), pg_temp.id('tdy_status'), '2026-09-01', '2026-10-22'),
(pg_temp.id('archived_alpha_leave'), pg_temp.id('alpha_org'), pg_temp.id('archived_alpha_person'), pg_temp.id('leave_status'), '2026-10-23', '2026-10-23'),
(pg_temp.id('alpha_two_tdy'), pg_temp.id('alpha_org'), pg_temp.id('alpha_two_person'), pg_temp.id('tdy_status'), '2026-10-23', '2026-10-23'),
(pg_temp.id('future_unassigned_leave'), pg_temp.id('alpha_org'), pg_temp.id('unassigned_alpha_person'), pg_temp.id('leave_status'), '2026-10-24', '2026-10-30'),
(pg_temp.id('bravo_leave'), pg_temp.id('bravo_org'), pg_temp.id('bravo_person'), pg_temp.id('bravo_leave_status'), '2026-10-23', '2026-10-23');

INSERT INTO public.training_types (id, organization_id, name, expiration_months, sort_order) VALUES
(pg_temp.id('cpr_training'), pg_temp.id('alpha_org'), 'CPR/BLS', 24, 0),
(pg_temp.id('bravo_cpr_training'), pg_temp.id('bravo_org'), 'Bravo CPR/BLS', 24, 0);
INSERT INTO public.personnel_trainings (organization_id, personnel_id, training_type_id, completion_date, expiration_date) VALUES
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), pg_temp.id('cpr_training'), '2024-10-01', '2026-10-01'),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_two_person'), pg_temp.id('cpr_training'), '2026-01-10', '2028-01-10');

INSERT INTO public.ict_tasks (id, organization_id, task_code, title, mos, archived_at) VALUES
(pg_temp.id('airway_task'), pg_temp.id('alpha_org'), 'A-001', 'Airway', ARRAY['68W'], NULL),
(pg_temp.id('retired_task'), pg_temp.id('alpha_org'), 'A-002', 'Retired task', ARRAY['68W'], '2026-01-01'),
(pg_temp.id('bravo_airway_task'), pg_temp.id('bravo_org'), 'B-001', 'Bravo airway', ARRAY['68W'], NULL);
INSERT INTO public.personnel_ict_completions
  (organization_id, personnel_id, ict_task_id, completed_at, validation_method, validated_by, created_at) VALUES
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), pg_temp.id('airway_task'), '2026-07-01', 'Practical Exercise', 'SFC Later', '2026-07-02 08:00+00'),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), pg_temp.id('airway_task'), '2026-06-01', 'Practical Exercise', 'SFC Older', '2026-07-03 08:00+00'),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), pg_temp.id('retired_task'), '2026-06-01', 'Practical Exercise', NULL, '2026-06-01 08:00+00'),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), pg_temp.id('airway_task'), '2026-10-24', 'Practical Exercise', 'SFC Future', '2026-07-04 08:00+00'),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_two_person'), pg_temp.id('airway_task'), '2026-10-24', 'Practical Exercise', 'SFC Future', '2026-07-04 08:00+00');

INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rating_period_start, rating_period_end, status, workflow_status) VALUES
(pg_temp.id('completed_evaluation'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), 'NCOER', '2026-01-01', '2027-01-01', 'completed', 'completed'),
(pg_temp.id('current_alpha_one_evaluation'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), 'NCOER', '2025-12-01', '2026-12-01', 'active', 'drafting'),
(pg_temp.id('older_alpha_one_evaluation'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), 'NCOER', '2025-06-01', '2026-06-01', 'active', NULL),
(pg_temp.id('current_alpha_two_evaluation'), pg_temp.id('alpha_org'), pg_temp.id('alpha_two_person'), 'NCOER', '2025-12-01', '2026-12-01', 'active', NULL);

INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, due_date, status, created_by, created_at) VALUES
(pg_temp.id('undated_follow_up'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), 'Undated', NULL, 'open', 'SFC Lead', '2026-10-01 08:00+00'),
(pg_temp.id('overdue_follow_up'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), 'Call home', '2026-10-20', 'open', 'SFC Lead', '2026-10-02 08:00+00'),
(pg_temp.id('completed_follow_up'), pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), 'Done', '2026-10-01', 'completed', 'SFC Lead', '2026-10-03 08:00+00'),
(pg_temp.id('alpha_two_follow_up'), pg_temp.id('alpha_org'), pg_temp.id('alpha_two_person'), 'Two follow-up', '2026-10-25', 'open', 'SFC Lead', '2026-10-04 08:00+00');

INSERT INTO public.counseling_records (organization_id, personnel_id, date_conducted, subject, title, uploaded_by, archived_at) VALUES
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), '2025-12-15', 'Monthly', 'Monthly', 'SFC Lead', NULL),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), '2026-03-10', 'Monthly', 'Monthly', 'SFC Lead', NULL),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), '2026-09-01', 'Monthly', 'Monthly', 'SFC Lead', now()),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_one_person'), '2026-11-01', 'Planned', 'Planned', 'SFC Lead', NULL),
(pg_temp.id('alpha_org'), pg_temp.id('alpha_two_person'), '2025-10-31', 'Monthly', 'Monthly', 'SFC Lead', NULL);

CREATE FUNCTION pg_temp.ids(p jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(CASE jsonb_typeof(v) WHEN 'array' THEN v->>0 WHEN 'object' THEN v->>'id' ELSE v #>> '{}' END ORDER BY 1), ARRAY[]::text[])
  FROM jsonb_array_elements(p) v
$$;

CREATE FUNCTION pg_temp.sig(p_source text, p_ids uuid[] DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.roster_signals(pg_temp.id('alpha_org'), '2026-10-23', '2025-11-01', ARRAY[p_source], p_ids) -> p_source
$$;

CREATE FUNCTION pg_temp.assert_rls_parity(p_label text) RETURNS SETOF text
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  actual jsonb := public.roster_signals(pg_temp.id('alpha_org'), '2026-10-23', '2025-11-01',
    ARRAY['availability', 'training', 'criticalTasks', 'evaluations', 'followUps', 'counseling']);
  org uuid := pg_temp.id('alpha_org');
  source text;
  lane text;
  expected jsonb;
BEGIN
  FOR source, lane IN SELECT * FROM (VALUES
    ('availability', 'calendar'), ('training', 'training'), ('criticalTasks', 'criticalTasks'),
    ('evaluations', 'ratingScheme'), ('followUps', 'personnel'), ('counseling', 'personnel')
  ) sources(source, lane) LOOP
    SELECT COALESCE(jsonb_agg(p.id ORDER BY p.id), '[]'::jsonb) INTO expected
    FROM public.personnel p
    WHERE p.organization_id = org AND p.archived_at IS NULL
      AND EXISTS (SELECT 1 FROM member_access_private.viewable_personnel(lane) v
        WHERE v.organization_id = org AND v.personnel_id = p.id)
      AND (source NOT IN ('followUps', 'counseling')
        OR public.member_access_has_capability(org, 'personnel', 'configure'));
    RETURN NEXT is(to_jsonb(pg_temp.ids(actual #> ARRAY[source, 'cohort'])), expected,
      p_label || ': ' || source || ' cohort matches the invoker-visible Personnel rows');
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_array(e.id, e.personnel_id, e.status_type_id, e.start_date)
    ORDER BY e.personnel_id, e.id), '[]'::jsonb) INTO expected
  FROM public.availability_entries e JOIN public.personnel p ON p.id = e.personnel_id
  WHERE e.organization_id = org AND p.archived_at IS NULL AND e.start_date <= '2026-10-23' AND e.end_date >= '2026-10-23';
  RETURN NEXT is(actual #> '{availability,entries}', expected, p_label || ': availability matches the invoker read');

  SELECT COALESCE(jsonb_agg(t.id ORDER BY t.sort_order, t.name), '[]'::jsonb) INTO expected
  FROM public.status_types t WHERE t.organization_id = org;
  RETURN NEXT is(to_jsonb(pg_temp.ids(actual #> '{availability,statusTypes}')), expected,
    p_label || ': status catalog matches the invoker read');

  SELECT COALESCE(jsonb_agg(t.id ORDER BY t.sort_order, t.id), '[]'::jsonb) INTO expected
  FROM public.training_types t WHERE t.organization_id = org;
  RETURN NEXT is(to_jsonb(pg_temp.ids(actual #> '{training,types}')), expected,
    p_label || ': Training catalog matches the invoker read');

  SELECT COALESCE(jsonb_agg(jsonb_build_array(t.personnel_id, t.training_type_id, t.completion_date, t.expiration_date)
    ORDER BY t.personnel_id, t.training_type_id), '[]'::jsonb) INTO expected
  FROM public.personnel_trainings t JOIN public.personnel p ON p.id = t.personnel_id
  WHERE t.organization_id = org AND p.archived_at IS NULL;
  RETURN NEXT is(actual #> '{training,completions}', expected, p_label || ': Training matches the invoker read');

  SELECT COALESCE(jsonb_agg(t.id ORDER BY t.sort_order, t.task_code), '[]'::jsonb) INTO expected
  FROM public.ict_tasks t WHERE t.organization_id = org AND t.archived_at IS NULL;
  RETURN NEXT is(to_jsonb(pg_temp.ids(actual #> '{criticalTasks,tasks}')), expected,
    p_label || ': Critical Tasks catalog matches the invoker read');

  SELECT COALESCE(jsonb_agg(jsonb_build_array(c.personnel_id, c.ict_task_id, c.completed_at, c.created_at, c.validated_by)
    ORDER BY c.personnel_id, c.ict_task_id), '[]'::jsonb) INTO expected
  FROM (
    SELECT DISTINCT ON (c.personnel_id, c.ict_task_id) c.*
    FROM public.personnel_ict_completions c
    JOIN public.personnel p ON p.id = c.personnel_id
    JOIN public.ict_tasks t ON t.id = c.ict_task_id
    WHERE c.organization_id = org AND p.archived_at IS NULL AND t.archived_at IS NULL AND c.completed_at <= '2026-10-23'
    ORDER BY c.personnel_id, c.ict_task_id, c.completed_at DESC, c.created_at DESC
  ) c;
  RETURN NEXT is(actual #> '{criticalTasks,completions}', expected, p_label || ': Critical Tasks matches the invoker read');

  SELECT jsonb_build_object('defaultExpirationMonths', o.critical_tasks_default_expiration_months,
    'expiringSoonWarningDays', o.critical_tasks_expiring_soon_warning_days) INTO expected
  FROM public.organizations o WHERE o.id = org;
  RETURN NEXT is(actual #> '{criticalTasks,settings}', COALESCE(expected, 'null'::jsonb),
    p_label || ': Organization settings match the invoker read');

  SELECT COALESCE(jsonb_agg(jsonb_build_array(r.rated_person_id, r.id, r.eval_type, r.report_type,
    r.rating_period_start, r.rating_period_end, r.status, r.workflow_status) ORDER BY r.rated_person_id), '[]'::jsonb)
    INTO expected
  FROM (
    SELECT DISTINCT ON (r.rated_person_id) r.*
    FROM public.rating_scheme_entries r JOIN public.personnel p ON p.id = r.rated_person_id
    WHERE r.organization_id = org AND p.archived_at IS NULL AND r.status IS DISTINCT FROM 'completed'
    ORDER BY r.rated_person_id, r.rating_period_end DESC, r.id DESC
  ) r;
  RETURN NEXT is(actual #> '{evaluations,entries}', expected, p_label || ': evaluations match the invoker read');

  SELECT COALESCE(jsonb_agg(jsonb_build_array(f.id, f.personnel_id, f.title, f.due_date)
    ORDER BY f.due_date NULLS LAST, f.created_at, f.id), '[]'::jsonb) INTO expected
  FROM public.personnel_follow_ups f JOIN public.personnel p ON p.id = f.personnel_id
  WHERE f.organization_id = org AND p.archived_at IS NULL AND f.status = 'open'
    AND public.member_access_has_capability(org, 'personnel', 'configure');
  RETURN NEXT is(actual #> '{followUps,open}', expected, p_label || ': follow-ups match the invoker read');

  SELECT COALESCE(jsonb_agg(jsonb_build_array(c.personnel_id, c.conducted_on) ORDER BY c.personnel_id), '[]'::jsonb)
    INTO expected
  FROM (
    SELECT c.personnel_id, max(c.date_conducted) AS conducted_on
    FROM public.counseling_records c JOIN public.personnel p ON p.id = c.personnel_id
    WHERE c.organization_id = org AND p.archived_at IS NULL AND c.archived_at IS NULL
      AND c.date_conducted BETWEEN '2025-11-01' AND '2026-10-23'
      AND public.member_access_has_capability(org, 'personnel', 'configure')
    GROUP BY c.personnel_id
  ) c;
  RETURN NEXT is(actual #> '{counseling,latest}', expected, p_label || ': counseling matches the invoker read');
END;
$$;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', pg_temp.id('org_wide_leader')::text, true);
SELECT * FROM pg_temp.assert_rls_parity('Organization-wide');
SELECT is(pg_temp.ids(pg_temp.sig('availability') -> 'cohort'),
  ARRAY[pg_temp.id('alpha_one_person')::text, pg_temp.id('alpha_two_person')::text, pg_temp.id('unassigned_alpha_person')::text],
  'presence cohort is every active Person, not the archived one');
SELECT is(pg_temp.sig('availability') -> 'entries',
  jsonb_build_array(jsonb_build_array(pg_temp.id('alpha_one_leave'), pg_temp.id('alpha_one_person'), pg_temp.id('leave_status'), '2026-10-20'),
    jsonb_build_array(pg_temp.id('alpha_two_tdy'), pg_temp.id('alpha_two_person'), pg_temp.id('tdy_status'), '2026-10-23')),
  'presence entries are those covering the day, for active People only');
SELECT is(pg_temp.sig('availability') -> 'statusTypes',
  jsonb_build_array(jsonb_build_object('id', pg_temp.id('tdy_status'), 'name', 'TDY', 'color', '#2563eb', 'textColor', '#ffffff', 'sortOrder', 0),
    jsonb_build_object('id', pg_temp.id('leave_status'), 'name', 'Leave', 'color', '#16a34a', 'textColor', '#ffffff', 'sortOrder', 1)),
  'status types come in catalog order, this Organization only');
SELECT is(pg_temp.sig('availability',
    ARRAY[pg_temp.id('alpha_two_person')]::uuid[]) -> 'cohort',
  jsonb_build_array(pg_temp.id('alpha_two_person')), 'a Person list narrows the cohort');

SELECT is(public.roster_signals(pg_temp.id('alpha_org'), '2026-10-23', '2025-11-01',
    ARRAY['availability', 'followUps']) ->> 'training', NULL, 'a source the caller did not name is not computed');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_each(public.roster_signals(
    pg_temp.id('alpha_org'), '2026-10-23', '2025-11-01', ARRAY['availability', 'followUps'])) AS e(k, v)
    WHERE jsonb_typeof(v) = 'object'),
  ARRAY['availability', 'followUps'], 'the named sources come back together from one statement');

SELECT is(pg_temp.sig('training') -> 'completions',
  jsonb_build_array(jsonb_build_array(pg_temp.id('alpha_one_person'), pg_temp.id('cpr_training'), '2024-10-01', '2026-10-01'),
    jsonb_build_array(pg_temp.id('alpha_two_person'), pg_temp.id('cpr_training'), '2026-01-10', '2028-01-10')),
  'training completions cover the visible active People');
SELECT is((pg_temp.sig('training') -> 'cohort') -> 0,
  jsonb_build_array(pg_temp.id('alpha_one_person'), 'SGT', '68W', 'Medic'), 'training cohort carries rank, MOS and role');
SELECT is(pg_temp.sig('training') #>> '{types,0,name}', 'CPR/BLS',
  'training types come with the read');

SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
    pg_temp.sig('training') -> 'types' -> 0) k),
  ARRAY['applies_to_mos', 'applies_to_ranks', 'applies_to_roles', 'can_be_exempted', 'excluded_mos', 'excluded_ranks',
    'excluded_roles', 'exempt_personnel_ids', 'expiration_date_only', 'expiration_months', 'id', 'is_optional', 'name',
    'warning_days_orange', 'warning_days_yellow'],
  'training types carry only the columns readiness reads');

SELECT is(pg_temp.sig('criticalTasks') -> 'completions',
  jsonb_build_array(jsonb_build_array(pg_temp.id('alpha_one_person'), pg_temp.id('airway_task'), '2026-07-01', '2026-07-02T08:00:00+00:00', 'SFC Later')),
  'critical tasks give the newest validation per active task, by date before record time, never one dated after the day');
SELECT is(jsonb_array_length(pg_temp.sig('criticalTasks') -> 'tasks'), 1,
  'retired tasks are left out');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
    pg_temp.sig('criticalTasks') -> 'tasks' -> 0) k),
  ARRAY['expiration_months', 'id', 'mos', 'task_code', 'title'],
  'critical tasks carry only the columns readiness reads');

SELECT is(pg_temp.sig('evaluations') -> 'entries',
  jsonb_build_array(jsonb_build_array(pg_temp.id('alpha_one_person'), pg_temp.id('current_alpha_one_evaluation'), 'NCOER', NULL, '2025-12-01', '2026-12-01', 'active', 'drafting'),
    jsonb_build_array(pg_temp.id('alpha_two_person'), pg_temp.id('current_alpha_two_evaluation'), 'NCOER', NULL, '2025-12-01', '2026-12-01', 'active', NULL)),
  'the active evaluation is the latest-ending entry not completed');

SELECT is(pg_temp.sig('followUps') -> 'open',
  jsonb_build_array(jsonb_build_array(pg_temp.id('overdue_follow_up'), pg_temp.id('alpha_one_person'), 'Call home', '2026-10-20'),
    jsonb_build_array(pg_temp.id('alpha_two_follow_up'), pg_temp.id('alpha_two_person'), 'Two follow-up', '2026-10-25'),
    jsonb_build_array(pg_temp.id('undated_follow_up'), pg_temp.id('alpha_one_person'), 'Undated', NULL)),
  'open follow-ups come soonest due first, undated last');

SELECT is(pg_temp.sig('counseling') -> 'latest',
  jsonb_build_array(jsonb_build_array(pg_temp.id('alpha_one_person'), '2026-03-10')),
  'counseling gives the latest held, unarchived record inside the window');

SELECT set_config('request.jwt.claim.sub', pg_temp.id('group_scoped_leader')::text, true);
SELECT * FROM pg_temp.assert_rls_parity('Group-scoped');
SELECT is(pg_temp.sig('availability') -> 'cohort',
  jsonb_build_array(pg_temp.id('alpha_one_person')), 'Group reader: presence cohort is its Group');
SELECT is(jsonb_array_length(pg_temp.sig('availability') -> 'entries'), 1,
  'Group reader: presence entries are its Group''s');
SELECT is(pg_temp.ids(pg_temp.sig('training') -> 'completions'),
  ARRAY[pg_temp.id('alpha_one_person')::text], 'Group reader: training is its Group''s');
SELECT is(pg_temp.ids(pg_temp.sig('evaluations') -> 'entries'),
  ARRAY[pg_temp.id('alpha_one_person')::text], 'Group reader: evaluations are its Group''s');
SELECT is(pg_temp.ids(pg_temp.sig('followUps') -> 'cohort'),
  ARRAY[pg_temp.id('alpha_one_person')::text], 'Group reader: follow-up cohort is its Group');
SELECT is(jsonb_array_length(pg_temp.sig('followUps') -> 'open'), 2,
  'Group reader: open follow-ups are its Group''s');

SELECT set_config('request.jwt.claim.sub', pg_temp.id('personnel_viewer')::text, true);
SELECT * FROM pg_temp.assert_rls_parity('Lanes off');
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

SELECT set_config('request.jwt.claim.sub', pg_temp.id('non_member')::text, true);
SELECT * FROM pg_temp.assert_rls_parity('Non-member');
SELECT is(public.roster_signals(pg_temp.id('alpha_org'), '2026-10-23', '2025-11-01',
  ARRAY['availability', 'training', 'criticalTasks', 'evaluations', 'followUps', 'counseling']),
  '{"availability":{"cohort":[],"statusTypes":[],"entries":[]},
    "training":{"cohort":[],"types":[],"completions":[]},
    "criticalTasks":{"cohort":[],"tasks":[],"settings":null,"completions":[]},
    "evaluations":{"cohort":[],"entries":[]},"followUps":{"cohort":[],"open":[]},
    "counseling":{"cohort":[],"latest":[]}}'::jsonb,
  'a signed-in non-member gets no facts, catalogs or settings');

SELECT set_config('request.jwt.claim.sub', pg_temp.id('bravo_owner')::text, true);
SELECT * FROM pg_temp.assert_rls_parity('Other Organization owner');
SELECT is(pg_temp.sig('availability') -> 'cohort', '[]'::jsonb,
  'foreign owner: empty presence cohort');
SELECT is(pg_temp.sig('followUps') -> 'cohort', '[]'::jsonb,
  'foreign owner: empty follow-up cohort');
SELECT is(pg_temp.sig('evaluations') -> 'cohort', '[]'::jsonb,
  'foreign owner: empty evaluation cohort');

SELECT set_config('request.jwt.claim.sub', pg_temp.id('training_only_viewer')::text, true);
SELECT * FROM pg_temp.assert_rls_parity('Training without Personnel');
SELECT is(pg_temp.sig('training') -> 'cohort', '[]'::jsonb,
  'Training access cannot borrow Personnel rank, MOS or duty role');
SELECT is(pg_temp.sig('training') #>> '{types,0,name}', 'CPR/BLS',
  'Training catalog access does not require Personnel view');

RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY['training', 'criticalTasks', 'evaluations'] WHERE id = pg_temp.id('alpha_org');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id('org_wide_leader')::text, true);
SELECT is(pg_temp.sig('training') -> 'cohort', '[]'::jsonb,
  'Training off: empty training cohort');
SELECT * FROM pg_temp.assert_rls_parity('Features off');
SELECT is(pg_temp.sig('criticalTasks') -> 'tasks', '[]'::jsonb, 'Critical Tasks off: no task catalog');
SELECT is(pg_temp.sig('evaluations') -> 'entries', '[]'::jsonb, 'Evaluations off: no entries');

RESET ROLE;
UPDATE public.organizations SET disabled_features = ARRAY[]::text[], suspended_at = now()
WHERE id = pg_temp.id('alpha_org');
SET LOCAL ROLE authenticated;
SELECT * FROM pg_temp.assert_rls_parity('Organization suspended');
RESET ROLE;
UPDATE public.organizations SET suspended_at = NULL WHERE id = pg_temp.id('alpha_org');
INSERT INTO public.user_suspensions (user_id, suspended_by)
VALUES (pg_temp.id('org_wide_leader'), pg_temp.id('bravo_owner'));
SET LOCAL ROLE authenticated;
SELECT * FROM pg_temp.assert_rls_parity('User suspended');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.roster_signals(pg_temp.id('alpha_org'), '2026-10-23', '2025-11-01', ARRAY['availability']) $$,
  '42501', NULL, 'anonymous callers cannot run the roster signals read');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
