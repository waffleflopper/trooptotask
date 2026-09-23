-- Phase 06 synthetic, populated upgrade fixture. Run once against a fresh,
-- seed-disabled replay of the pre-retirement schema, before 06-01c-before.sql.
-- This file commits deliberately: D02 can apply its forward migration to the
-- same isolated database, then run 06-01c-after.sql. Never run on shared data.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM public.organizations) THEN
    RAISE EXCEPTION '06-01c fixture requires an empty disposable replay';
  END IF;
END $$;

INSERT INTO auth.users (id, email) VALUES
  ('a6010000-0000-4000-8000-000000000001', 'phase06-owner@example.test'),
  ('a6010000-0000-4000-8000-000000000002', 'phase06-scoped@example.test'),
  ('a6010000-0000-4000-8000-000000000003', 'phase06-foreign@example.test');

INSERT INTO public.organizations (id, name, created_by, url_slug) VALUES
  ('a6010000-0000-4000-8000-000000000101', 'Phase 06 Alpha', 'a6010000-0000-4000-8000-000000000001', 'phase06-alpha'),
  ('a6010000-0000-4000-8000-000000000102', 'Phase 06 Foreign', 'a6010000-0000-4000-8000-000000000003', 'phase06-foreign');

INSERT INTO public.groups (id, organization_id, name) VALUES
  ('a6010000-0000-4000-8000-000000000201', 'a6010000-0000-4000-8000-000000000101', 'Alpha'),
  ('a6010000-0000-4000-8000-000000000202', 'a6010000-0000-4000-8000-000000000101', 'Bravo'),
  ('a6010000-0000-4000-8000-000000000203', 'a6010000-0000-4000-8000-000000000101', 'Charlie'),
  ('a6010000-0000-4000-8000-000000000204', 'a6010000-0000-4000-8000-000000000102', 'Foreign');

INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids)
VALUES
  ('a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000001', 'owner', 'editor', '{}'::jsonb, 'organization', ARRAY[]::uuid[]),
  ('a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000002', 'member', 'operator', '{"calendar":"operate","training":"operate"}'::jsonb, 'groups', ARRAY['a6010000-0000-4000-8000-000000000201','a6010000-0000-4000-8000-000000000202']::uuid[]),
  ('a6010000-0000-4000-8000-000000000102', 'a6010000-0000-4000-8000-000000000003', 'owner', 'editor', '{}'::jsonb, 'organization', ARRAY[]::uuid[]);

INSERT INTO public.personnel
  (id, organization_id, group_id, rank, first_name, last_name, clinic_role, mos, slug)
