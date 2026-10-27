BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,created_at) VALUES
 ('e8660000-0000-4000-8000-000000000101','setup-owner@example.test',now()),
 ('e8660000-0000-4000-8000-000000000102','setup-admin@example.test',now()),
 ('e8660000-0000-4000-8000-000000000103','setup-member@example.test',now()),
 ('e8660000-0000-4000-8000-000000000104','setup-outsider@example.test',now());
INSERT INTO public.organizations(id,name,created_by,url_slug) VALUES ('e8660000-0000-4000-8000-000000000100','Synthetic Setup Unit','e8660000-0000-4000-8000-000000000101','synthetic-setup-1866');
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids,email) VALUES
 ('e8660000-0000-4000-8000-000000000100','e8660000-0000-4000-8000-000000000101','owner','editor','{}','organization',ARRAY[]::uuid[],'setup-owner@example.test'),
 ('e8660000-0000-4000-8000-000000000100','e8660000-0000-4000-8000-000000000102','admin','editor','{}','organization',ARRAY[]::uuid[],'setup-admin@example.test'),
 ('e8660000-0000-4000-8000-000000000100','e8660000-0000-4000-8000-000000000103','member','editor','{}','organization',ARRAY[]::uuid[],'setup-member@example.test');
SELECT hasnt_table('public','getting_started_progress','the retired checklist table is gone');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e8660000-0000-4000-8000-000000000101',true);
SELECT is((public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','setup','{"never":true}')->'prompts'), '{"setup":{"never":true}}'::jsonb,'the signed-in owner saves prompt state');
SELECT is((public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','training','{"snoozedUntil":"2026-10-28"}')->'prompts'->'training'), '{"snoozedUntil":"2026-10-28"}'::jsonb,'prompt snoozes retain the viewer-local day');
SELECT is((public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','training',NULL)->'prompts'), '{"setup":{"never":true}}'::jsonb,'clearing one prompt preserves another');
SELECT throws_ok($$SELECT public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','setup','{"never":false}')$$,'22023',NULL,'malformed prompt state is rejected');
SELECT throws_ok($$SELECT public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','setup','{"never":true,"snoozedUntil":"2026-10-28"}')$$,'22023',NULL,'malformed prompt state is rejected');
SELECT throws_ok($$SELECT public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','setup','{"snoozedUntil":"2026-02-30"}')$$,'22023',NULL,'malformed prompt state is rejected');
SELECT throws_ok($$SELECT public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','setup','{"snoozedUntil":"2026-10-28T00:00:00Z"}')$$,'22023',NULL,'malformed prompt state is rejected');
SELECT throws_ok($$SELECT * FROM public.organization_setup$$,'42501',NULL,'the owner cannot select setup rows directly');
SELECT throws_ok($$INSERT INTO public.organization_setup(organization_id) VALUES ('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'the owner cannot insert setup rows directly');
SELECT throws_ok($$UPDATE public.organization_setup SET branch='navy' WHERE organization_id='e8660000-0000-4000-8000-000000000100'$$,'42501',NULL,'the owner cannot update setup rows directly');
SELECT throws_ok($$DELETE FROM public.organization_setup WHERE organization_id='e8660000-0000-4000-8000-000000000100'$$,'42501',NULL,'the owner cannot delete setup rows directly');
SELECT set_config('request.jwt.claim.sub','e8660000-0000-4000-8000-000000000102',true);
SELECT is((public.save_organization_setup_answer('e8660000-0000-4000-8000-000000000100','training','later')->'answers'->>'training'), 'later', 'an ordinary signed-in admin saves an answer');
SELECT is((public.save_organization_setup_branch('e8660000-0000-4000-8000-000000000100','army')->>'branch'), 'army', 'an admin saves the branch');
SELECT results_eq(
  $$SELECT organization_id, branch, answers, prompts FROM public.export_organization_setup('e8660000-0000-4000-8000-000000000100')$$,
  $$VALUES ('e8660000-0000-4000-8000-000000000100'::uuid, 'army'::text, '{"training":"later"}'::jsonb, '{"setup":{"never":true}}'::jsonb)$$,
  'an ordinary signed-in admin exports the stored setup row'
);
SELECT ok((public.finish_organization_setup('e8660000-0000-4000-8000-000000000100')->>'finishedAt') IS NOT NULL, 'an admin finishes setup');
SELECT throws_ok($$SELECT public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','setup','{"never":true}')$$,'42501',NULL,'an admin cannot write owner prompt state');
SELECT is((public.save_organization_setup_answer('e8660000-0000-4000-8000-000000000100','groups','reviewed')->'answers'), '{"groups":"reviewed","training":"later"}'::jsonb,'saving one answer preserves another');
SELECT is((public.save_organization_setup_answer('e8660000-0000-4000-8000-000000000100','training',NULL)->'answers'), '{"groups":"reviewed"}'::jsonb,'clearing an answer preserves the other answers');
SELECT throws_ok($$SELECT public.save_organization_setup_answer('e8660000-0000-4000-8000-000000000100','made-up','reviewed')$$,'22023',NULL,'invalid answers are rejected');
SELECT throws_ok($$SELECT public.save_organization_setup_answer('e8660000-0000-4000-8000-000000000100',NULL,'reviewed')$$,'22023',NULL,'invalid answers are rejected');
SELECT throws_ok($$SELECT public.save_organization_setup_answer('e8660000-0000-4000-8000-000000000100','training','off')$$,'22023',NULL,'invalid answers are rejected');
SELECT throws_ok($$SELECT public.save_organization_setup_branch('e8660000-0000-4000-8000-000000000100','made-up')$$,'22023',NULL,'invalid branches are rejected');
SELECT throws_ok($$SELECT * FROM public.organization_setup$$,'42501',NULL,'the admin cannot select setup rows directly');
SELECT throws_ok($$INSERT INTO public.organization_setup(organization_id) VALUES ('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'the admin cannot insert setup rows directly');
SELECT throws_ok($$UPDATE public.organization_setup SET branch='navy' WHERE organization_id='e8660000-0000-4000-8000-000000000100'$$,'42501',NULL,'the admin cannot update setup rows directly');
SELECT throws_ok($$DELETE FROM public.organization_setup WHERE organization_id='e8660000-0000-4000-8000-000000000100'$$,'42501',NULL,'the admin cannot delete setup rows directly');
SELECT set_config('request.jwt.claim.sub','e8660000-0000-4000-8000-000000000103',true);
SELECT throws_ok($$SELECT public.save_organization_setup_answer('e8660000-0000-4000-8000-000000000100','groups','later')$$,'42501',NULL,'the member cannot save setup answers');
SELECT throws_ok($$SELECT public.save_organization_setup_branch('e8660000-0000-4000-8000-000000000100','army')$$,'42501',NULL,'the member cannot save a branch');
SELECT throws_ok($$SELECT public.finish_organization_setup('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'the member cannot finish setup');
SELECT throws_ok($$SELECT public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','setup','{"never":true}')$$,'42501',NULL,'the member cannot save prompts');
SELECT throws_ok($$SELECT * FROM public.organization_setup$$,'42501',NULL,'the member cannot select setup rows directly');
SELECT throws_ok($$INSERT INTO public.organization_setup(organization_id) VALUES ('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'the member cannot insert setup rows directly');
SELECT throws_ok($$UPDATE public.organization_setup SET branch='navy' WHERE organization_id='e8660000-0000-4000-8000-000000000100'$$,'42501',NULL,'the member cannot update setup rows directly');
SELECT throws_ok($$DELETE FROM public.organization_setup WHERE organization_id='e8660000-0000-4000-8000-000000000100'$$,'42501',NULL,'the member cannot delete setup rows directly');
SELECT is((public.read_organization_setup('e8660000-0000-4000-8000-000000000100')->>'branch'),'army','a member reads the shared setup state through its reader');
SELECT throws_ok($$SELECT public.export_organization_setup('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'a member cannot use the privileged export reader');
SELECT set_config('request.jwt.claim.sub','e8660000-0000-4000-8000-000000000104',true);
SELECT throws_ok($$SELECT public.save_organization_setup_answer('e8660000-0000-4000-8000-000000000100','groups','later')$$,'42501',NULL,'the outsider cannot save setup answers');
SELECT throws_ok($$SELECT public.save_organization_setup_branch('e8660000-0000-4000-8000-000000000100','army')$$,'42501',NULL,'the outsider cannot save a branch');
SELECT throws_ok($$SELECT public.finish_organization_setup('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'the outsider cannot finish setup');
SELECT throws_ok($$SELECT public.save_organization_setup_prompt('e8660000-0000-4000-8000-000000000100','setup','{"never":true}')$$,'42501',NULL,'the outsider cannot save prompts');
SELECT throws_ok($$SELECT public.read_organization_setup('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'nonmembers cannot read another unit setup state');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT * FROM public.organization_setup$$,'42501',NULL,'anonymous clients have no setup access');
SELECT throws_ok($$INSERT INTO public.organization_setup(organization_id) VALUES ('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'anonymous clients have no setup access');
SELECT throws_ok($$UPDATE public.organization_setup SET branch=NULL$$,'42501',NULL,'anonymous clients have no setup access');
SELECT throws_ok($$DELETE FROM public.organization_setup$$,'42501',NULL,'anonymous clients have no setup access');
SELECT throws_ok($$SELECT public.read_organization_setup('e8660000-0000-4000-8000-000000000100')$$,'42501',NULL,'anonymous clients have no setup access');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
