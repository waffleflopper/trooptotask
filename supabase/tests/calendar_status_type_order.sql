BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('c1684055-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', CASE WHEN actor IS NULL THEN '' ELSE pg_temp.id(actor)::text END, true);
END; $$;
CREATE FUNCTION pg_temp.order_sql(type_ids integer[], expected_ids integer[], org integer DEFAULT 101) RETURNS text
LANGUAGE sql AS $$
  SELECT format('SELECT public.set_status_type_order(%L, %L::uuid[], %L::uuid[])', pg_temp.id(org),
    (SELECT coalesce(array_agg(pg_temp.id(n) ORDER BY i), '{}') FROM unnest(type_ids) WITH ORDINALITY AS t(n, i)),
    (SELECT coalesce(array_agg(pg_temp.id(n) ORDER BY i), '{}') FROM unnest(expected_ids) WITH ORDINALITY AS e(n, i)));
$$;
CREATE FUNCTION pg_temp.statuses(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(name ORDER BY sort_order, id), '[]') FROM public.status_types
  WHERE organization_id = pg_temp.id(org);
$$;
CREATE FUNCTION pg_temp.rows(org integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.status_types t
  WHERE t.organization_id = pg_temp.id(org);
$$;
CREATE TEMP TABLE snapshots(label text PRIMARY KEY, value jsonb);
GRANT ALL ON snapshots TO authenticated;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'status-order-' || n || '@example.test' FROM generate_series(1, 7) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
(pg_temp.id(101), 'Status Alpha', pg_temp.id(1)),
(pg_temp.id(102), 'Status Bravo', pg_temp.id(6));
INSERT INTO public.groups (id, organization_id, name) VALUES (pg_temp.id(201), pg_temp.id(101), 'Scoped Group');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT org, pg_temp.id(actor), 'member'::public.organization_role, 'viewer',
  jsonb_build_object('calendar', capability, 'personnel', 'none', 'training', 'none', 'onboarding', 'none'),
  scope_kind, CASE WHEN scope_kind = 'groups' THEN ARRAY[pg_temp.id(201)] ELSE ARRAY[]::uuid[] END
FROM (VALUES
  (pg_temp.id(101), 1, 'configure', 'organization'),
  (pg_temp.id(101), 2, 'view', 'organization'),
  (pg_temp.id(101), 3, 'operate', 'organization'),
  (pg_temp.id(101), 4, 'configure', 'groups'),
  (pg_temp.id(102), 6, 'configure', 'organization'),
  (pg_temp.id(101), 7, 'configure', 'organization')
) AS actors(org, actor, capability, scope_kind);
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES (pg_temp.id(7), pg_temp.id(1), 'synthetic');
-- Leave and School share sort_order 0, so the saved order breaks the tie by id.
INSERT INTO public.status_types (id, organization_id, name, sort_order) VALUES
(pg_temp.id(401), pg_temp.id(101), 'Leave', 0),
(pg_temp.id(402), pg_temp.id(101), 'School', 0),
(pg_temp.id(403), pg_temp.id(101), 'Sick', 5),
(pg_temp.id(404), pg_temp.id(101), 'Appointment', 9),
(pg_temp.id(411), pg_temp.id(102), 'Bravo Leave', 0),
(pg_temp.id(412), pg_temp.id(102), 'Bravo Sick', 1);

SELECT ok(NOT has_function_privilege('anon', 'public.set_status_type_order(uuid, uuid[], uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.set_status_type_order(uuid, uuid[], uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.set_status_type_order(uuid, uuid[], uuid[])', 'EXECUTE'),
  'only authenticated can execute the status order command');
SELECT is((SELECT prosecdef FROM pg_proc WHERE proname = 'set_status_type_order' AND pronamespace = 'public'::regnamespace),
  false, 'the status order command runs as the invoker');

SELECT throws_ok(format($$UPDATE public.status_types SET short_label = %L WHERE id = %L$$, label, pg_temp.id(401)),
  '23514', NULL, description)
FROM (VALUES ('', 'a blank one-day label is rejected'), ('ABCD', 'a four-letter one-day label is rejected'))
  AS invalid(label, description);
SELECT lives_ok(format($$UPDATE public.status_types SET short_label = %L WHERE id = %L$$, label, pg_temp.id(401)), description)
FROM (VALUES ('SK', 'a two-letter label is stored'), ('ÄÖÜ', 'three non-ASCII code points fit'),
  (NULL, 'no label is stored as NULL')) AS valid(label, description);
SELECT is((SELECT short_label FROM public.status_types WHERE id = pg_temp.id(401)), NULL, 'the label was cleared');

CREATE FUNCTION pg_temp.denied(actor integer, label text) RETURNS SETOF text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.act(actor);
  RETURN NEXT throws_ok(pg_temp.order_sql(ARRAY[404, 403, 402, 401], ARRAY[401, 402, 403, 404]),
    '42501', 'Calendar configuration is not allowed', label || ' cannot order status types');
END; $$;
INSERT INTO snapshots VALUES ('before-denials', jsonb_build_object('a', pg_temp.rows(101), 'b', pg_temp.rows(102)));
SELECT pg_temp.denied(actor, label)
FROM (VALUES
  (NULL::integer, 'no signed-in user'),
  (2, 'a Calendar viewer'),
  (3, 'a Calendar operator'),
  (4, 'a Group-scoped configurator'),
  (5, 'a non-member'),
  (6, 'a foreign Organization configurator'),
  (7, 'a suspended user')
) AS denied(actor, label);
RESET ROLE;
UPDATE public.organizations SET suspended_at = now() WHERE id = pg_temp.id(101);
SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.order_sql(ARRAY[404, 403, 402, 401], ARRAY[401, 402, 403, 404]),
  '42501', 'Calendar configuration is not allowed', 'a configurator of a suspended Organization cannot order status types');
