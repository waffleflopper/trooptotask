-- 05-01-02-R01: independent Onboarding configuration, shared reads and tenant references.
-- Exercise the authenticated SQL boundary; helpers below remain SECURITY INVOKER.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email)
SELECT ('a4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'onboarding-rls-' || n || '@example.test'
FROM generate_series(1, 10) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
('a4000000-0000-4000-8000-000000000101', 'Onboarding Alpha', 'a4000000-0000-4000-8000-000000000001'),
('a4000000-0000-4000-8000-000000000102', 'Onboarding Bravo', 'a4000000-0000-4000-8000-000000000008');
INSERT INTO public.groups (id, organization_id, name) VALUES
('a4000000-0000-4000-8000-000000000201', 'a4000000-0000-4000-8000-000000000101', 'Scoped Group');
INSERT INTO public.organization_memberships (
    organization_id, user_id, role, member_preset, capability_overrides,
    access_scope_kind, access_scope_group_ids
)
SELECT 'a4000000-0000-4000-8000-000000000101'::uuid,
       ('a4000000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
       actor_role::public.organization_role, 'viewer', overrides::jsonb,
       scope_kind,
       CASE WHEN scope_kind = 'groups'
         THEN ARRAY['a4000000-0000-4000-8000-000000000201']::uuid[]
         ELSE ARRAY[]::uuid[] END
FROM (VALUES
(1, 'owner', '{"onboarding":"none","personnel":"none","calendar":"none"}', 'organization'),
(2, 'admin', '{"onboarding":"none","personnel":"none","calendar":"none"}', 'organization'),
(3, 'member', '{"onboarding":"configure","personnel":"none","calendar":"none","training":"none"}', 'organization'),
(4, 'member', '{"onboarding":"view","personnel":"none","calendar":"none"}', 'organization'),
(5, 'member', '{"onboarding":"operate","personnel":"none","calendar":"none"}', 'organization'),
(6, 'member', '{"onboarding":"none","personnel":"configure","calendar":"none"}', 'organization'),
(7, 'member', '{"onboarding":"configure","personnel":"none","calendar":"none"}', 'groups'),
(10, 'member', '{"onboarding":"configure","personnel":"none","calendar":"none","training":"none"}', 'organization')
) AS actors(actor, actor_role, overrides, scope_kind);
INSERT INTO public.organization_memberships (
    organization_id, user_id, role, member_preset, capability_overrides,
    access_scope_kind, access_scope_group_ids
) VALUES
('a4000000-0000-4000-8000-000000000102', 'a4000000-0000-4000-8000-000000000008', 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
('a4000000-0000-4000-8000-000000000102', 'a4000000-0000-4000-8000-000000000010', 'member', 'viewer', '{"onboarding":"configure","personnel":"none","calendar":"none","training":"none"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.onboarding_templates (id, organization_id, name) VALUES
('a4000000-0000-4000-8000-000000000301', 'a4000000-0000-4000-8000-000000000101', 'Shared Alpha Packet'),
('a4000000-0000-4000-8000-000000000302', 'a4000000-0000-4000-8000-000000000102', 'Shared Bravo Packet');
INSERT INTO public.training_types (id, organization_id, name) VALUES
('a4000000-0000-4000-8000-000000000501', 'a4000000-0000-4000-8000-000000000101', 'Alpha Training'),
('a4000000-0000-4000-8000-000000000502', 'a4000000-0000-4000-8000-000000000102', 'Bravo Training');
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type) VALUES
('a4000000-0000-4000-8000-000000000401', 'a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000301', 'Alpha Step', 'checkbox'),
('a4000000-0000-4000-8000-000000000402', 'a4000000-0000-4000-8000-000000000102', 'a4000000-0000-4000-8000-000000000302', 'Bravo Step', 'checkbox');

CREATE FUNCTION pg_temp.allowed_crud(actor_label text) RETURNS SETOF text
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE affected integer;
BEGIN
    RETURN NEXT lives_ok($sql$
      INSERT INTO public.onboarding_templates (id, organization_id, name)
      VALUES ('a4000000-0000-4000-8000-000000000303', 'a4000000-0000-4000-8000-000000000101', 'Created Packet')
    $sql$, actor_label || ': create template');
    RETURN NEXT is((SELECT name FROM public.onboarding_templates WHERE id = 'a4000000-0000-4000-8000-000000000303'), 'Created Packet', actor_label || ': read created template');
    RETURN NEXT lives_ok($sql$
      INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type, training_type_id)
      VALUES ('a4000000-0000-4000-8000-000000000403', 'a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000303', 'Created Step', 'training', 'a4000000-0000-4000-8000-000000000501')
    $sql$, actor_label || ': create same-tenant Training step without another feature prerequisite');
    RETURN NEXT is((SELECT name FROM public.onboarding_template_steps WHERE id = 'a4000000-0000-4000-8000-000000000403'), 'Created Step', actor_label || ': read created step');
    UPDATE public.onboarding_templates SET name = 'Updated Packet', description = 'Updated description' WHERE id = 'a4000000-0000-4000-8000-000000000303';
    RETURN NEXT is((SELECT name FROM public.onboarding_templates WHERE id = 'a4000000-0000-4000-8000-000000000303'), 'Updated Packet', actor_label || ': update template');
    RETURN NEXT is((SELECT description FROM public.onboarding_templates WHERE id = 'a4000000-0000-4000-8000-000000000303'), 'Updated description', actor_label || ': update template description');
    UPDATE public.onboarding_template_steps SET name = 'Updated Step' WHERE id = 'a4000000-0000-4000-8000-000000000403';
    RETURN NEXT is((SELECT name FROM public.onboarding_template_steps WHERE id = 'a4000000-0000-4000-8000-000000000403'), 'Updated Step', actor_label || ': update step');
    DELETE FROM public.onboarding_template_steps WHERE id = 'a4000000-0000-4000-8000-000000000403';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN NEXT is(affected, 1, actor_label || ': delete step');
    DELETE FROM public.onboarding_templates WHERE id = 'a4000000-0000-4000-8000-000000000303';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN NEXT is(affected, 1, actor_label || ': delete template');
END;
$fn$;

CREATE FUNCTION pg_temp.denied_mutations(actor_label text) RETURNS SETOF text
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE affected integer;
BEGIN
    RETURN NEXT throws_ok($sql$
      INSERT INTO public.onboarding_templates (organization_id, name)
      VALUES ('a4000000-0000-4000-8000-000000000101', 'Forbidden Packet')
    $sql$, '42501', 'new row violates row-level security policy for table "onboarding_templates"', actor_label || ': cannot create template');
    RETURN NEXT throws_ok($sql$
      INSERT INTO public.onboarding_template_steps (organization_id, template_id, name, step_type)
      VALUES ('a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000301', 'Forbidden Step', 'checkbox')
    $sql$, '42501', 'new row violates row-level security policy for table "onboarding_template_steps"', actor_label || ': cannot create step');
    UPDATE public.onboarding_templates SET description = 'Forbidden edit' WHERE id = 'a4000000-0000-4000-8000-000000000301';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN NEXT is(affected, 0, actor_label || ': cannot update template');
    UPDATE public.onboarding_template_steps SET description = 'Forbidden edit' WHERE id = 'a4000000-0000-4000-8000-000000000401';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN NEXT is(affected, 0, actor_label || ': cannot update step');
    DELETE FROM public.onboarding_template_steps WHERE id = 'a4000000-0000-4000-8000-000000000401';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN NEXT is(affected, 0, actor_label || ': cannot delete step');
    DELETE FROM public.onboarding_templates WHERE id = 'a4000000-0000-4000-8000-000000000301';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN NEXT is(affected, 0, actor_label || ': cannot delete template');
END;
$fn$;

CREATE FUNCTION pg_temp.alpha_reads(actor_label text, expected_count integer) RETURNS SETOF text
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
BEGIN
    RETURN NEXT is((SELECT count(*)::integer FROM public.onboarding_templates WHERE organization_id = 'a4000000-0000-4000-8000-000000000101'), expected_count, actor_label || ': template visibility');
    RETURN NEXT is((SELECT count(*)::integer FROM public.onboarding_template_steps WHERE organization_id = 'a4000000-0000-4000-8000-000000000101'), expected_count, actor_label || ': step visibility');
END;
$fn$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
SELECT * FROM pg_temp.allowed_crud('Owner');
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
SELECT * FROM pg_temp.allowed_crud('Admin');
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
SELECT * FROM pg_temp.allowed_crud('Organization Onboarding configurator with Personnel/Calendar/Training none');
SELECT is((SELECT count(*)::integer FROM public.onboarding_templates WHERE organization_id = 'a4000000-0000-4000-8000-000000000102'), 0, 'configurator cannot read foreign templates');
SELECT is((SELECT count(*)::integer FROM public.onboarding_template_steps WHERE organization_id = 'a4000000-0000-4000-8000-000000000102'), 0, 'configurator cannot read foreign steps');
SELECT throws_ok($$
  UPDATE public.onboarding_templates SET organization_id = 'a4000000-0000-4000-8000-000000000102'
  WHERE id = 'a4000000-0000-4000-8000-000000000301'
$$, '42501', NULL, 'configurator cannot move a template into an unauthorized Organization');
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true);
SELECT * FROM pg_temp.alpha_reads('Onboarding viewer', 1);
SELECT * FROM pg_temp.denied_mutations('Onboarding viewer');
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000005', true);
SELECT * FROM pg_temp.alpha_reads('Onboarding operator', 1);
SELECT * FROM pg_temp.denied_mutations('Onboarding operator');
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000006', true);
SELECT * FROM pg_temp.alpha_reads('Personnel configurator with Onboarding none', 0);
SELECT * FROM pg_temp.denied_mutations('Personnel configurator with Onboarding none');
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000007', true);
SELECT * FROM pg_temp.alpha_reads('Group-scoped Onboarding configurator', 1);
SELECT * FROM pg_temp.denied_mutations('Group-scoped Onboarding configurator');
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000008', true);
SELECT * FROM pg_temp.alpha_reads('Foreign owner', 0);
SELECT * FROM pg_temp.denied_mutations('Foreign owner');
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000009', true);
SELECT * FROM pg_temp.alpha_reads('Nonmember', 0);
SELECT * FROM pg_temp.denied_mutations('Nonmember');

-- Both tenants are authorized: visibility alone cannot validate a reference.
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000010', true);
-- No child FK can conceal an ownership-check bypass on this template.
INSERT INTO public.onboarding_templates (id, organization_id, name)
VALUES ('a4000000-0000-4000-8000-000000000304', 'a4000000-0000-4000-8000-000000000101', 'Unreferenced Packet');
SELECT throws_ok($$
  UPDATE public.onboarding_templates SET organization_id = 'a4000000-0000-4000-8000-000000000102'
  WHERE id = 'a4000000-0000-4000-8000-000000000304'
$$, '42501', NULL, 'dual-org configurator cannot move even an unreferenced template');
SELECT throws_ok($$
  UPDATE public.onboarding_templates
  SET id = 'a4000000-0000-4000-8000-000000000305', organization_id = 'a4000000-0000-4000-8000-000000000102'
  WHERE id = 'a4000000-0000-4000-8000-000000000304'
$$, '42501', NULL, 'changing template identity cannot bypass fixed Organization ownership');
SELECT is(
  (SELECT organization_id FROM public.onboarding_templates WHERE id = 'a4000000-0000-4000-8000-000000000304'),
  'a4000000-0000-4000-8000-000000000101'::uuid,
  'denied ownership changes preserve the original template identity and Organization'
);
DELETE FROM public.onboarding_templates WHERE id = 'a4000000-0000-4000-8000-000000000304';
SELECT throws_ok($$
  UPDATE public.onboarding_templates SET organization_id = 'a4000000-0000-4000-8000-000000000102'
  WHERE id = 'a4000000-0000-4000-8000-000000000301'
$$, '42501', NULL, 'dual-org configurator cannot move a template away from its existing steps');
SELECT throws_ok($$
  INSERT INTO public.onboarding_template_steps (organization_id, template_id, name, step_type)
  VALUES ('a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000302', 'Forged Template', 'checkbox')
$$, '42501', NULL, 'dual-org configurator cannot insert a step against another tenant template');
SELECT throws_ok($$
  UPDATE public.onboarding_template_steps SET template_id = 'a4000000-0000-4000-8000-000000000302'
  WHERE id = 'a4000000-0000-4000-8000-000000000401'
$$, '42501', NULL, 'dual-org configurator cannot reparent a step to another tenant template');
SELECT throws_ok($$
  UPDATE public.onboarding_template_steps SET organization_id = 'a4000000-0000-4000-8000-000000000102'
  WHERE id = 'a4000000-0000-4000-8000-000000000401'
$$, '42501', NULL, 'dual-org configurator cannot move a step away from its template tenant');
SELECT throws_ok($$
  INSERT INTO public.onboarding_template_steps (organization_id, template_id, name, step_type, training_type_id)
  VALUES ('a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000301', 'Forged Training', 'training', 'a4000000-0000-4000-8000-000000000502')
$$, '42501', NULL, 'dual-org configurator cannot insert a foreign Training Type association');
SELECT throws_ok($$
  UPDATE public.onboarding_template_steps SET step_type = 'training', training_type_id = 'a4000000-0000-4000-8000-000000000502'
  WHERE id = 'a4000000-0000-4000-8000-000000000401'
$$, '42501', NULL, 'dual-org configurator cannot update to a foreign Training Type association');

-- A genuine demotion must take effect for an actor who just configured templates.
RESET ROLE;
UPDATE public.organization_memberships SET capability_overrides = '{"onboarding":"none","personnel":"none","calendar":"none"}'
WHERE organization_id = 'a4000000-0000-4000-8000-000000000101' AND user_id = 'a4000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
SELECT * FROM pg_temp.alpha_reads('Demoted configurator', 0);
SELECT * FROM pg_temp.denied_mutations('Demoted configurator');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
SELECT * FROM pg_temp.alpha_reads('Anonymous', 0);
SELECT * FROM pg_temp.denied_mutations('Anonymous');
RESET ROLE;
-- A dual-Organization configurator must not transfer an existing step's identity.
-- Include a real progress reference: its single-column FK cannot enforce tenancy.
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES ('a4000000-0000-4000-8000-000000000601', 'a4000000-0000-4000-8000-000000000101', 'SPC', 'Synthetic', 'Arrival', 'arrival-synthetic');
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id)
VALUES ('a4000000-0000-4000-8000-000000000701', 'a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000601', 'a4000000-0000-4000-8000-000000000301');
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, template_step_id, step_name, step_type)
VALUES ('a4000000-0000-4000-8000-000000000801', 'a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000701', 'a4000000-0000-4000-8000-000000000401', 'Alpha Step', 'checkbox');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000010', true);
INSERT INTO public.onboarding_templates (id, organization_id, name)
VALUES ('a4000000-0000-4000-8000-000000000304', 'a4000000-0000-4000-8000-000000000101', 'Another Alpha Packet');
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, step_type) VALUES
('a4000000-0000-4000-8000-000000000404', 'a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000301', 'Editable Alpha Step', 'checkbox'),
('a4000000-0000-4000-8000-000000000405', 'a4000000-0000-4000-8000-000000000101', 'a4000000-0000-4000-8000-000000000301', 'Fixed Identity', 'checkbox');
UPDATE public.onboarding_template_steps
SET template_id = 'a4000000-0000-4000-8000-000000000304', name = 'Updated Alpha Step',
    description = 'Retained edit', step_type = 'paperwork', training_type_id = NULL,
    stages = '["issued", "filed"]', sort_order = 3
