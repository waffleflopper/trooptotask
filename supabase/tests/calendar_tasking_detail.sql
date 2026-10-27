-- Tasking detail reads each in-scope pick's MOS and clinic role, an operator corrects a Blocked tasking's
-- reason without unblocking it, and a Completed tasking still takes equipment returns and nothing else.
-- Every read and write below runs as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a5e0000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;

-- 1 owner, 2 Organization-wide Calendar operator, 3 Alpha-scoped Calendar operator, 4 Organization-wide viewer.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'detail-' || n || '@example.test', now()
FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Detail Org', pg_temp.id('1'));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha'),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"calendar":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"calendar":"operate"}', 'groups', ARRAY[pg_temp.id('201')]),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"calendar":"view"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, mos, clinic_role, slug) VALUES
  (pg_temp.id('501'), pg_temp.id('101'), pg_temp.id('201'), 'SSG', 'Marisol', 'Alvarez', '68W', 'NCOIC', 'detail-501'),
  (pg_temp.id('502'), pg_temp.id('101'), pg_temp.id('202'), 'SPC', 'Cal', 'Cole', '68W', '', 'detail-502');

CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.blocked() RETURNS TABLE (status text, reason text, by uuid) LANGUAGE sql AS $$
  SELECT t.status, t.block_reason, t.blocked_by FROM public.calendar_taskings AS t WHERE t.id = pg_temp.id('401');
$$;
CREATE FUNCTION pg_temp.returned(p_item text, p_returned integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE public.calendar_tasking_equipment SET returned_quantity = p_returned WHERE id = pg_temp.id(p_item);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');
INSERT INTO public.calendar_taskings(id, organization_id, title, responsible_group_id, suspense_on) VALUES
  (pg_temp.id('401'), pg_temp.id('101'), 'Organization lane', NULL, '2030-10-23'),
  (pg_temp.id('402'), pg_temp.id('101'), 'Bravo lane', pg_temp.id('202'), '2030-10-23'),
  (pg_temp.id('403'), pg_temp.id('101'), 'Alpha lane', pg_temp.id('201'), '2030-10-23');
SELECT public.save_calendar_tasking_people(pg_temp.id('101'), pg_temp.id('401'),
  ARRAY[pg_temp.id('501'), pg_temp.id('502')], '{}', false, 0);
SELECT public.save_calendar_tasking_people(pg_temp.id('101'), pg_temp.id('403'), ARRAY[pg_temp.id('501')], '{}', false, 0);

SELECT results_eq(
  $$SELECT last_name, mos, clinic_role FROM public.calendar_tasking_people(pg_temp.id('101'), pg_temp.id('401'))$$,
  $$VALUES ('Alvarez'::text, '68W'::text, 'NCOIC'::text), ('Cole', '68W', '')$$,
  'an Organization-wide reader gets every pick with MOS and clinic role'
);
SELECT pg_temp.act_as('3');
SELECT results_eq(
  $$SELECT last_name, mos, clinic_role FROM public.calendar_tasking_people(pg_temp.id('101'), pg_temp.id('403'))$$,
  $$VALUES ('Alvarez'::text, '68W'::text, 'NCOIC'::text)$$,
  'a Group-scoped reader gets their Group''s picks with MOS and clinic role'
);
SELECT is((SELECT count(*) FROM public.calendar_tasking_people(pg_temp.id('101'), pg_temp.id('401'))), 0::bigint,
  'a Group-scoped reader reads no pick of a hidden Organization-level tasking');

SELECT pg_temp.act_as('2');
SELECT ok(public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('401'), 'block', 'Bags short'), 'blocks');
SELECT pg_temp.act_as('1');
SELECT ok(public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('401'), 'block', '  Loan requested  '),
  'an operator corrects the reason while Blocked');
SELECT results_eq('SELECT * FROM pg_temp.blocked()',
  $$VALUES ('blocked'::text, 'Loan requested'::text, pg_temp.id('2'))$$,
  'the correction keeps the status and who blocked it');
