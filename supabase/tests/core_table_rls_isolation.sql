BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(27);

-- RLS contract targets verified from migrations:
-- - personnel: organization_id, SELECT uses can_view_personnel_record(organization_id, group_id);
--   INSERT/UPDATE/DELETE use can_edit_personnel_record(organization_id, group_id).
-- - availability_entries: organization_id, SELECT uses
--   can_view_availability_record(organization_id, personnel_id); INSERT/UPDATE/DELETE use
--   can_edit_availability_record(organization_id, personnel_id).
-- - personnel_trainings: organization_id, SELECT uses
--   can_view_personnel_training_record(organization_id, personnel_id); INSERT/UPDATE/DELETE
--   use can_edit_personnel_training_record(organization_id, personnel_id).
-- - duty_roster_templates: organization_id, SELECT uses can_view_calendar(organization_id);
--   ALL writes use can_edit_calendar(organization_id). Anon table privileges are revoked.
-- - notifications: organization_id plus user_id; SELECT/UPDATE/DELETE use user_id = auth.uid().
--   No INSERT policy exists for authenticated or anon callers.

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
		'10000000-0000-4000-8000-000000015001',
		'authenticated',
		'authenticated',
		'rls-alpha-owner-1501@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000015002',
		'authenticated',
		'authenticated',
		'rls-alpha-peer-1502@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000015003',
		'authenticated',
		'authenticated',
		'rls-bravo-owner-1503@example.test',
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
		'20000000-0000-4000-8000-000000015001',
		'RLS Alpha Unit',
		'10000000-0000-4000-8000-000000015001',
		'rls-alpha-unit-1501'
	),
	(
		'20000000-0000-4000-8000-000000015002',
		'RLS Bravo Unit',
		'10000000-0000-4000-8000-000000015003',
		'rls-bravo-unit-1502'
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
		'30000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'10000000-0000-4000-8000-000000015001',
		'owner',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-alpha-owner-1501@example.test'
	),
	(
		'30000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015001',
		'10000000-0000-4000-8000-000000015002',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-alpha-peer-1502@example.test'
	),
	(
		'30000000-0000-4000-8000-000000015003',
		'20000000-0000-4000-8000-000000015002',
		'10000000-0000-4000-8000-000000015003',
		'owner',
		'editor',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-bravo-owner-1503@example.test'
	);

INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order)
VALUES
	(
		'40000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'Alpha Leave',
		'#2563eb',
		'#ffffff',
		1
	),
	(
		'40000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015002',
		'Bravo Leave',
		'#dc2626',
		'#ffffff',
		1
	);

INSERT INTO public.training_types (id, organization_id, name, description)
VALUES
	(
		'50000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'Alpha CLS',
		'Fixture training type'
	),
	(
		'50000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015002',
		'Bravo CLS',
		'Fixture training type'
	),
	(
		'50000000-0000-4000-8000-000000015003',
		'20000000-0000-4000-8000-000000015002',
		'Bravo SHARP',
		'Fixture training type for forbidden insert'
	);

INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, clinic_role, mos, slug)
VALUES
	(
		'60000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'SGT',
		'Alpha',
		'Avery',
		'Medic',
		'68W',
		'alpha-avery-1501'
	),
	(
		'60000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015002',
		'SSG',
		'Bravo',
		'Blake',
		'Medic',
		'68W',
		'bravo-blake-1502'
	);

INSERT INTO public.availability_entries (
	id,
	organization_id,
	personnel_id,
	status_type_id,
	start_date,
	end_date,
	note
)
VALUES
	(
		'70000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'60000000-0000-4000-8000-000000015001',
		'40000000-0000-4000-8000-000000015001',
		'2026-06-15',
		'2026-06-16',
		'Alpha fixture'
	),
	(
		'70000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015002',
		'60000000-0000-4000-8000-000000015002',
		'40000000-0000-4000-8000-000000015002',
		'2026-06-15',
		'2026-06-16',
		'Bravo fixture'
	);

INSERT INTO public.personnel_trainings (
	id,
	organization_id,
	personnel_id,
	training_type_id,
	completion_date,
	expiration_date,
	notes
)
VALUES
	(
		'80000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'60000000-0000-4000-8000-000000015001',
		'50000000-0000-4000-8000-000000015001',
		'2026-06-01',
		'2027-06-01',
		'Alpha fixture'
	),
	(
		'80000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015002',
		'60000000-0000-4000-8000-000000015002',
		'50000000-0000-4000-8000-000000015002',
		'2026-06-01',
		'2027-06-01',
		'Bravo fixture'
	);

