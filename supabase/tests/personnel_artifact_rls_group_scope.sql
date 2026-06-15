BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(22);

INSERT INTO auth.users (
	instance_id,
	id,
	aud,
	role,
	email,
	encrypted_password,
	email_confirmed_at,
	raw_app_meta_data,
	raw_user_meta_data,
	created_at,
	updated_at
)
VALUES
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000069001',
		'authenticated',
		'authenticated',
		'rls-artifact-org-viewer-069@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000069002',
		'authenticated',
		'authenticated',
		'rls-artifact-group-viewer-069@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000069003',
		'authenticated',
		'authenticated',
		'rls-artifact-group-operator-069@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000069004',
		'authenticated',
		'authenticated',
		'rls-artifact-other-org-069@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	);

INSERT INTO public.organizations (id, name, created_by, url_slug)
VALUES
	(
		'20000000-0000-4000-8000-000000069001',
		'RLS Artifact Alpha Unit',
		'10000000-0000-4000-8000-000000069001',
		'rls-artifact-alpha-069'
	),
	(
		'20000000-0000-4000-8000-000000069002',
		'RLS Artifact Bravo Unit',
		'10000000-0000-4000-8000-000000069004',
		'rls-artifact-bravo-069'
	);

INSERT INTO public.groups (id, organization_id, name, sort_order)
VALUES
	(
		'30000000-0000-4000-8000-000000069001',
		'20000000-0000-4000-8000-000000069001',
		'Artifact Alpha First Group',
		1
	),
	(
		'30000000-0000-4000-8000-000000069002',
		'20000000-0000-4000-8000-000000069001',
		'Artifact Alpha Second Group',
		2
	),
	(
		'30000000-0000-4000-8000-000000069003',
		'20000000-0000-4000-8000-000000069002',
		'Artifact Bravo Group',
		1
	);

INSERT INTO public.organization_memberships (
	id,
	organization_id,
	user_id,
	role,
	member_preset,
	capability_overrides,
	access_scope_kind,
	access_scope_group_ids,
	email
)
VALUES
	(
		'40000000-0000-4000-8000-000000069001',
		'20000000-0000-4000-8000-000000069001',
		'10000000-0000-4000-8000-000000069001',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-artifact-org-viewer-069@example.test'
	),
	(
		'40000000-0000-4000-8000-000000069002',
		'20000000-0000-4000-8000-000000069001',
		'10000000-0000-4000-8000-000000069002',
		'member',
		'viewer',
		'{}'::jsonb,
		'groups',
		ARRAY['30000000-0000-4000-8000-000000069001']::uuid[],
		'rls-artifact-group-viewer-069@example.test'
	),
	(
		'40000000-0000-4000-8000-000000069003',
		'20000000-0000-4000-8000-000000069001',
		'10000000-0000-4000-8000-000000069003',
		'member',
		'operator',
		'{}'::jsonb,
		'groups',
		ARRAY['30000000-0000-4000-8000-000000069001']::uuid[],
		'rls-artifact-group-operator-069@example.test'
	),
	(
		'40000000-0000-4000-8000-000000069004',
		'20000000-0000-4000-8000-000000069002',
		'10000000-0000-4000-8000-000000069004',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-artifact-other-org-069@example.test'
	);

INSERT INTO public.personnel (
	id,
	organization_id,
	rank,
	last_name,
	first_name,
	clinic_role,
	group_id,
	mos,
	slug
)
VALUES
	(
		'50000000-0000-4000-8000-000000069001',
		'20000000-0000-4000-8000-000000069001',
		'SGT',
		'Artifact',
		'Avery',
		'Medic',
		'30000000-0000-4000-8000-000000069001',
		'68W',
		'artifact-avery-069'
	),
	(
		'50000000-0000-4000-8000-000000069002',
		'20000000-0000-4000-8000-000000069001',
		'SSG',
		'Artifact',
		'Blair',
		'Medic',
		'30000000-0000-4000-8000-000000069002',
		'68W',
		'artifact-blair-069'
	),
	(
		'50000000-0000-4000-8000-000000069003',
		'20000000-0000-4000-8000-000000069002',
		'CPL',
		'Artifact',
		'Casey',
		'Medic',
		'30000000-0000-4000-8000-000000069003',
		'68W',
		'artifact-casey-069'
	);

INSERT INTO public.personnel_follow_ups (
	id,
	organization_id,
	personnel_id,
	title,
	notes,
	due_date,
	status,
	created_by
)
VALUES
	(
		'60000000-0000-4000-8000-000000069001',
		'20000000-0000-4000-8000-000000069001',
		'50000000-0000-4000-8000-000000069001',
		'Alpha group one follow up',
		'Fixture follow up',
		'2026-06-20',
		'open',
		'rls-artifact-fixture'
	),
	(
		'60000000-0000-4000-8000-000000069002',
		'20000000-0000-4000-8000-000000069001',
		'50000000-0000-4000-8000-000000069002',
		'Alpha group two follow up',
		'Fixture follow up',
		'2026-06-21',
		'open',
		'rls-artifact-fixture'
	),
	(
		'60000000-0000-4000-8000-000000069003',
		'20000000-0000-4000-8000-000000069002',
		'50000000-0000-4000-8000-000000069003',
		'Bravo follow up',
		'Fixture follow up',
		'2026-06-22',
		'open',
		'rls-artifact-fixture'
	);

