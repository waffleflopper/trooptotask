-- The upgrade opens one DA 6 form per person-assigned type, dated from its
-- first saved assignment, turns its exemptions into open excusals, and records
-- each Person's attributes from the day they were added.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT hasnt_column('public', 'assignment_types', 'exempt_personnel_ids', 'the exemption list column is gone');

SELECT results_eq($$
  SELECT t.name, f.starts_on, f.ends_on, f.record, f.rules FROM public.roster_forms f
  JOIN public.assignment_types t ON t.id = f.assignment_type_id
  WHERE f.organization_id = 'e1690000-0000-4000-8000-000000000101' AND t.name = 'Staff Duty' $$,
  $$ VALUES ('Staff Duty'::text, '2026-03-02'::date, NULL::date, NULL::jsonb, '{"pool": null, "weekendMode": "same"}'::jsonb) $$,
  'a type with saved assignments has one open form from its first assignment day');
SELECT results_eq($$
  SELECT t.name, f.starts_on = (f.created_at AT TIME ZONE 'UTC')::date, f.ends_on, f.rules FROM public.roster_forms f
  JOIN public.assignment_types t ON t.id = f.assignment_type_id
  WHERE f.organization_id = 'e1690000-0000-4000-8000-000000000101' AND t.name = 'Charge of Quarters' $$,
  $$ VALUES ('Charge of Quarters'::text, true, NULL::date, '{"pool": null, "weekendMode": "same"}'::jsonb) $$,
  'a type with no assignments has one open form from the migration day');
SELECT is((SELECT count(*)::integer FROM public.roster_forms
  WHERE assignment_type_id = 'e1690000-0000-4000-8000-000000000503'), 0, 'a Group-assigned type has no form');
SELECT results_eq($$
  SELECT name, roster_pool_rules, roster_weekend_mode FROM public.assignment_types
  WHERE organization_id = 'e1690000-0000-4000-8000-000000000101' ORDER BY name $$,
  $$ VALUES ('Charge of Quarters'::text, NULL::jsonb, 'same'::text), ('Motor Pool', NULL, 'same'), ('Staff Duty', NULL, 'same') $$,
  'every type starts with no pool rules and one shared weekday and weekend count');

SELECT results_eq($$
  SELECT t.name, p.last_name, x.reason, x.starts_on = f.starts_on, x.ends_on FROM public.roster_excusals x
  JOIN public.assignment_types t ON t.id = x.assignment_type_id
  JOIN public.personnel p ON p.id = x.personnel_id
  JOIN public.roster_forms f ON f.assignment_type_id = x.assignment_type_id AND f.ends_on IS NULL
  WHERE x.organization_id = 'e1690000-0000-4000-8000-000000000101' ORDER BY t.name, p.last_name $$,
  $$ VALUES ('Charge of Quarters'::text, 'Able'::text, 'Excused'::text, true, NULL::date),
            ('Staff Duty', 'Baker', 'Excused', true, NULL),
            ('Staff Duty', 'Charlie', 'Excused', true, NULL) $$,
  'each exemption of an existing Person is an open excusal from the form start; unknown and Group exemptions are dropped');

SELECT results_eq($$
  SELECT p.last_name, h.effective_on, h.rank, h.mos, h.clinic_role, h.group_id, h.archived
  FROM public.personnel_attribute_history h JOIN public.personnel p ON p.id = h.personnel_id
  WHERE h.organization_id = 'e1690000-0000-4000-8000-000000000101' ORDER BY p.last_name, h.effective_on $$,
  $$ VALUES ('Able'::text, '2026-01-05'::date, 'SPC'::text, '68W'::text, 'Medic'::text, NULL::uuid, false),
            ('Baker', '2026-01-06', 'SGT', '68W', 'NCOIC', NULL, false),
            ('Charlie', '2026-02-01', 'PFC', '68C', '', NULL, false),
            ('Charlie', '2026-05-10', 'PFC', '68C', '', NULL, true),
            ('Delta', '2026-02-03', 'PV2', '68W', '', NULL, true) $$,
  'each Person has a row from their UTC creation day, plus one from the day they were archived when later');
SELECT * FROM finish();
ROLLBACK;
