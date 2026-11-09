-- #2030 Calendar status types archive instead of deleting their schedule entries. Every write below runs as an ordinary
-- signed-in admin or member; setup and readback are the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a2030100-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

-- 1 owner, 2 admin, 3 viewer who can see the Calendar but not configure it.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'archive-status-' || n || '@example.test', now()
FROM generate_series(1, 3) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES
  (pg_temp.id('2'), 'SFC', 'Ada', 'Admin');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Archive Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Archive Bravo', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test'),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"calendar": "view", "personnel": "view"}',
    'organization', ARRAY[]::uuid[], 'viewer@example.test');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'archive-status-jane');

INSERT INTO public.status_types (id, organization_id, name, short_label, sort_order) VALUES
  (pg_temp.id('601'), pg_temp.id('101'), 'Leave', 'LV', 0),
  (pg_temp.id('602'), pg_temp.id('101'), 'Pass', 'PS', 1),
  (pg_temp.id('603'), pg_temp.id('101'), 'Unused status', 'UN', 2),
  (pg_temp.id('604'), pg_temp.id('101'), 'Unused two', 'U2', 3);
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date) VALUES
  (pg_temp.id('701'), pg_temp.id('101'), pg_temp.id('201'), pg_temp.id('601'), '2030-03-01', '2030-03-03');
DELETE FROM public.audit_logs WHERE org_id = pg_temp.id('101');

-- Archive and restore.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.status_types SET archived_at = '1999-01-01T00:00:00Z' WHERE id = pg_temp.id('601');
RESET ROLE;
SELECT ok(
  (SELECT archived_at FROM public.status_types WHERE id = pg_temp.id('601')) > now() - interval '1 minute',
  'an admin archives a type and the database sets the time, whatever time the client sent');
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.availability_entries WHERE status_type_id = pg_temp.id('601') $$,
  $$ VALUES (1) $$,
  'archiving keeps every entry that uses the type');

CREATE TEMP TABLE archived_at_before AS
  SELECT id, archived_at FROM public.status_types WHERE id = pg_temp.id('601');
GRANT SELECT ON archived_at_before TO authenticated;
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.status_types SET archived_at = '2040-01-01T00:00:00Z' WHERE id = pg_temp.id('601');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id, archived_at FROM public.status_types WHERE id = pg_temp.id('601') $$,
  $$ SELECT id, archived_at FROM archived_at_before $$,
  'an archived type keeps its archive time when saved again');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.status_types SET archived_at = NULL WHERE id = pg_temp.id('601');
RESET ROLE;
SELECT results_eq(
  $$ SELECT archived_at FROM public.status_types WHERE id = pg_temp.id('601') $$,
  $$ VALUES (NULL::timestamptz) $$,
  'an admin restores a type');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.status_types SET archived_at = now() WHERE id = pg_temp.id('601');
RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, user_id, actor_label, record_label, details FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND resource_type = 'status_type' $$,
  $$ VALUES
    ('status_type.archived', pg_temp.id('2'), 'SFC Admin, Ada', 'Leave', '{}'::jsonb),
    ('status_type.restored', pg_temp.id('2'), 'SFC Admin, Ada', 'Leave', '{}'::jsonb),
    ('status_type.archived', pg_temp.id('2'), 'SFC Admin, Ada', 'Leave', '{}'::jsonb) $$,
  'archiving and restoring write their own entries naming the admin, and a repeat save writes nothing');

-- A member without configure access cannot archive, restore or delete.
SELECT pg_temp.act_as('3');
SET LOCAL ROLE authenticated;
UPDATE public.status_types SET archived_at = now() WHERE id = pg_temp.id('603');
UPDATE public.status_types SET archived_at = NULL WHERE id = pg_temp.id('601');
DELETE FROM public.status_types WHERE id = pg_temp.id('603');
SELECT throws_ok($$ SELECT * FROM public.status_type_record_counts('a2030100-0000-4000-8000-000000000101') $$,
  '42501', 'Calendar configuration is not allowed', 'a viewer cannot read status type usage');
