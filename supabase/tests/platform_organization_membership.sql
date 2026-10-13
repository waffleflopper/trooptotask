BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email) SELECT
  ('d2103000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'d21-contract-' || n || '@example.test'
  FROM generate_series(1,9) n;
INSERT INTO public.platform_admins(user_id,role,is_active) VALUES
('d2103000-0000-4000-8000-000000000001','super_admin',true),
('d2103000-0000-4000-8000-000000000002','support',true),
('d2103000-0000-4000-8000-000000000003','billing',true),
('d2103000-0000-4000-8000-000000000004','super_admin',false);
INSERT INTO public.organizations(id,name,created_by) VALUES
('d2103000-0000-4000-8000-000000000101','D21 contract A','d2103000-0000-4000-8000-000000000005'),
('d2103000-0000-4000-8000-000000000102','D21 contract B','d2103000-0000-4000-8000-000000000008'),
('d2103000-0000-4000-8000-000000000103','D21 no owner','d2103000-0000-4000-8000-000000000005'),
('d2103000-0000-4000-8000-000000000104','D21 multiple owners','d2103000-0000-4000-8000-000000000005');
INSERT INTO public.organization_memberships(id,organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids)
SELECT ('d2103000-0000-4000-8000-' || lpad(m::text,12,'0'))::uuid,
  ('d2103000-0000-4000-8000-' || lpad(o::text,12,'0'))::uuid,
  ('d2103000-0000-4000-8000-' || lpad(u::text,12,'0'))::uuid,r::public.organization_role,
  'operator','{"calendar":"view","criticalTasks":"none"}'::jsonb,'groups',ARRAY['d2103000-0000-4000-8000-000000000501']::uuid[]
FROM (VALUES(201,101,5,'owner'),(202,101,6,'member'),(203,101,7,'admin'),
  (204,102,8,'owner'),(205,102,6,'member'),(206,104,5,'owner'),(207,104,9,'owner'),
  (208,104,6,'member'),(209,103,6,'member')) rows(m,o,u,r);
CREATE TEMP TABLE d21_before AS SELECT id,to_jsonb(m) row_data FROM public.organization_memberships m
  WHERE id::text LIKE 'd2103000-%';

SELECT is(has_function_privilege('anon','public.platform_promote_org_member(uuid,uuid,uuid)','EXECUTE'),false,'anonymous promotion is not granted');
SELECT is(has_function_privilege('authenticated','public.platform_promote_org_member(uuid,uuid,uuid)','EXECUTE'),false,'ordinary promotion is not granted');
SELECT is(has_function_privilege('service_role','public.platform_promote_org_member(uuid,uuid,uuid)','EXECUTE'),true,'server promotion is granted');
SELECT is(has_function_privilege('anon','public.platform_transfer_org_ownership(uuid,uuid,uuid,text)','EXECUTE'),false,'anonymous platform transfer is not granted');
SELECT is(has_function_privilege('authenticated','public.platform_transfer_org_ownership(uuid,uuid,uuid,text)','EXECUTE'),false,'ordinary platform transfer is not granted');
SELECT is(has_function_privilege('service_role','public.platform_transfer_org_ownership(uuid,uuid,uuid,text)','EXECUTE'),true,'server platform transfer is granted');
SELECT ok(has_function_privilege('anon','public.transfer_org_ownership(uuid,uuid)','EXECUTE') AND
  has_function_privilege('authenticated','public.transfer_org_ownership(uuid,uuid)','EXECUTE') AND
  has_function_privilege('service_role','public.transfer_org_ownership(uuid,uuid)','EXECUTE'),'ordinary transfer retains its existing execution grants');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2103000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000006','D21 contract A')$$,'42501',NULL,'even a super-admin cannot call the service-only RPC with an ordinary database role');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok(format('SELECT public.platform_promote_org_member(%L,%L,%L)',actor,
  'd2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000006'),
  '42501','Current active super-admin access is required','promotion denies ' || label)
FROM (VALUES(NULL::text,'missing actor'),('d2103000-0000-4000-8000-000000000002','support'),
  ('d2103000-0000-4000-8000-000000000003','billing'),('d2103000-0000-4000-8000-000000000004','inactive super-admin'),
  ('d2103000-0000-4000-8000-000000000008','non-admin')) actors(actor,label);
SELECT throws_ok(format('SELECT public.platform_transfer_org_ownership(%L,%L,%L,%L)',actor,
  'd2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000006','D21 contract A'),
  '42501','Current active super-admin access is required','transfer denies ' || label)
FROM (VALUES(NULL::text,'missing actor'),('d2103000-0000-4000-8000-000000000002','support'),
  ('d2103000-0000-4000-8000-000000000003','billing'),('d2103000-0000-4000-8000-000000000004','inactive super-admin'),
  ('d2103000-0000-4000-8000-000000000008','non-admin')) actors(actor,label);
