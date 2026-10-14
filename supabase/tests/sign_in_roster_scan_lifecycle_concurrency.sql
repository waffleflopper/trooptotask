BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
SELECT dblink_connect('r1643_first','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=r1643_first');
SELECT dblink_connect('r1643_second','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() || ' application_name=r1643_second');
SELECT dblink_exec('r1643_first',$setup$
  CREATE SCHEMA r1643_test;
  CREATE FUNCTION r1643_test.capture(statement text) RETURNS jsonb LANGUAGE plpgsql AS $body$
  DECLARE answer text;
  BEGIN
    IF statement ~* '^\s*select' THEN EXECUTE statement INTO answer; ELSE EXECUTE statement; END IF;
    RETURN jsonb_build_object('code','00000','answer',answer);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('code',SQLSTATE,'message',SQLERRM);
  END;
  $body$;
  CREATE FUNCTION r1643_test.id(suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $body$
    SELECT ('b1643100-0000-4000-8000-000000000' || suffix)::uuid
  $body$;
  CREATE FUNCTION r1643_test.key(roster text, name text) RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT r1643_test.id('101')::text || '/sign-in-rosters/' || r1643_test.id(roster)::text || '/' || name
  $body$;
  CREATE FUNCTION r1643_test.member(actor text) RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT format($q$SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = %L; SET LOCAL "request.jwt.claim.role" = 'authenticated'; SET LOCAL "request.jwt.claims" = %L$q$,
      r1643_test.id(actor), json_build_object('sub', r1643_test.id(actor), 'role', 'authenticated')::text)
  $body$;
  CREATE FUNCTION r1643_test.service() RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT $q$SET LOCAL ROLE service_role; SET LOCAL "request.jwt.claim.role" = 'service_role'; SET LOCAL "request.jwt.claims" = '{"role":"service_role"}'$q$
  $body$;
  CREATE FUNCTION r1643_test.attach(roster text, name text) RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT format('SELECT public.attach_sign_in_roster_scan(%L, %L, %L)', r1643_test.id('101'), r1643_test.id(roster), r1643_test.key(roster, name))
  $body$;
  CREATE FUNCTION r1643_test.remove(roster text, name text) RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT format($q$SELECT outcome || ':' || COALESCE(retired_object_name, '') FROM public.remove_sign_in_roster_scan(%L, %L, %L)$q$,
      r1643_test.id('101'), r1643_test.id(roster), r1643_test.key(roster, name))
  $body$;
  CREATE FUNCTION r1643_test.delete(roster text) RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT format($q$SELECT title || ':' || COALESCE(retired_object_name, '') FROM public.delete_sign_in_roster(%L, %L)$q$, r1643_test.id('101'), r1643_test.id(roster))
  $body$;
  CREATE FUNCTION r1643_test.settle(roster text, name text) RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT format($q$SELECT attached::text || ':' || COALESCE(retired_object_name, '') FROM public.settle_sign_in_roster_scan_upload(%L, %L, %L)$q$,
      r1643_test.id('101'), r1643_test.id(roster), r1643_test.key(roster, name))
  $body$;
  CREATE FUNCTION r1643_test.clear(roster text) RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT format('UPDATE public.counseling_records SET file_path = NULL WHERE id = %L', r1643_test.id('5' || right(roster, 2)))
  $body$;
  CREATE FUNCTION r1643_test.listing() RETURNS text LANGUAGE sql IMMUTABLE AS $body$
    SELECT $q$SELECT COALESCE(string_agg(object_name, ',' ORDER BY object_name), '') FROM public.list_pending_organization_file_retirements(1000) WHERE object_name LIKE 'b1643100-%'$q$
  $body$;
  CREATE FUNCTION r1643_test.delete_and_recreate(roster text) RETURNS text LANGUAGE plpgsql AS $body$
  DECLARE created uuid;
  BEGIN
    PERFORM public.delete_sign_in_roster(r1643_test.id('101'), r1643_test.id(roster));
    INSERT INTO public.sign_in_rosters (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, created_by)
    VALUES (r1643_test.id(roster), r1643_test.id('101'), 'Recreated ' || roster, '2030-03-01',
      jsonb_build_array(jsonb_build_object('id', r1643_test.id('301'))), ARRAY[r1643_test.id('301')], ARRAY[r1643_test.id('201')], r1643_test.id('001'))
    RETURNING id INTO created;
    RETURN created::text;
  END;
  $body$;
  CREATE FUNCTION r1643_test.held(roster text, name text) RETURNS boolean LANGUAGE sql STABLE AS $body$
    SELECT EXISTS (SELECT 1 FROM organization_private.file_retirement_holds
      WHERE key_digest = sha256(convert_to('counseling-files/' || r1643_test.key(roster, name), 'UTF8')))
  $body$;
  CREATE FUNCTION r1643_test.stage(actor text, roster text, name text) RETURNS void LANGUAGE sql AS $body$
    INSERT INTO organization_private.file_uploads (id, organization_id, actor_id, bucket_id, object_name)
      VALUES (gen_random_uuid(), r1643_test.id('101'), r1643_test.id(actor), 'counseling-files', r1643_test.key(roster, name));
    INSERT INTO storage.objects (bucket_id, name) VALUES ('counseling-files', r1643_test.key(roster, name));
  $body$;
  CREATE FUNCTION r1643_test.state(roster text, name text) RETURNS text LANGUAGE sql STABLE AS $body$
    SELECT CASE WHEN object_name IS NULL THEN 'removed' ELSE 'pending' END FROM organization_private.file_retirements
    WHERE key_digest = sha256(convert_to('counseling-files/' || r1643_test.key(roster, name), 'UTF8'))
  $body$;
  CREATE FUNCTION r1643_test.pointer(roster text) RETURNS text LANGUAGE sql STABLE AS $body$
    SELECT signed_file_path FROM public.sign_in_rosters WHERE id = r1643_test.id(roster)
  $body$;
  GRANT USAGE ON SCHEMA r1643_test TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION r1643_test.capture(text) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION r1643_test.delete_and_recreate(text) TO authenticated;
  INSERT INTO auth.users(id,email) SELECT r1643_test.id(actor), 'roster-race-' || actor || '@example.test'
    FROM unnest(ARRAY['001','002','003','004','005','006']) AS actor;
  INSERT INTO public.organizations(id,name,created_by) VALUES (r1643_test.id('101'),'Roster scan race',r1643_test.id('001'));
  INSERT INTO public.groups(id,organization_id,name) VALUES (r1643_test.id('201'),r1643_test.id('101'),'Race group');
  INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids)
  SELECT r1643_test.id('101'), r1643_test.id(actor), (CASE actor WHEN '001' THEN 'owner' ELSE 'member' END)::public.organization_role,
    CASE actor WHEN '001' THEN 'editor' ELSE 'viewer' END,
    CASE actor WHEN '001' THEN '{}' WHEN '006' THEN '{"personnel":"configure"}' ELSE '{"training":"operate"}' END::jsonb, 'organization', ARRAY[]::uuid[]
  FROM unnest(ARRAY['001','002','003','004','005','006']) AS actor;
  INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
    (r1643_test.id('301'), r1643_test.id('101'), r1643_test.id('201'), 'SGT', 'Race', 'Person', 'roster-scan-race');
  INSERT INTO public.sign_in_rosters (id, organization_id, title, roster_date, personnel_snapshot, personnel_ids, scope_group_ids, signed_file_path, created_by)
  SELECT r1643_test.id(roster), r1643_test.id('101'), 'Race ' || roster, '2030-03-01',
    jsonb_build_array(jsonb_build_object('id', r1643_test.id('301'))), ARRAY[r1643_test.id('301')], ARRAY[r1643_test.id('201')],
    CASE WHEN roster IN ('406','407') THEN NULL ELSE r1643_test.key(roster, 'original.pdf') END, r1643_test.id('001')
  FROM unnest(ARRAY['401','402','403','404','405','406','407','408','409','410','411','412','413','414','415','416','417','418','419','420','421']) AS roster;
  INSERT INTO storage.objects (bucket_id, name)
  SELECT 'counseling-files', signed_file_path FROM public.sign_in_rosters WHERE organization_id = r1643_test.id('101') AND signed_file_path IS NOT NULL;
  INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path)
  SELECT r1643_test.id('5' || right(roster, 2)), r1643_test.id('101'), r1643_test.id('301'), '2030-01-01', 'Shared ' || roster, 'Shared ' || roster, 'fixture',
    r1643_test.key(roster, 'original.pdf')
  FROM unnest(ARRAY['417','418','419','420','421']) AS roster;
  INSERT INTO organization_private.file_uploads (id, organization_id, actor_id, bucket_id, object_name)
  SELECT gen_random_uuid(), r1643_test.id('101'), r1643_test.id(actor), 'counseling-files', r1643_test.key(roster, 'original.pdf')
  FROM (VALUES ('002', '419'), ('003', '420')) AS reopened(actor, roster);
  DO $stage$ BEGIN
    PERFORM r1643_test.stage('002', '401', 'first.pdf');
    PERFORM r1643_test.stage('003', '401', 'second.pdf');
    PERFORM r1643_test.stage('002', '402', 'replacement.pdf');
    PERFORM r1643_test.stage('003', '403', 'replacement.pdf');
    PERFORM r1643_test.stage('003', '404', 'replacement.pdf');
    PERFORM r1643_test.stage('002', '405', 'replacement.pdf');
    PERFORM r1643_test.stage('002', '406', 'late-reply.pdf');
    PERFORM r1643_test.stage('002', '407', 'settled.pdf');
    PERFORM r1643_test.stage('004', '408', 'revoked.pdf');
    PERFORM r1643_test.stage('005', '409', 'revoked.pdf');
    PERFORM r1643_test.stage('002', '410', 'replacement.pdf');
    PERFORM r1643_test.stage('002', '413', 'stale.pdf');
    PERFORM r1643_test.stage('003', '416', 'stale.pdf');
  END $stage$;
$setup$);
SELECT dblink_exec('r1643_first', $$SET statement_timeout='10s'$$);
SELECT dblink_exec('r1643_second', $$SET statement_timeout='10s'$$);
CREATE TEMP TABLE r1643_sessions(name text PRIMARY KEY,pid integer);
INSERT INTO r1643_sessions SELECT 'first',pid FROM dblink('r1643_first','SELECT pg_backend_pid()') AS s(pid integer);
INSERT INTO r1643_sessions SELECT 'second',pid FROM dblink('r1643_second','SELECT pg_backend_pid()') AS s(pid integer);
SELECT is((SELECT count(DISTINCT pid)::integer FROM r1643_sessions),2,'two independent real sessions');
CREATE TEMP TABLE r1643_waits(case_name text,receipt jsonb);
CREATE FUNCTION pg_temp.r1643_wait(case_name text,waiter text,blocker text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp()+interval '5 seconds'; evidence jsonb; blocked boolean;
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT b.pid=ANY(pg_blocking_pids(a.pid)) AND a.state='active' AND a.wait_event_type='Lock',
    jsonb_build_object('waiter',w.name,'wait_event',a.wait_event,'blockers',pg_blocking_pids(a.pid))
    INTO blocked,evidence FROM pg_stat_activity a JOIN r1643_sessions w ON w.pid=a.pid
      CROSS JOIN r1643_sessions b WHERE w.name=waiter AND b.name=blocker;
  IF blocked THEN INSERT INTO r1643_waits VALUES(case_name,evidence); RETURN true; END IF;
  IF clock_timestamp()>deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
 END LOOP;
END;
$$;
CREATE TEMP TABLE r1643_results(case_name text,result jsonb);
CREATE FUNCTION pg_temp.r1643_capture(p_case text, p_session text, p_statement text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO r1643_results SELECT p_case, result FROM dblink(p_session, format('SELECT r1643_test.capture(%L)', p_statement)) AS r(result jsonb)
$$;
CREATE FUNCTION pg_temp.r1643_overlap(p_case text, p_first_role text, p_first text, p_second_role text, p_second text, p_second_commits_first boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec('r1643_first', 'BEGIN; ' || p_first_role);
  PERFORM pg_temp.r1643_capture(p_case || ':first', 'r1643_first', p_first);
  PERFORM dblink_exec('r1643_second', 'BEGIN; ' || p_second_role);
  PERFORM pg_temp.r1643_capture(p_case || ':second', 'r1643_second', p_second);
  IF p_second_commits_first THEN
    PERFORM dblink_exec('r1643_second', 'COMMIT');
    PERFORM dblink_exec('r1643_first', 'COMMIT');
  ELSE
    PERFORM dblink_exec('r1643_first', 'COMMIT');
    PERFORM dblink_exec('r1643_second', 'COMMIT');
  END IF;
END;
$$;
CREATE FUNCTION pg_temp.r1643_code(p_case text) RETURNS text LANGUAGE sql AS $$
  SELECT result->>'code' FROM r1643_results WHERE case_name = p_case
$$;
CREATE FUNCTION pg_temp.r1643_answer(p_case text) RETURNS text LANGUAGE sql AS $$
  SELECT result->>'answer' FROM r1643_results WHERE case_name = p_case
$$;
CREATE FUNCTION pg_temp.r1643_race(p_case text, p_first_role text, p_first text, p_second_role text, p_second text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE waited boolean;
BEGIN
  PERFORM dblink_exec('r1643_first', 'BEGIN; ' || p_first_role);
  INSERT INTO r1643_results SELECT p_case || ':first', result FROM dblink('r1643_first', format('SELECT r1643_test.capture(%L)', p_first)) AS r(result jsonb);
  PERFORM dblink_exec('r1643_second', 'BEGIN; ' || p_second_role);
  PERFORM dblink_send_query('r1643_second', format('SELECT r1643_test.capture(%L)', p_second));
  waited := pg_temp.r1643_wait(p_case, 'second', 'first');
  PERFORM dblink_exec('r1643_first', 'COMMIT');
  INSERT INTO r1643_results SELECT p_case || ':second', result FROM dblink_get_result('r1643_second') AS r(result jsonb);
  PERFORM * FROM dblink_get_result('r1643_second') AS r(result jsonb);
  PERFORM dblink_exec('r1643_second', 'COMMIT');
  RETURN waited;
END;
$$;

SELECT ok(pg_temp.r1643_race('b4-two-replacements', r1643_test.member('002'), r1643_test.attach('401','first.pdf'), r1643_test.member('003'), r1643_test.attach('401','second.pdf')),
  'B4: the second replacement waits on the roster row');
SELECT is(ARRAY[pg_temp.r1643_answer('b4-two-replacements:first'), pg_temp.r1643_answer('b4-two-replacements:second')],
  ARRAY[r1643_test.key('401','original.pdf'), r1643_test.key('401','first.pdf')], 'B4: each replacement reports the key it displaced');
SELECT is(ARRAY[r1643_test.pointer('401'), r1643_test.state('401','original.pdf'), r1643_test.state('401','first.pdf'), r1643_test.state('401','second.pdf')],
  ARRAY[r1643_test.key('401','second.pdf'), 'pending', 'pending', NULL], 'B4: the later commit is the scan and both displaced keys retire');

SELECT ok(pg_temp.r1643_race('b5-replace-then-remove', r1643_test.member('002'), r1643_test.attach('402','replacement.pdf'), r1643_test.member('003'), r1643_test.remove('402','original.pdf')),
  'B5: removal of the old scan waits behind the replacement');
SELECT is(pg_temp.r1643_answer('b5-replace-then-remove:second'), 'changed:', 'B5: the stale removal reports a changed scan');
SELECT is(ARRAY[r1643_test.pointer('402'), r1643_test.state('402','original.pdf'), r1643_test.state('402','replacement.pdf')],
  ARRAY[r1643_test.key('402','replacement.pdf'), 'pending', NULL], 'B5: the replacement survives the stale removal');

SELECT ok(pg_temp.r1643_race('b5-remove-then-replace', r1643_test.member('002'), r1643_test.remove('403','original.pdf'), r1643_test.member('003'), r1643_test.attach('403','replacement.pdf')),
  'B5: the replacement waits behind the removal');
SELECT is(ARRAY[pg_temp.r1643_answer('b5-remove-then-replace:first'), pg_temp.r1643_code('b5-remove-then-replace:second'), pg_temp.r1643_answer('b5-remove-then-replace:second')],
  ARRAY['removed:' || r1643_test.key('403','original.pdf'), '00000', NULL], 'B5: the removal retires the old key and the replacement displaces nothing');
SELECT is(ARRAY[r1643_test.pointer('403'), r1643_test.state('403','original.pdf'), r1643_test.state('403','replacement.pdf')],
  ARRAY[r1643_test.key('403','replacement.pdf'), 'pending', NULL], 'B5: the later replacement is the scan');

SELECT ok(pg_temp.r1643_race('b5-delete-then-replace', r1643_test.member('002'), r1643_test.delete('404'), r1643_test.member('003'), r1643_test.attach('404','replacement.pdf')),
  'B5: the replacement waits behind the deletion');
SELECT is(ARRAY[pg_temp.r1643_answer('b5-delete-then-replace:first'), pg_temp.r1643_code('b5-delete-then-replace:second')],
  ARRAY['Race 404:' || r1643_test.key('404','original.pdf'), 'P0002'], 'B5: the late replacement finds no roster');
SELECT dblink_exec('r1643_first', 'BEGIN; ' || r1643_test.service());
INSERT INTO r1643_results SELECT 'b5-delete-then-replace:settle', result FROM dblink('r1643_first',
  format('SELECT r1643_test.capture(%L)', r1643_test.settle('404','replacement.pdf'))) AS r(result jsonb);
SELECT dblink_exec('r1643_first', 'COMMIT');
SELECT is(pg_temp.r1643_answer('b5-delete-then-replace:settle'), 'false:' || r1643_test.key('404','replacement.pdf'), 'B5: settle retires the orphaned upload');
SELECT is(ARRAY[r1643_test.state('404','original.pdf'), r1643_test.state('404','replacement.pdf')], ARRAY['pending', 'pending'], 'B5: no key under the deleted roster is orphaned');

SELECT ok(pg_temp.r1643_race('b5-replace-then-delete', r1643_test.member('002'), r1643_test.attach('405','replacement.pdf'), r1643_test.member('003'), r1643_test.delete('405')),
  'B5: the deletion waits behind the replacement');
SELECT is(pg_temp.r1643_answer('b5-replace-then-delete:second'), 'Race 405:' || r1643_test.key('405','replacement.pdf'), 'B5: the deletion retires the newly attached scan');
SELECT is(ARRAY[r1643_test.state('405','original.pdf'), r1643_test.state('405','replacement.pdf')], ARRAY['pending', 'pending'], 'B5: both keys of the deleted roster retire');

SELECT ok(pg_temp.r1643_race('attach-then-settle', r1643_test.member('002'), r1643_test.attach('406','late-reply.pdf'), r1643_test.service(), r1643_test.settle('406','late-reply.pdf')),
  'settle waits on the key held by an in-flight attach');
SELECT is(ARRAY[pg_temp.r1643_answer('attach-then-settle:second'), r1643_test.pointer('406'), r1643_test.state('406','late-reply.pdf')],
  ARRAY['true:', r1643_test.key('406','late-reply.pdf'), NULL], 'settle confirms the committed attachment');

SELECT ok(pg_temp.r1643_race('settle-then-attach', r1643_test.service(), r1643_test.settle('407','settled.pdf'), r1643_test.member('002'), r1643_test.attach('407','settled.pdf')),
  'a late attach waits on the key held by settle');
SELECT is(ARRAY[pg_temp.r1643_answer('settle-then-attach:first'), pg_temp.r1643_code('settle-then-attach:second'), r1643_test.pointer('407'), r1643_test.state('407','settled.pdf')],
  ARRAY['false:' || r1643_test.key('407','settled.pdf'), '23514', NULL, 'pending'], 'the late attach cannot claim the settled key');

SELECT ok(pg_temp.r1643_race('revoked-during-row-wait',
    format($q$SELECT 1 FROM public.sign_in_rosters WHERE id = %L FOR UPDATE; UPDATE public.organization_memberships SET capability_overrides = '{"training":"view"}' WHERE user_id = %L$q$, r1643_test.id('408'), r1643_test.id('004')),
    'SELECT 1', r1643_test.member('004'), r1643_test.attach('408','revoked.pdf')),
  'an attach waits on the roster row while its grant is revoked');
SELECT is(ARRAY[pg_temp.r1643_code('revoked-during-row-wait:second'), r1643_test.pointer('408'), r1643_test.state('408','original.pdf')],
  ARRAY['42501', r1643_test.key('408','original.pdf'), NULL], 'authority read after the row wait refuses the attach');

SELECT ok(pg_temp.r1643_race('revoked-during-key-wait',
    format($q$SELECT organization_private.lock_file_key('counseling-files', %L); UPDATE public.organization_memberships SET capability_overrides = '{"training":"view"}' WHERE user_id = %L$q$, r1643_test.key('409','revoked.pdf'), r1643_test.id('005')),
    'SELECT 1', r1643_test.member('005'), r1643_test.attach('409','revoked.pdf')),
  'an attach waits on the new key while its grant is revoked');
SELECT is(ARRAY[pg_temp.r1643_code('revoked-during-key-wait:second'), r1643_test.pointer('409'), r1643_test.state('409','original.pdf')],
  ARRAY['42501', r1643_test.key('409','original.pdf'), NULL], 'authority read after the key wait rolls the attach back');

SELECT ok(pg_temp.r1643_race('attach-then-direct-delete', r1643_test.member('002'), r1643_test.attach('410','replacement.pdf'),
    r1643_test.member('003'), format('DELETE FROM public.sign_in_rosters WHERE id = %L', r1643_test.id('410'))),
  'a direct deletion waits behind the replacement');
SELECT is(ARRAY[pg_temp.r1643_code('attach-then-direct-delete:second'), r1643_test.state('410','original.pdf'), r1643_test.state('410','replacement.pdf')],
  ARRAY['00000', 'pending', 'pending'], 'a direct deletion retires the scan it deleted');

SELECT ok(pg_temp.r1643_race('remove-twice', r1643_test.member('002'), r1643_test.remove('411','original.pdf'), r1643_test.member('003'), r1643_test.remove('411','original.pdf')),
  'a repeated removal waits behind the first');
SELECT is(ARRAY[pg_temp.r1643_answer('remove-twice:first'), pg_temp.r1643_answer('remove-twice:second')],
  ARRAY['removed:' || r1643_test.key('411','original.pdf'), 'removed:' || r1643_test.key('411','original.pdf')], 'both removals report the same pending key');

SELECT ok(pg_temp.r1643_race('delete-twice', r1643_test.member('002'), r1643_test.delete('412'), r1643_test.member('003'), r1643_test.delete('412')),
  'a repeated deletion waits behind the first');
SELECT is(ARRAY[pg_temp.r1643_answer('delete-twice:first'), pg_temp.r1643_code('delete-twice:second')],
  ARRAY['Race 412:' || r1643_test.key('412','original.pdf'), 'P0002'], 'the repeated deletion finds no roster');

SELECT ok(pg_temp.r1643_race('recreate-during-attach', r1643_test.member('002'), 'SELECT r1643_test.delete_and_recreate(''416'')',
    r1643_test.member('003'), r1643_test.attach('416','stale.pdf')),
  'an attach waits on the roster row while it is deleted and its id is reinserted');
SELECT dblink_exec('r1643_first', 'BEGIN; ' || r1643_test.member('003'));
SELECT pg_temp.r1643_capture('recreate-during-attach:retry', 'r1643_first', r1643_test.attach('416','stale.pdf'));
SELECT dblink_exec('r1643_first', 'COMMIT');
SELECT is(ARRAY[pg_temp.r1643_code('recreate-during-attach:second'), pg_temp.r1643_code('recreate-during-attach:retry'),
    (pg_temp.r1643_answer('recreate-during-attach:first') = r1643_test.id('416')::text)::text, r1643_test.pointer('416')],
  ARRAY['P0002', 'P0002', 'false', NULL], 'the reinserted roster gets a new id and neither the waiting nor the retried attach finds the old one');

SELECT pg_temp.r1643_overlap('remove-then-clear', r1643_test.member('002'), r1643_test.remove('417','original.pdf'),
  r1643_test.member('006'), r1643_test.clear('417'), true);
SELECT pg_temp.r1643_overlap('clear-then-remove', r1643_test.member('006'), r1643_test.clear('418'),
  r1643_test.member('002'), r1643_test.remove('418','original.pdf'), true);
SELECT is(ARRAY[pg_temp.r1643_answer('remove-then-clear:first'), pg_temp.r1643_code('remove-then-clear:second'),
    pg_temp.r1643_code('clear-then-remove:first'), pg_temp.r1643_answer('clear-then-remove:second')],
  ARRAY['removed:', '00000', '00000', 'removed:'], 'an owner release and a counseling clear never wait on each other in either order');
SELECT is(ARRAY[r1643_test.state('417','original.pdf'), r1643_test.held('417','original.pdf')::text, r1643_test.state('418','original.pdf'), r1643_test.held('418','original.pdf')::text],
  ARRAY[NULL, 'true', NULL, 'true'], 'each owner release saw the other reference and is held');
SELECT dblink_exec('r1643_first', 'BEGIN; ' || r1643_test.service());
SELECT pg_temp.r1643_capture('shared-release:listing', 'r1643_first', r1643_test.listing());
SELECT dblink_exec('r1643_first', 'COMMIT');
SELECT is(ARRAY[strpos(pg_temp.r1643_answer('shared-release:listing'), r1643_test.key('417','original.pdf')) > 0,
    strpos(pg_temp.r1643_answer('shared-release:listing'), r1643_test.key('418','original.pdf')) > 0,
    r1643_test.held('417','original.pdf'), r1643_test.held('418','original.pdf')],
  ARRAY[true, true, false, false], 'the next drain promotes both released keys exactly once');

DO $$ BEGIN
  PERFORM dblink_exec('r1643_first', 'BEGIN; ' || r1643_test.member('002'));
  PERFORM pg_temp.r1643_capture('reopened:remove', 'r1643_first', r1643_test.remove(roster, 'original.pdf')) FROM unnest(ARRAY['419','420','421']) AS roster;
  PERFORM dblink_exec('r1643_first', 'COMMIT; BEGIN; ' || r1643_test.member('006'));
  PERFORM pg_temp.r1643_capture('reopened:clear', 'r1643_first', r1643_test.clear('419'));
  PERFORM dblink_exec('r1643_first', 'COMMIT');
END $$;
SELECT is(ARRAY[r1643_test.held('419','original.pdf'), r1643_test.held('420','original.pdf'), r1643_test.held('421','original.pdf')],
  ARRAY[true, true, true], 'owner releases that met a counseling reference stay held, including after that reference clears');

SELECT pg_temp.r1643_overlap('promotion-during-attach', r1643_test.member('002'), r1643_test.attach('419','original.pdf'),
  r1643_test.service(), r1643_test.listing(), true);
SELECT is(ARRAY[pg_temp.r1643_code('promotion-during-attach:first'), pg_temp.r1643_code('promotion-during-attach:second'),
    (strpos(pg_temp.r1643_answer('promotion-during-attach:second'), r1643_test.key('419','original.pdf')) > 0)::text],
  ARRAY['00000', '00000', 'false'], 'a drain skips a held key an in-flight attach has locked without waiting');
SELECT is(ARRAY[r1643_test.pointer('419'), r1643_test.state('419','original.pdf'), r1643_test.held('419','original.pdf')::text],
  ARRAY[r1643_test.key('419','original.pdf'), NULL, 'true'], 'the reattached key stays held and unretired');
SELECT is(ARRAY[r1643_test.state('420','original.pdf'), r1643_test.held('420','original.pdf')::text, r1643_test.state('421','original.pdf'), r1643_test.held('421','original.pdf')::text],
  ARRAY[NULL, 'true', NULL, 'true'], 'a drain keeps holds whose keys are still referenced');

SELECT dblink_exec('r1643_first', 'BEGIN; ' || r1643_test.member('006') || '; ' || r1643_test.clear('420') || '; COMMIT');

SELECT ok(pg_temp.r1643_race('attach-behind-promotion', r1643_test.service(), r1643_test.listing(), r1643_test.member('003'), r1643_test.attach('420','original.pdf')),
  'an attach of a held key waits on the key a drain is promoting');
SELECT is(ARRAY[(strpos(pg_temp.r1643_answer('attach-behind-promotion:first'), r1643_test.key('420','original.pdf')) > 0)::text,
    (strpos(pg_temp.r1643_answer('attach-behind-promotion:first'), r1643_test.key('419','original.pdf')) > 0)::text,
    pg_temp.r1643_code('attach-behind-promotion:second'), r1643_test.pointer('420'), r1643_test.state('420','original.pdf'), r1643_test.held('420','original.pdf')::text],
  ARRAY['true', 'false', '23514', NULL, 'pending', 'false'], 'the waiting attach sees the promoted retirement and fails closed');

SELECT dblink_exec('r1643_first', 'BEGIN; ' || r1643_test.member('006') || '; ' || r1643_test.clear('421') || '; COMMIT');

SELECT pg_temp.r1643_overlap('overlapping-promotions', r1643_test.service(), r1643_test.listing(), r1643_test.service(), r1643_test.listing(), true);
SELECT is(ARRAY[(strpos(pg_temp.r1643_answer('overlapping-promotions:first'), r1643_test.key('421','original.pdf')) > 0)::text,
    pg_temp.r1643_code('overlapping-promotions:second'),
    (strpos(pg_temp.r1643_answer('overlapping-promotions:second'), r1643_test.key('421','original.pdf')) > 0)::text,
    r1643_test.state('421','original.pdf'), r1643_test.held('421','original.pdf')::text],
  ARRAY['true', '00000', 'false', 'pending', 'false'], 'an overlapping drain skips the hold another drain is promoting');

SELECT dblink_exec('r1643_first', 'BEGIN ISOLATION LEVEL REPEATABLE READ; ' || r1643_test.member('002'));
INSERT INTO r1643_results SELECT 'repeatable-attach', result FROM dblink('r1643_first', format('SELECT r1643_test.capture(%L)', r1643_test.attach('413','stale.pdf'))) AS r(result jsonb);
SELECT dblink_exec('r1643_first', 'ROLLBACK');
SELECT dblink_exec('r1643_first', 'BEGIN ISOLATION LEVEL SERIALIZABLE; ' || r1643_test.member('002'));
INSERT INTO r1643_results SELECT 'serializable-remove', result FROM dblink('r1643_first', format('SELECT r1643_test.capture(%L)', r1643_test.remove('414','original.pdf'))) AS r(result jsonb);
SELECT dblink_exec('r1643_first', 'ROLLBACK');
SELECT dblink_exec('r1643_first', 'BEGIN ISOLATION LEVEL REPEATABLE READ; ' || r1643_test.member('002'));
INSERT INTO r1643_results SELECT 'repeatable-direct-delete', result FROM dblink('r1643_first', format('SELECT r1643_test.capture(%L)', format('DELETE FROM public.sign_in_rosters WHERE id = %L', r1643_test.id('415')))) AS r(result jsonb);
SELECT dblink_exec('r1643_first', 'ROLLBACK');
SELECT is(ARRAY[pg_temp.r1643_code('repeatable-attach'), pg_temp.r1643_code('serializable-remove'), pg_temp.r1643_code('repeatable-direct-delete')],
  ARRAY['25000', '25000', '25000'], 'scan commands and direct deletion reject unsupported isolation');
SELECT is(ARRAY[r1643_test.pointer('413'), r1643_test.pointer('414'), r1643_test.pointer('415')],
  ARRAY[r1643_test.key('413','original.pdf'), r1643_test.key('414','original.pdf'), r1643_test.key('415','original.pdf')], 'rejected commands keep their scans');

SELECT diag('ROSTER_SCAN_WAIT_RECEIPTS=' || (SELECT jsonb_agg(to_jsonb(r) ORDER BY case_name)::text FROM r1643_waits r));
SELECT diag('ROSTER_SCAN_RESULTS=' || (SELECT jsonb_agg(to_jsonb(r) ORDER BY case_name)::text FROM r1643_results r));
SELECT dblink_exec('r1643_first', $$
  SET storage.allow_delete_query = 'true';
  DELETE FROM organization_private.file_uploads WHERE organization_id = r1643_test.id('101');
  DELETE FROM storage.objects WHERE name LIKE r1643_test.id('101')::text || '/%';
  DELETE FROM public.organizations WHERE id = r1643_test.id('101');
  DELETE FROM organization_private.file_retirements WHERE object_name LIKE r1643_test.id('101')::text || '/%';
  DELETE FROM organization_private.file_retirement_holds WHERE object_name LIKE 'b1643100-%';
  DELETE FROM auth.users WHERE id::text LIKE 'b1643100-%';
  DROP SCHEMA r1643_test CASCADE$$);
SELECT is((SELECT count(*)::integer FROM organization_private.file_retirements WHERE object_name LIKE 'b1643100-%'),0,'committed test keys are cleaned');
SELECT ok(to_regnamespace('r1643_test') IS NULL,'committed test support schema is removed');
SELECT is((SELECT count(*)::integer FROM organization_private.file_retirement_holds WHERE object_name LIKE 'b1643100-%'),0,'committed test holds are cleaned');
SELECT dblink_disconnect('r1643_first');
SELECT dblink_disconnect('r1643_second');
SELECT * FROM finish();
ROLLBACK;
