-- Calendar availability and assignment reads: every actor kind sees exactly
-- these records, and exactly what the replaced per-row policies admitted.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(NOT has_function_privilege('anon', 'calendar_private.viewable_assignees()', 'EXECUTE'),
  'anonymous callers cannot reach the visible-assignee helper');
SELECT ok(to_regprocedure('public.can_view_availability_record(uuid,uuid)') IS NULL
    AND to_regprocedure('public.can_view_daily_assignment_record(uuid,uuid,text)') IS NULL,
  'the replaced per-row Calendar read helpers are gone');

INSERT INTO auth.users (id, email)
SELECT ('c6d06000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'calendar-read-' || n || '@example.test'
FROM generate_series(1, 11) AS n;
INSERT INTO public.organizations (id, name, created_by, suspended_at) VALUES
  ('c6d06000-0000-4000-8000-000000000101', 'Calendar Read A', 'c6d06000-0000-4000-8000-000000000001', NULL),
  ('c6d06000-0000-4000-8000-000000000102', 'Calendar Read B', 'c6d06000-0000-4000-8000-000000000001', NULL),
  ('c6d06000-0000-4000-8000-000000000103', 'Calendar Read C', 'c6d06000-0000-4000-8000-000000000001', now());
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('c6d06000-0000-4000-8000-000000000201', 'c6d06000-0000-4000-8000-000000000101', 'Alpha'),
  ('c6d06000-0000-4000-8000-000000000202', 'c6d06000-0000-4000-8000-000000000101', 'Bravo'),
  ('c6d06000-0000-4000-8000-000000000203', 'c6d06000-0000-4000-8000-000000000102', 'Foreign'),
  ('c6d06000-0000-4000-8000-000000000204', 'c6d06000-0000-4000-8000-000000000103', 'Charlie');
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('c6d06000-0000-4000-8000-000000000301', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Active', 'calendar-read-alpha', NULL),
  ('c6d06000-0000-4000-8000-000000000302', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Archived', 'calendar-read-archived', now()),
  ('c6d06000-0000-4000-8000-000000000303', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000202', 'SPC', 'Bravo', 'Person', 'calendar-read-bravo', NULL),
  ('c6d06000-0000-4000-8000-000000000304', 'c6d06000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Person', 'calendar-read-unassigned', NULL),
  ('c6d06000-0000-4000-8000-000000000305', 'c6d06000-0000-4000-8000-000000000102', 'c6d06000-0000-4000-8000-000000000203', 'SPC', 'Foreign', 'Person', 'calendar-read-foreign', NULL),
  ('c6d06000-0000-4000-8000-000000000306', 'c6d06000-0000-4000-8000-000000000103', 'c6d06000-0000-4000-8000-000000000204', 'SPC', 'Charlie', 'Person', 'calendar-read-charlie', NULL);
INSERT INTO public.status_types (id, organization_id, name, color, text_color) VALUES
  ('c6d06000-0000-4000-8000-000000000401', 'c6d06000-0000-4000-8000-000000000101', 'Leave', '#ffffff', '#000000'),
  ('c6d06000-0000-4000-8000-000000000402', 'c6d06000-0000-4000-8000-000000000102', 'Leave', '#ffffff', '#000000'),
  ('c6d06000-0000-4000-8000-000000000403', 'c6d06000-0000-4000-8000-000000000103', 'Leave', '#ffffff', '#000000');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to) VALUES
  ('c6d06000-0000-4000-8000-000000000411', 'c6d06000-0000-4000-8000-000000000101', 'Staff Duty', 'SD', 'personnel'),
  ('c6d06000-0000-4000-8000-000000000412', 'c6d06000-0000-4000-8000-000000000101', 'Detail', 'DG', 'group'),
  ('c6d06000-0000-4000-8000-000000000413', 'c6d06000-0000-4000-8000-000000000102', 'Staff Duty', 'SD', 'personnel'),
  ('c6d06000-0000-4000-8000-000000000414', 'c6d06000-0000-4000-8000-000000000103', 'Staff Duty', 'SD', 'personnel');
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
  ('c6d06000-0000-4000-8000-000000000501', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000301', 'c6d06000-0000-4000-8000-000000000401', '2030-04-01', '2030-04-02'),
  ('c6d06000-0000-4000-8000-000000000502', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000302', 'c6d06000-0000-4000-8000-000000000401', '2030-04-01', '2030-04-02'),
  ('c6d06000-0000-4000-8000-000000000503', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000303', 'c6d06000-0000-4000-8000-000000000401', '2030-04-01', '2030-04-02'),
  ('c6d06000-0000-4000-8000-000000000504', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000304', 'c6d06000-0000-4000-8000-000000000401', '2030-04-01', '2030-04-02'),
  ('c6d06000-0000-4000-8000-000000000505', 'c6d06000-0000-4000-8000-000000000102', 'c6d06000-0000-4000-8000-000000000305', 'c6d06000-0000-4000-8000-000000000402', '2030-04-01', '2030-04-02'),
  ('c6d06000-0000-4000-8000-000000000506', 'c6d06000-0000-4000-8000-000000000103', 'c6d06000-0000-4000-8000-000000000306', 'c6d06000-0000-4000-8000-000000000403', '2030-04-01', '2030-04-02');
-- 607 and 608 name an assignee of the other kind than their type; no actor sees them.
INSERT INTO public.daily_assignments (id, organization_id, assignment_type_id, date, assignee_id) VALUES
  ('c6d06000-0000-4000-8000-000000000601', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000411', '2030-04-01', 'c6d06000-0000-4000-8000-000000000301'),
  ('c6d06000-0000-4000-8000-000000000602', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000411', '2030-04-02', 'c6d06000-0000-4000-8000-000000000302'),
  ('c6d06000-0000-4000-8000-000000000603', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000411', '2030-04-03', 'c6d06000-0000-4000-8000-000000000303'),
  ('c6d06000-0000-4000-8000-000000000604', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000411', '2030-04-04', 'c6d06000-0000-4000-8000-000000000304'),
  ('c6d06000-0000-4000-8000-000000000605', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000412', '2030-04-01', 'c6d06000-0000-4000-8000-000000000201'),
  ('c6d06000-0000-4000-8000-000000000606', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000412', '2030-04-02', 'c6d06000-0000-4000-8000-000000000202'),
  ('c6d06000-0000-4000-8000-000000000607', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000411', '2030-04-05', 'c6d06000-0000-4000-8000-000000000201'),
  ('c6d06000-0000-4000-8000-000000000608', 'c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000412', '2030-04-05', 'c6d06000-0000-4000-8000-000000000301'),
  ('c6d06000-0000-4000-8000-000000000609', 'c6d06000-0000-4000-8000-000000000102', 'c6d06000-0000-4000-8000-000000000413', '2030-04-01', 'c6d06000-0000-4000-8000-000000000305'),
  ('c6d06000-0000-4000-8000-000000000610', 'c6d06000-0000-4000-8000-000000000103', 'c6d06000-0000-4000-8000-000000000414', '2030-04-01', 'c6d06000-0000-4000-8000-000000000306');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000002', 'admin', 'viewer', '{"calendar":"none"}', 'groups', ARRAY['c6d06000-0000-4000-8000-000000000201']::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000003', 'member', 'viewer', '{"calendar":"view"}', 'groups', ARRAY['c6d06000-0000-4000-8000-000000000201']::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000004', 'member', 'viewer', '{"calendar":"view"}', 'groups', ARRAY['c6d06000-0000-4000-8000-000000000201','c6d06000-0000-4000-8000-000000000202']::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000005', 'member', 'viewer', '{"calendar":"view"}', 'groups', ARRAY[]::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000006', 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000007', 'member', 'viewer', '{"calendar":"none"}', 'organization', ARRAY[]::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000008', 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]),
  ('c6d06000-0000-4000-8000-000000000103', 'c6d06000-0000-4000-8000-000000000009', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000009', 'member', 'viewer', '{"calendar":"view"}', 'groups', ARRAY['c6d06000-0000-4000-8000-000000000202']::uuid[]),
  ('c6d06000-0000-4000-8000-000000000101', 'c6d06000-0000-4000-8000-000000000010', 'member', 'operator', '{}', 'groups', ARRAY['c6d06000-0000-4000-8000-000000000201']::uuid[]),
  ('c6d06000-0000-4000-8000-000000000102', 'c6d06000-0000-4000-8000-000000000010', 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES
  ('c6d06000-0000-4000-8000-000000000008', 'c6d06000-0000-4000-8000-000000000001', 'Synthetic account suspension');

-- The replaced policies' predicates, evaluated as the table owner for the current claims.
CREATE FUNCTION pg_temp.replaced_availability_policy_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id FROM public.availability_entries a
  WHERE public.member_access_has_capability(a.organization_id, 'calendar', 'view')
    AND EXISTS (
      SELECT 1 FROM public.personnel p
      WHERE p.id = a.personnel_id AND p.organization_id = a.organization_id
        AND public.calendar_personnel_group_scope_matches(a.organization_id, p.group_id)
    );
$$;
CREATE FUNCTION pg_temp.replaced_assignment_policy_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT d.id FROM public.daily_assignments d
  WHERE public.member_access_has_capability(d.organization_id, 'calendar', 'view')
    AND EXISTS (
      SELECT 1 FROM public.assignment_types t
      WHERE t.id = d.assignment_type_id AND t.organization_id = d.organization_id
        AND (
          (t.assign_to = 'personnel' AND EXISTS (
            SELECT 1 FROM public.personnel p
            WHERE p.id::text = d.assignee_id AND p.organization_id = d.organization_id
              AND public.calendar_personnel_group_scope_matches(d.organization_id, p.group_id)
          ))
          OR (t.assign_to = 'group' AND EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id::text = d.assignee_id AND g.organization_id = d.organization_id
              AND public.member_access_group_scope_matches(d.organization_id, g.id)
          ))
        )
    );
$$;

CREATE TEMP TABLE calendar_read_matrix (actor integer, label text, availability integer[], assignments integer[]);
INSERT INTO calendar_read_matrix VALUES
  (1, 'owner: every record of the Organization', ARRAY[501,502,503,504], ARRAY[601,602,603,604,605,606]),
  (2, 'admin: role overrides lane none and Group scope', ARRAY[501,502,503,504], ARRAY[601,602,603,604,605,606]),
  (3, 'Group viewer: own Group, active and archived, and its Group slot', ARRAY[501,502], ARRAY[601,602,605]),
  (4, 'several Groups: both Groups, not unassigned', ARRAY[501,502,503], ARRAY[601,602,603,605,606]),
  (5, 'empty Group list: nothing', ARRAY[]::integer[], ARRAY[]::integer[]),
  (6, 'Organization scope: every Group and unassigned', ARRAY[501,502,503,504], ARRAY[601,602,603,604,605,606]),
  (7, 'lane none: nothing', ARRAY[]::integer[], ARRAY[]::integer[]),
  (8, 'suspended account: nothing', ARRAY[]::integer[], ARRAY[]::integer[]),
  (9, 'member of a suspended Organization: only the admitted one', ARRAY[503], ARRAY[603,606]),
  (10, 'member of two Organizations: Group scope in one, Organization scope in the other', ARRAY[501,502,505], ARRAY[601,602,605,609]),
  (11, 'account with no membership: nothing', ARRAY[]::integer[], ARRAY[]::integer[]);

CREATE FUNCTION pg_temp.calendar_ids(suffixes integer[]) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(('c6d06000-0000-4000-8000-' || lpad(s::text, 12, '0'))::uuid), ARRAY[]::uuid[])
  FROM unnest(suffixes) AS s;
$$;

CREATE FUNCTION pg_temp.calendar_read_matrix() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM calendar_read_matrix ORDER BY actor LOOP
    PERFORM set_config('request.jwt.claim.sub', 'c6d06000-0000-4000-8000-' || lpad(item.actor::text, 12, '0'), true);
    SET LOCAL ROLE authenticated;
    RETURN NEXT set_eq('SELECT id FROM public.availability_entries', pg_temp.calendar_ids(item.availability),
                       'actor ' || item.actor || ' availability, ' || item.label);
    RETURN NEXT set_eq('SELECT id FROM public.availability_entries', 'SELECT pg_temp.replaced_availability_policy_ids()',
                       'actor ' || item.actor || ' reads exactly the availability the replaced per-row policy admitted');
    RETURN NEXT set_eq('SELECT id FROM public.daily_assignments', pg_temp.calendar_ids(item.assignments),
                       'actor ' || item.actor || ' assignments, ' || item.label);
    RETURN NEXT set_eq('SELECT id FROM public.daily_assignments', 'SELECT pg_temp.replaced_assignment_policy_ids()',
                       'actor ' || item.actor || ' reads exactly the assignments the replaced per-row policy admitted');
    RESET ROLE;
  END LOOP;
END;
$$;
SELECT * FROM pg_temp.calendar_read_matrix();

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.availability_entries), 0, 'anonymous reads no availability');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments), 0, 'anonymous reads no assignments');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
