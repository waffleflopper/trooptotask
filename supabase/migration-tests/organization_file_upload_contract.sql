-- Shared fresh/populated SQL contract, distinct from provider file byte proof.
SELECT is((SELECT count(*)::integer FROM upgrade_fixture.organization_file_upload_current_rows),17,'all historical witnesses remain');
SELECT results_eq($$SELECT * FROM upgrade_fixture.organization_file_upload_current_rows ORDER BY 1,2$$,
  $$SELECT * FROM upgrade_fixture.organization_file_upload_before_rows ORDER BY 1,2$$,'upgrade preserves every historical ID and saved value');
SELECT ok(NOT has_schema_privilege('authenticated','organization_private','USAGE')
  AND NOT has_schema_privilege('service_role','organization_private','USAGE'),'private registrations are not exposed to SDK clients');
SELECT ok(has_function_privilege('service_role','public.register_organization_file_upload(uuid,uuid,uuid,text,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.register_organization_file_upload(uuid,uuid,uuid,text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.register_organization_file_upload(uuid,uuid,uuid,text,text)','EXECUTE'),'only trusted server registration is granted');
SELECT ok(has_function_privilege('service_role','public.settle_organization_file_upload(uuid,uuid,uuid,text,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.settle_organization_file_upload(uuid,uuid,uuid,text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.settle_organization_file_upload(uuid,uuid,uuid,text,text)','EXECUTE'),'clients cannot settle a server registration');
SELECT diag('ORGANIZATION_FILE_UPLOAD_EFFECTIVE=' || jsonb_build_object(
  'server_version',current_setting('server_version'),
  'register',pg_get_functiondef('public.register_organization_file_upload(uuid,uuid,uuid,text,text)'::regprocedure),
  'settle',pg_get_functiondef('public.settle_organization_file_upload(uuid,uuid,uuid,text,text)'::regprocedure),
  'storage_guard',pg_get_functiondef('organization_private.require_registered_file_upload()'::regprocedure),
  'delete_guard',pg_get_functiondef('organization_private.require_empty_files_before_delete()'::regprocedure),
  'foreign_keys',(SELECT jsonb_agg(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='organization_private.file_uploads'::regclass AND contype='f'),
  'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE tgname IN ('require_registered_organization_file_upload','require_empty_organization_files_before_delete'))
)::text);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa180000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT ok(public.sensitive_file_object_is_writable('counseling-files','fa180000-0000-4000-8000-000000000101/counseling-records/fa180000-0000-4000-8000-000000000301/new.pdf'), 'owner retains scoped file-write admission');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES('counseling-files','fa180000-0000-4000-8000-000000000101/counseling-records/fa180000-0000-4000-8000-000000000301/new.pdf')$$,
  '42501',NULL,'ordinary raw upload cannot bypass registration');
SELECT throws_ok($$DELETE FROM public.organizations WHERE id='fa180000-0000-4000-8000-000000000101'$$,
  'P0001','Organization files must be removed before deletion','case-variant historical files refuse ordinary parent deletion');
RESET ROLE;
-- Clear all claims explicitly; RESET ROLE alone is insufficient for trusted metadata setup.
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES('personnel-documents','fa180000-0000-4000-8000-000000000101/unregistered.pdf')$$,
  '42501',NULL,'even service Storage writes require a committed exact registration');
SELECT throws_ok($$SELECT public.register_organization_file_upload('fa180000-0000-4000-8000-000000000601','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000003','counseling-files','fa180000-0000-4000-8000-000000000101/new.pdf')$$,
  '42501',NULL,'foreign actor cannot register in target Organization');
SELECT throws_ok($$SELECT public.register_organization_file_upload('fa180000-0000-4000-8000-000000000601','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','counseling-files','fa180000-0000-4000-8000-000000000101-extra/new.pdf')$$,
  '22023',NULL,'lookalike prefix cannot register');
SELECT throws_ok($$SELECT public.register_organization_file_upload('fa180000-0000-4000-8000-000000000601','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','counseling-files','fa180000-0000-4000-8000-000000000101/../new.pdf')$$,
  '22023',NULL,'traversal path cannot register');
SELECT throws_ok($$SELECT * FROM organization_private.file_uploads$$,'42501',NULL,'service clients cannot read private registrations directly');
SAVEPOINT suspended_organization_admission;
UPDATE public.organizations SET suspended_at=now() WHERE id='fa180000-0000-4000-8000-000000000101';
SELECT throws_ok($$SELECT public.register_organization_file_upload('fa180000-0000-4000-8000-000000000601','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','personnel-documents','fa180000-0000-4000-8000-000000000101/suspended.pdf')$$,'42501',NULL,'suspended Organization refuses new registration');
ROLLBACK TO SAVEPOINT suspended_organization_admission;
SAVEPOINT suspended_actor_admission;
INSERT INTO public.user_suspensions(user_id,suspended_by) VALUES('fa180000-0000-4000-8000-000000000001','fa180000-0000-4000-8000-000000000002');
SELECT throws_ok($$SELECT public.register_organization_file_upload('fa180000-0000-4000-8000-000000000601','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','personnel-documents','fa180000-0000-4000-8000-000000000101/suspended.pdf')$$,'42501',NULL,'suspended actor refuses new registration');
ROLLBACK TO SAVEPOINT suspended_actor_admission;
RESET ROLE;
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES('personnel-documents','fa180000-0000-4000-8000-000000000101/stale-claims.pdf')$$,'42501',NULL,'RESET ROLE with retained provider claims cannot use trusted SQL metadata admission');
SET LOCAL ROLE service_role;
SELECT is(public.register_organization_file_upload('fa180000-0000-4000-8000-000000000601','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','counseling-files','fa180000-0000-4000-8000-000000000101/counseling-records/fa180000-0000-4000-8000-000000000301/new.pdf'),
  'fa180000-0000-4000-8000-000000000601'::uuid,'server admission returns the exact known upload ID');
