BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid =
  'public.import_availability_entries(uuid,jsonb)'::regprocedure),
  'availability import uses the caller permissions');
SELECT ok(has_function_privilege('authenticated',
  'public.import_availability_entries(uuid,jsonb)', 'EXECUTE'),
  'authenticated members can reach availability import');
SELECT ok(NOT has_function_privilege('anon',
  'public.import_availability_entries(uuid,jsonb)', 'EXECUTE'),
  'anonymous callers cannot execute availability import');
SELECT ok(NOT has_function_privilege('service_role',
  'public.import_availability_entries(uuid,jsonb)', 'EXECUTE'),
  'service role cannot execute availability import');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p,
    LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) entry
  WHERE p.oid = 'public.import_availability_entries(uuid,jsonb)'::regprocedure
    AND entry.grantee = 0 AND entry.privilege_type = 'EXECUTE'
), 'PUBLIC has no availability import execution grant');

INSERT INTO auth.users(id,email) VALUES
  ('e6200000-0000-4000-8000-000000000001','import-owner@example.test'),
  ('e6200000-0000-4000-8000-000000000002','import-alpha@example.test'),
  ('e6200000-0000-4000-8000-000000000003','import-viewer@example.test'),
  ('e6200000-0000-4000-8000-000000000004','import-none@example.test'),
  ('e6200000-0000-4000-8000-000000000006','import-foreign@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('e6200000-0000-4000-8000-000000000101','Import A','e6200000-0000-4000-8000-000000000001'),
  ('e6200000-0000-4000-8000-000000000102','Import B','e6200000-0000-4000-8000-000000000006');
INSERT INTO public.groups(id,organization_id,name) VALUES
  ('e6200000-0000-4000-8000-000000000201','e6200000-0000-4000-8000-000000000101','Alpha'),
  ('e6200000-0000-4000-8000-000000000202','e6200000-0000-4000-8000-000000000101','Bravo');
INSERT INTO public.organization_memberships(
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
  ('e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000001','owner','editor','{}','organization','{}'),
  ('e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000002','member','viewer','{"calendar":"operate","personnel":"none"}','groups',ARRAY['e6200000-0000-4000-8000-000000000201']::uuid[]),
  ('e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000003','member','viewer','{"calendar":"view"}','organization','{}'),
  ('e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000004','member','viewer','{"calendar":"none"}','organization','{}'),
  ('e6200000-0000-4000-8000-000000000102','e6200000-0000-4000-8000-000000000006','owner','editor','{}','organization','{}');
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,slug) VALUES
  ('e6200000-0000-4000-8000-000000000301','e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000201','SPC','Alpha','Person','import-alpha'),
  ('e6200000-0000-4000-8000-000000000302','e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000202','SPC','Bravo','Person','import-bravo'),
  ('e6200000-0000-4000-8000-000000000304','e6200000-0000-4000-8000-000000000102',NULL,'SPC','Foreign','Person','import-foreign');
INSERT INTO public.status_types(id,organization_id,name) VALUES
  ('e6200000-0000-4000-8000-000000000401','e6200000-0000-4000-8000-000000000101','Import A status'),
  ('e6200000-0000-4000-8000-000000000402','e6200000-0000-4000-8000-000000000102','Import B status');
INSERT INTO public.availability_entries(
  id,organization_id,personnel_id,status_type_id,start_date,end_date,note
) VALUES
  ('e6200000-0000-4000-8000-000000000501','e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000301','e6200000-0000-4000-8000-000000000401','2030-01-05','2030-01-12','Alpha leave'),
  ('e6200000-0000-4000-8000-000000000502','e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000302','e6200000-0000-4000-8000-000000000401','2030-01-05','2030-01-12','Bravo leave'),
  ('e6200000-0000-4000-8000-000000000503','e6200000-0000-4000-8000-000000000102','e6200000-0000-4000-8000-000000000304','e6200000-0000-4000-8000-000000000402','2030-01-05','2030-01-12','Foreign leave'),
  ('e6200000-0000-4000-8000-000000000504','e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000302','e6200000-0000-4000-8000-000000000401','2030-05-01','2030-05-03','Bravo course');
CREATE TEMP TABLE import_original_rows AS
SELECT id,to_jsonb(row_value) row_data FROM public.availability_entries row_value
WHERE id::text LIKE 'e6200000-%';
GRANT SELECT ON import_original_rows TO authenticated;

CREATE FUNCTION pg_temp.import_entry(
  person text, start_date text, end_date text, note text DEFAULT NULL, replaces jsonb DEFAULT '[]',
  overlap text DEFAULT NULL, alongside jsonb DEFAULT '[]'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'personnel_id','e6200000-0000-4000-8000-000000000' || person,
    'status_type_id','e6200000-0000-4000-8000-000000000401',
    'start_date',start_date,'end_date',end_date,'note',note,'replaces',replaces,
    'overlap',coalesce(overlap,CASE WHEN replaces <> '[]'::jsonb THEN 'replace' ELSE 'none' END),
    'alongside',alongside)
$$;
CREATE FUNCTION pg_temp.reviewed(entry text, start_date text DEFAULT '2030-01-05', end_date text DEFAULT '2030-01-12',
  note text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'id','e6200000-0000-4000-8000-000000000' || entry,
    'status_type_id','e6200000-0000-4000-8000-000000000401',
    'start_date',start_date,'end_date',end_date,
    'note',CASE entry WHEN '501' THEN 'Alpha leave' WHEN '502' THEN 'Bravo leave'
      WHEN '503' THEN 'Foreign leave' WHEN '504' THEN 'Bravo course' ELSE note END)
$$;
CREATE FUNCTION pg_temp.saved_rows() RETURNS TABLE(id uuid, row_data jsonb) LANGUAGE sql AS $$
  SELECT r.id,to_jsonb(r) FROM public.availability_entries r WHERE r.id::text LIKE 'e6200000-%' ORDER BY r.id
$$;

SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-02-01','2030-02-02'))) $$,
  '42501',NULL,'anonymous RPC execution is denied');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-02-01','2030-02-02'))) $$,
  '42501','Calendar availability import is not allowed','an authenticated role without a user cannot import');
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-01-03','2030-01-06',NULL,jsonb_build_array(pg_temp.reviewed('501'))))) $$,
  '42501','Calendar availability import is not allowed','Calendar view cannot import or replace');
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000004',true);
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-02-01','2030-02-02'))) $$,
  '42501','Calendar availability import is not allowed','a member without the Calendar lane cannot import');
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000006',true);
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-02-01','2030-02-02'))) $$,
  '42501','Calendar availability import is not allowed','foreign membership cannot import into the target Organization');

SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',NULL) $$,
  '22023','Invalid Calendar availability import','null entries are rejected');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101','{}'::jsonb) $$,
  '22023','Invalid Calendar availability import','a non-array payload is rejected');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101','[]'::jsonb) $$,
  '22023','Invalid Calendar availability import','an empty import is rejected');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  (SELECT jsonb_agg(pg_temp.import_entry('301','2030-02-01','2030-02-02')) FROM generate_series(1,501))) $$,
  '22023','Invalid Calendar availability import','501 entries exceed the chunk cap');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-02-01','2030-02-02',NULL,'{}'::jsonb))) $$,
  '22023','Invalid Calendar availability import','a non-array replaced list is rejected');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-01-03','2030-01-06',NULL,
    jsonb_build_array(pg_temp.reviewed('501'),pg_temp.reviewed('501') - 'id')))) $$,
  '22023','Invalid Calendar availability import','a replaced entry without an ID is rejected');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  (SELECT jsonb_agg(pg_temp.import_entry('301','2030-01-03','2030-01-06',NULL,
     jsonb_build_array(pg_temp.reviewed('501'),pg_temp.reviewed('502'))))
   FROM generate_series(1,251))) $$,
  '22023','Invalid Calendar availability import','251 rows replacing two entries each exceed the 500 replaced-entry cap');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-02-03','2030-02-01'))) $$,
  '23514',NULL,'an end before the start fails the whole import');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-01-03','2030-01-06',repeat('x',201),
    jsonb_build_array(pg_temp.reviewed('501'))))) $$,
  '23514',NULL,'an over-long note fails the whole import and keeps the replaced entry');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(jsonb_set(pg_temp.import_entry('301','2030-01-03','2030-01-06',NULL,
    jsonb_build_array(pg_temp.reviewed('501'))),
    '{status_type_id}','"e6200000-0000-4000-8000-000000000402"'))) $$,
  '23503',NULL,'a foreign status type fails the whole import');
