-- Populate the predecessor schema before the #1360 Personnel Group repair.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260929000300') THEN
    RAISE EXCEPTION 'Personnel Group fixture requires the preceding schema';
  END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users (id, email) VALUES
  ('d1200000-0000-4000-8000-000000000001', 'personnel-group-upgrade-alpha@example.test'),
  ('d1200000-0000-4000-8000-000000000002', 'personnel-group-upgrade-bravo@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('d1200000-0000-4000-8000-000000000101', 'Personnel Upgrade Alpha', 'd1200000-0000-4000-8000-000000000001'),
  ('d1200000-0000-4000-8000-000000000102', 'Personnel Upgrade Bravo', 'd1200000-0000-4000-8000-000000000002');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('d1200000-0000-4000-8000-000000000201', 'd1200000-0000-4000-8000-000000000101', 'Retained Alpha Group'),
  ('d1200000-0000-4000-8000-000000000202', 'd1200000-0000-4000-8000-000000000101', 'Disposable Alpha Group'),
  ('d1200000-0000-4000-8000-000000000203', 'd1200000-0000-4000-8000-000000000102', 'Foreign Bravo Group');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('d1200000-0000-4000-8000-000000000101', 'd1200000-0000-4000-8000-000000000001',
   'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  ('d1200000-0000-4000-8000-000000000102', 'd1200000-0000-4000-8000-000000000002',
   'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (
  id, organization_id, group_id, rank, first_name, last_name, slug,
  clinic_role, mos, ets, deros, archived_at, created_at
) VALUES
  ('d1200000-0000-4000-8000-000000000301', 'd1200000-0000-4000-8000-000000000101',
   'd1200000-0000-4000-8000-000000000201', 'SGT', 'Same', 'Organization', 'personnel-upgrade-same',
   'NCOIC', '68V', '2027-06-30', '2027-05-31', NULL, '2026-07-01T12:00:00Z'),
  ('d1200000-0000-4000-8000-000000000302', 'd1200000-0000-4000-8000-000000000101',
   'd1200000-0000-4000-8000-000000000202', 'SPC', 'Archived', 'Keeper', 'personnel-upgrade-archived',
   'Technician', '68W', '2027-08-31', NULL, '2026-08-01T12:00:00Z', '2026-07-02T12:00:00Z'),
  ('d1200000-0000-4000-8000-000000000303', 'd1200000-0000-4000-8000-000000000101',
   'd1200000-0000-4000-8000-000000000202', 'CPL', 'Active', 'Keeper', 'personnel-upgrade-active',
   'Medic', '68W', NULL, '2027-09-30', NULL, '2026-07-03T12:00:00Z'),
  ('d1200000-0000-4000-8000-000000000304', 'd1200000-0000-4000-8000-000000000101',
   'd1200000-0000-4000-8000-000000000203', 'SSG', 'Legacy', 'Mismatch', 'personnel-upgrade-legacy',
   'Supervisor', '68V', '2028-01-31', '2027-12-31', NULL, '2026-07-04T12:00:00Z'),
  ('d1200000-0000-4000-8000-000000000305', 'd1200000-0000-4000-8000-000000000102',
   'd1200000-0000-4000-8000-000000000203', 'SPC', 'Bravo', 'Keeper', 'personnel-upgrade-bravo',
   'Technician', '68W', NULL, NULL, NULL, '2026-07-05T12:00:00Z'),
  ('d1200000-0000-4000-8000-000000000306', 'd1200000-0000-4000-8000-000000000101',
   NULL, 'PFC', 'Unassigned', 'Keeper', 'personnel-upgrade-unassigned',
   '', '68W', NULL, NULL, NULL, '2026-07-06T12:00:00Z');
INSERT INTO public.training_types (id, organization_id, name) VALUES
  ('d1200000-0000-4000-8000-000000000401', 'd1200000-0000-4000-8000-000000000101', 'Retained Personnel Training');
INSERT INTO public.personnel_trainings (
  id, organization_id, personnel_id, training_type_id, completion_date, notes
) VALUES (
  'd1200000-0000-4000-8000-000000000501', 'd1200000-0000-4000-8000-000000000101',
  'd1200000-0000-4000-8000-000000000302', 'd1200000-0000-4000-8000-000000000401',
  '2026-07-15', 'Retained archived-person history'
);
INSERT INTO public.personnel_follow_ups (
  id, organization_id, personnel_id, title, notes, created_by, status, completed_at
) VALUES (
  'd1200000-0000-4000-8000-000000000601', 'd1200000-0000-4000-8000-000000000101',
  'd1200000-0000-4000-8000-000000000302', 'Retained follow-up', 'Retained completed history',
  'Upgrade Alpha', 'completed', '2026-07-16T12:00:00Z'
);

-- Independently expose the old delete behavior, then restore the saved rows.
SAVEPOINT old_group_delete;
DELETE FROM public.groups WHERE id = 'd1200000-0000-4000-8000-000000000203';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.personnel
      WHERE id IN ('d1200000-0000-4000-8000-000000000304', 'd1200000-0000-4000-8000-000000000305')
        AND group_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Expected the predecessor global FK to clear both Organizations';
  END IF;
  RAISE NOTICE 'Predecessor Group deletion clears a historical foreign Personnel link';
END;
$$;
ROLLBACK TO SAVEPOINT old_group_delete;
RELEASE SAVEPOINT old_group_delete;

CREATE TABLE upgrade_fixture.personnel_group_before AS
  SELECT 'group'::text AS table_name, id AS row_id, to_jsonb(g) AS row_data
    FROM public.groups g WHERE id IN (
      'd1200000-0000-4000-8000-000000000201', 'd1200000-0000-4000-8000-000000000202',
      'd1200000-0000-4000-8000-000000000203')
  UNION ALL
  SELECT 'personnel', id, to_jsonb(p) FROM public.personnel p WHERE id IN (
    'd1200000-0000-4000-8000-000000000301', 'd1200000-0000-4000-8000-000000000302',
    'd1200000-0000-4000-8000-000000000303', 'd1200000-0000-4000-8000-000000000304',
    'd1200000-0000-4000-8000-000000000305', 'd1200000-0000-4000-8000-000000000306')
  UNION ALL
  SELECT 'type', id, to_jsonb(t) FROM public.training_types t
    WHERE id = 'd1200000-0000-4000-8000-000000000401'
  UNION ALL
  SELECT 'completion', id, to_jsonb(t) FROM public.personnel_trainings t
    WHERE id = 'd1200000-0000-4000-8000-000000000501'
  UNION ALL
  SELECT 'follow_up', id, to_jsonb(f) FROM public.personnel_follow_ups f
    WHERE id = 'd1200000-0000-4000-8000-000000000601';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.personnel_group_before) <> 12 THEN
    RAISE EXCEPTION 'Expected all twelve populated Personnel Group and history rows';
  END IF;
END;
$$;
COMMIT;
