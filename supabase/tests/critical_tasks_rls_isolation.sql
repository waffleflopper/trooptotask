BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

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
		'10000000-0000-4000-8000-000000069101',
		'authenticated',
		'authenticated',
		'rls-critical-viewer-069@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000069102',
		'authenticated',
		'authenticated',
		'rls-critical-training-only-069@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000069103',
		'authenticated',
		'authenticated',
		'rls-critical-group-operator-069@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000069104',
		'authenticated',
		'authenticated',
		'rls-critical-other-org-069@example.test',
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
		'20000000-0000-4000-8000-000000069101',
		'RLS Critical Alpha Unit',
		'10000000-0000-4000-8000-000000069101',
		'rls-critical-alpha-069'
	),
	(
		'20000000-0000-4000-8000-000000069102',
		'RLS Critical Bravo Unit',
		'10000000-0000-4000-8000-000000069104',
		'rls-critical-bravo-069'
	);

INSERT INTO public.groups (id, organization_id, name, sort_order)
VALUES
	(
		'30000000-0000-4000-8000-000000069101',
		'20000000-0000-4000-8000-000000069101',
		'Critical Alpha First Group',
		1
	),
	(
		'30000000-0000-4000-8000-000000069102',
		'20000000-0000-4000-8000-000000069101',
		'Critical Alpha Second Group',
		2
	),
	(
		'30000000-0000-4000-8000-000000069103',
		'20000000-0000-4000-8000-000000069102',
		'Critical Bravo Group',
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
		'40000000-0000-4000-8000-000000069101',
		'20000000-0000-4000-8000-000000069101',
		'10000000-0000-4000-8000-000000069101',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-critical-viewer-069@example.test'
	),
	(
		'40000000-0000-4000-8000-000000069102',
		'20000000-0000-4000-8000-000000069101',
		'10000000-0000-4000-8000-000000069102',
		'member',
		'viewer',
		'{"criticalTasks":"none","training":"operate"}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-critical-training-only-069@example.test'
	),
	(
		'40000000-0000-4000-8000-000000069103',
		'20000000-0000-4000-8000-000000069101',
		'10000000-0000-4000-8000-000000069103',
		'member',
		'operator',
		'{}'::jsonb,
		'groups',
		ARRAY['30000000-0000-4000-8000-000000069101']::uuid[],
		'rls-critical-group-operator-069@example.test'
	),
	(
		'40000000-0000-4000-8000-000000069104',
		'20000000-0000-4000-8000-000000069102',
		'10000000-0000-4000-8000-000000069104',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-critical-other-org-069@example.test'
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
		'50000000-0000-4000-8000-000000069101',
		'20000000-0000-4000-8000-000000069101',
		'SGT',
		'Critical',
		'Avery',
		'Medic',
		'30000000-0000-4000-8000-000000069101',
		'68W',
		'critical-avery-069'
	),
	(
		'50000000-0000-4000-8000-000000069102',
		'20000000-0000-4000-8000-000000069101',
		'SSG',
		'Critical',
		'Blair',
		'Medic',
		'30000000-0000-4000-8000-000000069102',
		'68W',
		'critical-blair-069'
	),
	(
		'50000000-0000-4000-8000-000000069103',
		'20000000-0000-4000-8000-000000069102',
		'CPL',
		'Critical',
		'Casey',
		'Medic',
		'30000000-0000-4000-8000-000000069103',
		'68W',
		'critical-casey-069'
	);

INSERT INTO public.ict_tasks (
	id,
	organization_id,
	task_code,
	title,
	mos,
	expiration_months,
	description,
	sort_order
)
VALUES
	(
		'60000000-0000-4000-8000-000000069101',
		'20000000-0000-4000-8000-000000069101',
		'069-ALPHA',
		'Alpha Critical Task',
		ARRAY['68W'],
		12,
		'Fixture ICT task',
		1
	),
	(
		'60000000-0000-4000-8000-000000069102',
		'20000000-0000-4000-8000-000000069102',
		'069-BRAVO',
		'Bravo Critical Task',
		ARRAY['68W'],
		12,
		'Fixture ICT task',
		1
	);

INSERT INTO public.personnel_ict_completions (
	id,
	organization_id,
	personnel_id,
	ict_task_id,
	completed_at,
	validation_method,
	validated_by,
	notes,
	logged_by
)
VALUES
	(
		'70000000-0000-4000-8000-000000069101',
		'20000000-0000-4000-8000-000000069101',
		'50000000-0000-4000-8000-000000069101',
		'60000000-0000-4000-8000-000000069101',
		'2026-06-01',
		'Practical Exercise',
		'Alpha validator',
		'Alpha group one completion',
		'10000000-0000-4000-8000-000000069101'
	),
	(
		'70000000-0000-4000-8000-000000069102',
		'20000000-0000-4000-8000-000000069101',
		'50000000-0000-4000-8000-000000069102',
		'60000000-0000-4000-8000-000000069101',
		'2026-06-02',
		'Practical Exercise',
		'Alpha validator',
		'Alpha group two completion',
		'10000000-0000-4000-8000-000000069101'
	),
	(
		'70000000-0000-4000-8000-000000069103',
		'20000000-0000-4000-8000-000000069102',
		'50000000-0000-4000-8000-000000069103',
		'60000000-0000-4000-8000-000000069102',
		'2026-06-03',
		'Practical Exercise',
		'Bravo validator',
		'Bravo completion',
		'10000000-0000-4000-8000-000000069104'
	);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069101', true);
