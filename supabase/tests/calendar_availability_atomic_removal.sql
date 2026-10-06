BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid =
  'public.delete_availability_entries(uuid,uuid[])'::regprocedure),
  'availability removal uses the caller permissions');
SELECT ok(has_function_privilege('authenticated',
  'public.delete_availability_entries(uuid,uuid[])', 'EXECUTE'),
  'authenticated members can reach availability removal');
SELECT ok(NOT has_function_privilege('anon',
  'public.delete_availability_entries(uuid,uuid[])', 'EXECUTE'),
  'anonymous callers cannot execute availability removal');
SELECT ok(NOT has_function_privilege('service_role',
  'public.delete_availability_entries(uuid,uuid[])', 'EXECUTE'),
  'service role cannot execute availability removal');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p,
    LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) entry
  WHERE p.oid = 'public.delete_availability_entries(uuid,uuid[])'::regprocedure
    AND entry.grantee = 0 AND entry.privilege_type = 'EXECUTE'
), 'PUBLIC has no availability removal execution grant');

INSERT INTO auth.users(id,email) VALUES
  ('e6100000-0000-4000-8000-000000000001','remove-owner@example.test'),
  ('e6100000-0000-4000-8000-000000000002','remove-alpha@example.test'),
  ('e6100000-0000-4000-8000-000000000003','remove-viewer@example.test'),
  ('e6100000-0000-4000-8000-000000000004','remove-none@example.test'),
  ('e6100000-0000-4000-8000-000000000005','remove-empty@example.test'),
  ('e6100000-0000-4000-8000-000000000006','remove-foreign@example.test'),
  ('e6100000-0000-4000-8000-000000000007','remove-operator@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('e6100000-0000-4000-8000-000000000101','Removal A','e6100000-0000-4000-8000-000000000001'),
  ('e6100000-0000-4000-8000-000000000102','Removal B','e6100000-0000-4000-8000-000000000006');
INSERT INTO public.groups(id,organization_id,name) VALUES
  ('e6100000-0000-4000-8000-000000000201','e6100000-0000-4000-8000-000000000101','Alpha'),
  ('e6100000-0000-4000-8000-000000000202','e6100000-0000-4000-8000-000000000101','Bravo');
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
  ('e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000001','owner','editor','{}','organization','{}'),
  ('e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000002','member','viewer','{"calendar":"operate","personnel":"none"}','groups',ARRAY['e6100000-0000-4000-8000-000000000201']::uuid[]),
  ('e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000003','member','viewer','{"calendar":"view"}','organization','{}'),
  ('e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000004','member','viewer','{"calendar":"none"}','organization','{}'),
  ('e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000005','member','viewer','{"calendar":"operate"}','groups','{}'),
  ('e6100000-0000-4000-8000-000000000102','e6100000-0000-4000-8000-000000000006','owner','editor','{}','organization','{}'),
  ('e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000007','member','viewer','{"calendar":"operate","personnel":"none"}','organization','{}');
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,slug) VALUES
  ('e6100000-0000-4000-8000-000000000301','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000201','SPC','Alpha','Person','removal-alpha'),
  ('e6100000-0000-4000-8000-000000000302','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000202','SPC','Bravo','Person','removal-bravo'),
  ('e6100000-0000-4000-8000-000000000303','e6100000-0000-4000-8000-000000000101',NULL,'SPC','Unassigned','Person','removal-unassigned'),
  ('e6100000-0000-4000-8000-000000000304','e6100000-0000-4000-8000-000000000102',NULL,'SPC','Foreign','Person','removal-foreign');
INSERT INTO public.status_types(id,organization_id,name) VALUES
  ('e6100000-0000-4000-8000-000000000401','e6100000-0000-4000-8000-000000000101','Removal A status'),
  ('e6100000-0000-4000-8000-000000000402','e6100000-0000-4000-8000-000000000102','Removal B status');