RESET ROLE;
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.status_types
       WHERE id IN (pg_temp.id('601'), pg_temp.id('603')) AND (id = pg_temp.id('601')) = (archived_at IS NOT NULL) $$,
  $$ VALUES (2) $$,
  'a viewer changed and removed nothing, so both the archived and the unused types are as they were');

-- A type with entries cannot be deleted, however it is reached.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ DELETE FROM public.status_types WHERE id = 'a2030100-0000-4000-8000-000000000601' $$,
  '23503', NULL, 'an admin cannot delete a status type that has a schedule entry');
RESET ROLE;
SELECT results_eq(
  $$ SELECT (SELECT count(*)::integer FROM public.availability_entries WHERE id = pg_temp.id('701')),
            (SELECT count(*)::integer FROM public.status_types WHERE id = pg_temp.id('601')) $$,
  $$ VALUES (1, 1) $$,
  'the refused delete left the type and its entry in place');

-- A type without entries deletes.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
DELETE FROM public.status_types WHERE id = pg_temp.id('603');
RESET ROLE;
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.status_types WHERE id = pg_temp.id('603') $$,
  $$ VALUES (0) $$,
  'an admin deletes a type that has no entries');

-- Usage counts.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT status_type_id, record_count FROM public.status_type_record_counts('a2030100-0000-4000-8000-000000000101') ORDER BY status_type_id $$,
  $$ VALUES (pg_temp.id('601'), 1::bigint), (pg_temp.id('602'), 0::bigint), (pg_temp.id('604'), 0::bigint) $$,
  'status usage counts schedule entries for every type in the Organization');
SELECT throws_ok($$ SELECT * FROM public.status_type_record_counts('a2030100-0000-4000-8000-000000000102') $$,
  '42501', NULL, 'an admin of one Organization cannot read another''s usage');
RESET ROLE;

-- Reordering covers active types only.
SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
UPDATE public.status_types SET archived_at = NULL WHERE id = pg_temp.id('601');
UPDATE public.status_types SET archived_at = now() WHERE id = pg_temp.id('602');
SELECT lives_ok(
  format($$ SELECT public.set_status_type_order(%L, ARRAY[%L, %L]::uuid[], ARRAY[%L, %L]::uuid[]) $$,
    pg_temp.id('101'), pg_temp.id('604'), pg_temp.id('601'), pg_temp.id('601'), pg_temp.id('604')),
  'the status order saves the active types in the new order');
SELECT throws_ok(
  format($$ SELECT public.set_status_type_order(%L, ARRAY[%L, %L]::uuid[], ARRAY[%L, %L, %L]::uuid[]) $$,
    pg_temp.id('101'), pg_temp.id('601'), pg_temp.id('604'), pg_temp.id('604'), pg_temp.id('601'), pg_temp.id('602')),
  'STO01', NULL, 'an expected order that still lists an archived status type is stale');
RESET ROLE;
SELECT results_eq(
  $$ SELECT array_agg(id ORDER BY sort_order, id) FROM public.status_types
       WHERE organization_id = pg_temp.id('101') AND archived_at IS NULL $$,
  $$ VALUES (ARRAY[pg_temp.id('604'), pg_temp.id('601')]) $$,
  'the active types read back in the saved order');
SELECT results_eq(
  $$ SELECT sort_order FROM public.status_types WHERE id = pg_temp.id('602') $$,
  $$ VALUES (1) $$,
  'archived types keep the position they had');

-- Deleting an Organization still removes its types together with their entries.
SELECT set_config('request.jwt.claim.sub', pg_temp.id('1')::text, true);
DELETE FROM public.organizations WHERE id = pg_temp.id('101');
SELECT results_eq(
  $$ SELECT (SELECT count(*)::integer FROM public.status_types WHERE organization_id = pg_temp.id('101')),
            (SELECT count(*)::integer FROM public.availability_entries WHERE organization_id = pg_temp.id('101')) $$,
  $$ VALUES (0, 0) $$,
  'deleting an Organization removes its types and entries together');

SELECT * FROM finish();
ROLLBACK;
