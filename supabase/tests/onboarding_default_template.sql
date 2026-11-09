-- #2033 One default onboarding template per Organization, set only by an owner or admin.
-- Every write below runs as the ordinary `authenticated` role; setup and readback are the only privileged steps.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a2033000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.defaults(p_org text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(name ORDER BY name), ARRAY[]::text[]) FROM public.onboarding_templates
  WHERE organization_id = pg_temp.id(p_org) AND is_default;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'default-template-' || n || '@example.test', now()
FROM generate_series(1, 6) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('2'), 'SFC', 'Ada', 'Admin');
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Default Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Default Bravo', pg_temp.id('5'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'admin@example.test'),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"onboarding":"configure"}', 'organization', ARRAY[]::uuid[], 'configurator@example.test'),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"onboarding":"view"}', 'organization', ARRAY[]::uuid[], 'viewer@example.test'),
  (pg_temp.id('102'), pg_temp.id('5'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Alpha One'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Alpha Two'),
  (pg_temp.id('403'), pg_temp.id('101'), 'Alpha Three'),
  (pg_temp.id('411'), pg_temp.id('102'), 'Bravo One');

SELECT is(pg_temp.defaults('101'), ARRAY[]::text[], 'a template is not the default until an admin chooses it');

SET LOCAL ROLE authenticated;

SELECT pg_temp.act_as('1');
SELECT is(public.set_default_onboarding_template(pg_temp.id('101'), pg_temp.id('401')), pg_temp.id('401'),
  'the owner sets the default and is told which template it is');
SELECT pg_temp.act_as('2');
SELECT is(public.set_default_onboarding_template(pg_temp.id('101'), pg_temp.id('402')), pg_temp.id('402'),
  'an admin sets a different default');
SELECT is(pg_temp.defaults('101'), ARRAY['Alpha Two'], 'setting a new default clears the old one in the same call');
SELECT is(public.set_default_onboarding_template(pg_temp.id('101'), pg_temp.id('402')), pg_temp.id('402'),
  'choosing the current default again is allowed');
SELECT is(pg_temp.defaults('101'), ARRAY['Alpha Two'], 'choosing the current default again changes nothing');

-- A member who may configure templates is not an admin.
SELECT pg_temp.act_as('3');
SELECT throws_ok($$ SELECT public.set_default_onboarding_template(pg_temp.id('101'), pg_temp.id('403')) $$,
  '42501', NULL, 'a member with Onboarding configure cannot set the default through the command');
SELECT throws_ok($$ SELECT public.set_default_onboarding_template(pg_temp.id('101'), NULL) $$,
  '42501', NULL, 'a member with Onboarding configure cannot clear the default through the command');
SELECT throws_ok($$ UPDATE public.onboarding_templates SET is_default = true WHERE id = pg_temp.id('403') $$,
  '42501', NULL, 'a member with Onboarding configure cannot write is_default directly');
SELECT throws_ok($$ UPDATE public.onboarding_templates SET is_default = false WHERE id = pg_temp.id('402') $$,
  '42501', NULL, 'a member with Onboarding configure cannot clear is_default directly');
SELECT throws_ok($$ INSERT INTO public.onboarding_templates (organization_id, name, is_default)
    VALUES (pg_temp.id('101'), 'Sneaky default', true) $$,
  '42501', NULL, 'a member with Onboarding configure cannot insert a template that names itself the default');
SELECT lives_ok($$ INSERT INTO public.onboarding_templates (id, organization_id, name)
    VALUES (pg_temp.id('404'), pg_temp.id('101'), 'Configurator made') $$,
  'a member with Onboarding configure still creates a template');
SELECT lives_ok($$ UPDATE public.onboarding_templates SET name = 'Alpha Two Renamed' WHERE id = pg_temp.id('402') $$,
  'a member with Onboarding configure still renames the default template');
SELECT is(pg_temp.defaults('101'), ARRAY['Alpha Two Renamed'], 'renaming keeps the template the default');

SELECT pg_temp.act_as('4');
SELECT throws_ok($$ SELECT public.set_default_onboarding_template(pg_temp.id('101'), pg_temp.id('403')) $$,
  '42501', NULL, 'a view-only member cannot set the default');

-- Another Organization's owner, and templates of another Organization.
SELECT pg_temp.act_as('5');
SELECT throws_ok($$ SELECT public.set_default_onboarding_template(pg_temp.id('101'), pg_temp.id('403')) $$,
  '42501', NULL, 'an admin of another Organization cannot set this Organization''s default');
SELECT is(public.set_default_onboarding_template(pg_temp.id('102'), pg_temp.id('411')), pg_temp.id('411'),
  'each Organization has its own default');
SELECT is(pg_temp.defaults('102'), ARRAY['Bravo One'], 'the Bravo owner sees Bravo''s default');
SELECT pg_temp.act_as('2');
SELECT throws_ok($$ SELECT public.set_default_onboarding_template(pg_temp.id('101'), pg_temp.id('411')) $$,
  'P0002', NULL, 'a template of another Organization cannot become the default');
SELECT throws_ok($$ SELECT public.set_default_onboarding_template(pg_temp.id('101'), gen_random_uuid()) $$,
  'P0002', NULL, 'an unknown template cannot become the default');
SELECT is(pg_temp.defaults('101'), ARRAY['Alpha Two Renamed'], 'a rejected command leaves the default in place');

RESET ROLE;
SELECT is(pg_temp.defaults('102'), ARRAY['Bravo One'], 'changing Alpha''s default left Bravo''s alone');
-- The database refuses a second default no matter who writes it.
SELECT throws_ok($$ UPDATE public.onboarding_templates SET is_default = true WHERE id = pg_temp.id('403') $$,
  '23505', NULL, 'the partial unique index rejects a second default in one Organization');

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
SELECT lives_ok($$ SELECT public.duplicate_onboarding_template(pg_temp.id('101'), pg_temp.id('402'), gen_random_uuid()) $$,
  'an admin duplicates the default template');
SELECT is(pg_temp.defaults('101'), ARRAY['Alpha Two Renamed'], 'a copy of the default is not itself a default');
SELECT is(public.set_default_onboarding_template(pg_temp.id('101'), NULL), NULL::uuid, 'an admin clears the default');
SELECT is(pg_temp.defaults('101'), ARRAY[]::text[], 'no template is the default after clearing');
SELECT public.set_default_onboarding_template(pg_temp.id('101'), pg_temp.id('403'));
SELECT public.delete_onboarding_template(pg_temp.id('101'), pg_temp.id('403'));
SELECT is(pg_temp.defaults('101'), ARRAY[]::text[], 'deleting the default leaves the Organization with none');

RESET ROLE;
SELECT bag_eq(
  $$ SELECT action, user_id, record_label, details FROM public.audit_logs
     WHERE resource_type = 'onboarding_template' AND org_id = pg_temp.id('101') AND action = 'onboarding_template.updated'
       AND details ? 'change' $$,
  $$ VALUES
    ('onboarding_template.updated', pg_temp.id('1'), 'Alpha One',
      '{"change": {"isDefault": {"from": false, "to": true}}}'::jsonb),
    ('onboarding_template.updated', pg_temp.id('2'), 'Alpha One',
      '{"change": {"isDefault": {"from": true, "to": false}}}'::jsonb),
    ('onboarding_template.updated', pg_temp.id('2'), 'Alpha Two',
      '{"change": {"isDefault": {"from": false, "to": true}}}'::jsonb),
    ('onboarding_template.updated', pg_temp.id('3'), 'Alpha Two Renamed',
      '{"change": {"name": {"from": "Alpha Two", "to": "Alpha Two Renamed"}}}'::jsonb),
    ('onboarding_template.updated', pg_temp.id('2'), 'Alpha Two Renamed',
      '{"change": {"isDefault": {"from": true, "to": false}}}'::jsonb),
    ('onboarding_template.updated', pg_temp.id('2'), 'Alpha Three',
      '{"change": {"isDefault": {"from": false, "to": true}}}'::jsonb) $$,
  'every default change is audited with who made it, and choosing the current default again writes nothing');

SELECT * FROM finish();
ROLLBACK;
