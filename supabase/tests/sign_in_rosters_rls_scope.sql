BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(10);

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
		'10000000-0000-4000-8000-000000070001',
		'authenticated',
		'authenticated',
		'rls-roster-org-viewer-070@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000070002',
		'authenticated',
		'authenticated',
		'rls-roster-group-viewer-070@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000070003',
		'authenticated',
		'authenticated',
		'rls-roster-group-operator-070@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000070004',
		'authenticated',
		'authenticated',
		'rls-roster-other-org-070@example.test',
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
		'20000000-0000-4000-8000-000000070001',
		'RLS Roster Alpha Unit',
		'10000000-0000-4000-8000-000000070001',
		'rls-roster-alpha-070'
	),
	(
		'20000000-0000-4000-8000-000000070002',
		'RLS Roster Bravo Unit',
		'10000000-0000-4000-8000-000000070004',
		'rls-roster-bravo-070'
	);

INSERT INTO public.groups (id, organization_id, name, sort_order)
VALUES
	(
		'30000000-0000-4000-8000-000000070001',
		'20000000-0000-4000-8000-000000070001',
		'Roster Alpha First Group',
		1
	),
	(
		'30000000-0000-4000-8000-000000070002',
		'20000000-0000-4000-8000-000000070001',
		'Roster Alpha Second Group',
		2
	),
	(
		'30000000-0000-4000-8000-000000070003',
		'20000000-0000-4000-8000-000000070002',
		'Roster Bravo Group',
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
		'40000000-0000-4000-8000-000000070001',
		'20000000-0000-4000-8000-000000070001',
		'10000000-0000-4000-8000-000000070001',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-roster-org-viewer-070@example.test'
	),
	(
		'40000000-0000-4000-8000-000000070002',
		'20000000-0000-4000-8000-000000070001',
		'10000000-0000-4000-8000-000000070002',
		'member',
		'viewer',
		'{}'::jsonb,
		'groups',
		ARRAY['30000000-0000-4000-8000-000000070001']::uuid[],
		'rls-roster-group-viewer-070@example.test'
	),
	(
		'40000000-0000-4000-8000-000000070003',
		'20000000-0000-4000-8000-000000070001',
		'10000000-0000-4000-8000-000000070003',
		'member',
		'operator',
		'{}'::jsonb,
		'groups',
		ARRAY['30000000-0000-4000-8000-000000070001']::uuid[],
		'rls-roster-group-operator-070@example.test'
	),
	(
		'40000000-0000-4000-8000-000000070004',
		'20000000-0000-4000-8000-000000070002',
		'10000000-0000-4000-8000-000000070004',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-roster-other-org-070@example.test'
	);

INSERT INTO public.sign_in_rosters (
	id,
	organization_id,
	title,
	roster_date,
	blank_date,
	separate_by_group,
	sort_by,
	personnel_snapshot,
	personnel_ids,
	scope_group_ids,
	filter_config,
	created_by,
	created_at
)
VALUES
	(
		'50000000-0000-4000-8000-000000070001',
		'20000000-0000-4000-8000-000000070001',
		'Alpha roster',
		'2026-05-04',
		false,
		false,
		'alphabetical',
		'[]'::jsonb,
		ARRAY['60000000-0000-4000-8000-000000070001']::uuid[],
		ARRAY['30000000-0000-4000-8000-000000070001']::uuid[],
		NULL,
		'10000000-0000-4000-8000-000000070001',
		now()
	),
	(
		'50000000-0000-4000-8000-000000070002',
		'20000000-0000-4000-8000-000000070001',
		'Mixed roster',
		'2026-05-04',
		false,
		false,
		'alphabetical',
		'[]'::jsonb,
		ARRAY[
			'60000000-0000-4000-8000-000000070001',
			'60000000-0000-4000-8000-000000070002'
		]::uuid[],
		ARRAY[
			'30000000-0000-4000-8000-000000070001',
			'30000000-0000-4000-8000-000000070002'
		]::uuid[],
		NULL,
		'10000000-0000-4000-8000-000000070001',
		now()
	),
	(
		'50000000-0000-4000-8000-000000070003',
		'20000000-0000-4000-8000-000000070001',
		'Organization-only roster',
		'2026-05-04',
		false,
		false,
		'alphabetical',
		'[]'::jsonb,
		ARRAY[]::uuid[],
		ARRAY[]::uuid[],
		NULL,
		'10000000-0000-4000-8000-000000070001',
		now()
	);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070001', true);

SELECT results_eq(
	$$SELECT title FROM public.sign_in_rosters ORDER BY title$$,
	ARRAY['Alpha roster'::text, 'Mixed roster'::text, 'Organization-only roster'::text],
	'organization-scope training viewer can read all in-org sign-in rosters'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070002', true);

SELECT results_eq(
	$$SELECT title FROM public.sign_in_rosters ORDER BY title$$,
	ARRAY['Alpha roster'::text],
	'group-scoped training viewer can read only rosters whose every group is in scope'
);

SELECT is_empty(
	$$SELECT title FROM public.sign_in_rosters WHERE id = '50000000-0000-4000-8000-000000070002'$$,
	'group-scoped training viewer cannot read mixed-scope sign-in rosters'
);

SELECT is_empty(
	$$SELECT title FROM public.sign_in_rosters WHERE id = '50000000-0000-4000-8000-000000070003'$$,
	'group-scoped training viewer cannot read organization-only historical sign-in rosters'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070003', true);

SELECT results_eq(
	$$WITH updated AS (
		UPDATE public.sign_in_rosters
			SET title = 'Updated mixed roster'
			WHERE id = '50000000-0000-4000-8000-000000070002'
			RETURNING id
	)
	SELECT count(*)::integer FROM updated$$,
	ARRAY[0],
	'group-scoped training operator cannot update a mixed-scope sign-in roster'
);

SELECT results_eq(
	$$WITH deleted AS (
		DELETE FROM public.sign_in_rosters
			WHERE id = '50000000-0000-4000-8000-000000070002'
			RETURNING id
	)
	SELECT count(*)::integer FROM deleted$$,
	ARRAY[0],
	'group-scoped training operator cannot delete a mixed-scope sign-in roster'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070001', true);

SELECT results_eq(
	$$SELECT title FROM public.sign_in_rosters
		WHERE id = '50000000-0000-4000-8000-000000070002'$$,
	ARRAY['Mixed roster'::text],
	'forbidden mixed-scope mutations leave the sign-in roster unchanged'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070003', true);

SELECT lives_ok(
	$$UPDATE public.sign_in_rosters
		SET title = 'Updated alpha roster'
		WHERE id = '50000000-0000-4000-8000-000000070001'$$,
	'group-scoped training operator can update an in-scope sign-in roster'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000070004', true);

SELECT is_empty(
	$$SELECT title FROM public.sign_in_rosters WHERE organization_id = '20000000-0000-4000-8000-000000070001'$$,
	'other-org members cannot read sign-in rosters'
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT is(
	(SELECT count(*)::integer FROM public.sign_in_rosters),
	0,
	'anon cannot access sign-in rosters'
);

SELECT * FROM finish();

ROLLBACK;
