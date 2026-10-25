BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id,email,created_at,last_sign_in_at) VALUES
 ('f5a00000-0000-4000-8000-000000000001','zulu-owner@example.test','2026-10-01','2026-10-10'),
 ('f5a00000-0000-4000-8000-000000000002','ALPHA-owner@example.test','2026-10-02','2026-10-05'),
 ('f5a00000-0000-4000-8000-000000000003','bravo@example.test','2026-10-02',NULL),
 ('f5a00000-0000-4000-8000-000000000004','alpha@example.test','2026-10-02',NULL);
INSERT INTO public.user_profiles(user_id,first_name,last_name) VALUES
 ('f5a00000-0000-4000-8000-000000000001','zulu','Sorttest'),
 ('f5a00000-0000-4000-8000-000000000002','alpha','Sorttest'),
 ('f5a00000-0000-4000-8000-000000000003','Bravo','Sorttest'),
 ('f5a00000-0000-4000-8000-000000000004','ALPHA','Sorttest');
INSERT INTO public.platform_operators(user_id) VALUES ('f5a00000-0000-4000-8000-000000000001');
INSERT INTO public.user_suspensions(user_id,suspended_by,reason) VALUES ('f5a00000-0000-4000-8000-000000000003','f5a00000-0000-4000-8000-000000000001','Synthetic sorting fixture');
INSERT INTO public.access_requests(id,name,email,status,approval_basis,created_at,reviewed_at) VALUES
 ('f5a00000-0000-4000-8000-000000000005','Delta Sorttest','delta@example.test','approved','platform_review','2026-10-03','2026-10-03');
INSERT INTO public.organizations(id,name,created_by,url_slug,created_at,suspended_at) VALUES
 ('f5a00000-0000-4000-8000-000000000101','Zulu Orgsorttest','f5a00000-0000-4000-8000-000000000001','admin-sort-101','2026-01-01',NULL),
 ('f5a00000-0000-4000-8000-000000000102','alpha Orgsorttest','f5a00000-0000-4000-8000-000000000001','admin-sort-102','2026-02-01',NULL),
 ('f5a00000-0000-4000-8000-000000000103','Bravo Orgsorttest','f5a00000-0000-4000-8000-000000000001','admin-sort-103','2026-03-01',NULL),
 ('f5a00000-0000-4000-8000-000000000104','ALPHA Orgsorttest','f5a00000-0000-4000-8000-000000000001','admin-sort-104','2026-03-01',now());
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids,email) VALUES
 ('f5a00000-0000-4000-8000-000000000101','f5a00000-0000-4000-8000-000000000001','owner','editor','{}','organization',ARRAY[]::uuid[],NULL),
 ('f5a00000-0000-4000-8000-000000000102','f5a00000-0000-4000-8000-000000000001','member','editor','{}','organization',ARRAY[]::uuid[],'zulu-owner@example.test'),
 ('f5a00000-0000-4000-8000-000000000102','f5a00000-0000-4000-8000-000000000002','owner','editor','{}','organization',ARRAY[]::uuid[],'ALPHA-owner@example.test');
INSERT INTO public.personnel(organization_id,rank,last_name,first_name,clinic_role,mos,slug,archived_at) VALUES
 ('f5a00000-0000-4000-8000-000000000101','SGT','Sort 1','Ann','Medic','68W','admin-sort-person-1',NULL),
 ('f5a00000-0000-4000-8000-000000000101','SGT','Sort 2','Ann','Medic','68W','admin-sort-person-2',NULL),
 ('f5a00000-0000-4000-8000-000000000102','SGT','Sort 3','Ann','Medic','68W','admin-sort-person-3',NULL),
 ('f5a00000-0000-4000-8000-000000000103','SGT','Sort 4','Ann','Medic','68W','admin-sort-person-4',now());
INSERT INTO public.audit_logs(org_id,user_id,action,resource_type,severity,"timestamp") VALUES
 ('f5a00000-0000-4000-8000-000000000101','f5a00000-0000-4000-8000-000000000001','personnel.create','personnel','info',now() - interval '1 days'),
 ('f5a00000-0000-4000-8000-000000000102','f5a00000-0000-4000-8000-000000000001','personnel.create','personnel','info',now() - interval '60 days'),
 ('f5a00000-0000-4000-8000-000000000104','f5a00000-0000-4000-8000-000000000001','personnel.create','personnel','info',now() - interval '2 days');
SET LOCAL ROLE service_role;
SELECT is(
 (SELECT array_agg(person->>'id' ORDER BY ordinal) FROM jsonb_array_elements(
   public.platform_account_directory('Sorttest','all',1,20,cases.key,cases.dir)->'people') WITH ORDINALITY AS rows(person,ordinal)),
 cases.expected, 'People ' || cases.key || ' ' || cases.dir || ' preserves full order, null placement and ties')