INSERT INTO public.assignment_types (
	id,
	organization_id,
	name,
	short_name,
	assign_to,
	color,
	sort_order,
	show_in_date_header,
	exempt_personnel_ids
)
VALUES
	(
		'90000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'Alpha Duty',
		'ALPHA',
		'personnel',
		'#2563eb',
		1,
		false,
		ARRAY[]::text[]
	),
	(
		'90000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015002',
		'Bravo Duty',
		'BRAVO',
		'personnel',
		'#dc2626',
		1,
		false,
		ARRAY[]::text[]
	),
	(
		'90000000-0000-4000-8000-000000015003',
		'20000000-0000-4000-8000-000000015002',
		'Bravo Extra Duty',
		'BRAVO2',
		'personnel',
		'#7c3aed',
		2,
		false,
		ARRAY[]::text[]
	);

INSERT INTO public.duty_roster_templates (
	id,
	organization_id,
	name,
	slug,
	short_code,
	created_by_user_id,
	assignment_type_id
)
VALUES
	(
		'a0000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'Alpha Duty Template',
		'alpha-duty-template-1501',
		'ADT',
		'10000000-0000-4000-8000-000000015001',
		'90000000-0000-4000-8000-000000015001'
	),
	(
		'a0000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015002',
		'Bravo Duty Template',
		'bravo-duty-template-1502',
		'BDT',
		'10000000-0000-4000-8000-000000015003',
		'90000000-0000-4000-8000-000000015002'
	);

INSERT INTO public.notifications (id, user_id, organization_id, type, title, message, link, read)
VALUES
	(
		'b0000000-0000-4000-8000-000000015001',
		'10000000-0000-4000-8000-000000015001',
		'20000000-0000-4000-8000-000000015001',
		'training',
		'Alpha owner notification',
		'Alpha owner message',
		NULL,
		false
	),
	(
		'b0000000-0000-4000-8000-000000015002',
		'10000000-0000-4000-8000-000000015002',
		'20000000-0000-4000-8000-000000015001',
		'training',
		'Alpha peer notification',
		'Alpha peer message',
		NULL,
		false
	),
	(
		'b0000000-0000-4000-8000-000000015003',
		'10000000-0000-4000-8000-000000015003',
		'20000000-0000-4000-8000-000000015002',
		'training',
		'Bravo owner notification',
		'Bravo owner message',
		NULL,
		false
	);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000015001', true);
