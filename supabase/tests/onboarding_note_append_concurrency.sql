-- Real independent transactions append to one saved array after observed waits.
-- Only this synthetic committed fixture is removed at the end.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
INSERT INTO auth.users(id, email)
SELECT ('d1504000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'onboarding-note-' || n || '@example.test' FROM generate_series(1, 7) n;
INSERT INTO public.organizations(id, name, created_by) VALUES
('d1504000-0000-4000-8000-000000000101', 'Note Alpha', 'd1504000-0000-4000-8000-000000000001'),
('d1504000-0000-4000-8000-000000000102', 'Note Foreign', 'd1504000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id, organization_id, name) VALUES
('d1504000-0000-4000-8000-000000000201', 'd1504000-0000-4000-8000-000000000101', 'Alpha'),
('d1504000-0000-4000-8000-000000000202', 'd1504000-0000-4000-8000-000000000101', 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) SELECT 'd1504000-0000-4000-8000-000000000101'::uuid,
  ('d1504000-0000-4000-8000-' || lpad(actor::text, 12, '0'))::uuid,
  'member'::public.organization_role, 'viewer',
  jsonb_build_object('onboarding', capability, 'personnel', CASE WHEN actor=4 THEN 'operate' ELSE 'none' END,
    'training', 'none', 'calendar', 'none'), scope_kind,
  CASE WHEN actor=5 THEN ARRAY['d1504000-0000-4000-8000-000000000201']::uuid[] ELSE ARRAY[]::uuid[] END
FROM (VALUES (1,'operate','organization'), (2,'configure','organization'),
  (3,'view','organization'), (4,'none','organization'), (5,'operate','groups'),
  (6,'operate','groups'), (7,'operate','organization')) a(actor,capability,scope_kind);
INSERT INTO public.organization_memberships (
  organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES ('d1504000-0000-4000-8000-000000000102','d1504000-0000-4000-8000-000000000001',
  'member','viewer','{"onboarding":"operate","personnel":"none","training":"none","calendar":"none"}',
  'organization',ARRAY[]::uuid[]);
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,slug) VALUES
('d1504000-0000-4000-8000-000000000301','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000201','SPC','Alpha','Note','note-alpha'),
('d1504000-0000-4000-8000-000000000302','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000202','SPC','Bravo','Note','note-bravo'),
('d1504000-0000-4000-8000-000000000303','d1504000-0000-4000-8000-000000000101',NULL,'SPC','Unassigned','Note','note-unassigned'),
('d1504000-0000-4000-8000-000000000304','d1504000-0000-4000-8000-000000000102',NULL,'SPC','Foreign','Note','note-foreign');
INSERT INTO public.personnel_onboardings(id,organization_id,personnel_id,status,started_at,completed_at,cancelled_at) VALUES
('d1504000-0000-4000-8000-000000000701','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000301','in_progress','2030-01-01T00:00:00Z',NULL,NULL),
('d1504000-0000-4000-8000-000000000702','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000302','in_progress','2030-01-01T00:00:00Z',NULL,NULL),
('d1504000-0000-4000-8000-000000000703','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000303','in_progress','2030-01-01T00:00:00Z',NULL,NULL),
('d1504000-0000-4000-8000-000000000704','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000301','completed','2030-01-01T00:00:00Z','2030-01-03T00:00:00Z',NULL),
('d1504000-0000-4000-8000-000000000705','d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000301','cancelled','2030-01-01T00:00:00Z',NULL,'2030-01-03T00:00:00Z'),
('d1504000-0000-4000-8000-000000000706','d1504000-0000-4000-8000-000000000102','d1504000-0000-4000-8000-000000000304','in_progress','2030-01-01T00:00:00Z',NULL,NULL);
INSERT INTO public.onboarding_step_progress (
  id,organization_id,onboarding_id,step_name,step_type,sort_order,completed,current_stage,stages,notes,active
) SELECT ('d1504000-0000-4000-8000-' || lpad(step_id::text,12,'0'))::uuid,
  CASE WHEN step_id=807 THEN 'd1504000-0000-4000-8000-000000000102' ELSE 'd1504000-0000-4000-8000-000000000101' END::uuid,
  ('d1504000-0000-4000-8000-' || lpad(parent_id::text,12,'0'))::uuid,
  step_name,step_type,step_id-800,true,current_stage,
  CASE WHEN step_type='paperwork' THEN '["Draft","Reviewed","Filed"]'::jsonb ELSE NULL END,
  CASE WHEN step_id=808 THEN '{"unexpected":"object"}'::jsonb ELSE
    '[{"text":"Original saved note","timestamp":"2030-01-01T00:00:00Z","userId":"d1504000-0000-4000-8000-000000000002","extra":{"retained":[1,true,null]}}]'::jsonb END,active
FROM (VALUES (801,701,'Orientation','checkbox',NULL::text,true),
  (802,701,'Paperwork','paperwork','Reviewed',true),
  (803,704,'Completed retained work','checkbox',NULL,false),
  (804,705,'Cancelled retained Training','training',NULL,false),
  (805,702,'Bravo work','checkbox',NULL,true),
  (806,703,'Unassigned work','checkbox',NULL,true),
  (807,706,'Foreign work','checkbox',NULL,true),
  (808,701,'Malformed saved notes','checkbox',NULL,true)) s(step_id,parent_id,step_name,step_type,current_stage,active);

INSERT INTO public.onboarding_templates(id,organization_id,name) VALUES
('d1504000-0000-4000-8000-000000000401','d1504000-0000-4000-8000-000000000101','Note reconciliation');
INSERT INTO public.onboarding_template_steps(id,organization_id,template_id,name,step_type,sort_order) VALUES
('d1504000-0000-4000-8000-000000000501','d1504000-0000-4000-8000-000000000101',
 'd1504000-0000-4000-8000-000000000401','Orientation','checkbox',10);
COMMIT;
BEGIN;
SELECT dblink_connect(name,'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_note_' || name)
FROM (VALUES ('fixture'),('holder'),('first'),('second'),('reconcile')) connections(name);
SELECT dblink_exec(name,$$SET statement_timeout='15s'$$)
FROM (VALUES ('holder'),('first'),('second'),('reconcile')) connections(name);
CREATE FUNCTION pg_temp.note_begin(connection_name text,actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec(connection_name,'BEGIN');
  PERFORM dblink_exec(connection_name,'SET LOCAL ROLE authenticated');
  PERFORM dblink_exec(connection_name,format('SET LOCAL request.jwt.claim.sub=%L',
    'd1504000-0000-4000-8000-' || lpad(actor::text,12,'0')));
END; $$;
CREATE FUNCTION pg_temp.note_sql(step_number integer,note_text text) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.append_onboarding_step_note(%L,%L,%L)',
    'd1504000-0000-4000-8000-000000000101',
    'd1504000-0000-4000-8000-' || lpad(step_number::text,12,'0'),note_text);
$$;
CREATE FUNCTION pg_temp.note_waits(waiter text,holder text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz:=clock_timestamp()+interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS(
      WITH RECURSIVE chain(pid,path) AS (
        SELECT w.pid,ARRAY[w.pid] FROM pg_stat_activity w
        WHERE w.application_name='t3_note_' || waiter AND w.wait_event_type='Lock'
        UNION ALL
        SELECT blocked.pid,c.path || blocked.pid FROM chain c,
          LATERAL unnest(pg_blocking_pids(c.pid)) blocked(pid)
        WHERE NOT blocked.pid=ANY(c.path)
      ) SELECT 1 FROM chain c JOIN pg_stat_activity b ON b.pid=c.pid
      WHERE b.application_name='t3_note_' || holder
    ) THEN RETURN true; END IF;
    IF clock_timestamp()>=deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END; $$;
CREATE TEMP TABLE before_parents AS SELECT id,to_jsonb(p) row_data FROM public.personnel_onboardings p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102');
CREATE TEMP TABLE before_progress AS SELECT id,to_jsonb(p) row_data FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102');
CREATE TEMP TABLE replies(actor integer,value jsonb);

-- Both ordinary requests reach the same locked step; neither can write yet.
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.note_begin('first',1);
SELECT pg_temp.note_begin('second',2);
SELECT dblink_send_query('first',pg_temp.note_sql(801,'Overlapping Operate note'));
SELECT dblink_send_query('second',pg_temp.note_sql(801,'Overlapping Configure note'));
SELECT ok(pg_temp.note_waits('first','holder'),'Operate append is observed waiting on the held progress row');
SELECT ok(pg_temp.note_waits('second','holder'),'Configure append is observed in the same holder wait chain');
SELECT results_eq($$ SELECT id,row_data FROM dblink('fixture',$q$ SELECT id,to_jsonb(p) FROM public.personnel_onboardings p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $q$)
  r(id uuid,row_data jsonb) $$,$$ SELECT id,row_data FROM before_parents ORDER BY id $$,
  'both waits leave every committed parent field unchanged');
SELECT results_eq($$ SELECT id,row_data FROM dblink('fixture',$q$ SELECT id,to_jsonb(p) FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $q$)
  r(id uuid,row_data jsonb) $$,$$ SELECT id,row_data FROM before_progress ORDER BY id $$,
  'both waits leave every committed progress field unchanged');
SELECT dblink_exec('holder','ROLLBACK');
-- Either request may win. Drain/commit the ready one before awaiting the other.
DO $drain$
DECLARE connection_name text; actor_number integer;
  deadline timestamptz:=clock_timestamp()+interval '5 seconds';
BEGIN
  LOOP
    IF dblink_is_busy('first')=0 THEN connection_name:='first'; actor_number:=1; EXIT;
    ELSIF dblink_is_busy('second')=0 THEN connection_name:='second'; actor_number:=2; EXIT;
    END IF;
    IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'Neither append completed after release'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  INSERT INTO replies SELECT actor_number,value FROM dblink_get_result(connection_name) r(value jsonb);
  PERFORM * FROM dblink_get_result(connection_name) r(value jsonb);
  PERFORM dblink_exec(connection_name,'COMMIT');
  IF connection_name='first' THEN connection_name:='second'; actor_number:=2;
  ELSE connection_name:='first'; actor_number:=1; END IF;
  INSERT INTO replies SELECT actor_number,value FROM dblink_get_result(connection_name) r(value jsonb);
  PERFORM * FROM dblink_get_result(connection_name) r(value jsonb);
  PERFORM dblink_exec(connection_name,'COMMIT');
END;
$drain$;
SELECT is((SELECT count(*)::integer FROM replies),2,'both independent ordinary appends succeed');
SELECT results_eq($$ SELECT n.value->>'text',n.value->>'userId' FROM dblink('fixture',$q$
  SELECT notes FROM public.onboarding_step_progress WHERE id='d1504000-0000-4000-8000-000000000801' $q$) r(notes jsonb),
  LATERAL jsonb_array_elements(r.notes) WITH ORDINALITY n(value,position) WHERE position>1 ORDER BY n.value->>'text' $$,
  $$ VALUES ('Overlapping Configure note'::text,'d1504000-0000-4000-8000-000000000002'::text),
    ('Overlapping Operate note'::text,'d1504000-0000-4000-8000-000000000001'::text) $$,
  'the final saved array contains each marker once with its own authenticated author');
SELECT is((SELECT notes->0 FROM dblink('fixture',$q$ SELECT notes FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' $q$) r(notes jsonb)),
  (SELECT row_data->'notes'->0 FROM before_progress WHERE id='d1504000-0000-4000-8000-000000000801'),
  'overlap preserves all original note attributes');
SELECT ok((SELECT bool_and(value->>'id'='d1504000-0000-4000-8000-000000000801'
  AND jsonb_array_length(value->'notes') BETWEEN 2 AND 3
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(value->'notes') n WHERE n->>'text'=CASE actor
    WHEN 1 THEN 'Overlapping Operate note' ELSE 'Overlapping Configure note' END AND
    n->>'userId'='d1504000-0000-4000-8000-' || lpad(actor::text,12,'0'))) FROM replies),
  'each authoritative response contains its caller''s saved addition');
SELECT ok((SELECT bool_and(n.value->>'timestamp' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  AND (n.value->>'timestamp')::timestamptz BETWEEN transaction_timestamp()-interval '1 second' AND clock_timestamp())
  FROM dblink('fixture',$q$ SELECT notes FROM public.onboarding_step_progress
    WHERE id='d1504000-0000-4000-8000-000000000801' $q$) r(notes jsonb),
  LATERAL jsonb_array_elements(r.notes) WITH ORDINALITY n(value,position) WHERE position>1),
  'both waited appends generate current UTC millisecond timestamps');
SELECT results_eq($$ SELECT id,row_data FROM dblink('fixture',$q$ SELECT id,to_jsonb(p)-'notes'-'updated_at' FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $q$)
  r(id uuid,row_data jsonb) $$,$$ SELECT id,row_data-'notes'-'updated_at' FROM before_progress ORDER BY id $$,
  'overlap retains all work and snapshot fields in both Organizations');
SELECT results_eq($$ SELECT id,row_data FROM dblink('fixture',$q$ SELECT id,to_jsonb(p) FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102')
    AND id<>'d1504000-0000-4000-8000-000000000801' ORDER BY id $q$) r(id uuid,row_data jsonb) $$,
  $$ SELECT id,row_data FROM before_progress WHERE id<>'d1504000-0000-4000-8000-000000000801' ORDER BY id $$,
  'only the targeted progress row changes');

-- Capability loss committed during a real row-lock wait is denied with no write.
TRUNCATE before_progress;
INSERT INTO before_progress SELECT id,to_jsonb(p) FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102');
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.note_begin('first',7);
SELECT dblink_send_query('first',pg_temp.note_sql(801,'Revoked while waiting'));
SELECT ok(pg_temp.note_waits('first','holder'),'revoked caller first reaches the actual progress wait');
SELECT dblink_exec('fixture',$$ UPDATE public.organization_memberships SET capability_overrides=
  '{"onboarding":"view","personnel":"none","training":"none","calendar":"none"}'
  WHERE organization_id='d1504000-0000-4000-8000-000000000101' AND user_id='d1504000-0000-4000-8000-000000000007' $$);
SELECT dblink_exec('holder','ROLLBACK');
SELECT throws_ok($$ SELECT value FROM dblink_get_result('first') r(value jsonb) $$,
  '42501','Onboarding changes are not allowed','Operate revoked during wait denies the append');
SELECT * FROM dblink_get_result('first',false) r(value jsonb);
SELECT dblink_exec('first','ROLLBACK');
SELECT results_eq($$ SELECT id,row_data FROM dblink('fixture',$q$ SELECT id,to_jsonb(p) FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $q$)
  r(id uuid,row_data jsonb) $$,$$ SELECT id,row_data FROM before_progress ORDER BY id $$,
  'post-wait capability denial retains all saved rows');

-- Moving the Person outside Alpha scope also takes effect after the step wait.
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.note_begin('first',5);
SELECT dblink_send_query('first',pg_temp.note_sql(801,'Person moved while waiting'));
SELECT ok(pg_temp.note_waits('first','holder'),'Group-scoped caller reaches the actual progress wait');
SELECT dblink_exec('fixture',$$ UPDATE public.personnel SET group_id='d1504000-0000-4000-8000-000000000202'
  WHERE id='d1504000-0000-4000-8000-000000000301' $$);
SELECT dblink_exec('holder','ROLLBACK');
SELECT throws_ok($$ SELECT value FROM dblink_get_result('first') r(value jsonb) $$,
  '42501','Onboarding changes are not allowed','Person moved out of Group during wait denies the append');
SELECT * FROM dblink_get_result('first',false) r(value jsonb);
SELECT dblink_exec('first','ROLLBACK');
SELECT results_eq($$ SELECT id,row_data FROM dblink('fixture',$q$ SELECT id,to_jsonb(p) FROM public.onboarding_step_progress p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $q$)
  r(id uuid,row_data jsonb) $$,$$ SELECT id,row_data FROM before_progress ORDER BY id $$,
  'post-wait Group denial retains all progress rows');
SELECT results_eq($$ SELECT id,row_data FROM dblink('fixture',$q$ SELECT id,to_jsonb(p) FROM public.personnel_onboardings p
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') ORDER BY id $q$)
  r(id uuid,row_data jsonb) $$,$$ SELECT id,row_data FROM before_parents ORDER BY id $$,
  'append successes and both post-wait denials retain all parent fields');
SELECT dblink_exec('fixture',$$ UPDATE public.personnel SET group_id='d1504000-0000-4000-8000-000000000201'
  WHERE id='d1504000-0000-4000-8000-000000000301' $$);

-- One ordinary append can finish while reconciliation waits on an unchanged
-- progress hold. Multi-call explicit SQL transactions are not this RPC boundary:
-- PostgreSQL can recheck unchanged FKs on a tuple written by that transaction.
SELECT pg_temp.note_begin('first',1);
SELECT * FROM dblink('first',$$ SELECT id FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.note_begin('reconcile',2);
SELECT dblink_send_query('reconcile',$$ SELECT public.reconcile_onboarding_packet(
  'd1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000701',
  'd1504000-0000-4000-8000-000000000401') $$);
SELECT ok(pg_temp.note_waits('reconcile','first'),'metadata reconciliation waits on the note-held progress row');
SELECT is((SELECT value->'notes'->3->>'text' FROM dblink('first',pg_temp.note_sql(801,'While metadata waited')) r(value jsonb)),
  'While metadata waited','note append finishes while reconciliation retains its parent lock');
SELECT dblink_exec('first','COMMIT');
INSERT INTO replies SELECT 2,value FROM dblink_get_result('reconcile') r(value jsonb);
SELECT * FROM dblink_get_result('reconcile') r(value jsonb);
SELECT dblink_exec('reconcile','COMMIT');
SELECT results_eq($$ SELECT n.value->>'text' FROM dblink('fixture',$q$ SELECT notes FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' $q$) r(notes jsonb),
  LATERAL jsonb_array_elements(r.notes) WITH ORDINALITY n(value,position) WHERE position>3 ORDER BY position $$,
  $$ VALUES ('While metadata waited'::text) $$,
  'reconciliation retains the committed note through metadata adoption');
SELECT is((SELECT completed FROM dblink('fixture',$q$ SELECT completed FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' $q$) r(completed boolean)),true,
  'reconciliation and notes retain the original completed checkbox');
SELECT is((SELECT template_step_id FROM dblink('fixture',$q$ SELECT template_step_id FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' $q$) r(template_step_id uuid)),
  'd1504000-0000-4000-8000-000000000501'::uuid,'the waited reconciliation commits its expected definition metadata');

-- A held step is not an Organization-wide append queue.
SELECT dblink_exec('holder','BEGIN');
SELECT * FROM dblink('holder',$$ SELECT id FROM public.onboarding_step_progress
  WHERE id='d1504000-0000-4000-8000-000000000801' FOR UPDATE $$) held(id uuid);
SELECT pg_temp.note_begin('second',2);
SELECT is((SELECT value->'notes'->1->>'text' FROM dblink('second',pg_temp.note_sql(802,'Independent step note')) r(value jsonb)),
  'Independent step note','another step appends before the first step lock releases');
SELECT dblink_exec('second','COMMIT');
SELECT dblink_exec('holder','ROLLBACK');

SELECT dblink_disconnect(name) FROM (VALUES ('holder'),('first'),('second'),('reconcile')) connections(name);
SELECT dblink_exec('fixture',$cleanup$
  DELETE FROM public.organizations WHERE id IN
    ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102');
  DELETE FROM auth.users WHERE id::text LIKE 'd1504000-0000-4000-8000-%';
$cleanup$);
SELECT is((SELECT count(*)::integer FROM dblink('fixture',$q$ SELECT id FROM public.personnel_onboardings
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') $q$) r(id uuid)),
  0,'committed synthetic parents are fully cleaned');
SELECT is((SELECT count(*)::integer FROM dblink('fixture',$q$ SELECT id FROM public.onboarding_step_progress
  WHERE organization_id IN ('d1504000-0000-4000-8000-000000000101','d1504000-0000-4000-8000-000000000102') $q$) r(id uuid)),
  0,'committed synthetic progress is fully cleaned');
SELECT dblink_disconnect('fixture');
SELECT * FROM finish();
ROLLBACK;
