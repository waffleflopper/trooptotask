-- Returned equipment never exceeds what was secured. Lowering what is secured on a reopened Tasking trims
-- the returns it can no longer hold. Every write below runs as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e9e10000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.move(p_action text) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('401'), p_action, NULL);
$$;
CREATE FUNCTION pg_temp.item(p_id text) RETURNS TABLE (secured integer, returned integer) LANGUAGE sql AS $$
  SELECT secured_quantity, returned_quantity FROM public.calendar_tasking_equipment WHERE id = pg_temp.id(p_id);
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'equipment-returns-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Returns Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
INSERT INTO public.calendar_taskings (id, organization_id, title, suspense_on)
VALUES (pg_temp.id('401'), pg_temp.id('101'), 'Return the litters', '2030-10-23');
INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity, secured_quantity) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('401'), 'Litters', 5, 2),
  (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('401'), 'Tents', 3, 0);
SELECT is(pg_temp.move('complete'), true, 'the Tasking is completed');

SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET returned_quantity = 3 WHERE id = pg_temp.id('501')$$,
  '23514', NULL, 'a return above the secured count is refused, though the quantity is higher');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET returned_quantity = 1 WHERE id = pg_temp.id('502')$$,
  '23514', NULL, 'an item with nothing secured takes no return');
SELECT results_eq($$SELECT * FROM pg_temp.item('501')$$, $$VALUES (2, 0)$$, 'a refused return stores nothing');
SELECT lives_ok($$UPDATE public.calendar_tasking_equipment SET returned_quantity = 2 WHERE id = pg_temp.id('501')$$,
  'everything secured can come back');
SELECT results_eq($$SELECT * FROM pg_temp.item('501')$$, $$VALUES (2, 2)$$, 'the return is stored');

SELECT is(pg_temp.move('reopen'), true, 'the Tasking is reopened');
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET secured_quantity = 1, returned_quantity = 3
  WHERE id = pg_temp.id('501')$$, '23514', NULL, 'a return named above the new secured count in the same write is still refused');
SELECT lives_ok($$UPDATE public.calendar_tasking_equipment SET secured_quantity = 1 WHERE id = pg_temp.id('501')$$,
  'lowering what is secured below the returned count is not refused');
SELECT results_eq($$SELECT * FROM pg_temp.item('501')$$, $$VALUES (1, 1)$$, 'the returned count is trimmed to the secured count');
SELECT results_eq(
  $$SELECT actor_id, payload FROM public.read_calendar_tasking_activity(pg_temp.id('101'))
    WHERE kind = 'equipment_returned' ORDER BY id$$,
  $$VALUES (pg_temp.id('2'), '{"name":"Litters","quantity":5,"securedQuantity":2,"from":0,"to":2}'::jsonb),
    (pg_temp.id('2'), '{"name":"Litters","quantity":5,"securedQuantity":1,"from":2,"to":1}'::jsonb)$$,
  'the trim is recorded as a return change by the member who lowered the count');
SELECT lives_ok($$UPDATE public.calendar_tasking_equipment SET secured_quantity = 4 WHERE id = pg_temp.id('501')$$,
  'securing more is accepted');
SELECT results_eq($$SELECT * FROM pg_temp.item('501')$$, $$VALUES (4, 1)$$, 'securing more leaves the returned count alone');
SELECT lives_ok($$UPDATE public.calendar_tasking_equipment SET secured_quantity = 0 WHERE id = pg_temp.id('501')$$,
  'securing nothing is accepted');
SELECT results_eq($$SELECT * FROM pg_temp.item('501')$$, $$VALUES (0, 0)$$, 'nothing secured leaves nothing returned');

SELECT * FROM finish();
ROLLBACK;