INSERT INTO public.personnel_documents (
	id,
	organization_id,
	personnel_id,
	title,
	file_path,
	file_size_bytes,
	content_type,
	uploaded_by
)
VALUES
	(
		'70000000-0000-4000-8000-000000069001',
		'20000000-0000-4000-8000-000000069001',
		'50000000-0000-4000-8000-000000069001',
		'Alpha group one document',
		'20000000-0000-4000-8000-000000069001/personnel/50000000-0000-4000-8000-000000069001/documents/alpha-group-one.pdf',
		128,
		'application/pdf',
		'rls-artifact-fixture'
	),
	(
		'70000000-0000-4000-8000-000000069002',
		'20000000-0000-4000-8000-000000069001',
		'50000000-0000-4000-8000-000000069002',
		'Alpha group two document',
		'20000000-0000-4000-8000-000000069001/personnel/50000000-0000-4000-8000-000000069002/documents/alpha-group-two.pdf',
		128,
		'application/pdf',
		'rls-artifact-fixture'
	),
	(
		'70000000-0000-4000-8000-000000069003',
		'20000000-0000-4000-8000-000000069002',
		'50000000-0000-4000-8000-000000069003',
		'Bravo document',
		'20000000-0000-4000-8000-000000069002/personnel/50000000-0000-4000-8000-000000069003/documents/bravo.pdf',
		128,
		'application/pdf',
		'rls-artifact-fixture'
	);

INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata)
VALUES
	(
		'80000000-0000-4000-8000-000000069001',
		'personnel-documents',
		'20000000-0000-4000-8000-000000069001/personnel/50000000-0000-4000-8000-000000069001/documents/alpha-group-one.pdf',
		'10000000-0000-4000-8000-000000069001',
		'10000000-0000-4000-8000-000000069001',
		'{}'::jsonb
	),
	(
		'80000000-0000-4000-8000-000000069002',
		'personnel-documents',
		'20000000-0000-4000-8000-000000069001/personnel/50000000-0000-4000-8000-000000069002/documents/alpha-group-two.pdf',
		'10000000-0000-4000-8000-000000069001',
		'10000000-0000-4000-8000-000000069001',
		'{}'::jsonb
	);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069001', true);
SELECT set_config('request.jwt.claim.email', 'rls-artifact-org-viewer-069@example.test', true);

SELECT is(
	(SELECT count(*)::integer FROM public.personnel_follow_ups WHERE id = '60000000-0000-4000-8000-000000069001'),
	1,
	'organization-scope personnel viewer can read in-org follow ups'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_documents WHERE id = '70000000-0000-4000-8000-000000069001'),
	1,
	'organization-scope personnel viewer can read in-org personnel documents'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069002', true);
SELECT set_config('request.jwt.claim.email', 'rls-artifact-group-viewer-069@example.test', true);

SELECT is(
	(SELECT count(*)::integer FROM public.personnel_follow_ups WHERE id = '60000000-0000-4000-8000-000000069001'),
	1,
	'group-scoped personnel viewer can read follow ups for scoped personnel'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_documents WHERE id = '70000000-0000-4000-8000-000000069001'),
	1,
	'group-scoped personnel viewer can read documents for scoped personnel'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_follow_ups WHERE id = '60000000-0000-4000-8000-000000069002'),
	0,
	'group-scoped personnel viewer cannot read follow ups for another same-org group'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_documents WHERE id = '70000000-0000-4000-8000-000000069002'),
	0,
	'group-scoped personnel viewer cannot read documents for another same-org group'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM storage.objects
		WHERE id = '80000000-0000-4000-8000-000000069002'
	),
	0,
	'group-scoped personnel viewer cannot read out-of-scope personnel document storage objects'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM storage.objects
		WHERE id = '80000000-0000-4000-8000-000000069001'
	),
	1,
	'group-scoped personnel viewer can read in-scope personnel document storage objects'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069004', true);
SELECT set_config('request.jwt.claim.email', 'rls-artifact-other-org-069@example.test', true);

SELECT is(
	(SELECT count(*)::integer FROM public.personnel_follow_ups WHERE id = '60000000-0000-4000-8000-000000069001'),
	0,
	'other-org members cannot read personnel follow ups'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_documents WHERE id = '70000000-0000-4000-8000-000000069001'),
	0,
	'other-org members cannot read personnel documents'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069003', true);
