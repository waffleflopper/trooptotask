BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*)::integer FROM supabase_migrations.schema_migrations
  WHERE version='20261012000100'),1,'the invitation grant migration is recorded');
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) - 'approval_basis' FROM public.access_requests r WHERE id::text LIKE 'f3000000-%' ORDER BY id $$,
  $$ SELECT row_id,row_data FROM upgrade_fixture.approval_basis_before_rows ORDER BY row_id $$,
  'upgrade preserves every historical Access Request value apart from the added basis');
SELECT results_eq(
  $$ SELECT name,approval_basis FROM public.access_requests WHERE id::text LIKE 'f3000000-%' ORDER BY id $$,
  $$ VALUES ('Audited approval'::text,'platform_review'::text),
            ('Invitation approval','organization_invitation'),
            ('Skewed invitation approval','organization_invitation'),
            ('Hand approval then invite','platform_review'),
            ('Unlinked approval','platform_review'),
            ('Pending',NULL),
            ('Rejected',NULL) $$,
  'backfill classifies each historical approval by its audit trail and invitation timing');
SELECT throws_ok($$ INSERT INTO public.access_requests(email,name,status) VALUES ('basis-new@example.test','New','approved') $$,
  '23514',NULL,'after upgrade an approved row must state its basis');
SELECT ok(public.access_request_setup_grant_is_live('f3000000-0000-4000-8000-000000000402'),
  'a backfilled invitation approval with a pending invitation is live');
UPDATE public.organization_invitations SET status='revoked', revoked_at=now(), revoked_by='f3000000-0000-4000-8000-000000000001'
  WHERE id='f3000000-0000-4000-8000-000000000302';
SELECT ok(NOT public.access_request_setup_grant_is_live('f3000000-0000-4000-8000-000000000402'),
  'historical residue dies once its only invitation is withdrawn');
UPDATE public.organization_invitations SET status='revoked', revoked_at=now(), revoked_by='f3000000-0000-4000-8000-000000000002'
  WHERE id='f3000000-0000-4000-8000-000000000304';
SELECT ok(public.access_request_setup_grant_is_live('f3000000-0000-4000-8000-000000000404'),
  'a hand approval survives the withdrawal of a later invitation');
SELECT * FROM finish();
ROLLBACK;
