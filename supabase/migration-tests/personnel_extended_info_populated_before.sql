-- Saved Soldier Data Sheet rows on the schema before strict Person scope.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926001000') THEN
    RAISE EXCEPTION 'Extended info fixture requires the preceding schema';
  END IF;
END;
$$;
INSERT INTO auth.users (id, email) VALUES
  ('f6000000-0000-4000-8000-000000000001', 'extended-upgrade-group@example.test'),
  ('f6000000-0000-4000-8000-000000000002', 'extended-upgrade-org@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
  ('f6000000-0000-4000-8000-000000000101', 'Extended Upgrade', 'f6000000-0000-4000-8000-000000000002');
INSERT INTO public.groups (id, organization_id, name) VALUES
  ('f6000000-0000-4000-8000-000000000201', 'f6000000-0000-4000-8000-000000000101', 'Alpha');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  ('f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000001', 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY['f6000000-0000-4000-8000-000000000201']::uuid[]),
  ('f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000002', 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at) VALUES
  ('f6000000-0000-4000-8000-000000000301', 'f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000201', 'SPC', 'Assigned', 'Active', 'extended-upgrade-assigned', NULL),
  ('f6000000-0000-4000-8000-000000000302', 'f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000201', 'SGT', 'Assigned', 'Archived', 'extended-upgrade-archived', '2029-01-01'),
  ('f6000000-0000-4000-8000-000000000303', 'f6000000-0000-4000-8000-000000000101', NULL, 'PFC', 'Unassigned', 'Active', 'extended-upgrade-unassigned', NULL);
INSERT INTO public.personnel_extended_info
  (id, organization_id, personnel_id, emergency_contact_name, personal_phone, award_tracking_acknowledged_at) VALUES
  ('f6000000-0000-4000-8000-000000000401', 'f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000301', 'Alpha contact', '555-0101', '2029-02-01'),
  ('f6000000-0000-4000-8000-000000000402', 'f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000302', 'Archived contact', '555-0102', '2029-02-02'),
  ('f6000000-0000-4000-8000-000000000403', 'f6000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000303', 'Unassigned contact', '555-0103', '2029-02-03');

CREATE TABLE upgrade_fixture.personnel_extended_info_before_rows (
  table_name text NOT NULL, row_id uuid NOT NULL, row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.personnel_extended_info_before_rows
SELECT 'auth.users', id, to_jsonb(row_value) FROM auth.users AS row_value WHERE id IN ('f6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000002')
UNION ALL
SELECT 'public.organizations', id, to_jsonb(row_value) FROM public.organizations AS row_value WHERE id = 'f6000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.groups', id, to_jsonb(row_value) FROM public.groups AS row_value WHERE id = 'f6000000-0000-4000-8000-000000000201'
UNION ALL
SELECT 'public.organization_memberships', id, to_jsonb(row_value) FROM public.organization_memberships AS row_value WHERE organization_id = 'f6000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel', id, to_jsonb(row_value) FROM public.personnel AS row_value WHERE organization_id = 'f6000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'public.personnel_extended_info', id, to_jsonb(row_value) FROM public.personnel_extended_info AS row_value WHERE organization_id = 'f6000000-0000-4000-8000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.personnel_extended_info_before_rows) <> 12 THEN
    RAISE EXCEPTION 'Extended info upgrade fixture is incomplete';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f6000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.personnel_extended_info) <> 3 THEN
    RAISE EXCEPTION 'Pre-upgrade extended info Group exposure changed';
  END IF;
END;
$$;
RESET ROLE;
COMMIT;