WHERE id = 'a4000000-0000-4000-8000-000000000404';
SELECT is(
  (SELECT jsonb_build_array(template_id, name, description, step_type, training_type_id, stages, sort_order)
   FROM public.onboarding_template_steps WHERE id = 'a4000000-0000-4000-8000-000000000404'),
  '["a4000000-0000-4000-8000-000000000304", "Updated Alpha Step", "Retained edit", "paperwork", null, ["issued", "filed"], 3]'::jsonb,
  'ordinary edits, reordering and same-Organization template reassignment remain allowed'
);
UPDATE public.onboarding_template_steps
SET step_type = 'training', training_type_id = 'a4000000-0000-4000-8000-000000000501', stages = NULL
WHERE id = 'a4000000-0000-4000-8000-000000000404';
SELECT is(
  (SELECT training_type_id FROM public.onboarding_template_steps WHERE id = 'a4000000-0000-4000-8000-000000000404'),
  'a4000000-0000-4000-8000-000000000501'::uuid,
  'configurator can edit a same-Organization Training association without Training access'
);
SELECT throws_ok($$
  UPDATE public.onboarding_template_steps
  SET organization_id = 'a4000000-0000-4000-8000-000000000102',
      template_id = 'a4000000-0000-4000-8000-000000000302', training_type_id = NULL
  WHERE id = 'a4000000-0000-4000-8000-000000000404'
$$, '42501', NULL, 'changing both ownership fields cannot transfer an unreferenced step');
SELECT throws_ok($$
  UPDATE public.onboarding_template_steps SET id = 'a4000000-0000-4000-8000-000000000406'
  WHERE id = 'a4000000-0000-4000-8000-000000000405'
$$, '42501', NULL, 'authenticated callers cannot replace an unreferenced step identity');
SELECT throws_ok($$
  UPDATE public.onboarding_template_steps
  SET organization_id = 'a4000000-0000-4000-8000-000000000102',
      template_id = 'a4000000-0000-4000-8000-000000000302'
  WHERE id = 'a4000000-0000-4000-8000-000000000401'
$$, '42501', NULL, 'changing both ownership fields cannot transfer a step referenced by active progress');
RESET ROLE;
SELECT is(
  (SELECT jsonb_build_array(s.organization_id, s.template_id, p.organization_id, p.template_step_id)
   FROM public.onboarding_template_steps s JOIN public.onboarding_step_progress p ON p.template_step_id = s.id
   WHERE p.id = 'a4000000-0000-4000-8000-000000000801'),
  '["a4000000-0000-4000-8000-000000000101", "a4000000-0000-4000-8000-000000000301", "a4000000-0000-4000-8000-000000000101", "a4000000-0000-4000-8000-000000000401"]'::jsonb,
  'denied transfer preserves the step and its existing progress association in Alpha'
);
SELECT * FROM finish();
ROLLBACK;