RESET ROLE;
SELECT results_eq('SELECT * FROM pg_temp.saved_rows()','SELECT id,row_data FROM import_original_rows ORDER BY id',
  'denied, invalid and failed imports keep every saved row and delete nothing');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-01-03','2030-01-06',NULL,jsonb_build_array(pg_temp.reviewed('501'))),
    pg_temp.import_entry('302','2030-02-01','2030-02-02'))) $$,
  '42501',NULL,'a Group-scoped operator cannot insert outside the scope, and the replace rolls back with it');
RESET ROLE;
SELECT results_eq('SELECT * FROM pg_temp.saved_rows()','SELECT id,row_data FROM import_original_rows ORDER BY id',
  'the refused insert keeps the replaced entry');

UPDATE public.availability_entries SET end_date = '2030-01-08' WHERE id = 'e6200000-0000-4000-8000-000000000501';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000001',true);
SELECT is(public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(
    pg_temp.import_entry('301','2030-01-03','2030-01-06','Stale',jsonb_build_array(pg_temp.reviewed('501'))),
    pg_temp.import_entry('302','2030-01-10','2030-01-20','Fresh',jsonb_build_array(pg_temp.reviewed('502'))))),
  '{"inserted":1,"deleted":1,"stale":[0]}'::jsonb,
  'a replace whose entry changed since Review is refused while a current replace in the same request lands');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id::text,end_date::text FROM public.availability_entries
     WHERE id IN ('e6200000-0000-4000-8000-000000000501','e6200000-0000-4000-8000-000000000502') $$,
  $$ VALUES ('e6200000-0000-4000-8000-000000000501','2030-01-08') $$,
  'the changed entry keeps its new dates and the current one is replaced');
SELECT results_eq(
  $$ SELECT note FROM public.availability_entries WHERE note IN ('Stale','Fresh') $$,
  $$ VALUES ('Fresh') $$,
  'only the current replacement is saved');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000001',true);
SELECT is(public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(
    pg_temp.import_entry('301','2030-03-01','2030-03-02','Far',
      jsonb_build_array(pg_temp.reviewed('501','2030-01-05','2030-01-08'))),
    pg_temp.import_entry('301','2030-05-01','2030-05-02','Other',
      jsonb_build_array(pg_temp.reviewed('504','2030-05-01','2030-05-03'))))),
  '{"inserted":0,"deleted":0,"stale":[0,1]}'::jsonb,
  'a replace naming an entry it does not overlap, or one another Person owns, is refused');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000002',true);
SELECT is(public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2030-01-07','2030-01-09','Replacement',jsonb_build_array(
    pg_temp.reviewed('501','2030-01-05','2030-01-08'),
    pg_temp.reviewed('503'),
    pg_temp.reviewed('504','2030-05-01','2030-05-03'),
    pg_temp.reviewed('999'))))),
  '{"inserted":1,"deleted":1,"stale":[]}'::jsonb,
  'a scoped operator replaces only the reviewed entry; other Organizations, other Groups and missing IDs are untouched');