SELECT results_eq(
  $$SELECT actor_id, payload FROM public.read_calendar_tasking_activity(pg_temp.id('101'), pg_temp.id('401'))
    WHERE kind = 'blocked' ORDER BY id$$,
  $$VALUES (pg_temp.id('2'), '{"reason": "Bags short"}'::jsonb),
    (pg_temp.id('1'), '{"reason": "Loan requested", "edited": true}'::jsonb)$$,
  'Activity keeps the first reason and records the correction by its author'
);
SELECT is(public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('401'), 'block', 'Loan requested'), false,
  'the same reason changes nothing');
SELECT throws_ok($$SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('401'), 'block', ' ')$$,
  '23514', NULL, 'a correction still needs a reason');

SELECT pg_temp.act_as('4');
SELECT throws_ok($$SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('401'), 'block', 'Mine')$$,
  '42501', NULL, 'a Calendar viewer cannot correct the reason');
SELECT pg_temp.act_as('2');
SELECT ok(public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('402'), 'block', 'Bravo short'), 'blocks Bravo');
SELECT pg_temp.act_as('3');
SELECT throws_ok($$SELECT public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('402'), 'block', 'Hidden')$$,
  'P0002', NULL, 'an Alpha-scoped operator cannot reach a Bravo tasking');
SELECT pg_temp.act_as('2');
SELECT is((SELECT block_reason FROM public.calendar_taskings WHERE id = pg_temp.id('402')), 'Bravo short',
  'the hidden reason is unchanged');

INSERT INTO public.calendar_tasking_equipment (id, organization_id, tasking_id, name, quantity, secured_quantity) VALUES
  (pg_temp.id('601'), pg_temp.id('101'), pg_temp.id('403'), 'Aid bags', 2, 2),
  (pg_temp.id('602'), pg_temp.id('101'), pg_temp.id('402'), 'Litters', 2, 2),
  (pg_temp.id('603'), pg_temp.id('101'), pg_temp.id('401'), 'Radios', 2, 2);
SELECT ok(public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('403'), 'complete', NULL), 'completes Alpha');
SELECT ok(public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('402'), 'complete', NULL), 'completes Bravo');
SELECT ok(public.transition_calendar_tasking(pg_temp.id('101'), pg_temp.id('401'), 'cancel', NULL), 'cancels');

SELECT pg_temp.act_as('3');
SELECT is(pg_temp.returned('601', 1), 1, 'a Group operator records a return on their completed tasking');
SELECT results_eq(
  $$SELECT actor_id, payload FROM public.read_calendar_tasking_activity(pg_temp.id('101'), pg_temp.id('403'))
    WHERE kind = 'equipment_returned'$$,
  $$VALUES (pg_temp.id('3'), '{"name": "Aid bags", "quantity": 2, "from": 0, "to": 1}'::jsonb)$$,
  'Activity records the return by its author'
);
SELECT throws_ok($$UPDATE public.calendar_tasking_equipment SET secured_quantity = 1 WHERE id = pg_temp.id('601')$$,
  '55000', NULL, 'anything but a return stays closed on a completed tasking');
SELECT is(pg_temp.returned('602', 1), 0, 'a Group operator cannot record a return on a hidden Group''s tasking');
SELECT pg_temp.act_as('4');
SELECT is(pg_temp.returned('601', 2), 0, 'a Calendar viewer cannot record a return');
SELECT pg_temp.act_as('2');
SELECT is(pg_temp.returned('603', 1), 0, 'a cancelled tasking takes no return');
SELECT results_eq(
  $$SELECT returned_quantity FROM public.calendar_tasking_equipment ORDER BY id$$,
  $$VALUES (1), (0), (0)$$,
  'only the permitted return is stored'
);

SELECT * FROM finish();
ROLLBACK;