SELECT set_config('request.jwt.claim.email', 'rls-critical-viewer-069@example.test', true);

SELECT is(
	(SELECT count(*)::integer FROM public.ict_tasks WHERE id = '60000000-0000-4000-8000-000000069101'),
	1,
	'critical tasks viewer can read in-org ICT tasks'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_ict_completions WHERE id = '70000000-0000-4000-8000-000000069101'),
	1,
	'critical tasks viewer can read in-scope personnel ICT completions'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069102', true);
SELECT set_config('request.jwt.claim.email', 'rls-critical-training-only-069@example.test', true);

SELECT is(
	(SELECT count(*)::integer FROM public.ict_tasks WHERE id = '60000000-0000-4000-8000-000000069101'),
	0,
	'training-only member cannot read ICT tasks through the old training lane'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_ict_completions WHERE id = '70000000-0000-4000-8000-000000069101'),
	0,
	'training-only member cannot read ICT completions through the old training lane'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069103', true);
SELECT set_config('request.jwt.claim.email', 'rls-critical-group-operator-069@example.test', true);

SELECT lives_ok(
	$$
		INSERT INTO public.personnel_ict_completions (
			id,
			organization_id,
			personnel_id,
			ict_task_id,
			completed_at,
			validation_method,
			validated_by,
			notes
		)
		VALUES (
			'70000000-0000-4000-8000-000000069104',
			'20000000-0000-4000-8000-000000069101',
			'50000000-0000-4000-8000-000000069101',
			'60000000-0000-4000-8000-000000069101',
			'2026-06-04',
			'Demonstration',
			'Scoped operator',
			'Allowed insert'
		)
	$$,
	'group-scoped critical tasks operator can insert completions for scoped personnel'
);
SELECT throws_ok(
	$$
		INSERT INTO public.personnel_ict_completions (
			id,
			organization_id,
			personnel_id,
			ict_task_id,
			completed_at,
			validation_method,
			validated_by,
			notes
		)
		VALUES (
			'70000000-0000-4000-8000-000000069105',
			'20000000-0000-4000-8000-000000069101',
			'50000000-0000-4000-8000-000000069102',
			'60000000-0000-4000-8000-000000069101',
			'2026-06-05',
			'Demonstration',
			'Scoped operator',
			'Blocked insert'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "personnel_ict_completions"',
	'group-scoped critical tasks operator cannot insert completions for another same-org group'
);
WITH updated AS (
	UPDATE public.personnel_ict_completions
	SET notes = 'Allowed scoped update'
	WHERE id = '70000000-0000-4000-8000-000000069104'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	1,
	'group-scoped critical tasks operator can update completions for scoped personnel'
);
WITH updated AS (
	UPDATE public.personnel_ict_completions
	SET notes = 'Blocked scoped update'
	WHERE id = '70000000-0000-4000-8000-000000069102'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'group-scoped critical tasks operator cannot update completions for another same-org group'
);
WITH deleted AS (
	DELETE FROM public.personnel_ict_completions
	WHERE id = '70000000-0000-4000-8000-000000069104'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM deleted),
	1,
	'group-scoped critical tasks operator can delete completions for scoped personnel'
);
WITH deleted AS (
	DELETE FROM public.personnel_ict_completions
	WHERE id = '70000000-0000-4000-8000-000000069102'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM deleted),
	0,
	'group-scoped critical tasks operator cannot delete completions for another same-org group'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069104', true);
SELECT set_config('request.jwt.claim.email', 'rls-critical-other-org-069@example.test', true);

SELECT is(
	(SELECT count(*)::integer FROM public.personnel_ict_completions WHERE id = '70000000-0000-4000-8000-000000069101'),
	0,
	'other-org members cannot read personnel ICT completions'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.email', '', true);
SET LOCAL ROLE anon;

SELECT is(
	(SELECT count(*)::integer FROM public.ict_tasks),
	0,
	'anon cannot read ICT tasks'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_ict_completions),
	0,
	'anon cannot read personnel ICT completions'
);
SELECT throws_ok(
	$$
		INSERT INTO public.personnel_ict_completions (
			id,
			organization_id,
			personnel_id,
			ict_task_id,
			completed_at,
			validation_method
		)
		VALUES (
			'70000000-0000-4000-8000-000000069106',
			'20000000-0000-4000-8000-000000069101',
			'50000000-0000-4000-8000-000000069101',
			'60000000-0000-4000-8000-000000069101',
			'2026-06-06',
			'Demonstration'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "personnel_ict_completions"',
	'anon cannot insert personnel ICT completions'
);

RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