FROM (VALUES
 ('person','asc',ARRAY['f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000001']::text[]),
 ('person','desc',ARRAY['f5a00000-0000-4000-8000-000000000001', 'f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000002']::text[]),
 ('organizations','asc',ARRAY['f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000001']::text[]),
 ('organizations','desc',ARRAY['f5a00000-0000-4000-8000-000000000001', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000003']::text[]),
 ('lastSignIn','asc',ARRAY['f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000001', 'f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000003']::text[]),
 ('lastSignIn','desc',ARRAY['f5a00000-0000-4000-8000-000000000001', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000003']::text[]),
 ('status','asc',ARRAY['f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000001', 'f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000003']::text[]),
 ('status','desc',ARRAY['f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000001']::text[]),
 ('added','asc',ARRAY['f5a00000-0000-4000-8000-000000000001', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000005']::text[]),
 ('added','desc',ARRAY['f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000001']::text[]),
 ('unknown','asc',ARRAY['f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000001']::text[]),
 ('person','unknown',ARRAY['f5a00000-0000-4000-8000-000000000005', 'f5a00000-0000-4000-8000-000000000004', 'f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000002', 'f5a00000-0000-4000-8000-000000000001']::text[])) AS cases(key,dir,expected);
SELECT is(
 (SELECT array_agg(organization_id) FROM public.platform_list_organizations('Orgsorttest','all',1,25,cases.key,cases.dir)),
 cases.expected, 'Organizations ' || cases.key || ' ' || cases.dir || ' preserves full order, null placement and ties')
FROM (VALUES
 ('name','asc',ARRAY['f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000103', 'f5a00000-0000-4000-8000-000000000101']::uuid[]),
 ('name','desc',ARRAY['f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000103', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000102']::uuid[]),
 ('owner','asc',ARRAY['f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103']::uuid[]),
 ('owner','desc',ARRAY['f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103']::uuid[]),
 ('members','asc',ARRAY['f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103', 'f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000102']::uuid[]),
 ('members','desc',ARRAY['f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103']::uuid[]),
 ('personnel','asc',ARRAY['f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000101']::uuid[]),
 ('personnel','desc',ARRAY['f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103']::uuid[]),
 ('lastActive','asc',ARRAY['f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000103']::uuid[]),
 ('lastActive','desc',ARRAY['f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000103']::uuid[]),
 ('created','asc',ARRAY['f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103']::uuid[]),
 ('created','desc',ARRAY['f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000101']::uuid[]),
 ('status','asc',ARRAY['f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000103', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000104']::uuid[]),
 ('status','desc',ARRAY['f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000101']::uuid[]),
 ('unknown','asc',ARRAY['f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000103']::uuid[]),
 ('name','unknown',ARRAY['f5a00000-0000-4000-8000-000000000101', 'f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000102', 'f5a00000-0000-4000-8000-000000000103']::uuid[])) AS cases(key,dir,expected);
SELECT is(
 (SELECT array_agg(person->>'id' ORDER BY ordinal) FROM jsonb_array_elements(
   public.platform_account_directory('Sorttest','all',2,2,'person','asc')->'people') WITH ORDINALITY AS rows(person,ordinal)),
 ARRAY['f5a00000-0000-4000-8000-000000000003', 'f5a00000-0000-4000-8000-000000000005']::text[], 'People applies the selected order before slicing the second page');
SELECT is(
 (SELECT array_agg(organization_id) FROM public.platform_list_organizations('Orgsorttest','all',2,2,'owner','asc')),
 ARRAY['f5a00000-0000-4000-8000-000000000104', 'f5a00000-0000-4000-8000-000000000103']::uuid[], 'Organizations applies nullable owner sorting before paging');
SELECT is(
 (SELECT "organizationCount" FROM jsonb_to_recordset(public.platform_account_directory('Sorttest','all',1,1,'organizations','desc')->'people') AS rows("organizationCount" integer)),
 2, 'People carries the membership count used for sorting');
SELECT results_eq(
 $$SELECT total_count,all_count,active_week_count,quiet_count,suspended_count,organization_id
   FROM public.platform_list_organizations('Orgsorttest','quiet',1,25,'members','asc')$$,
 $$VALUES (2::bigint,4::bigint,1::bigint,2::bigint,1::bigint,'f5a00000-0000-4000-8000-000000000103'::uuid),
          (2::bigint,4::bigint,1::bigint,2::bigint,1::bigint,'f5a00000-0000-4000-8000-000000000102'::uuid)$$,
 'sorting retains filter counts and the quiet filter');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
