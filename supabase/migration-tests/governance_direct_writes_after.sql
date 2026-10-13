-- Narrowed direct governance writes keep saved rows and retire pending owner invitations.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent AND legacy_flag_could_export FROM upgrade_fixture.governance_direct_writes_baseline),
  'saved rows preceded the migration while the legacy flag still granted export');
SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations WHERE version='20261012000400'),1,
  'governance direct write migration is recorded after populated upgrade');
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.governance_direct_writes_current_rows
    WHERE row_id<>'c6421000-0000-4000-8000-000000000501' ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.governance_direct_writes_before_rows
    WHERE row_id<>'c6421000-0000-4000-8000-000000000501' ORDER BY table_name,row_id $$,
  'organization, memberships, member invitation and historical owner invitation are unchanged');
SELECT results_eq(
  $$ SELECT row_data-'status'-'revoked_at' FROM upgrade_fixture.governance_direct_writes_current_rows
    WHERE row_id='c6421000-0000-4000-8000-000000000501' $$,
  $$ SELECT row_data-'status'-'revoked_at' FROM upgrade_fixture.governance_direct_writes_before_rows
    WHERE row_id='c6421000-0000-4000-8000-000000000501' $$,
  'the retired owner invitation keeps every field except its lifecycle state');
SELECT ok((SELECT status='revoked' AND revoked_at IS NOT NULL FROM public.organization_invitations
    WHERE id='c6421000-0000-4000-8000-000000000501'),
  'the pending owner invitation is revoked');
SELECT throws_ok(
  $$ UPDATE public.organization_invitations SET status='pending', revoked_at=NULL
    WHERE id='c6421000-0000-4000-8000-000000000503' $$,
  '23514', NULL, 'an owner invitation cannot return to pending');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c6421000-0000-4000-8000-000000000004',true);
SELECT is(public.can_export_organization_data('c6421000-0000-4000-8000-000000000101'),false,
  'the upgraded legacy canManageMembers flag no longer grants export');
SELECT set_config('request.jwt.claim.sub','c6421000-0000-4000-8000-000000000005',true);
SELECT set_config('request.jwt.claim.email','governance-upgrade-5@example.test',true);
SELECT throws_ok(
  $$ INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset)
    VALUES ('c6421000-0000-4000-8000-000000000101','c6421000-0000-4000-8000-000000000005','owner','viewer') $$,
  '42501', NULL, 'the former owner invitee cannot admit itself after upgrade');
SELECT set_config('request.jwt.claim.sub','c6421000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.email','governance-upgrade-2@example.test',true);
WITH changed AS (
  UPDATE public.organization_memberships SET role='owner'
  WHERE id='c6421000-0000-4000-8000-000000000302' RETURNING id
) SELECT is((SELECT count(*)::integer FROM changed),0,'the upgraded admin cannot promote itself');
SELECT throws_ok(
  $$ UPDATE public.organizations SET created_by='c6421000-0000-4000-8000-000000000002'
    WHERE id='c6421000-0000-4000-8000-000000000101' $$,
  '42501', NULL, 'the upgraded admin cannot rewrite the organization creator');
RESET ROLE;
SELECT results_eq(
  $$ SELECT * FROM upgrade_fixture.governance_direct_writes_current_rows
    WHERE row_id<>'c6421000-0000-4000-8000-000000000501' ORDER BY table_name,row_id $$,
  $$ SELECT * FROM upgrade_fixture.governance_direct_writes_before_rows
    WHERE row_id<>'c6421000-0000-4000-8000-000000000501' ORDER BY table_name,row_id $$,
  'denied upgraded writes leave saved governance rows unchanged');
SELECT * FROM finish();
ROLLBACK;