INSERT INTO public.user_suspensions(user_id,suspended_by) VALUES('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT public.platform_promote_org_member('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000006')$$,'42501','Current active super-admin access is required','suspended actor cannot promote');
SELECT throws_ok($$SELECT public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000006','D21 contract A')$$,'42501','Current active super-admin access is required','suspended actor cannot transfer');
DELETE FROM public.user_suspensions WHERE user_id='d2103000-0000-4000-8000-000000000001';
SELECT is(public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000006',confirmation)->>'status','name_mismatch','wrong or absent confirmation changes nothing')
FROM (VALUES('wrong'),('d21 contract a'),('D21 contract A '),(NULL)) names(confirmation);
SELECT is(public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000103','d2103000-0000-4000-8000-000000000006','D21 no owner')->>'status','no_current_owner','missing owner is rejected');
SELECT is(public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000104','d2103000-0000-4000-8000-000000000006','D21 multiple owners')->>'status','multiple_current_owners','multiple owners are rejected without normalization');
SELECT is(public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000008','D21 contract A')->>'status','target_not_member','foreign owner is not an A target');
SELECT is(public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000005','D21 contract A')->>'status','already_owner','current owner is not a transfer target');
SELECT is(public.platform_promote_org_member('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000008')->>'status','target_not_member','foreign owner is not an A promotion target');
SELECT is(public.platform_promote_org_member('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000005')->>'status','already_owner','promotion cannot demote an owner');
SELECT is(public.platform_promote_org_member('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000007')->>'status','already_admin','repeated admin promotion does not rewrite access');
SELECT is(public.platform_promote_org_member('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000199','d2103000-0000-4000-8000-000000000006')->>'status','organization_not_found','promotion rejects missing Organization');
SELECT is(public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000199','d2103000-0000-4000-8000-000000000006','missing')->>'status','organization_not_found','transfer rejects missing Organization');
RESET ROLE;
SELECT results_eq($$SELECT id,to_jsonb(m) FROM public.organization_memberships m WHERE id::text LIKE 'd2103000-%' ORDER BY id$$,
  $$SELECT * FROM d21_before ORDER BY id$$,'all denials and conflicts retain every saved membership field');
SET LOCAL ROLE service_role;
SELECT is(public.platform_promote_org_member('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000006'),
  '{"status":"updated","org_id":"d2103000-0000-4000-8000-000000000101","target_user_id":"d2103000-0000-4000-8000-000000000006"}'::jsonb,'promotion acknowledges the exact existing member');
SELECT is(public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000006','D21 contract A')->>'from_user_id','d2103000-0000-4000-8000-000000000005','atomic transfer reports its actual current owner');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.organization_memberships WHERE organization_id='d2103000-0000-4000-8000-000000000101' AND role='owner'),1,'one owner remains');
SELECT ok((SELECT role='owner' AND member_preset='editor' AND capability_overrides='{}'::jsonb AND access_scope_kind='organization' AND cardinality(access_scope_group_ids)=0 FROM public.organization_memberships WHERE id='d2103000-0000-4000-8000-000000000202'),'recipient retains its membership ID and gains canonical full owner fields');
SELECT ok((SELECT role='admin' AND member_preset='editor' AND capability_overrides='{}'::jsonb AND access_scope_kind='organization' AND cardinality(access_scope_group_ids)=0 FROM public.organization_memberships WHERE id='d2103000-0000-4000-8000-000000000201'),'former owner retains its membership ID and gains canonical full admin fields');
SELECT results_eq($$SELECT id,to_jsonb(m) FROM public.organization_memberships m WHERE id::text LIKE 'd2103000-%' AND id NOT IN ('d2103000-0000-4000-8000-000000000201','d2103000-0000-4000-8000-000000000202') ORDER BY id$$,
  $$SELECT * FROM d21_before WHERE id NOT IN ('d2103000-0000-4000-8000-000000000201','d2103000-0000-4000-8000-000000000202') ORDER BY id$$,'neighbors, B and owner anomalies remain untouched');
SELECT is((SELECT created_by FROM public.organizations WHERE id='d2103000-0000-4000-8000-000000000101'),'d2103000-0000-4000-8000-000000000005'::uuid,'transfer preserves creator provenance');

CREATE TEMP TABLE d21_atomic_before AS SELECT id,to_jsonb(m) row_data FROM public.organization_memberships m WHERE organization_id='d2103000-0000-4000-8000-000000000101';
CREATE FUNCTION pg_temp.d21_reject_promotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.user_id='d2103000-0000-4000-8000-000000000007' AND NEW.role='owner' THEN RAISE EXCEPTION 'synthetic promotion storage failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER d21_reject_promotion BEFORE UPDATE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION pg_temp.d21_reject_promotion();
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.platform_transfer_org_ownership('d2103000-0000-4000-8000-000000000001','d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000007','D21 contract A')$$,'P0001','synthetic promotion storage failure','platform promotion failure aborts the whole transfer');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2103000-0000-4000-8000-000000000006',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT throws_ok($$SELECT public.transfer_org_ownership('d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000007')$$,'P0001','synthetic promotion storage failure','ordinary promotion failure aborts the whole transfer');
RESET ROLE;
SELECT results_eq($$SELECT id,to_jsonb(m) FROM public.organization_memberships m WHERE organization_id='d2103000-0000-4000-8000-000000000101' ORDER BY id$$,
  $$SELECT * FROM d21_atomic_before ORDER BY id$$,'neither failure commits its preceding demotion or any changed access field');
DROP TRIGGER d21_reject_promotion ON public.organization_memberships;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2103000-0000-4000-8000-000000000005',true);
SELECT throws_ok($$SELECT public.transfer_org_ownership('d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000007')$$,'P0001','Only the owner can transfer ownership','former owner is denied');
SELECT set_config('request.jwt.claim.sub','d2103000-0000-4000-8000-000000000006',true);
SELECT lives_ok($$SELECT public.transfer_org_ownership('d2103000-0000-4000-8000-000000000101','d2103000-0000-4000-8000-000000000007')$$,'ordinary current owner can still transfer to its admin');
RESET ROLE;
SELECT ok((SELECT role='owner' AND member_preset='editor' AND capability_overrides='{}'::jsonb AND access_scope_kind='organization' AND cardinality(access_scope_group_ids)=0 FROM public.organization_memberships WHERE id='d2103000-0000-4000-8000-000000000203'),'ordinary recipient retains its ID and canonical full owner fields');
SELECT * FROM finish();
ROLLBACK;
