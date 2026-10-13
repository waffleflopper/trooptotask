BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(5);

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, '', now(),
	'{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM (VALUES
	('f3100000-0000-4000-8000-000000000001', 'helper-alpha-owner@example.test'),
	('f3100000-0000-4000-8000-000000000002', 'helper-alpha-editor@example.test'),
	('f3100000-0000-4000-8000-000000000003', 'helper-bravo-owner@example.test')
) AS fixture(id, email);

INSERT INTO public.organizations (id, name, created_by) VALUES
	('f3100000-0000-4000-8000-000000000101', 'Helper Alpha', 'f3100000-0000-4000-8000-000000000001'),
	('f3100000-0000-4000-8000-000000000102', 'Helper Bravo', 'f3100000-0000-4000-8000-000000000003');

INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids) VALUES
	('f3100000-0000-4000-8000-000000000101', 'f3100000-0000-4000-8000-000000000001', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
	('f3100000-0000-4000-8000-000000000101', 'f3100000-0000-4000-8000-000000000002', 'member', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
	('f3100000-0000-4000-8000-000000000102', 'f3100000-0000-4000-8000-000000000003', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]);

INSERT INTO public.personnel (id, organization_id, rank, last_name, first_name, clinic_role, mos, slug) VALUES
	('f3100000-0000-4000-8000-000000000401', 'f3100000-0000-4000-8000-000000000101', 'SGT', 'Alpha', 'Avery', 'Medic', '68W', 'helper-alpha-avery');
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, status) VALUES
	('f3100000-0000-4000-8000-000000000501', 'f3100000-0000-4000-8000-000000000101', 'f3100000-0000-4000-8000-000000000401', 'in_progress');
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
	('f3100000-0000-4000-8000-000000000601', 'f3100000-0000-4000-8000-000000000101', 'Alpha Packet');
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type) VALUES
	('f3100000-0000-4000-8000-000000000701', 'f3100000-0000-4000-8000-000000000101', 'f3100000-0000-4000-8000-000000000601', 'Alpha Step', 'checkbox');
INSERT INTO public.training_types (id, organization_id, name) VALUES
	('f3100000-0000-4000-8000-000000000801', 'f3100000-0000-4000-8000-000000000101', 'Alpha CLS');

-- Person, packet, template, NULL template, step and Training type, NULL step references.
CREATE FUNCTION pg_temp.alpha_helper_answers(p_user_id uuid) RETURNS boolean[]
LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claim.sub', p_user_id::text, true);
	SELECT ARRAY[
		onboarding_private.onboarding_personnel_scope_matches('f3100000-0000-4000-8000-000000000101', 'f3100000-0000-4000-8000-000000000401'),
		onboarding_private.onboarding_parent_scope_matches('f3100000-0000-4000-8000-000000000101', 'f3100000-0000-4000-8000-000000000501'),
		onboarding_private.onboarding_template_reference_matches('f3100000-0000-4000-8000-000000000101', 'f3100000-0000-4000-8000-000000000601'),
		onboarding_private.onboarding_template_reference_matches('f3100000-0000-4000-8000-000000000101', NULL),
		onboarding_private.onboarding_step_references_match('f3100000-0000-4000-8000-000000000101', 'f3100000-0000-4000-8000-000000000701', 'f3100000-0000-4000-8000-000000000801'),
		onboarding_private.onboarding_step_references_match('f3100000-0000-4000-8000-000000000101', NULL, NULL)
	];
$$;

SET LOCAL ROLE authenticated;

SELECT is(
	pg_temp.alpha_helper_answers('f3100000-0000-4000-8000-000000000001'),
	ARRAY[true, true, true, true, true, true],
	'an active owner matches in-scope Onboarding references and NULL references'
);
SELECT is(
	pg_temp.alpha_helper_answers('f3100000-0000-4000-8000-000000000003'),
	ARRAY[false, false, false, false, false, false],
	'another Organization''s owner learns nothing about existing Onboarding references'
);

RESET ROLE;
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES
	('f3100000-0000-4000-8000-000000000002', 'f3100000-0000-4000-8000-000000000003', 'Synthetic helper suspension');
SET LOCAL ROLE authenticated;
SELECT is(
	pg_temp.alpha_helper_answers('f3100000-0000-4000-8000-000000000002'),
	ARRAY[false, false, false, false, false, false],
	'a suspended account matches no Onboarding reference in its active Organization'
);
SELECT is(
	pg_temp.alpha_helper_answers('f3100000-0000-4000-8000-000000000001'),
	ARRAY[true, true, true, true, true, true],
	'another member''s account suspension leaves the active owner admitted'
);

RESET ROLE;
UPDATE public.organizations SET suspended_at = now() WHERE id = 'f3100000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
SELECT is(
	pg_temp.alpha_helper_answers('f3100000-0000-4000-8000-000000000001'),
	ARRAY[false, false, false, false, false, false],
	'a suspended Organization''s owner matches no Onboarding reference'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
