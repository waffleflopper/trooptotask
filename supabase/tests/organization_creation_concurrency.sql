BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
SELECT dblink_connect('first','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
 ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_org_first');
SELECT dblink_connect('second','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
 ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_org_second');
SELECT dblink_exec('first', $$SET statement_timeout='5s'$$);
SELECT dblink_exec('second', $$SET statement_timeout='5s'$$);
SELECT dblink_exec('first', $$SET request.jwt.claim.sub='f3000000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('second', $$SET request.jwt.claim.sub='f3000000-0000-4000-8000-000000000001'$$);

CREATE FUNCTION pg_temp.cleanup() RETURNS void LANGUAGE sql AS $$
 SELECT dblink_exec('first',$cleanup$
  DELETE FROM public.organizations WHERE created_by::text LIKE 'f3000000-%';
  DELETE FROM auth.users WHERE id::text LIKE 'f3000000-%';
 $cleanup$);
$$;
CREATE FUNCTION pg_temp.second_waits() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '3 seconds';
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  IF EXISTS (SELECT 1 FROM pg_stat_activity
    WHERE application_name='t3_org_second' AND wait_event_type='Lock') THEN RETURN true; END IF;
  IF clock_timestamp() >= deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
 END LOOP;
END $$;
CREATE FUNCTION pg_temp.create_sql(p_name text, p_request uuid) RETURNS text LANGUAGE sql AS $$
 SELECT format($q$ SELECT public.create_organization(%L, %L, %L::jsonb) $q$, p_name, p_request,
  '{"groups":[{"name":"Race Group","sort_order":0}],
    "status_types":[{"name":"Race Status","color":"#111111","text_color":"#ffffff","sort_order":0}],
    "assignment_types":[{"name":"Race Assignment","short_name":"RA","assign_to":"personnel","color":"#222222","sort_order":0}],
    "special_days":[{"date":"2026-01-01","name":"Race Holiday","type":"federal-holiday"}],
    "rank_catalog":[{"code":"RACE","label":"Race Rank","service":"custom","category":"custom","pay_grade":"ungraded","state":"active","source":"custom","sort_order":0}]}');
$$;
CREATE FUNCTION pg_temp.created_rows(p_name text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'organizations', (SELECT count(*) FROM public.organizations WHERE name = p_name),
  'owners', (SELECT count(*) FROM public.organization_memberships m JOIN public.organizations o ON o.id = m.organization_id
   WHERE o.name = p_name AND m.role = 'owner'),
  'groups', (SELECT count(*) FROM public.groups g JOIN public.organizations o ON o.id = g.organization_id WHERE o.name = p_name),
  'status_types', (SELECT count(*) FROM public.status_types s JOIN public.organizations o ON o.id = s.organization_id WHERE o.name = p_name),
  'assignment_types', (SELECT count(*) FROM public.assignment_types a JOIN public.organizations o ON o.id = a.organization_id WHERE o.name = p_name),
  'special_days', (SELECT count(*) FROM public.special_days d JOIN public.organizations o ON o.id = d.organization_id WHERE o.name = p_name),
  'rank_catalog', (SELECT count(*) FROM public.organization_rank_catalog r JOIN public.organizations o ON o.id = r.organization_id WHERE o.name = p_name),
  'requests', (SELECT count(*) FROM public.organization_creation_requests r JOIN public.organizations o ON o.id = r.organization_id WHERE o.name = p_name));
$$;

-- A previous interrupted dblink run can leave its committed synthetic rows.
SELECT pg_temp.cleanup();
SELECT dblink_exec('first',$fixture$
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  ('f3000000-0000-4000-8000-000000000001','race-org-owner@example.test',now());
$fixture$);

SELECT dblink_exec('first','BEGIN');
CREATE TEMP TABLE first_created AS
 SELECT id FROM dblink('first',pg_temp.create_sql('Race Org Commit','f3000000-0000-4000-8000-0000000000a1')) AS result(id uuid);
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE name='Race Org Commit'),0,
 'the first creation is invisible to other sessions until it commits');
SELECT dblink_send_query('second',pg_temp.create_sql('Race Org Commit','f3000000-0000-4000-8000-0000000000a1'));
SELECT ok(pg_temp.second_waits(),'the same request waits on the first creation');
SELECT dblink_exec('first','COMMIT');
SELECT is((SELECT id FROM dblink_get_result('second') AS result(id uuid)),(SELECT id FROM first_created),
 'the waiting request returns the committed Organization');
SELECT * FROM dblink_get_result('second') AS result(id uuid);
SELECT is(pg_temp.created_rows('Race Org Commit'),
 '{"organizations":1,"owners":1,"groups":1,"status_types":1,"assignment_types":1,"special_days":1,"rank_catalog":1,"requests":1}'::jsonb,
 'two concurrent submissions leave one Organization, owner, request and default set');

SELECT dblink_exec('first','BEGIN');
CREATE TEMP TABLE abandoned AS
 SELECT id FROM dblink('first',pg_temp.create_sql('Race Org Rollback','f3000000-0000-4000-8000-0000000000a2')) AS result(id uuid);
SELECT dblink_send_query('second',pg_temp.create_sql('Race Org Rollback','f3000000-0000-4000-8000-0000000000a2'));
SELECT ok(pg_temp.second_waits(),'the same request waits on the first creation before it rolls back');
SELECT dblink_exec('first','ROLLBACK');
CREATE TEMP TABLE recovered AS SELECT id FROM dblink_get_result('second') AS result(id uuid);
SELECT * FROM dblink_get_result('second') AS result(id uuid);
SELECT isnt((SELECT id FROM recovered),(SELECT id FROM abandoned),
 'the waiting request creates its own Organization after the first rolled back');
SELECT is((SELECT organization_id FROM public.organization_creation_requests
 WHERE user_id='f3000000-0000-4000-8000-000000000001' AND request_id='f3000000-0000-4000-8000-0000000000a2'),
 (SELECT id FROM recovered),'the request identity belongs to the surviving creation');
SELECT is(pg_temp.created_rows('Race Org Rollback'),
 '{"organizations":1,"owners":1,"groups":1,"status_types":1,"assignment_types":1,"special_days":1,"rank_catalog":1,"requests":1}'::jsonb,
 'the rolled-back attempt leaves one complete Organization from the recovery');

SELECT pg_temp.cleanup();
SELECT dblink_disconnect('first');
SELECT dblink_disconnect('second');
SELECT * FROM finish();
ROLLBACK;