SELECT set_config('request.jwt.claim.email', 'rls-alpha-owner-1501@example.test', true);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.personnel
		WHERE id = '60000000-0000-4000-8000-000000015001'
	),
	1,
	'alpha owner can read alpha personnel'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.personnel
		WHERE id = '60000000-0000-4000-8000-000000015002'
	),
	0,
	'alpha owner cannot read bravo personnel'
);
WITH updated AS (
	UPDATE public.personnel
	SET rank = 'SFC'
	WHERE id = '60000000-0000-4000-8000-000000015002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'alpha owner cannot update bravo personnel'
);
SELECT throws_ok(
	$$
		INSERT INTO public.personnel (
			id,
			organization_id,
			rank,
			last_name,
			first_name,
			clinic_role,
			mos,
			slug
		)
		VALUES (
			'60000000-0000-4000-8000-000000015003',
			'20000000-0000-4000-8000-000000015002',
			'SPC',
			'Bravo',
			'Blocked',
			'Medic',
			'68W',
			'bravo-blocked-1503'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "personnel"',
	'alpha owner cannot insert bravo personnel'
);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.availability_entries
		WHERE id = '70000000-0000-4000-8000-000000015001'
	),
	1,
	'alpha owner can read alpha availability'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.availability_entries
		WHERE id = '70000000-0000-4000-8000-000000015002'
	),
	0,
	'alpha owner cannot read bravo availability'
);
WITH updated AS (
	UPDATE public.availability_entries
	SET note = 'blocked update'
	WHERE id = '70000000-0000-4000-8000-000000015002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'alpha owner cannot update bravo availability'
);
SELECT throws_ok(
	$$
		INSERT INTO public.availability_entries (
			id,
			organization_id,
			personnel_id,
			status_type_id,
			start_date,
			end_date,
			note
		)
		VALUES (
			'70000000-0000-4000-8000-000000015003',
			'20000000-0000-4000-8000-000000015002',
			'60000000-0000-4000-8000-000000015002',
			'40000000-0000-4000-8000-000000015002',
			'2026-06-20',
			'2026-06-21',
			'blocked insert'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "availability_entries"',
	'alpha owner cannot insert bravo availability'
);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.personnel_trainings
		WHERE id = '80000000-0000-4000-8000-000000015001'
	),
	1,
	'alpha owner can read alpha personnel training'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.personnel_trainings
		WHERE id = '80000000-0000-4000-8000-000000015002'
	),
	0,
	'alpha owner cannot read bravo personnel training'
);
WITH updated AS (
	UPDATE public.personnel_trainings
	SET notes = 'blocked update'
	WHERE id = '80000000-0000-4000-8000-000000015002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'alpha owner cannot update bravo personnel training'
);
SELECT throws_ok(
	$$
		INSERT INTO public.personnel_trainings (
			id,
			organization_id,
			personnel_id,
			training_type_id,
			completion_date,
			expiration_date,
			notes
		)
		VALUES (
			'80000000-0000-4000-8000-000000015003',
			'20000000-0000-4000-8000-000000015002',
			'60000000-0000-4000-8000-000000015002',
			'50000000-0000-4000-8000-000000015003',
			'2026-06-02',
			'2027-06-02',
			'blocked insert'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "personnel_trainings"',
	'alpha owner cannot insert bravo personnel training'
);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.duty_roster_templates
		WHERE id = 'a0000000-0000-4000-8000-000000015001'
	),
	1,
	'alpha owner can read alpha duty roster template'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.duty_roster_templates
		WHERE id = 'a0000000-0000-4000-8000-000000015002'
	),
	0,
	'alpha owner cannot read bravo duty roster template'
);
WITH updated AS (
	UPDATE public.duty_roster_templates
	SET name = 'Blocked Bravo Duty Template'
	WHERE id = 'a0000000-0000-4000-8000-000000015002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'alpha owner cannot update bravo duty roster template'
);
SELECT throws_ok(
	$$
		INSERT INTO public.duty_roster_templates (
			id,
			organization_id,
			name,
			slug,
			short_code,
			created_by_user_id,
			assignment_type_id
		)
		VALUES (
			'a0000000-0000-4000-8000-000000015003',
			'20000000-0000-4000-8000-000000015002',
			'Blocked Bravo Duty Template',
			'blocked-bravo-duty-template-1503',
			'BBDT',
			'10000000-0000-4000-8000-000000015001',
			'90000000-0000-4000-8000-000000015003'
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "duty_roster_templates"',
	'alpha owner cannot insert bravo duty roster template'
);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.notifications
		WHERE id = 'b0000000-0000-4000-8000-000000015001'
	),
	1,
	'alpha owner can read own notification'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.notifications
		WHERE id = 'b0000000-0000-4000-8000-000000015003'
	),
	0,
	'alpha owner cannot read bravo notification'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.notifications
		WHERE id = 'b0000000-0000-4000-8000-000000015002'
	),
	0,
	'alpha owner cannot read same-org peer notification'
);
WITH updated AS (
	UPDATE public.notifications
	SET read = true
	WHERE id = 'b0000000-0000-4000-8000-000000015003'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'alpha owner cannot update bravo notification'
);
WITH updated AS (
	UPDATE public.notifications
	SET read = true
	WHERE id = 'b0000000-0000-4000-8000-000000015002'
	RETURNING id
)
SELECT is(
	(SELECT count(*)::integer FROM updated),
	0,
	'alpha owner cannot update same-org peer notification'
);
SELECT throws_ok(
	$$
		INSERT INTO public.notifications (
			id,
			user_id,
			organization_id,
			type,
			title,
			message,
			read
		)
		VALUES (
			'b0000000-0000-4000-8000-000000015004',
			'10000000-0000-4000-8000-000000015003',
			'20000000-0000-4000-8000-000000015002',
			'training',
			'Blocked Bravo notification',
			'Blocked Bravo message',
			false
		)
	$$,
	'42501',
	'new row violates row-level security policy for table "notifications"',
	'alpha owner cannot insert bravo notification'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.email', '', true);
SET LOCAL ROLE anon;

SELECT is(
	(SELECT count(*)::integer FROM public.personnel),
	0,
	'anon cannot read personnel'
);
SELECT is(
	(SELECT count(*)::integer FROM public.availability_entries),
	0,
	'anon cannot read availability'
);
SELECT is(
	(SELECT count(*)::integer FROM public.personnel_trainings),
	0,
	'anon cannot read personnel trainings'
);
SELECT throws_ok(
	$$ SELECT count(*) FROM public.duty_roster_templates $$,
	'42501',
	'permission denied for table duty_roster_templates',
	'anon has no table privilege for duty roster templates'
);
SELECT is(
	(SELECT count(*)::integer FROM public.notifications),
	0,
	'anon cannot read notifications'
);

RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
