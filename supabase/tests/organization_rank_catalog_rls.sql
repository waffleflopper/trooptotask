BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(9);

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
		'10000000-0000-4000-8000-000000124701',
		'authenticated',
		'authenticated',
		'rank-alpha-owner-1247@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000124702',
		'authenticated',
		'authenticated',
		'rank-alpha-editor-1247@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000124703',
		'authenticated',
		'authenticated',
		'rank-bravo-owner-1247@example.test',
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
		'20000000-0000-4000-8000-000000124701',
		'Rank Catalog Alpha Unit',
		'10000000-0000-4000-8000-000000124701',
		'rank-catalog-alpha-1247'
	),
	(
		'20000000-0000-4000-8000-000000124702',
		'Rank Catalog Bravo Unit',
		'10000000-0000-4000-8000-000000124703',
		'rank-catalog-bravo-1247'
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
		'30000000-0000-4000-8000-000000124701',
		'20000000-0000-4000-8000-000000124701',
		'10000000-0000-4000-8000-000000124701',
		'owner',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rank-alpha-owner-1247@example.test'
	),
	(
		'30000000-0000-4000-8000-000000124702',
		'20000000-0000-4000-8000-000000124701',
		'10000000-0000-4000-8000-000000124702',
		'member',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rank-alpha-editor-1247@example.test'
	),
	(
		'30000000-0000-4000-8000-000000124703',
		'20000000-0000-4000-8000-000000124702',
		'10000000-0000-4000-8000-000000124703',
		'owner',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rank-bravo-owner-1247@example.test'
	);

INSERT INTO public.organization_rank_catalog (
	id,
	organization_id,
	code,
	label,
	service,
	category,
	pay_grade,
	state,
	source,
	sort_order
)
VALUES
	(
		'40000000-0000-4000-8000-000000124701',
		'20000000-0000-4000-8000-000000124701',
		'ALPHA-SGT',
		'Alpha Sergeant',
		'custom',
		'custom',
		'ungraded',
		'active',
		'custom',
		1
	),
	(
		'40000000-0000-4000-8000-000000124702',
		'20000000-0000-4000-8000-000000124702',
		'BRAVO-SGT',
		'Bravo Sergeant',
		'custom',
		'custom',
		'ungraded',
		'active',
		'custom',
		1
	);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000124702', true);
SELECT set_config('request.jwt.claim.email', 'rank-alpha-editor-1247@example.test', true);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.organization_rank_catalog
		WHERE code = 'ALPHA-SGT'
	),
	1,
	'alpha personnel editor can read alpha rank catalog entries'
);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.organization_rank_catalog
		WHERE code = 'BRAVO-SGT'
	),
	0,
	'alpha personnel editor cannot read bravo rank catalog entries'
);

WITH updated AS (
	UPDATE public.organization_rank_catalog
	SET label = 'Blocked Alpha Sergeant'
	WHERE code = 'ALPHA-SGT'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'personnel editor cannot update alpha rank catalog entries without Organization governance'
);

SELECT throws_ok(
	$$
		INSERT INTO public.organization_rank_catalog (
			organization_id,
			code,
			label,
			service,
			category,
			pay_grade,
			state,
			source,
			sort_order
		)
		VALUES (
			'20000000-0000-4000-8000-000000124701',
			'ALPHA-CUSTOM',
			'Alpha Custom',
			'custom',
			'custom',
			'ungraded',
			'active',
			'custom',
			2
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "organization_rank_catalog"',
	'personnel editor cannot insert alpha rank catalog entries without Organization governance'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000124701', true);
SELECT set_config('request.jwt.claim.email', 'rank-alpha-owner-1247@example.test', true);

SELECT lives_ok(
	$$
		INSERT INTO public.organization_rank_catalog (
			organization_id,
			code,
			label,
			service,
			category,
			pay_grade,
			state,
			source,
			sort_order
		)
		VALUES (
			'20000000-0000-4000-8000-000000124701',
			'ALPHA-OWNER',
			'Alpha Owner Custom',
			'custom',
			'custom',
			'ungraded',
			'active',
			'custom',
			3
		)
	$$,
	'alpha owner can insert alpha rank catalog entries'
);

SELECT throws_ok(
	$$
		INSERT INTO public.organization_rank_catalog (
			organization_id,
			code,
			label,
			service,
			category,
			pay_grade,
			state,
			source,
			sort_order
		)
		VALUES (
			'20000000-0000-4000-8000-000000124702',
			'BRAVO-BLOCKED',
			'Blocked Bravo Custom',
			'custom',
			'custom',
			'ungraded',
			'active',
			'custom',
			2
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "organization_rank_catalog"',
	'alpha owner cannot insert bravo rank catalog entries'
);

SELECT throws_ok(
	$$
		DELETE FROM public.organization_rank_catalog
		WHERE code = 'ALPHA-SGT'
	$$,
	'42501',
	'permission denied for table organization_rank_catalog',
	'alpha owner cannot directly delete rank catalog entries'
);

SELECT throws_ok(
	$$
		INSERT INTO public.organization_rank_catalog (
			organization_id,
			code,
			label,
			service,
			category,
			pay_grade,
			state,
			source,
			sort_order
		)
		VALUES (
			'20000000-0000-4000-8000-000000124701',
			' ALPHA-SPACED ',
			'Alpha Spaced',
			'custom',
			'custom',
			'ungraded',
			'active',
			'custom',
			4
		)
	$$,
	'23514',
	'new row for relation "organization_rank_catalog" violates check constraint "organization_rank_catalog_code_check"',
	'alpha owner cannot insert non-canonical trimmed rank catalog codes'
);

SELECT throws_ok(
	$$
		INSERT INTO public.organization_rank_catalog (
			organization_id,
			code,
			label,
			service,
			category,
			pay_grade,
			state,
			source,
			sort_order
		)
		VALUES (
			'20000000-0000-4000-8000-000000124701',
			'ALPHA-E10',
			'Alpha E10',
			'custom',
			'custom',
			'E-10',
			'active',
			'custom',
			5
		)
	$$,
	'23514',
	'new row for relation "organization_rank_catalog" violates check constraint "organization_rank_catalog_pay_grade_check"',
	'alpha owner cannot insert unsupported rank pay grades'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.email', '', true);

SELECT * FROM finish();
ROLLBACK;