RESET ROLE;
SELECT results_eq(
  $$ SELECT id,row_data FROM pg_temp.saved_rows() $$,
  $$ SELECT id,row_data FROM import_original_rows
     WHERE id IN ('e6200000-0000-4000-8000-000000000503','e6200000-0000-4000-8000-000000000504') ORDER BY id $$,
  'another Person, another Organization and missing IDs keep every saved field');
SELECT results_eq(
  $$ SELECT personnel_id::text,start_date::text,end_date::text FROM public.availability_entries
     WHERE organization_id = 'e6200000-0000-4000-8000-000000000101' AND note = 'Replacement' $$,
  $$ VALUES ('e6200000-0000-4000-8000-000000000301','2030-01-07','2030-01-09') $$,
  'the replacement row is saved in the target Organization');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000001',true);
SELECT is(public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  (SELECT jsonb_agg(pg_temp.import_entry('301','2030-06-01','2030-06-01','Capped',jsonb_build_array(
     jsonb_build_object('id',gen_random_uuid(),'status_type_id','e6200000-0000-4000-8000-000000000401',
       'start_date','2030-06-01','end_date','2030-06-01'),
     jsonb_build_object('id',gen_random_uuid(),'status_type_id','e6200000-0000-4000-8000-000000000401',
       'start_date','2030-06-01','end_date','2030-06-01'))))
   FROM generate_series(1,250))),
  '{"inserted":250,"deleted":0,"stale":[]}'::jsonb,
  '250 rows replacing two entries each fit the 500 replaced-entry cap');
SELECT is(public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  (SELECT jsonb_agg(pg_temp.import_entry(CASE WHEN n % 2 = 0 THEN '301' ELSE '302' END,'2030-03-01','2030-03-02','Dense'))
   FROM generate_series(1,500) n)),
  '{"inserted":500,"deleted":0,"stale":[]}'::jsonb,
  'an Organization-wide operator imports a full chunk of 500 rows');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.availability_entries WHERE note = 'Dense'),500,
  'all 500 imported rows are saved');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e6200000-0000-4000-8000-000000000002',true);
INSERT INTO public.availability_entries(id,organization_id,personnel_id,status_type_id,start_date,end_date,note)
SELECT ('e6200000-0000-4000-8000-000000000' || suffix)::uuid,
  'e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000301',
  'e6200000-0000-4000-8000-000000000401','2030-08-05','2030-08-12',note
FROM (VALUES ('505','Reviewed note'),('506',NULL),('507','Reviewed note'),('508',NULL)) fixture(suffix,note);
UPDATE public.availability_entries SET note = CASE id::text
  WHEN 'e6200000-0000-4000-8000-000000000505' THEN 'Edited note'
  WHEN 'e6200000-0000-4000-8000-000000000506' THEN 'Added note'
  ELSE NULL END
WHERE id IN ('e6200000-0000-4000-8000-000000000505','e6200000-0000-4000-8000-000000000506',
  'e6200000-0000-4000-8000-000000000507');
SELECT is(public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  (SELECT jsonb_agg(pg_temp.import_entry('301','2030-08-03','2030-08-10','Note replacement',
    jsonb_build_array(pg_temp.reviewed(suffix,'2030-08-05','2030-08-12',note)),
    'replace',jsonb_build_array(jsonb_build_object('status_type_id','e6200000-0000-4000-8000-000000000401',
      'start_date','2030-08-05','end_date','2030-08-12'))) ORDER BY suffix)
  FROM (VALUES ('505','Reviewed note'),('506',NULL),('507','Reviewed note'),('508',NULL)) fixture(suffix,note))),
  '{"inserted":1,"deleted":1,"stale":[0,1,2]}'::jsonb,
  'a Group-scoped operator refuses edited, added and cleared notes but replaces an unchanged null note');