SELECT set_config('request.jwt.claim.email', 'rls-artifact-group-operator-069@example.test', true);

SELECT lives_ok(
	$$
		INSERT INTO public.personnel_follow_ups (
			id,
			organization_id,
			personnel_id,
			title,
			notes,
			due_date,
			status,
			created_by
		)
		VALUES (
			'60000000-0000-4000-8000-000000069004',
			'20000000-0000-4000-8000-000000069001',
			'50000000-0000-4000-8000-000000069001',
			'Scoped operator follow up',
			'Allowed insert',
			'2026-06-23',
			'open',
			'rls-artifact-group-operator-069@example.test'
		)
	$$,
	'group-scoped personnel operator can insert follow ups for scoped personnel'
);
SELECT throws_ok(
	$$
		INSERT INTO public.personnel_follow_ups (
			id,
			organization_id,
			personnel_id,
			title,
			notes,
			due_date,
			status,
			created_by
		)
		VALUES (
			'60000000-0000-4000-8000-000000069005',
			'20000000-0000-4000-8000-000000069001',
			'50000000-0000-4000-8000-000000069002',
			'Out of scope follow up',
			'Blocked insert',
			'2026-06-23',
			'open',
			'rls-artifact-group-operator-069@example.test'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "personnel_follow_ups"',
	'group-scoped personnel operator cannot insert follow ups for another same-org group'
);
WITH updated AS (
	UPDATE public.personnel_follow_ups
	SET notes = 'Allowed scoped update'
	WHERE id = '60000000-0000-4000-8000-000000069004'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	1,
	'group-scoped personnel operator can update follow ups for scoped personnel'
);
WITH updated AS (
	UPDATE public.personnel_follow_ups
	SET notes = 'Blocked scoped update'
	WHERE id = '60000000-0000-4000-8000-000000069002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'group-scoped personnel operator cannot update follow ups for another same-org group'
);
WITH deleted AS (
	DELETE FROM public.personnel_follow_ups
	WHERE id = '60000000-0000-4000-8000-000000069004'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM deleted),
	1,
	'group-scoped personnel operator can delete follow ups for scoped personnel'
);
WITH deleted AS (
	DELETE FROM public.personnel_follow_ups
	WHERE id = '60000000-0000-4000-8000-000000069002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM deleted),
	0,
	'group-scoped personnel operator cannot delete follow ups for another same-org group'
);

SELECT lives_ok(
	$$
		INSERT INTO public.personnel_documents (
			id,
			organization_id,
			personnel_id,
			title,
			file_path,
			file_size_bytes,
			content_type,
			uploaded_by
		)
		VALUES (
			'70000000-0000-4000-8000-000000069004',
			'20000000-0000-4000-8000-000000069001',
			'50000000-0000-4000-8000-000000069001',
			'Scoped operator document',
			'20000000-0000-4000-8000-000000069001/personnel/50000000-0000-4000-8000-000000069001/documents/operator-document.pdf',
			256,
			'application/pdf',
			'rls-artifact-group-operator-069@example.test'
		)
	$$,
	'group-scoped personnel operator can insert documents for scoped personnel'
);
SELECT throws_ok(
	$$
		INSERT INTO public.personnel_documents (
			id,
			organization_id,
			personnel_id,
			title,
			file_path,
			file_size_bytes,
			content_type,
			uploaded_by
		)
		VALUES (
			'70000000-0000-4000-8000-000000069005',
			'20000000-0000-4000-8000-000000069001',
			'50000000-0000-4000-8000-000000069002',
			'Out of scope document',
			'20000000-0000-4000-8000-000000069001/personnel/50000000-0000-4000-8000-000000069002/documents/operator-blocked.pdf',
			256,
			'application/pdf',
			'rls-artifact-group-operator-069@example.test'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "personnel_documents"',
	'group-scoped personnel operator cannot insert documents for another same-org group'
);
WITH updated AS (
	UPDATE public.personnel_documents
	SET title = 'Allowed scoped document update'
	WHERE id = '70000000-0000-4000-8000-000000069004'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	1,
	'group-scoped personnel operator can update documents for scoped personnel'
);
WITH updated AS (
	UPDATE public.personnel_documents
	SET title = 'Blocked scoped document update'
	WHERE id = '70000000-0000-4000-8000-000000069002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'group-scoped personnel operator cannot update documents for another same-org group'
);
WITH deleted AS (
	DELETE FROM public.personnel_documents
	WHERE id = '70000000-0000-4000-8000-000000069004'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM deleted),
	1,
	'group-scoped personnel operator can delete documents for scoped personnel'
);
WITH deleted AS (
	DELETE FROM public.personnel_documents
	WHERE id = '70000000-0000-4000-8000-000000069002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM deleted),
	0,
	'group-scoped personnel operator cannot delete documents for another same-org group'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.email', '', true);
SELECT * FROM finish();

ROLLBACK;