SELECT throws_ok($$SELECT public.register_organization_file_upload('fa180000-0000-4000-8000-000000000602','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','counseling-files','fa180000-0000-4000-8000-000000000101/counseling-records/fa180000-0000-4000-8000-000000000301/new.pdf')$$,
  '23505',NULL,'an uncertain upload key cannot be admitted again');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa180000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES('counseling-files','fa180000-0000-4000-8000-000000000101/counseling-records/fa180000-0000-4000-8000-000000000301/new.pdf')$$,
  '42501',NULL,'ordinary upload cannot borrow an active server registration');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT lives_ok($$INSERT INTO storage.objects(id,bucket_id,name,version) VALUES('fa180000-0000-4000-8000-000000000506','counseling-files','fa180000-0000-4000-8000-000000000101/counseling-records/fa180000-0000-4000-8000-000000000301/new.pdf','synthetic-version')$$,
  'committed registration permits trusted preflight/final metadata');
SELECT ok(NOT public.settle_organization_file_upload('fa180000-0000-4000-8000-000000000601','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','personnel-documents','fa180000-0000-4000-8000-000000000101/counseling-records/fa180000-0000-4000-8000-000000000301/new.pdf'),
  'a different bucket cannot settle the upload');
RESET ROLE;
SELECT set_config('storage.allow_delete_query','true',true);
DELETE FROM storage.objects WHERE id IN ('fa180000-0000-4000-8000-000000000501','fa180000-0000-4000-8000-000000000502','fa180000-0000-4000-8000-000000000506');
SELECT throws_ok($$DELETE FROM public.organizations WHERE id='fa180000-0000-4000-8000-000000000101'$$,
  'P0001','An Organization file upload is still in progress','empty metadata cannot override an unresolved provider call');
UPDATE organization_private.file_uploads SET created_at='2000-01-01Z' WHERE id='fa180000-0000-4000-8000-000000000601';
SELECT throws_ok($$DELETE FROM public.organizations WHERE id='fa180000-0000-4000-8000-000000000101'$$,
  'P0001','An Organization file upload is still in progress','age does not prove a provider call is finished');
SET LOCAL ROLE service_role;
SELECT ok(public.settle_organization_file_upload('fa180000-0000-4000-8000-000000000601','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','counseling-files','fa180000-0000-4000-8000-000000000101/counseling-records/fa180000-0000-4000-8000-000000000301/new.pdf'),
  'exact server settlement releases the completed registration');
SELECT throws_ok($$UPDATE storage.objects SET name='fa180000-0000-4000-8000-000000000101/moved.pdf' WHERE id='fa180000-0000-4000-8000-000000000504'$$,
  '42501',NULL,'unregistered move into canonical namespace is denied');
SELECT throws_ok($$UPDATE storage.objects SET bucket_id='d17-file-other' WHERE id='fa180000-0000-4000-8000-000000000503'$$,
  '42501',NULL,'moving a retained object out of its bucket is denied');
SELECT throws_ok($$UPDATE storage.objects SET version='replacement' WHERE id='fa180000-0000-4000-8000-000000000503'$$,
  '42501',NULL,'new physical versions require registration');
SAVEPOINT retained_metadata_edit;
SELECT lives_ok($$UPDATE storage.objects SET metadata=metadata WHERE id='fa180000-0000-4000-8000-000000000503'$$,'metadata-only edits remain allowed');
ROLLBACK TO SAVEPOINT retained_metadata_edit;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','fa180000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
WITH removed AS(DELETE FROM public.organizations WHERE id='fa180000-0000-4000-8000-000000000101' RETURNING id)
SELECT is(count(*)::integer,0,'admin cannot delete the now-empty Organization') FROM removed;
SELECT set_config('request.jwt.claim.sub','fa180000-0000-4000-8000-000000000001',true);
WITH removed AS(DELETE FROM public.organizations WHERE id='fa180000-0000-4000-8000-000000000101' RETURNING id)
SELECT is(count(*)::integer,1,'ordinary current owner can delete after files and registrations are empty') FROM removed;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.register_organization_file_upload('fa180000-0000-4000-8000-000000000602','fa180000-0000-4000-8000-000000000101','fa180000-0000-4000-8000-000000000001','personnel-documents','fa180000-0000-4000-8000-000000000101/late.pdf')$$,
  'P0001',NULL,'deleted Organization rejects admission before bytes');
RESET ROLE;
SELECT results_eq($$SELECT id::text,to_jsonb(r) FROM storage.objects r WHERE id IN ('fa180000-0000-4000-8000-000000000503','fa180000-0000-4000-8000-000000000504','fa180000-0000-4000-8000-000000000505') ORDER BY 1$$,
  $$SELECT row_id,row_data FROM upgrade_fixture.organization_file_upload_before_rows WHERE table_name='objects' AND row_id IN ('fa180000-0000-4000-8000-000000000503','fa180000-0000-4000-8000-000000000504','fa180000-0000-4000-8000-000000000505') ORDER BY 1$$,
  'foreign, historical lookalike and unrelated-bucket values remain exact');
SELECT results_eq($$SELECT id::text,to_jsonb(r) - 'training_readiness_goal_percent' - 'disabled_features' - 'strength_floor_percent' FROM public.organizations r WHERE id='fa180000-0000-4000-8000-000000000102'$$,
  $$SELECT row_id,row_data FROM upgrade_fixture.organization_file_upload_before_rows WHERE table_name='organizations' AND row_id='fa180000-0000-4000-8000-000000000102'$$,'foreign Organization remains exact');