SELECT throws_ok(pg_temp.order_sql(ARRAY[412, 411], ARRAY[411, 412], 102),
  '42501', 'Calendar configuration is not allowed', 'an Alpha configurator cannot order Bravo status types');
RESET ROLE;
UPDATE public.organizations SET suspended_at = NULL WHERE id = pg_temp.id(101);
SELECT is(jsonb_build_object('a', pg_temp.rows(101), 'b', pg_temp.rows(102)),
  (SELECT value FROM snapshots WHERE label = 'before-denials'), 'denied calls change no status type in either Organization');

SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.order_sql(ARRAY[403, 401, 404, 402], ARRAY[401, 402, 403, 404]),
  'a configurator orders every status type');
RESET ROLE;
SELECT is(pg_temp.statuses(101), '["Sick", "Leave", "Appointment", "School"]', 'the status types follow the chosen order');
SELECT is((SELECT jsonb_agg(sort_order ORDER BY sort_order) FROM public.status_types WHERE organization_id = pg_temp.id(101)),
  '[0, 1, 2, 3]', 'the saved positions are dense');
SELECT is(pg_temp.statuses(102), '["Bravo Leave", "Bravo Sick"]', 'the Bravo order is untouched');

CREATE TEMP TABLE type_writes(id uuid);
GRANT ALL ON type_writes TO authenticated;
CREATE FUNCTION pg_temp.record_type_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO type_writes VALUES (NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER record_type_write AFTER UPDATE ON public.status_types
  FOR EACH ROW EXECUTE FUNCTION pg_temp.record_type_write();
SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.order_sql(ARRAY[403, 401, 404, 402], ARRAY[401, 402, 403, 404]),
  'a replay after a lost reply succeeds although its expected order is stale');
SELECT is(pg_temp.statuses(101), '["Sick", "Leave", "Appointment", "School"]',
  'the recovery read under the actor''s row security returns the saved order');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM type_writes), 0, 'the replay writes no row');
SELECT pg_temp.act(1);
SELECT lives_ok(pg_temp.order_sql(ARRAY[403, 404, 401, 402], ARRAY[403, 401, 404, 402]), 'moving one type down');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM type_writes), 2, 'only the two types whose position changed are written');
DROP TRIGGER record_type_write ON public.status_types;

INSERT INTO snapshots VALUES ('before-stale', pg_temp.rows(101));
SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.order_sql(ARRAY[402, 401, 403, 404], ARRAY[403, 401, 404, 402]), 'STO01', 'Status type order changed',
  'a different order from a stale view is a conflict');
RESET ROLE;
SELECT is(pg_temp.rows(101), (SELECT value FROM snapshots WHERE label = 'before-stale'), 'a conflict changes no type');

SELECT pg_temp.act(1);
INSERT INTO public.status_types (id, organization_id, name, sort_order) VALUES (pg_temp.id(405), pg_temp.id(101), 'Quarters', 4);
SELECT throws_ok(pg_temp.order_sql(ARRAY[401, 402, 403, 404], ARRAY[403, 404, 401, 402]), 'STO01', 'Status type order changed',
  'an order read before another type was created is a conflict');
SELECT is(pg_temp.statuses(101), '["Sick", "Appointment", "Leave", "School", "Quarters"]',
  'the new type stays at the end and nothing else moved');
DELETE FROM public.status_types WHERE id = pg_temp.id(404);
SELECT throws_ok(pg_temp.order_sql(ARRAY[405, 401, 402, 403], ARRAY[403, 404, 401, 402, 405]), 'STO01', 'Status type order changed',
  'an order read before a type was deleted is a conflict');
