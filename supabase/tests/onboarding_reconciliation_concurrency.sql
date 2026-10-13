-- Independent authenticated transactions serialize one packet, not an Organization.
-- This committed fixture is synthetic and is removed explicitly at the end.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
-- Synthetic packet fixture; all saved work and attribution are independently specified.
INSERT INTO auth.users(id, email)
SELECT ('d1503000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'packet-reconciliation-' || n || '@example.test' FROM generate_series(1, 7) n;
INSERT INTO public.organizations(id, name, created_by) VALUES
('d1503000-0000-4000-8000-000000000101', 'Packet Alpha', 'd1503000-0000-4000-8000-000000000001'),
('d1503000-0000-4000-8000-000000000102', 'Packet Bravo', 'd1503000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id, organization_id, name) VALUES
('d1503000-0000-4000-8000-000000000201', 'd1503000-0000-4000-8000-000000000101', 'Alpha'),
('d1503000-0000-4000-8000-000000000202', 'd1503000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1503000-0000-4000-8000-000000000101'::uuid,
  ('d1503000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer', jsonb_build_object('onboarding', capability,
    'personnel', 'none', 'training', 'none', 'calendar', 'none'), scope_kind,
  CASE WHEN actor = 5 THEN ARRAY['d1503000-0000-4000-8000-000000000201']::uuid[] ELSE ARRAY[]::uuid[] END
FROM (VALUES (1, 'configure', 'organization'), (2, 'operate', 'organization'),
  (3, 'view', 'organization'), (4, 'none', 'organization'),
  (5, 'configure', 'groups'), (6, 'configure', 'groups'), (7, 'configure', 'organization')) a(actor, capability, scope_kind);
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES ('d1503000-0000-4000-8000-000000000102', 'd1503000-0000-4000-8000-000000000001',
  'member', 'viewer', '{"onboarding":"configure","personnel":"none","training":"none"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel(id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
('d1503000-0000-4000-8000-000000000301', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000201', 'SPC', 'Alpha', 'Person', 'packet-alpha'),
('d1503000-0000-4000-8000-000000000302', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000202', 'SPC', 'Bravo', 'Person', 'packet-bravo'),
('d1503000-0000-4000-8000-000000000303', 'd1503000-0000-4000-8000-000000000101', NULL, 'SPC', 'Unassigned', 'Person', 'packet-unassigned'),
('d1503000-0000-4000-8000-000000000304', 'd1503000-0000-4000-8000-000000000102', NULL, 'SPC', 'Foreign', 'Person', 'packet-foreign');
INSERT INTO public.onboarding_templates(id, organization_id, name) VALUES
('d1503000-0000-4000-8000-000000000401', 'd1503000-0000-4000-8000-000000000101', 'Template A'),
('d1503000-0000-4000-8000-000000000402', 'd1503000-0000-4000-8000-000000000101', 'Template B'),
('d1503000-0000-4000-8000-000000000403', 'd1503000-0000-4000-8000-000000000101', 'Empty template'),
('d1503000-0000-4000-8000-000000000404', 'd1503000-0000-4000-8000-000000000102', 'Foreign template');
INSERT INTO public.training_types(id, organization_id, name) VALUES
('d1503000-0000-4000-8000-000000000601', 'd1503000-0000-4000-8000-000000000101', 'Saved Training');
INSERT INTO public.onboarding_template_steps(id, organization_id, template_id, name, step_type, stages, sort_order, training_type_id) VALUES
('d1503000-0000-4000-8000-000000000501', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Orientation', 'checkbox', NULL, 20, NULL),
('d1503000-0000-4000-8000-000000000502', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Paperwork', 'paperwork', '["Draft","Reviewed"]', 30, NULL),
('d1503000-0000-4000-8000-000000000503', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Training', 'training', NULL, 40, 'd1503000-0000-4000-8000-000000000601'),
('d1503000-0000-4000-8000-000000000504', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Orientation', 'checkbox', NULL, 10, NULL),
('d1503000-0000-4000-8000-000000000511', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000402', 'Orientation', 'checkbox', NULL, 20, NULL),
('d1503000-0000-4000-8000-000000000512', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000402', 'Paperwork', 'paperwork', '["Draft","Reviewed"]', 30, NULL),
('d1503000-0000-4000-8000-000000000513', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000402', 'Training', 'training', NULL, 40, 'd1503000-0000-4000-8000-000000000601');
INSERT INTO public.personnel_onboardings(id, organization_id, personnel_id, status) VALUES
('d1503000-0000-4000-8000-000000000701', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000301', 'in_progress'),
('d1503000-0000-4000-8000-000000000702', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000302', 'in_progress'),
('d1503000-0000-4000-8000-000000000703', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000303', 'in_progress'),
('d1503000-0000-4000-8000-000000000704', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000301', 'cancelled'),
('d1503000-0000-4000-8000-000000000705', 'd1503000-0000-4000-8000-000000000102', 'd1503000-0000-4000-8000-000000000304', 'in_progress');
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, template_step_id, step_name, step_type, sort_order, completed, current_stage, notes, active
) SELECT ('d1503000-0000-4000-8000-' || lpad(step_id::text, 12, '0'))::uuid,
  'd1503000-0000-4000-8000-000000000101'::uuid, 'd1503000-0000-4000-8000-000000000701'::uuid,
  CASE WHEN step_id = 807 THEN 'd1503000-0000-4000-8000-000000000502'::uuid ELSE NULL END,
  step_name, step_type, step_id - 800, true, current_stage,
  jsonb_build_array(jsonb_build_object('text', 'Retained note ' || step_id,
    'timestamp', '2030-01-01T00:00:00Z', 'userId', 'd1503000-0000-4000-8000-000000000002')), active
FROM (VALUES
  (801, 'Orientation', 'checkbox', NULL::text, true),
  (802, 'Paperwork', 'paperwork', 'Reviewed', true),
  (803, 'Historic task', 'checkbox', NULL, true),
  (804, 'Orientation', 'paperwork', 'Reviewed', true),
  (805, 'Training', 'training', NULL, false),
  (806, 'Orientation', 'checkbox', NULL, false),
  (807, 'Paperwork', 'paperwork', 'Reviewed', false)
) s(step_id, step_name, step_type, current_stage, active);
INSERT INTO public.onboarding_step_progress (
  id, organization_id, onboarding_id, step_name, step_type, completed, notes
) VALUES
('d1503000-0000-4000-8000-000000000808', 'd1503000-0000-4000-8000-000000000102', 'd1503000-0000-4000-8000-000000000705', 'Foreign saved work', 'checkbox', true,
 '[{"text":"Foreign note","timestamp":"2030-01-01T00:00:00Z","userId":"d1503000-0000-4000-8000-000000000001"}]'),
('d1503000-0000-4000-8000-000000000809', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000703', 'Orientation', 'checkbox', true,
 '[{"text":"Retry note","timestamp":"2030-01-01T00:00:00Z","userId":"d1503000-0000-4000-8000-000000000002"}]');
COMMIT;
BEGIN;
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_packet_' || name)
FROM (VALUES ('fixture'), ('winner'), ('contender'), ('editor')) connections(name);
SELECT dblink_exec(name, $$SET statement_timeout='10s'$$)
FROM (VALUES ('winner'), ('contender'), ('editor')) connections(name);

CREATE FUNCTION pg_temp.packet_begin(connection_name text, actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec(connection_name,'BEGIN');
  PERFORM dblink_exec(connection_name,'SET LOCAL ROLE authenticated');
  PERFORM dblink_exec(connection_name,format('SET LOCAL request.jwt.claim.sub=%L',
    'd1503000-0000-4000-8000-' || lpad(actor::text,12,'0')));
END; $$;
CREATE FUNCTION pg_temp.packet_call_sql(packet_number integer, template_number integer DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.reconcile_onboarding_packet(%L,%L,%s)',
    'd1503000-0000-4000-8000-000000000101',
    'd1503000-0000-4000-8000-' || lpad(packet_number::text,12,'0'),
    CASE WHEN template_number IS NULL THEN 'NULL' ELSE quote_literal(
      'd1503000-0000-4000-8000-' || lpad(template_number::text,12,'0')) END);
$$;
CREATE FUNCTION pg_temp.packet_waits(waiter text, blocker text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS(SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity b
      ON b.pid = ANY(pg_blocking_pids(w.pid))
      WHERE w.application_name='t3_packet_' || waiter AND b.application_name='t3_packet_' || blocker
        AND w.wait_event_type='Lock') THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END; $$;
CREATE TEMP TABLE async_result(value jsonb);

-- The second first-assignment reads the committed selection after waiting.
SELECT pg_temp.packet_begin('winner',1);
SELECT pg_temp.packet_begin('contender',7);
SELECT is((SELECT value->>'template_id' FROM dblink('winner',pg_temp.packet_call_sql(701,401)) AS result(value jsonb)),
  'd1503000-0000-4000-8000-000000000401','first assignment selects Template A');
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(701,401));
SELECT ok(pg_temp.packet_waits('contender','winner'),'same-template assignment waits for the actual first transaction');
SELECT dblink_exec('winner','COMMIT');
INSERT INTO async_result SELECT value FROM dblink_get_result('contender') AS result(value jsonb);
SELECT * FROM dblink_get_result('contender') AS result(value jsonb);
SELECT dblink_exec('contender','COMMIT');
SELECT is((SELECT value->>'old_template_id' FROM async_result),
  'd1503000-0000-4000-8000-000000000401','waiting assignment observes the committed parent template');
SELECT is((SELECT jsonb_array_length(value->'steps') FROM async_result),9,
  'overlapping same-template assignments create no duplicate definitions');
SELECT results_eq($$ SELECT id,completed,notes->0->>'text' FROM dblink('fixture',$query$
  SELECT id,completed,notes FROM public.onboarding_step_progress
  WHERE id IN ('d1503000-0000-4000-8000-000000000801','d1503000-0000-4000-8000-000000000807') ORDER BY id
$query$) AS result(id uuid,completed boolean,notes jsonb) $$,
  $$ VALUES ('d1503000-0000-4000-8000-000000000801'::uuid,true,'Retained note 801'::text),
    ('d1503000-0000-4000-8000-000000000807'::uuid,true,'Retained note 807'::text) $$,
  'same-template overlap retains completed adopted and inactive linked work with notes');
TRUNCATE async_result;

-- A second template uses distinct rows and leaves the first template as history.
SELECT pg_temp.packet_begin('winner',1);
SELECT pg_temp.packet_begin('contender',7);
SELECT is((SELECT value->>'template_id' FROM dblink('winner',pg_temp.packet_call_sql(702,401)) AS result(value jsonb)),
  'd1503000-0000-4000-8000-000000000401','an initially empty packet first selects A');
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(702,402));
SELECT ok(pg_temp.packet_waits('contender','winner'),'different-template assignment waits on the same saved parent');
SELECT dblink_exec('winner','COMMIT');
INSERT INTO async_result SELECT value FROM dblink_get_result('contender') AS result(value jsonb);
SELECT * FROM dblink_get_result('contender') AS result(value jsonb);
SELECT dblink_exec('contender','COMMIT');
SELECT is((SELECT value->>'old_template_id' FROM async_result),
  'd1503000-0000-4000-8000-000000000401','different-template contender reconciles from the committed first selection');
SELECT is((SELECT jsonb_array_length(value->'steps') FROM async_result),7,
  'both template histories survive, with one saved row per definition');
SELECT results_eq($$ SELECT template_step_id FROM dblink('fixture',$query$
  SELECT template_step_id FROM public.onboarding_step_progress WHERE onboarding_id='d1503000-0000-4000-8000-000000000702'
    AND active ORDER BY template_step_id
$query$) AS result(template_step_id uuid) $$,
  $$ VALUES ('d1503000-0000-4000-8000-000000000511'::uuid),('d1503000-0000-4000-8000-000000000512'::uuid),
    ('d1503000-0000-4000-8000-000000000513'::uuid) $$,
  'only the final selected Template B definitions are active');
TRUNCATE async_result;

-- An ordinary resync must derive the selection after its parent-lock wait.
SELECT pg_temp.packet_begin('winner',1);
SELECT pg_temp.packet_begin('contender',7);
SELECT is((SELECT value->>'template_id' FROM dblink('winner',pg_temp.packet_call_sql(701,402)) AS result(value jsonb)),
  'd1503000-0000-4000-8000-000000000402','switch selects B before resync');
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(701));
SELECT ok(pg_temp.packet_waits('contender','winner'),'resync waits for the overlapping switch');
SELECT dblink_exec('winner','COMMIT');
INSERT INTO async_result SELECT value FROM dblink_get_result('contender') AS result(value jsonb);
SELECT * FROM dblink_get_result('contender') AS result(value jsonb);
SELECT dblink_exec('contender','COMMIT');
SELECT is((SELECT value->>'template_id' FROM async_result),
  'd1503000-0000-4000-8000-000000000402','waiting resync uses B rather than the stale A selection');
SELECT is((SELECT saved FROM dblink('fixture',$query$
  SELECT count(*)::integer FROM public.onboarding_step_progress p JOIN public.onboarding_template_steps s ON s.id=p.template_step_id
  WHERE p.onboarding_id='d1503000-0000-4000-8000-000000000701' AND p.active AND s.template_id<>'d1503000-0000-4000-8000-000000000402'
$query$) AS result(saved integer)),0,'resync leaves no active definitions from the old template');
TRUNCATE async_result;

-- Genuine failure after waiting rolls back only the contender, not the winner.
SELECT dblink_exec('fixture',$trigger$
  CREATE FUNCTION public.t3_fail_packet_contender() RETURNS trigger LANGUAGE plpgsql AS $body$
  BEGIN
    IF NEW.onboarding_id='d1503000-0000-4000-8000-000000000701' AND NEW.active
      AND NEW.template_step_id='d1503000-0000-4000-8000-000000000513' THEN
      RAISE EXCEPTION 'synthetic packet contender failure' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END; $body$;
  CREATE TRIGGER t3_fail_packet_contender BEFORE UPDATE ON public.onboarding_step_progress
    FOR EACH ROW EXECUTE FUNCTION public.t3_fail_packet_contender();
$trigger$);
SELECT pg_temp.packet_begin('winner',1);
SELECT pg_temp.packet_begin('contender',7);
SELECT is((SELECT value->>'template_id' FROM dblink('winner',pg_temp.packet_call_sql(701,401)) AS result(value jsonb)),
  'd1503000-0000-4000-8000-000000000401','successful switch selects A');
CREATE TEMP TABLE committed_winner AS SELECT value FROM dblink('winner',$query$
  SELECT jsonb_build_object('parent',to_jsonb(po),'steps',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id)
    FROM public.onboarding_step_progress p WHERE p.onboarding_id=po.id))
  FROM public.personnel_onboardings po WHERE po.id='d1503000-0000-4000-8000-000000000701'
$query$) AS result(value jsonb);
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(701,402));
SELECT ok(pg_temp.packet_waits('contender','winner'),'failed contender first waits for the winner');
SELECT dblink_exec('winner','COMMIT');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT ok(dblink_error_message('contender') LIKE '%synthetic packet contender failure%', 'the awaited contender reaches its genuine write failure');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT dblink_exec('contender','ROLLBACK');
SELECT results_eq($$ SELECT value FROM dblink('fixture',$query$
  SELECT jsonb_build_object('parent',to_jsonb(po),'steps',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id)
    FROM public.onboarding_step_progress p WHERE p.onboarding_id=po.id))
  FROM public.personnel_onboardings po WHERE po.id='d1503000-0000-4000-8000-000000000701'
$query$) AS result(value jsonb) $$,$$ SELECT value FROM committed_winner $$,
  'failed contender retains every committed winner parent/progress field');
SELECT dblink_exec('fixture',$cleanup$
  DROP TRIGGER t3_fail_packet_contender ON public.onboarding_step_progress;
  DROP FUNCTION public.t3_fail_packet_contender();
$cleanup$);

-- A progress edit already in flight must not be replaced by a stale full row.
SELECT dblink_exec('fixture',$setup$
  UPDATE public.onboarding_step_progress SET completed=false WHERE id='d1503000-0000-4000-8000-000000000809';
$setup$);
SELECT pg_temp.packet_begin('editor',2);
SELECT dblink_exec('editor',$edit$
  UPDATE public.onboarding_step_progress SET completed=true,notes=notes ||
    '[{"text":"Committed while reconciliation waited","timestamp":"2030-01-02T00:00:00Z","userId":"d1503000-0000-4000-8000-000000000002"}]'::jsonb
  WHERE id='d1503000-0000-4000-8000-000000000809';
$edit$);
SELECT pg_temp.packet_begin('contender',7);
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(703,401));
SELECT ok(pg_temp.packet_waits('contender','editor'),'reconciliation waits for the actual progress edit');
SELECT dblink_exec('editor','COMMIT');
INSERT INTO async_result SELECT value FROM dblink_get_result('contender') AS result(value jsonb);
SELECT * FROM dblink_get_result('contender') AS result(value jsonb);
SELECT dblink_exec('contender','COMMIT');
SELECT results_eq($$ SELECT completed,notes FROM dblink('fixture',$query$
  SELECT completed,notes FROM public.onboarding_step_progress WHERE id='d1503000-0000-4000-8000-000000000809'
$query$) AS result(completed boolean,notes jsonb) $$,
  $$ VALUES (true,'[{"text":"Retry note","timestamp":"2030-01-01T00:00:00Z","userId":"d1503000-0000-4000-8000-000000000002"},{"text":"Committed while reconciliation waited","timestamp":"2030-01-02T00:00:00Z","userId":"d1503000-0000-4000-8000-000000000002"}]'::jsonb) $$,
  'metadata reconciliation retains the committed checkbox value and both attributed notes');
TRUNCATE async_result;

-- Locking one parent cannot turn another packet into a shared global queue.
SELECT pg_temp.packet_begin('winner',1);
SELECT is((SELECT value->>'template_id' FROM dblink('winner',pg_temp.packet_call_sql(701,401)) AS result(value jsonb)),
  'd1503000-0000-4000-8000-000000000401','first packet remains locked in its transaction');
SELECT pg_temp.packet_begin('contender',7);
SELECT is((SELECT value->>'template_id' FROM dblink('contender',pg_temp.packet_call_sql(702,402)) AS result(value jsonb)),
  'd1503000-0000-4000-8000-000000000402','a different packet completes before the first transaction releases its lock');
SELECT dblink_exec('contender','COMMIT');
SELECT dblink_exec('winner','COMMIT');

-- The caller's Person can leave its Group while the saved parent is awaited.
-- Fixture reassignment is a committed same-Organization edit; the waiting RPC
-- remains an ordinary Group-scoped Configure caller with unchanged capability.
SELECT pg_temp.packet_begin('winner',1);
SELECT pg_temp.packet_begin('contender',5);
SELECT is((SELECT value->>'template_id' FROM dblink('winner',pg_temp.packet_call_sql(701,401)) AS result(value jsonb)),
  'd1503000-0000-4000-8000-000000000401','admitted winner holds the in-scope packet parent');
CREATE TEMP TABLE person_scope_winner AS SELECT value FROM dblink('winner',$query$
  SELECT jsonb_build_object(
    'parents',(SELECT jsonb_agg(to_jsonb(po) ORDER BY id) FROM public.personnel_onboardings po
      WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102')),
    'steps',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.onboarding_step_progress p
      WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102'))
  )
$query$) AS result(value jsonb);
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(701,402));
SELECT ok(pg_temp.packet_waits('contender','winner'),'in-scope Group Configure assignment reaches an observed parent wait');
SELECT dblink_exec('fixture',$move$
  UPDATE public.personnel SET group_id='d1503000-0000-4000-8000-000000000202'
  WHERE organization_id='d1503000-0000-4000-8000-000000000101' AND id='d1503000-0000-4000-8000-000000000301';
$move$);
SELECT is((SELECT group_id FROM dblink('fixture',$query$
  SELECT group_id::text FROM public.personnel WHERE id='d1503000-0000-4000-8000-000000000301'
$query$) AS result(group_id text)), 'd1503000-0000-4000-8000-000000000202',
  'Person reassignment is committed before the parent lock releases');
SELECT dblink_exec('winner','COMMIT');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT ok(dblink_error_message('contender') LIKE '%Onboarding configuration is not allowed%',
  'post-wait scope recheck rejects a Person now outside the caller Group');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT dblink_exec('contender','ROLLBACK');
SELECT results_eq($$ SELECT value FROM dblink('fixture',$query$
  SELECT jsonb_build_object(
    'parents',(SELECT jsonb_agg(to_jsonb(po) ORDER BY id) FROM public.personnel_onboardings po
      WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102')),
    'steps',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.onboarding_step_progress p
      WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102'))
  )
$query$) AS result(value jsonb) $$,$$ SELECT value FROM person_scope_winner $$,
  'scope-rejected contender retains every committed parent/progress field in both Organizations');

-- Configure can be revoked while an ordinary caller is waiting on the parent.
SELECT pg_temp.packet_begin('winner',1);
SELECT pg_temp.packet_begin('contender',7);
SELECT is((SELECT value->>'template_id' FROM dblink('winner',pg_temp.packet_call_sql(701,401)) AS result(value jsonb)),
  'd1503000-0000-4000-8000-000000000401','admitted first transaction holds the parent');
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(701,402));
SELECT ok(pg_temp.packet_waits('contender','winner'),'Configure contender is admitted before the observed parent wait');
SELECT dblink_exec('fixture',$revoke$
  UPDATE public.organization_memberships SET capability_overrides='{"onboarding":"operate","personnel":"none","training":"none"}'
  WHERE organization_id='d1503000-0000-4000-8000-000000000101' AND user_id='d1503000-0000-4000-8000-000000000007';
$revoke$);
SELECT dblink_exec('winner','COMMIT');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT ok(dblink_error_message('contender') LIKE '%Onboarding configuration is not allowed%',
  'post-wait capability recheck rejects a now-Operate caller');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT dblink_exec('contender','ROLLBACK');
SELECT is((SELECT template_id FROM dblink('fixture',$query$
  SELECT template_id::text FROM public.personnel_onboardings WHERE id='d1503000-0000-4000-8000-000000000701'
$query$) AS result(template_id text)),'d1503000-0000-4000-8000-000000000401',
  'revoked Configure cannot replace the committed parent selection');
-- A new step's insert can wait on the Organization row after every earlier
-- check. Access lost during that wait denies the whole reconciliation.
SELECT dblink_exec('fixture',$$SET statement_timeout='10s'$$);
SELECT dblink_exec('fixture',$setup$
  UPDATE public.organization_memberships SET capability_overrides='{"onboarding":"configure","personnel":"none","training":"none"}'
  WHERE organization_id='d1503000-0000-4000-8000-000000000101' AND user_id='d1503000-0000-4000-8000-000000000007';
  UPDATE public.personnel SET group_id='d1503000-0000-4000-8000-000000000201'
  WHERE organization_id='d1503000-0000-4000-8000-000000000101' AND id='d1503000-0000-4000-8000-000000000301';
  INSERT INTO public.onboarding_template_steps(id, organization_id, template_id, name, step_type, stages, sort_order, training_type_id)
  VALUES ('d1503000-0000-4000-8000-000000000505', 'd1503000-0000-4000-8000-000000000101', 'd1503000-0000-4000-8000-000000000401', 'Late addition', 'checkbox', NULL, 50, NULL);
$setup$);
CREATE FUNCTION pg_temp.packet_rows() RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM dblink('fixture',$query$
    SELECT jsonb_build_object(
      'parents',(SELECT jsonb_agg(to_jsonb(po) ORDER BY id) FROM public.personnel_onboardings po
        WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102')),
      'steps',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.onboarding_step_progress p
        WHERE organization_id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102'))
    )
  $query$) AS result(value jsonb);
$$;
CREATE TEMP TABLE before_final_insert AS SELECT pg_temp.packet_rows() AS value;

SELECT dblink_exec('editor','BEGIN');
SELECT * FROM dblink('editor',$$ SELECT id FROM public.organizations
  WHERE id='d1503000-0000-4000-8000-000000000101' FOR UPDATE $$) AS held(id uuid);
SELECT pg_temp.packet_begin('contender',7);
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(701));
SELECT ok(pg_temp.packet_waits('contender','editor'),'Configure resync reaches its new-step insert and waits on the Organization row');
SELECT dblink_exec('fixture',$revoke$
  UPDATE public.organization_memberships SET capability_overrides='{"onboarding":"operate","personnel":"none","training":"none"}'
  WHERE organization_id='d1503000-0000-4000-8000-000000000101' AND user_id='d1503000-0000-4000-8000-000000000007';
$revoke$);
SELECT dblink_exec('editor','ROLLBACK');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT ok(dblink_error_message('contender') LIKE '%Onboarding configuration is not allowed%',
  'Configure revoked during the new-step insert wait denies the reconciliation');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT dblink_exec('contender','COMMIT');
SELECT is(pg_temp.packet_rows(),(SELECT value FROM before_final_insert),
  'the revoked reconciliation leaves every packet and step unchanged');

SELECT dblink_exec('editor','BEGIN');
SELECT * FROM dblink('editor',$$ SELECT id FROM public.organizations
  WHERE id='d1503000-0000-4000-8000-000000000101' FOR UPDATE $$) AS held(id uuid);
SELECT pg_temp.packet_begin('contender',5);
SELECT dblink_send_query('contender',pg_temp.packet_call_sql(701));
SELECT ok(pg_temp.packet_waits('contender','editor'),'Group Configure resync reaches its new-step insert and waits on the Organization row');
SELECT dblink_exec('fixture',$move$
  UPDATE public.personnel SET group_id='d1503000-0000-4000-8000-000000000202'
  WHERE organization_id='d1503000-0000-4000-8000-000000000101' AND id='d1503000-0000-4000-8000-000000000301';
$move$);
SELECT dblink_exec('editor','ROLLBACK');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT ok(dblink_error_message('contender') LIKE '%Onboarding configuration is not allowed%',
  'a Person moved out of the caller Group during the new-step insert wait denies the reconciliation');
SELECT * FROM dblink_get_result('contender',false) AS result(value jsonb);
SELECT dblink_exec('contender','COMMIT');
SELECT is(pg_temp.packet_rows(),(SELECT value FROM before_final_insert),
  'the out-of-scope reconciliation leaves every packet and step unchanged');
SELECT dblink_exec('fixture',$cleanup$
  DELETE FROM public.organizations WHERE id IN ('d1503000-0000-4000-8000-000000000101','d1503000-0000-4000-8000-000000000102');
  DELETE FROM auth.users WHERE id BETWEEN 'd1503000-0000-4000-8000-000000000001' AND 'd1503000-0000-4000-8000-000000000007';
$cleanup$);
SELECT dblink_disconnect(name) FROM (VALUES ('fixture'),('winner'),('contender'),('editor')) connections(name);
SELECT * FROM finish();
ROLLBACK;