SELECT results_eq(
  $$ SELECT id::text,note FROM public.availability_entries
     WHERE id IN ('e6200000-0000-4000-8000-000000000505','e6200000-0000-4000-8000-000000000506',
       'e6200000-0000-4000-8000-000000000507','e6200000-0000-4000-8000-000000000508') ORDER BY id $$,
  $$ VALUES ('e6200000-0000-4000-8000-000000000505','Edited note'),
     ('e6200000-0000-4000-8000-000000000506','Added note'),
     ('e6200000-0000-4000-8000-000000000507',NULL) $$,
  'refused replacements retain the saved IDs and the latest notes');
SELECT is((SELECT count(*)::integer FROM public.availability_entries WHERE note = 'Note replacement'),1,
  'only the unchanged-note replacement is saved');

INSERT INTO public.availability_entries(id,organization_id,personnel_id,status_type_id,start_date,end_date,note)
SELECT ('e6200000-0000-4000-8000-000000000' || suffix)::uuid,
  'e6200000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000301',
  'e6200000-0000-4000-8000-000000000401',start_date::date,end_date::date,'Saved after review'
FROM (VALUES ('509','2030-10-01','2030-10-03'),('510','2030-11-01','2030-11-03'),
  ('511','2030-11-02','2030-11-04'),('512','2030-12-01','2030-12-03')) fixture(suffix,start_date,end_date);
SELECT is(public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(
    pg_temp.import_entry('301','2030-10-02','2030-10-03','Unreviewed none','[]','none'),
    pg_temp.import_entry('301','2030-11-01','2030-11-05','Unreviewed replace',
      jsonb_build_array(pg_temp.reviewed('510','2030-11-01','2030-11-03','Saved after review')),'replace'),
    pg_temp.import_entry('301','2030-12-01','2030-12-03','Duplicate keep','[]','keep'),
    pg_temp.import_entry('301','2030-10-02','2030-10-04','Keep overlap','[]','keep'),
    pg_temp.import_entry('301','2030-10-03','2030-10-05','Alongside overlap','[]','none',
      jsonb_build_array(jsonb_build_object('status_type_id','e6200000-0000-4000-8000-000000000401',
        'start_date','2030-10-01','end_date','2030-10-03'))))),
  '{"inserted":2,"deleted":0,"stale":[0,1,2]}'::jsonb,
  'a scoped operator refuses unreviewed none and replace overlaps and exact keep duplicates, but accepts keep and alongside');
SELECT results_eq(
  $$ SELECT note FROM public.availability_entries
     WHERE note IN ('Unreviewed none','Unreviewed replace','Duplicate keep','Keep overlap','Alongside overlap') ORDER BY note $$,
  $$ VALUES ('Alongside overlap'),('Keep overlap') $$,
  'only reviewed overlaps are inserted');
SELECT results_eq(
  $$ SELECT id::text,note FROM public.availability_entries
     WHERE id IN ('e6200000-0000-4000-8000-000000000509','e6200000-0000-4000-8000-000000000510',
       'e6200000-0000-4000-8000-000000000511','e6200000-0000-4000-8000-000000000512') ORDER BY id $$,
  $$ VALUES ('e6200000-0000-4000-8000-000000000509','Saved after review'),
     ('e6200000-0000-4000-8000-000000000510','Saved after review'),
     ('e6200000-0000-4000-8000-000000000511','Saved after review'),
     ('e6200000-0000-4000-8000-000000000512','Saved after review') $$,
  'stale imports retain all saved entries including the reviewed replacement');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2031-01-01','2031-01-02') - 'overlap')) $$,
  '22023','Invalid Calendar availability import','overlap is required');
SELECT throws_ok($$ SELECT public.import_availability_entries('e6200000-0000-4000-8000-000000000101',
  jsonb_build_array(pg_temp.import_entry('301','2031-01-01','2031-01-02',NULL,'[]','unknown'))) $$,
  '22023','Invalid Calendar availability import','unknown overlap choices are rejected');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
