BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a51a000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

INSERT INTO auth.users (id, email) VALUES (pg_temp.id(1), 'legacy-group-names@example.test');
INSERT INTO public.organizations (id, name, created_by)
VALUES (pg_temp.id(101), 'Legacy Group names', pg_temp.id(1));
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind)
VALUES (pg_temp.id(101), pg_temp.id(1), 'member', 'viewer', '{"personnel":"configure"}', 'organization');
INSERT INTO public.groups (id, organization_id, name, sort_order) VALUES
  (pg_temp.id(201), pg_temp.id(101), 'Parent', 0),
  (pg_temp.id(202), pg_temp.id(101), 'Legacy HQ', 1),
  (pg_temp.id(203), pg_temp.id(101), 'Legacy Ward', 2);

-- These names could exist before the tree migration reserved its path separator.
ALTER TABLE public.groups DISABLE TRIGGER groups_set_path;
UPDATE public.groups SET name = 'HQ / Supply' WHERE id = pg_temp.id(202);
UPDATE public.groups SET name = 'Ward / Desk' WHERE id = pg_temp.id(203);
ALTER TABLE public.groups ENABLE TRIGGER groups_set_path;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
SELECT is(current_user::text, 'authenticated', 'legacy compatibility uses an ordinary signed-in role');
SELECT lives_ok($$SELECT public.set_group_order(pg_temp.id(101),
  ARRAY[pg_temp.id(203), pg_temp.id(202), pg_temp.id(201)],
  ARRAY[pg_temp.id(201), pg_temp.id(202), pg_temp.id(203)])$$,
  'a flat Organization can reorder legacy names');
SELECT results_eq($$SELECT id, name, sort_order FROM public.groups ORDER BY sort_order$$,
  $$VALUES (pg_temp.id(203), 'Ward / Desk'::text, 0), (pg_temp.id(202), 'HQ / Supply'::text, 1),
    (pg_temp.id(201), 'Parent'::text, 2)$$,
  'reordering retains the legacy names and writes the requested positions');
SELECT lives_ok($$UPDATE public.groups SET parent_id = pg_temp.id(202) WHERE id = pg_temp.id(203)$$,
  'a legacy name can move under another Group');
SELECT lives_ok($$UPDATE public.groups SET parent_id = pg_temp.id(201) WHERE id = pg_temp.id(202)$$,
  'a parent move cascades through a legacy name');
SELECT results_eq($$SELECT id, name, path FROM public.groups WHERE id IN (pg_temp.id(202), pg_temp.id(203)) ORDER BY id$$,
  $$VALUES (pg_temp.id(202), 'HQ / Supply'::text, ARRAY[pg_temp.id(201), pg_temp.id(202)]),
    (pg_temp.id(203), 'Ward / Desk'::text, ARRAY[pg_temp.id(201), pg_temp.id(202), pg_temp.id(203)])$$,
  'moving retains legacy identities and names with the new ancestor paths');
SELECT lives_ok($$SELECT public.rename_group(pg_temp.id(101), pg_temp.id(202), 'HQ / Supply')$$,
  'saving an unchanged legacy name remains valid');

SELECT * FROM finish();
ROLLBACK;