SELECT lives_ok(pg_temp.order_sql(ARRAY[405, 401, 402, 403], ARRAY[403, 401, 402, 405]),
  'an order read after the create and delete saves');
RESET ROLE;
SELECT is(pg_temp.statuses(101), '["Quarters", "Leave", "School", "Sick"]', 'the current types follow the new order');

INSERT INTO snapshots VALUES ('before-invalid', pg_temp.rows(101));
SELECT pg_temp.act(1);
SELECT throws_ok(format('SELECT public.set_status_type_order(%L, %s, %s)', pg_temp.id(101), ordered, expected),
  '22023', 'Choose every status type once', label)
FROM (VALUES
  ('NULL', format('ARRAY[%L]::uuid[]', pg_temp.id(405)), 'a missing order is rejected'),
  (format('ARRAY[%L]::uuid[]', pg_temp.id(405)), 'NULL', 'a missing expected order is rejected'),
  (format('ARRAY[[%L],[%L]]::uuid[]', pg_temp.id(405), pg_temp.id(401)), 'ARRAY[]::uuid[]', 'a two-dimensional order is rejected'),
  (format('ARRAY[%L]::uuid[]', pg_temp.id(405)), format('ARRAY[[%L],[%L]]::uuid[]', pg_temp.id(405), pg_temp.id(401)),
    'a two-dimensional expected order is rejected'),
  (format('ARRAY[%L, NULL]::uuid[]', pg_temp.id(405)), 'ARRAY[]::uuid[]', 'a null type is rejected'),
  (format('ARRAY[%L]::uuid[]', pg_temp.id(405)), format('ARRAY[NULL, %L]::uuid[]', pg_temp.id(405)), 'a null expected type is rejected'),
  (format('ARRAY[%L, %L]::uuid[]', pg_temp.id(405), pg_temp.id(405)), 'ARRAY[]::uuid[]', 'a type cannot appear twice')
) AS invalid(ordered, expected, label);
SELECT throws_ok(pg_temp.order_sql(ordered, ARRAY[405, 401, 402, 403]), '22023', 'Choose every status type once', label)
FROM (VALUES
  (ARRAY[401, 402, 403], 'leaving a type out is rejected'),
  (ARRAY[401, 402, 403, 405, 499], 'an unknown extra type is rejected'),
  (ARRAY[401, 402, 403, 499], 'an unknown type in place of a saved one is rejected'),
  (ARRAY[401, 402, 403, 411], 'a Bravo type in place of a saved one is rejected')
) AS partial(ordered, label);
SELECT pg_temp.act(2);
SELECT throws_ok(pg_temp.order_sql(ARRAY[499], ARRAY[405, 401, 402, 403]), '42501', 'Calendar configuration is not allowed',
  'a viewer naming a missing type is denied before it learns the order');
RESET ROLE;
SELECT is(pg_temp.rows(101), (SELECT value FROM snapshots WHERE label = 'before-invalid'),
  'rejected orders change no type');

-- Authority is revoked while the final write runs. The trigger demotes the
-- actor as the first status row changes.
CREATE FUNCTION public.t1684_revoke_during_status_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.organization_id = 'c1684055-0000-4000-8000-000000000101' AND NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
    UPDATE public.organization_memberships
    SET capability_overrides = capability_overrides || '{"calendar":"view"}'
    WHERE organization_id = NEW.organization_id AND user_id = 'c1684055-0000-4000-8000-000000000001';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t1684_revoke_during_status_write BEFORE UPDATE ON public.status_types
  FOR EACH ROW EXECUTE FUNCTION public.t1684_revoke_during_status_write();
INSERT INTO snapshots VALUES ('before-revoked-write', pg_temp.rows(101));
SELECT pg_temp.act(1);
SELECT throws_ok(pg_temp.order_sql(ARRAY[403, 402, 401, 405], ARRAY[405, 401, 402, 403]), '42501',
  'Calendar configuration is not allowed', 'authority revoked during the final write denies the change');
RESET ROLE;
DROP TRIGGER t1684_revoke_during_status_write ON public.status_types;
DROP FUNCTION public.t1684_revoke_during_status_write();
SELECT is(pg_temp.rows(101), (SELECT value FROM snapshots WHERE label = 'before-revoked-write'),
  'the denied write leaves every type unchanged');
SELECT is((SELECT capability_overrides->>'calendar' FROM public.organization_memberships
  WHERE organization_id = pg_temp.id(101) AND user_id = pg_temp.id(1)), 'configure',
  'the revocation rolled back with the denied command');

CREATE FUNCTION pg_temp.write_position(type_id integer, new_position integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.status_types SET sort_order = new_position WHERE id = pg_temp.id(type_id);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END; $$;
SELECT pg_temp.act(3);
SELECT is(pg_temp.write_position(401, 99), 0, 'a Calendar operator cannot write an order position directly');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
