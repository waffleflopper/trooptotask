BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(8);

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
		'10000000-0000-4000-8000-000000069201',
		'authenticated',
		'authenticated',
		'rls-billing-alpha-069@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'10000000-0000-4000-8000-000000069202',
		'authenticated',
		'authenticated',
		'rls-billing-bravo-069@example.test',
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
		'20000000-0000-4000-8000-000000069201',
		'RLS Billing Alpha Unit',
		'10000000-0000-4000-8000-000000069201',
		'rls-billing-alpha-069'
	),
	(
		'20000000-0000-4000-8000-000000069202',
		'RLS Billing Bravo Unit',
		'10000000-0000-4000-8000-000000069202',
		'rls-billing-bravo-069'
	),
	(
		'20000000-0000-4000-8000-000000069203',
		'RLS Billing Charlie Unit',
		'10000000-0000-4000-8000-000000069201',
		'rls-billing-charlie-069'
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
		'30000000-0000-4000-8000-000000069201',
		'20000000-0000-4000-8000-000000069201',
		'10000000-0000-4000-8000-000000069201',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-billing-alpha-069@example.test'
	),
	(
		'30000000-0000-4000-8000-000000069202',
		'20000000-0000-4000-8000-000000069202',
		'10000000-0000-4000-8000-000000069202',
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[],
		'rls-billing-bravo-069@example.test'
	);

INSERT INTO public.organization_billing_snapshots (
	id,
	organization_id,
	source,
	commercial_plan,
	stripe_customer_id,
	stripe_subscription_id,
	subscription_status,
	sync_status,
	last_stripe_event_id,
	last_stripe_event_type,
	last_stripe_event_created_at,
	last_processed_at
)
VALUES
	(
		'40000000-0000-4000-8000-000000069201',
		'20000000-0000-4000-8000-000000069201',
		'stripe',
		'team',
		'cus_test_plan_069_alpha',
		'sub_test_plan_069_alpha',
		'active',
		'synced',
		'evt_test_plan_069_alpha',
		'customer.subscription.updated',
		'2026-06-01 00:00:00+00',
		'2026-06-01 00:01:00+00'
	),
	(
		'40000000-0000-4000-8000-000000069202',
		'20000000-0000-4000-8000-000000069202',
		'stripe',
		'unit',
		'cus_test_plan_069_bravo',
		'sub_test_plan_069_bravo',
		'active',
		'synced',
		'evt_test_plan_069_bravo',
		'customer.subscription.updated',
		'2026-06-01 00:00:00+00',
		'2026-06-01 00:01:00+00'
	);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000069201', true);
SELECT set_config('request.jwt.claim.email', 'rls-billing-alpha-069@example.test', true);

SELECT is(
	(
		SELECT count(*)::integer
		FROM public.organization_billing_snapshots
		WHERE organization_id = '20000000-0000-4000-8000-000000069201'
	),
	1,
	'authenticated members can read their own organization billing snapshot'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.organization_billing_snapshots
		WHERE organization_id = '20000000-0000-4000-8000-000000069202'
	),
	0,
	'authenticated members cannot read another organization billing snapshot'
);
SELECT throws_ok(
	$$
		INSERT INTO public.organization_billing_snapshots (
			id,
			organization_id,
			source,
			commercial_plan
		)
		VALUES (
			'40000000-0000-4000-8000-000000069203',
			'20000000-0000-4000-8000-000000069201',
			'stripe',
			'team'
		)
	$$,
	'42501',
	'permission denied for table organization_billing_snapshots',
	'authenticated users cannot insert organization billing snapshots'
);
SELECT throws_ok(
	$$
		UPDATE public.organization_billing_snapshots
		SET sync_status = 'pending'
		WHERE id = '40000000-0000-4000-8000-000000069201'
	$$,
	'42501',
	'permission denied for table organization_billing_snapshots',
	'authenticated users cannot update organization billing snapshots'
);
SELECT throws_ok(
	$$
		DELETE FROM public.organization_billing_snapshots
		WHERE id = '40000000-0000-4000-8000-000000069201'
	$$,
	'42501',
	'permission denied for table organization_billing_snapshots',
	'authenticated users cannot delete organization billing snapshots'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.email', '', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
	$$ SELECT count(*) FROM public.organization_billing_snapshots $$,
	'42501',
	'permission denied for table organization_billing_snapshots',
	'anon cannot read organization billing snapshots'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT lives_ok(
	$$
		INSERT INTO public.organization_billing_snapshots (
			id,
			organization_id,
			source,
			commercial_plan,
			stripe_customer_id,
			stripe_subscription_id,
			subscription_status,
			sync_status,
			last_stripe_event_id
		)
		VALUES (
			'40000000-0000-4000-8000-000000069203',
			'20000000-0000-4000-8000-000000069203',
			'gift',
			'team',
			'cus_test_plan_069_service',
			'sub_test_plan_069_service',
			'active',
			'synced',
			'evt_test_plan_069_service'
		)
	$$,
	'service role can insert organization billing snapshots'
);
SELECT lives_ok(
	$$
		UPDATE public.organization_billing_snapshots
		SET sync_status = 'needs_reconciliation',
			reconciliation_result = 'fixture update'
		WHERE id = '40000000-0000-4000-8000-000000069203'
	$$,
	'service role can update organization billing snapshots'
);

RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