INSERT INTO public.availability_entries(
  id,organization_id,personnel_id,status_type_id,start_date,end_date,note
) VALUES
  ('e6100000-0000-4000-8000-000000000501','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000301','e6100000-0000-4000-8000-000000000401','2030-01-01','2030-01-02','Visible Alpha'),
  ('e6100000-0000-4000-8000-000000000502','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000302','e6100000-0000-4000-8000-000000000401','2030-01-03','2030-01-04','Hidden Bravo'),
  ('e6100000-0000-4000-8000-000000000503','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000303','e6100000-0000-4000-8000-000000000401','2030-01-05','2030-01-06',NULL),
  ('e6100000-0000-4000-8000-000000000504','e6100000-0000-4000-8000-000000000102','e6100000-0000-4000-8000-000000000304','e6100000-0000-4000-8000-000000000402','2030-01-07','2030-01-08','Foreign saved row'),
  ('e6100000-0000-4000-8000-000000000505','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000301','e6100000-0000-4000-8000-000000000401','2030-01-09','2030-01-10','Rollback one'),
  ('e6100000-0000-4000-8000-000000000506','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000301','e6100000-0000-4000-8000-000000000401','2030-01-11','2030-01-12','Rollback two'),
  ('e6100000-0000-4000-8000-000000000507','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000301','e6100000-0000-4000-8000-000000000401','2030-01-13','2030-01-14','Newly hidden Alpha'),
  ('e6100000-0000-4000-8000-000000000508','e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000302','e6100000-0000-4000-8000-000000000401','2030-01-15','2030-01-16','Newly visible Bravo');
CREATE TEMP TABLE removal_original_rows AS
SELECT id,to_jsonb(row_value) row_data FROM public.availability_entries row_value
WHERE id::text LIKE 'e6100000-%';

SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000501']::uuid[]
) $$,'42501',NULL,'anonymous RPC execution is denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000501']::uuid[]
) $$,'42501',NULL,'service role RPC execution is denied');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{}',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000501']::uuid[]
) $$,'42501','Calendar availability removal is not allowed','an authenticated role without a user cannot delete');
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000501']::uuid[]
) $$,'42501','Calendar availability removal is not allowed','Calendar view cannot remove availability');
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000004',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000501']::uuid[]
) $$,'42501','Calendar availability removal is not allowed','a member without the Calendar lane cannot remove availability');
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000006',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000501']::uuid[]
) $$,'42501','Calendar availability removal is not allowed','foreign membership cannot operate in the target Organization');
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000005',true);
SELECT is(public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000501','e6100000-0000-4000-8000-000000000503']::uuid[]
),0,'an empty Group scope has no delete effects');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) FROM public.availability_entries r WHERE id::text LIKE 'e6100000-%' ORDER BY id $$,
  $$ SELECT id,row_data FROM removal_original_rows ORDER BY id $$,
  'denied and empty-scope calls preserve every saved field and ID');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000002',true);
SELECT is(public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY[
    'e6100000-0000-4000-8000-000000000501','e6100000-0000-4000-8000-000000000501',
    'e6100000-0000-4000-8000-000000000502','e6100000-0000-4000-8000-000000000503',
    'e6100000-0000-4000-8000-000000000504','e6100000-0000-4000-8000-000000000999'
  ]::uuid[]
),1,'a Calendar-only scoped operator deletes only the visible row and counts duplicates once');
SELECT is(public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY[
    'e6100000-0000-4000-8000-000000000501','e6100000-0000-4000-8000-000000000502',
    'e6100000-0000-4000-8000-000000000503','e6100000-0000-4000-8000-000000000504',
    'e6100000-0000-4000-8000-000000000999'
  ]::uuid[]
),0,'replay and hidden, unassigned, foreign and missing IDs have no effects');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) FROM public.availability_entries r WHERE id::text LIKE 'e6100000-%' ORDER BY id $$,
  $$ SELECT id,row_data FROM removal_original_rows WHERE id <> 'e6100000-0000-4000-8000-000000000501' ORDER BY id $$,
  'subset deletion preserves every other saved row exactly');

UPDATE public.organization_memberships SET capability_overrides='{"calendar":"view","personnel":"none"}'
WHERE organization_id='e6100000-0000-4000-8000-000000000101' AND user_id='e6100000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000507']::uuid[]
) $$,'42501','Calendar availability removal is not allowed','the RPC uses current membership after capability removal');
RESET ROLE;
UPDATE public.organization_memberships
SET capability_overrides='{"calendar":"operate","personnel":"none"}',
  access_scope_group_ids=ARRAY['e6100000-0000-4000-8000-000000000202']::uuid[]
