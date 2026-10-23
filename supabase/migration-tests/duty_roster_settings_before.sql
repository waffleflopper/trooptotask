-- Saved duty rosters before DA 6 forms, dated excusals and attribute history.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261022000100') THEN
    RAISE EXCEPTION 'Duty roster settings fixture requires the preceding schema';
  END IF;
END;
$$;

INSERT INTO auth.users (id, email) VALUES
  ('e1690000-0000-4000-8000-000000000001', 'duty-roster-upgrade@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('e1690000-0000-4000-8000-000000000101', 'Roster Upgrade Alpha', 'e1690000-0000-4000-8000-000000000001');
INSERT INTO public.personnel (
  id, organization_id, rank, mos, clinic_role, first_name, last_name, slug, created_at, archived_at
) VALUES
  ('e1690000-0000-4000-8000-000000000301', 'e1690000-0000-4000-8000-000000000101', 'SPC', '68W', 'Medic',
   'Roster', 'Able', 'roster-upgrade-able', '2026-01-05T12:00:00Z', NULL),
  -- Created on the evening of 5 January in UTC-5, which is 6 January in UTC.
  ('e1690000-0000-4000-8000-000000000302', 'e1690000-0000-4000-8000-000000000101', 'SGT', '68W', 'NCOIC',
   'Roster', 'Baker', 'roster-upgrade-baker', '2026-01-05T23:30:00-05:00', NULL),
  ('e1690000-0000-4000-8000-000000000303', 'e1690000-0000-4000-8000-000000000101', 'PFC', '68C', '',
   'Roster', 'Charlie', 'roster-upgrade-charlie', '2026-02-01T08:00:00Z', '2026-05-10T15:00:00Z'),
  ('e1690000-0000-4000-8000-000000000304', 'e1690000-0000-4000-8000-000000000101', 'PV2', '68W', '',
   'Roster', 'Delta', 'roster-upgrade-delta', '2026-02-03T08:00:00Z', '2026-02-03T20:00:00Z');
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, exempt_personnel_ids) VALUES
  ('e1690000-0000-4000-8000-000000000501', 'e1690000-0000-4000-8000-000000000101', 'Staff Duty', 'SD', 'personnel',
   ARRAY['e1690000-0000-4000-8000-000000000302', 'e1690000-0000-4000-8000-000000000303',
         'e1690000-0000-4000-8000-000000000399']),
  ('e1690000-0000-4000-8000-000000000502', 'e1690000-0000-4000-8000-000000000101', 'Charge of Quarters', 'CQ', 'personnel',
   ARRAY['e1690000-0000-4000-8000-000000000301']),
  ('e1690000-0000-4000-8000-000000000503', 'e1690000-0000-4000-8000-000000000101', 'Motor Pool', 'MP', 'group',
   ARRAY['e1690000-0000-4000-8000-000000000301']);
INSERT INTO public.daily_assignments (id, organization_id, assignment_type_id, date, assignee_id) VALUES
  ('e1690000-0000-4000-8000-000000000601', 'e1690000-0000-4000-8000-000000000101',
   'e1690000-0000-4000-8000-000000000501', '2026-04-10', 'e1690000-0000-4000-8000-000000000301'),
  ('e1690000-0000-4000-8000-000000000602', 'e1690000-0000-4000-8000-000000000101',
   'e1690000-0000-4000-8000-000000000501', '2026-03-02', 'e1690000-0000-4000-8000-000000000302'),
  ('e1690000-0000-4000-8000-000000000603', 'e1690000-0000-4000-8000-000000000101',
   'e1690000-0000-4000-8000-000000000501', '2099-01-01', 'e1690000-0000-4000-8000-000000000301');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.assignment_types WHERE organization_id = 'e1690000-0000-4000-8000-000000000101') <> 3
    OR (SELECT count(*) FROM public.daily_assignments WHERE organization_id = 'e1690000-0000-4000-8000-000000000101') <> 3
    OR (SELECT count(*) FROM public.personnel WHERE organization_id = 'e1690000-0000-4000-8000-000000000101') <> 4
  THEN
    RAISE EXCEPTION 'Duty roster settings upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
