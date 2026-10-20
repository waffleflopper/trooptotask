BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
DELETE FROM public.organizations WHERE id = 'f7101000-0000-4000-8000-000000000101';
DELETE FROM auth.users WHERE id::text LIKE 'f7101000-0000-4000-8000-%';
INSERT INTO auth.users (id, email) VALUES
('f7101000-0000-4000-8000-000000000001', 'exemption-race-owner@example.test'),
('f7101000-0000-4000-8000-000000000002', 'exemption-race-configurator@example.test');
INSERT INTO public.organizations (id, name, created_by) VALUES
('f7101000-0000-4000-8000-000000000101', 'Exemption Race', 'f7101000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES (
  'f7101000-0000-4000-8000-000000000101', 'f7101000-0000-4000-8000-000000000002',
  'member'::public.organization_role, 'viewer', '{"training":"configure","personnel":"none"}'::jsonb,
  'organization', ARRAY[]::uuid[]
);
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
('f7101000-0000-4000-8000-000000000301', 'f7101000-0000-4000-8000-000000000101', 'SGT', 'Race', 'Exempt',
 'exemption-race-person');
INSERT INTO public.training_types (id, organization_id, name, expiration_months, can_be_exempted, exempt_personnel_ids)
VALUES ('f7101000-0000-4000-8000-000000000401', 'f7101000-0000-4000-8000-000000000101', 'Race Training', 12, true,
  '[]');
COMMIT;

BEGIN;
SELECT no_plan();
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t7101exr_' || name)
FROM (VALUES ('fixture'), ('holder'), ('writer')) AS connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '10s'$$) FROM (VALUES ('holder'), ('writer')) AS connections(name);

CREATE FUNCTION pg_temp.expand(sql text) RETURNS text LANGUAGE sql AS $$
  SELECT regexp_replace(sql, '#(\d{3})', $r$'f7101000-0000-4000-8000-000000000\1'::uuid$r$, 'g');
$$;
CREATE FUNCTION pg_temp.exec(connection_name text, sql text) RETURNS text LANGUAGE sql AS $$
  SELECT dblink_exec(connection_name, pg_temp.expand(sql));
$$;
CREATE FUNCTION pg_temp.exemptions() RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM dblink('fixture', pg_temp.expand(
    $q$SELECT exempt_personnel_ids FROM public.training_types WHERE id = #401$q$)) AS result(value jsonb);
$$;
CREATE FUNCTION pg_temp.set_training(capability text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.exec('fixture', format($q$UPDATE public.organization_memberships
    SET capability_overrides = capability_overrides || jsonb_build_object('training', %L::text)
    WHERE organization_id = #101 AND user_id = #002$q$, capability));
$$;
-- Scheduling setup, not an assertion: the writer must be blocked before the
-- holder commits, or the interleaving under test never happened.
CREATE FUNCTION pg_temp.await_wait() RETURNS void LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity w
      JOIN pg_stat_activity b ON b.pid = ANY (pg_blocking_pids(w.pid))
      WHERE w.application_name = 't7101exr_writer' AND b.application_name = 't7101exr_holder'
    ) THEN RETURN; END IF;
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'writer never waited on holder'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END; $$;
-- dblink raises a remote failure with the remote SQLSTATE.
CREATE FUNCTION pg_temp.result() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_value boolean;
  v_result jsonb;
BEGIN
  BEGIN
    SELECT r.value INTO v_value FROM dblink_get_result('writer') AS r(value boolean);
    v_result := jsonb_build_object('value', v_value);
  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object('sqlstate', SQLSTATE);
  END;
  PERFORM 1 FROM dblink_get_result('writer', false) AS r(value boolean);
  RETURN v_result;
END; $$;
-- Holds the Training type row, then starts the configurator's exemption call
-- behind it and optionally changes their Training access while it waits.
CREATE FUNCTION pg_temp.race(p_exempt boolean, p_capability text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.exec('holder', 'BEGIN');
  PERFORM pg_temp.exec('holder', 'DO $l$ BEGIN PERFORM 1 FROM public.training_types WHERE id = #401 FOR UPDATE; END $l$');
  PERFORM pg_temp.exec('writer', 'BEGIN');
  PERFORM pg_temp.exec('writer', 'SET LOCAL ROLE authenticated');
  PERFORM pg_temp.exec('writer', $q$SET LOCAL request.jwt.claim.sub = 'f7101000-0000-4000-8000-000000000002'$q$);
  PERFORM dblink_send_query('writer', pg_temp.expand(format(
    'SELECT public.set_training_exemption(#101, #401, #301, %L)', p_exempt)));
  PERFORM pg_temp.await_wait();
  PERFORM pg_temp.set_training(p_capability);
  PERFORM pg_temp.exec('holder', 'COMMIT');
  v_result := pg_temp.result();
  PERFORM pg_temp.exec('writer', CASE WHEN v_result ? 'sqlstate' THEN 'ROLLBACK' ELSE 'COMMIT' END);
  PERFORM pg_temp.set_training('configure');
  RETURN v_result;
END; $$;

SELECT is(pg_temp.race(true, 'none'), '{"sqlstate":"42501"}',
  'Training access revoked while an exemption waits for the type denies it');
SELECT is(pg_temp.exemptions(), '[]', 'the denied exemption leaves the list unchanged');

SELECT is(pg_temp.race(true, 'configure'), '{"value":true}', 'a waiting exemption with access kept is saved');
SELECT is(pg_temp.exemptions(), '["f7101000-0000-4000-8000-000000000301"]', 'the kept exemption is on the list');

SELECT is(pg_temp.race(false, 'view'), '{"sqlstate":"42501"}',
  'Training access reduced while an exemption removal waits denies it');
SELECT is(pg_temp.exemptions(), '["f7101000-0000-4000-8000-000000000301"]',
  'the denied removal keeps the Person exempt');

SELECT pg_temp.exec('fixture', $$
  DELETE FROM public.organizations WHERE id = #101;
  DELETE FROM auth.users WHERE id::text LIKE 'f7101000-0000-4000-8000-%';
$$);
SELECT dblink_disconnect(name) FROM (VALUES ('fixture'), ('holder'), ('writer')) AS connections(name);
SELECT * FROM finish();
ROLLBACK;