WHERE organization_id='e6100000-0000-4000-8000-000000000101' AND user_id='e6100000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000002',true);
SELECT is(public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000507','e6100000-0000-4000-8000-000000000508']::uuid[]
),1,'the RPC obeys current Group scope rather than the previous grant');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) FROM public.availability_entries r WHERE id::text LIKE 'e6100000-%' ORDER BY id $$,
  $$ SELECT id,row_data FROM removal_original_rows WHERE id NOT IN (
    'e6100000-0000-4000-8000-000000000501','e6100000-0000-4000-8000-000000000508'
  ) ORDER BY id $$,
  'capability removal and changed scope preserve denied rows and delete only the new permitted row');

DELETE FROM public.organization_memberships
WHERE organization_id='e6100000-0000-4000-8000-000000000101' AND user_id='e6100000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000502']::uuid[]
) $$,'42501','Calendar availability removal is not allowed','removed membership cannot keep its former delete access');
RESET ROLE;

CREATE TEMP TABLE removal_dense_ids AS
SELECT ('e6100001-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid id FROM generate_series(1,500) n;
GRANT SELECT ON removal_dense_ids TO authenticated;
INSERT INTO public.availability_entries(id,organization_id,personnel_id,status_type_id,start_date,end_date,note)
SELECT id,'e6100000-0000-4000-8000-000000000101','e6100000-0000-4000-8000-000000000301',
  'e6100000-0000-4000-8000-000000000401','2030-02-01','2030-02-02','Dense removal cohort'
FROM removal_dense_ids;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000007',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(NULL,
  ARRAY['e6100000-0000-4000-8000-000000000505']::uuid[]
) $$,'42501','Calendar availability removal is not allowed','a null Organization is denied');
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',NULL
) $$,'22023','Invalid Calendar availability removal','a null ID array is rejected');
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101','{}'::uuid[]
) $$,'22023','Invalid Calendar availability removal','an empty ID array is rejected');
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000505'::uuid,NULL]
) $$,'22023','Invalid Calendar availability removal','a null ID among valid IDs is rejected');
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',array_fill('e6100000-0000-4000-8000-000000000505'::uuid,ARRAY[501])
) $$,'22023','Invalid Calendar availability removal','501 duplicate IDs exceed the raw input cap');
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',
  (SELECT array_agg(id ORDER BY id) FROM removal_dense_ids) || 'e6100000-0000-4000-8000-000000000505'::uuid
) $$,'22023','Invalid Calendar availability removal','501 distinct IDs are rejected before deletion');
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['not-a-uuid']::uuid[]
) $$,'22P02',NULL,'malformed UUID input never reaches deletion');
SELECT is((SELECT count(*)::integer FROM public.availability_entries WHERE id::text LIKE 'e6100001-%'),500,
  'invalid calls preserve all 500 selected rows');
SELECT is(public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',(SELECT array_agg(id ORDER BY id) FROM removal_dense_ids)
),500,'one admitted RPC deletes exactly 500 saved rows');
SELECT is(public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',(SELECT array_agg(id ORDER BY id) FROM removal_dense_ids)
),0,'the 500-ID replay has zero effects');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.availability_entries WHERE id::text LIKE 'e6100001-%'),0,
  'all 500 selected identities are absent after success');

CREATE FUNCTION pg_temp.fail_availability_removal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'synthetic availability deletion failure' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER fail_availability_removal AFTER DELETE ON public.availability_entries
FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.fail_availability_removal();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6100000-0000-4000-8000-000000000007',true);
SELECT throws_ok($$ SELECT public.delete_availability_entries(
  'e6100000-0000-4000-8000-000000000101',ARRAY['e6100000-0000-4000-8000-000000000505','e6100000-0000-4000-8000-000000000506']::uuid[]
) $$,'23514','synthetic availability deletion failure','a statement error rolls back every selected deletion');
RESET ROLE;
DROP TRIGGER fail_availability_removal ON public.availability_entries;
SELECT results_eq(
  $$ SELECT id,to_jsonb(r) FROM public.availability_entries r WHERE id::text LIKE 'e6100000-%' ORDER BY id $$,
  $$ SELECT id,row_data FROM removal_original_rows WHERE id NOT IN (
    'e6100000-0000-4000-8000-000000000501','e6100000-0000-4000-8000-000000000508'
  ) ORDER BY id $$,
  'the failed statement and dense removal preserve all unrelated fields and identities');
SELECT * FROM finish();
ROLLBACK;