VALUES
  ('a6010000-0000-4000-8000-000000000301', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000201', 'KEEP', 'Avery', 'Alpha', 'Medic', '68W', 'phase06-avery'),
  ('a6010000-0000-4000-8000-000000000302', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000202', 'SPC', 'Bailey', 'Bravo', 'Medic', '68W', 'phase06-bailey'),
  ('a6010000-0000-4000-8000-000000000303', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000203', 'SPC', 'Casey', 'Charlie', 'Medic', '68W', 'phase06-casey'),
  ('a6010000-0000-4000-8000-000000000304', 'a6010000-0000-4000-8000-000000000102', 'a6010000-0000-4000-8000-000000000204', 'KEEP', 'Frankie', 'Foreign', 'Medic', '68W', 'phase06-frankie');

INSERT INTO public.assignment_types
  (id, organization_id, name, short_name, assign_to, color, sort_order, show_in_date_header)
VALUES
  ('a6010000-0000-4000-8000-000000000401', 'a6010000-0000-4000-8000-000000000101', 'Manual Clinic', 'MC', 'personnel', '#123456', 1, false),
  ('a6010000-0000-4000-8000-000000000402', 'a6010000-0000-4000-8000-000000000101', 'Legacy Night Duty', 'COV', 'personnel', '#654321', 2, true),
  ('a6010000-0000-4000-8000-000000000403', 'a6010000-0000-4000-8000-000000000101', 'Group Coverage', 'GC', 'group', '#abcdef', 3, false),
  ('a6010000-0000-4000-8000-000000000404', 'a6010000-0000-4000-8000-000000000102', 'Foreign Clinic', 'FC', 'personnel', '#fedcba', 1, false),
  ('a6010000-0000-4000-8000-000000000405', 'a6010000-0000-4000-8000-000000000101', 'Unused Generated', 'UG', 'personnel', '#333333', 4, false);

INSERT INTO public.duty_roster_templates
  (id, organization_id, name, slug, assignment_type_id, pool_criteria)
VALUES
  ('a6010000-0000-4000-8000-000000000501', 'a6010000-0000-4000-8000-000000000101', 'Former Coverage Generator', 'former-coverage-generator', 'a6010000-0000-4000-8000-000000000402', '{"rankValues":["OLD-DUTY"],"groupIds":[],"mosValues":[],"dutyRoleValues":[]}'::jsonb),
  ('a6010000-0000-4000-8000-000000000502', 'a6010000-0000-4000-8000-000000000101', 'Unused Generator', 'unused-generator', 'a6010000-0000-4000-8000-000000000405', '{}'::jsonb);

INSERT INTO public.duty_roster_template_runs
  (id, organization_id, template_id, template_name, start_date, end_date, snapshot_payload)
VALUES
  ('a6010000-0000-4000-8000-000000000503', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000501', 'Former Coverage Generator', '2030-03-01', '2030-03-31', '{"assignments":[{"date":"2030-03-10","personnelId":"a6010000-0000-4000-8000-000000000301"}]}'::jsonb);

-- The saved March 10 assignment was changed manually from the run snapshot's
-- Alpha person to the Bravo person. The next day reuses the same former
-- generated type without run lineage. Current labels, not historical names,
-- are the retained Calendar contract.
UPDATE public.assignment_types
SET name = 'Current Clinical Coverage'
WHERE id = 'a6010000-0000-4000-8000-000000000402';

INSERT INTO public.daily_assignments
  (id, organization_id, assignment_type_id, date, assignee_id, created_at, duty_roster_template_run_id, duty_roster_template_run_row_date)
VALUES
  ('a6010000-0000-4000-8000-000000000601', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000401', '2030-03-09', 'a6010000-0000-4000-8000-000000000301', '2030-01-01 00:00:01+00', NULL, NULL),
  ('a6010000-0000-4000-8000-000000000602', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000402', '2030-03-10', 'a6010000-0000-4000-8000-000000000302', '2030-01-01 00:00:02+00', 'a6010000-0000-4000-8000-000000000503', '2030-03-10'),
  ('a6010000-0000-4000-8000-000000000603', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000402', '2030-03-11', 'a6010000-0000-4000-8000-000000000301', '2030-01-01 00:00:03+00', NULL, NULL),
  ('a6010000-0000-4000-8000-000000000604', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000403', '2030-03-12', 'a6010000-0000-4000-8000-000000000202', '2030-01-01 00:00:04+00', NULL, NULL),
  ('a6010000-0000-4000-8000-000000000605', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000402', '2030-03-12', 'a6010000-0000-4000-8000-000000000301', '2030-01-01 00:00:05+00', NULL, '2030-03-12'),
  ('a6010000-0000-4000-8000-000000000606', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000402', '2030-03-13', 'a6010000-0000-4000-8000-000000000302', '2030-01-01 00:00:06+00', 'a6010000-0000-4000-8000-000000000503', '2030-04-01'),
  ('a6010000-0000-4000-8000-000000000607', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000401', '2030-03-10', 'a6010000-0000-4000-8000-000000000303', '2030-01-01 00:00:07+00', NULL, NULL),
  ('a6010000-0000-4000-8000-000000000608', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000402', '2030-03-14', 'a6010000-0000-4000-8000-000000000301', '2030-01-01 00:00:08+00', 'a6010000-0000-4000-8000-000000000503', NULL),
  ('a6010000-0000-4000-8000-000000000609', 'a6010000-0000-4000-8000-000000000102', 'a6010000-0000-4000-8000-000000000404', '2030-03-10', 'a6010000-0000-4000-8000-000000000304', '2030-01-01 00:00:09+00', NULL, NULL);

-- A computed-only legacy overlay has no daily_assignments row for March 20.
INSERT INTO public.duty_templates
  (id, organization_id, status, name)
VALUES
  ('a6010000-0000-4000-8000-000000000510', 'a6010000-0000-4000-8000-000000000101', 'active', 'Computed Only');
INSERT INTO public.duty_events
  (id, organization_id, template_id, template_name, event_date, coverage_start, coverage_end)
VALUES
  ('a6010000-0000-4000-8000-000000000511', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000510', 'Computed Only', '2030-03-20', '08:00', '17:00');
INSERT INTO public.duty_event_slots
  (id, organization_id, duty_event_id, role_label, assignee_id)
VALUES
  ('a6010000-0000-4000-8000-000000000512', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000511', 'Cover', 'a6010000-0000-4000-8000-000000000301');

INSERT INTO public.status_types
  (id, organization_id, name, color, text_color, da6_availability_treatment, da6_treatment_reviewed)
VALUES
  ('a6010000-0000-4000-8000-000000000701', 'a6010000-0000-4000-8000-000000000101', 'Clinic Available', '#112233', '#ffffff', 'other-duty', true);

INSERT INTO public.organization_rank_catalog
  (id, organization_id, code, label, service, category, pay_grade)
VALUES
  ('a6010000-0000-4000-8000-000000000801', 'a6010000-0000-4000-8000-000000000101', 'KEEP', 'Retained Rank', 'army', 'enlisted', 'E-5'),
  ('a6010000-0000-4000-8000-000000000802', 'a6010000-0000-4000-8000-000000000101', 'OLD-DUTY', 'Former Generator Rank', 'army', 'enlisted', 'E-5'),
  ('a6010000-0000-4000-8000-000000000803', 'a6010000-0000-4000-8000-000000000101', 'UNUSED', 'Unused Rank', 'army', 'enlisted', 'E-5');

INSERT INTO public.sign_in_rosters
  (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, filter_config, signed_file_path, created_by)
VALUES
  ('a6010000-0000-4000-8000-000000000901', 'a6010000-0000-4000-8000-000000000101', 'Alpha Sign-In', '2030-03-09', '[{"id":"a6010000-0000-4000-8000-000000000301","rank":"KEEP","groupId":"a6010000-0000-4000-8000-000000000201"}]'::jsonb, ARRAY['a6010000-0000-4000-8000-000000000301']::uuid[], ARRAY['a6010000-0000-4000-8000-000000000201']::uuid[], '{"ranks":["KEEP"]}'::jsonb, 'a6010000-0000-4000-8000-000000000101/sign-in-rosters/a6010000-0000-4000-8000-000000000901/signed.pdf', 'a6010000-0000-4000-8000-000000000001'),
  ('a6010000-0000-4000-8000-000000000902', 'a6010000-0000-4000-8000-000000000101', 'Charlie Sign-In', '2030-03-09', '[{"id":"a6010000-0000-4000-8000-000000000303","rank":"SPC","groupId":"a6010000-0000-4000-8000-000000000203"}]'::jsonb, ARRAY['a6010000-0000-4000-8000-000000000303']::uuid[], ARRAY['a6010000-0000-4000-8000-000000000203']::uuid[], '{}'::jsonb, NULL, 'a6010000-0000-4000-8000-000000000001'),
  ('a6010000-0000-4000-8000-000000000903', 'a6010000-0000-4000-8000-000000000102', 'Foreign Sign-In', '2030-03-09', '[{"id":"a6010000-0000-4000-8000-000000000304","rank":"KEEP","groupId":"a6010000-0000-4000-8000-000000000204"}]'::jsonb, ARRAY['a6010000-0000-4000-8000-000000000304']::uuid[], ARRAY['a6010000-0000-4000-8000-000000000204']::uuid[], '{}'::jsonb, NULL, 'a6010000-0000-4000-8000-000000000003');

COMMIT;
