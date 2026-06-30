BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(5);

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
		'90000000-0000-4000-8000-000000000001',
		'authenticated',
		'authenticated',
		'invite-owner-acceptance@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'90000000-0000-4000-8000-000000000002',
		'authenticated',
		'authenticated',
		'duplicate-request@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	),
	(
		'00000000-0000-0000-0000-000000000000',
		'90000000-0000-4000-8000-000000000003',
		'authenticated',
		'authenticated',
		'still-needs-setup@example.test',
		'',
		now(),
		'{"provider": "email", "providers": ["email"]}'::jsonb,
		'{}'::jsonb,
		now(),
		now()
	);

INSERT INTO public.organizations (id, name, created_by)
VALUES (
	'90000000-0000-4000-8000-000000000101',
	'Invitation Acceptance Regression Test',
	'90000000-0000-4000-8000-000000000001'
);

INSERT INTO public.organization_memberships (
	id,
	organization_id,
	user_id,
	role,
	member_preset,
	capability_overrides,
	access_scope_kind,
	access_scope_group_ids
)
VALUES (
	'90000000-0000-4000-8000-000000000201',
	'90000000-0000-4000-8000-000000000101',
	'90000000-0000-4000-8000-000000000001',
	'admin',
	'editor',
	'{}'::jsonb,
	'organization',
	ARRAY[]::uuid[]
);

INSERT INTO public.access_requests (
	id,
	email,
	name,
	status,
	reviewed_by,
	reviewed_at,
	setup_completed_at,
	setup_user_id
)
VALUES
	(
		'90000000-0000-4000-8000-000000000301',
		'duplicate-request@example.test',
		'Duplicate Request Completed',
		'approved',
		'90000000-0000-4000-8000-000000000001',
		now() - '2 days'::interval,
		now() - '1 day'::interval,
		'90000000-0000-4000-8000-000000000002'
	),
	(
		'90000000-0000-4000-8000-000000000302',
		'duplicate-request@example.test',
		'Duplicate Request Linked',
		'approved',
		'90000000-0000-4000-8000-000000000001',
		now(),
		NULL,
		NULL
	),
	(
		'90000000-0000-4000-8000-000000000303',
		'still-needs-setup@example.test',
		'Still Needs Setup',
		'approved',
		'90000000-0000-4000-8000-000000000001',
		now(),
		NULL,
		NULL
	);

INSERT INTO public.organization_invitations (
	id,
	organization_id,
	email,
	invited_by,
	status,
	expires_at,
	role,
	member_preset,
	capability_overrides,
	access_scope_kind,
	access_scope_group_ids
)
VALUES
	(
		'90000000-0000-4000-8000-000000000401',
		'90000000-0000-4000-8000-000000000101',
		'duplicate-request@example.test',
		'90000000-0000-4000-8000-000000000001',
		'pending',
		now() + '7 days'::interval,
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	),
	(
		'90000000-0000-4000-8000-000000000402',
		'90000000-0000-4000-8000-000000000101',
		'still-needs-setup@example.test',
		'90000000-0000-4000-8000-000000000001',
		'pending',
		now() + '7 days'::interval,
		'member',
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	);

INSERT INTO public.access_request_organization_invitation_links (
	id,
	access_request_id,
	organization_invitation_id,
	organization_id,
	invited_by,
	invited_at,
	intended_membership_role,
	intended_permissions,
	intended_member_preset,
	intended_capability_overrides,
	intended_access_scope_kind,
	intended_access_scope_group_ids
)
VALUES
	(
		'90000000-0000-4000-8000-000000000501',
		'90000000-0000-4000-8000-000000000302',
		'90000000-0000-4000-8000-000000000401',
		'90000000-0000-4000-8000-000000000101',
		'90000000-0000-4000-8000-000000000001',
		now(),
		'member',
		'{}'::jsonb,
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	),
	(
		'90000000-0000-4000-8000-000000000502',
		'90000000-0000-4000-8000-000000000303',
		'90000000-0000-4000-8000-000000000402',
		'90000000-0000-4000-8000-000000000101',
		'90000000-0000-4000-8000-000000000001',
		now(),
		'member',
		'{}'::jsonb,
		'viewer',
		'{}'::jsonb,
		'organization',
		ARRAY[]::uuid[]
	);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claim.email', 'still-needs-setup@example.test', true);
SELECT set_config(
	'request.jwt.claims',
	'{"sub":"90000000-0000-4000-8000-000000000003","email":"still-needs-setup@example.test","role":"authenticated"}',
	true
);
CREATE TEMP TABLE still_needs_setup_accept_result ON COMMIT DROP AS
SELECT * FROM public.accept_organization_invitation('90000000-0000-4000-8000-000000000402');

RESET ROLE;
SELECT is(
	(SELECT accept_status FROM still_needs_setup_accept_result),
	'setup_required',
	'linked reviewed-access invitations still require setup when no same-email setup is complete'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.organization_memberships
		WHERE organization_id = '90000000-0000-4000-8000-000000000101'
			AND user_id = '90000000-0000-4000-8000-000000000003'
	),
	0,
	'setup-required invitations do not create organization memberships'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.email', 'duplicate-request@example.test', true);
SELECT set_config(
	'request.jwt.claims',
	'{"sub":"90000000-0000-4000-8000-000000000002","email":"duplicate-request@example.test","role":"authenticated"}',
	true
);
CREATE TEMP TABLE duplicate_request_accept_result ON COMMIT DROP AS
SELECT * FROM public.accept_organization_invitation('90000000-0000-4000-8000-000000000401');

RESET ROLE;
SELECT is(
	(SELECT accept_status FROM duplicate_request_accept_result),
	'accepted',
	'linked duplicate Access Request invitations accept when the same email already completed account setup'
);
SELECT is(
	(
		SELECT count(*)::integer
		FROM public.organization_memberships
		WHERE organization_id = '90000000-0000-4000-8000-000000000101'
			AND user_id = '90000000-0000-4000-8000-000000000002'
	),
	1,
	'duplicate-request invitation acceptance creates the organization membership'
);
SELECT is(
	(
		SELECT status::text
		FROM public.organization_invitations
		WHERE id = '90000000-0000-4000-8000-000000000401'
	),
	'accepted',
	'duplicate-request invitation acceptance marks the invitation accepted'
);

RESET ROLE;
SELECT * FROM finish();

ROLLBACK;
