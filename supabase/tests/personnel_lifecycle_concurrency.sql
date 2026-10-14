BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET LOCAL TIME ZONE 'UTC';
CREATE FUNCTION pg_temp.u(n bigint) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('d1643b00-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.child(family integer, person integer, k integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.u(family * 100000 + person * 10 + k)
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.u(n), 'lifecycle-wait-' || n || '@example.test' FROM generate_series(1, 11) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.u(101), 'Lifecycle Wait', pg_temp.u(1));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.u(201), pg_temp.u(101), 'Alpha'), (pg_temp.u(202), pg_temp.u(101), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.u(101), pg_temp.u(1), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(2), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(3), 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(4), 'member', 'viewer', '{"personnel":"configure"}', 'groups', ARRAY[pg_temp.u(201)]),
  (pg_temp.u(101), pg_temp.u(5), 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(6), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(7), 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(8), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(9), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(10), 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.u(101), pg_temp.u(11), 'member', 'viewer', '{"personnel":"configure"}', 'organization', ARRAY[]::uuid[]);

CREATE TEMP TABLE people AS
SELECT person, CASE WHEN person IN (312, 318, 331) OR person BETWEEN 320 AND 326
  THEN '2029-05-01T00:00:00.123Z'::timestamptz END AS archived_at
FROM generate_series(301, 331) AS person;
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug, archived_at)
SELECT pg_temp.u(person), pg_temp.u(101), pg_temp.u(201), 'SGT', 'Wait', 'Person ' || person, 'lifecycle-wait-' || person, archived_at
FROM people;
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, status, created_by, archived_at)
SELECT pg_temp.child(1, person, 1), pg_temp.u(101), pg_temp.u(person), 'Follow-up ' || person,
  CASE WHEN archived_at IS NULL THEN 'open' ELSE 'archived' END, 'fixture', archived_at FROM people;
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, file_path, archived_at)
SELECT pg_temp.child(2, person, 1), pg_temp.u(101), pg_temp.u(person), '2029-02-01', 'Subject ' || person, 'Counseling ' || person, 'fixture',
  pg_temp.u(101) || '/counseling-records/' || pg_temp.u(person) || '/c1.pdf', archived_at FROM people;
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at)
SELECT pg_temp.child(3, person, 1), pg_temp.u(101), pg_temp.u(person), 'Document ' || person,
  pg_temp.u(101) || '/personnel/' || pg_temp.u(person) || '/documents/d1.pdf', 64, 'application/pdf', 'fixture', archived_at FROM people;
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, archived_at)
SELECT pg_temp.child(4, person, k), pg_temp.u(101), pg_temp.u(person), 'Author', 'Note ' || person || '.' || k,
  CASE k WHEN 1 THEN archived_at ELSE '2029-06-01T00:00:00Z' END
FROM people CROSS JOIN (VALUES (1), (2)) AS notes(k);
INSERT INTO public.deletion_requests (
  id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status, created_at
)
SELECT pg_temp.u(request), pg_temp.u(101), pg_temp.u(5), 'requester@example.test', 'personnel', pg_temp.u(person),
  'Archive ' || person, 'pending', '2029-08-01T00:00:00Z'
FROM (VALUES (601, 301), (602, 302), (603, 303), (604, 304), (605, 305), (606, 306), (607, 306),
  (608, 307), (609, 314), (610, 326), (611, 328), (612, 329)) AS rows(request, person);
COMMIT;

BEGIN;
SELECT no_plan();
SET LOCAL TIME ZONE 'UTC';
SELECT dblink_connect(name, 'hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
  ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_life_' || name)
FROM (VALUES ('fixture'), ('holder'), ('first'), ('second')) AS connections(name);
SELECT dblink_exec(name, $$SET statement_timeout = '15s'$$), dblink_exec(name, $$SET TIME ZONE 'UTC'$$)
FROM (VALUES ('fixture'), ('holder'), ('first'), ('second')) AS connections(name);

CREATE FUNCTION pg_temp.begin_as(conn text, actor integer, role_name text DEFAULT 'authenticated',
  isolation_level text DEFAULT 'READ COMMITTED') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_exec(conn, 'BEGIN ISOLATION LEVEL ' || isolation_level);
  PERFORM dblink_exec(conn, 'SET LOCAL ROLE ' || role_name);
  IF actor IS NOT NULL THEN
    PERFORM dblink_exec(conn, format('SET LOCAL request.jwt.claim.sub = %L', pg_temp.u(actor)));
    PERFORM dblink_exec(conn, format('SET LOCAL request.jwt.claims = %L',
      json_build_object('sub', pg_temp.u(actor), 'role', role_name)));
  END IF;
END;
$$;
CREATE FUNCTION pg_temp.archive_sql(people integer[], at text) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.archive_personnel(%L, %L::uuid[], %L)::text', pg_temp.u(101),
    ARRAY(SELECT pg_temp.u(p) FROM unnest(people) AS p), at)
$$;
CREATE FUNCTION pg_temp.restore_sql(person integer) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.restore_personnel(%L, %L)::text', pg_temp.u(101), pg_temp.u(person))
$$;
CREATE FUNCTION pg_temp.approve_sql(request integer, person integer, at text) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.approve_personnel_archive_request(%L, %L, %L, %L)::text',
    pg_temp.u(101), pg_temp.u(request), pg_temp.u(person), at)
$$;
CREATE FUNCTION pg_temp.deny_sql(request integer, reviewer integer) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$WITH denied AS (UPDATE public.deletion_requests SET status = 'denied', reviewed_by = %L,
    reviewed_at = '2030-01-09T00:00:00Z', denial_reason = 'Keep' WHERE organization_id = %L AND id = %L
    AND status = 'pending' RETURNING 1) SELECT count(*)::text FROM denied$q$, pg_temp.u(reviewer), pg_temp.u(101), pg_temp.u(request))
$$;
CREATE FUNCTION pg_temp.cancel_sql(request integer) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.cancel_own_deletion_request(%L, %L)::text', pg_temp.u(101), pg_temp.u(request))
$$;
CREATE FUNCTION pg_temp.hold_person_sql(person integer) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT count(*)::text FROM (SELECT 1 FROM public.personnel WHERE id = %L FOR NO KEY UPDATE) AS held', pg_temp.u(person))
$$;
CREATE FUNCTION pg_temp.hold_note_sql(person integer) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT count(*)::text FROM (SELECT 1 FROM public.leader_notes WHERE id = %L FOR UPDATE) AS held', pg_temp.child(4, person, 1))
$$;
CREATE FUNCTION pg_temp.hold_request_sql(request integer) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT count(*)::text FROM (SELECT 1 FROM public.deletion_requests WHERE id = %L FOR UPDATE) AS held', pg_temp.u(request))
$$;
CREATE FUNCTION pg_temp.follow_up_status_sql(person integer, status text, at text) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$WITH changed AS (UPDATE public.personnel_follow_ups SET status = %L,
    completed_at = CASE WHEN %L = 'completed' THEN %L::timestamptz END,
    archived_at = CASE WHEN %L = 'archived' THEN %L::timestamptz END, updated_at = %L
    WHERE organization_id = %L AND personnel_id = %L AND id = %L RETURNING 1) SELECT count(*)::text FROM changed$q$,
    status, status, at, status, at, at, pg_temp.u(101), pg_temp.u(person), pg_temp.child(1, person, 1))
$$;
CREATE FUNCTION pg_temp.send(conn text, sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF dblink_send_query(conn, sql) <> 1 THEN RAISE EXCEPTION 'Could not send to %', conn; END IF;
END;
$$;
CREATE FUNCTION pg_temp.reply(conn text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
  v_reply text;
BEGIN
  WHILE dblink_is_busy(conn) = 1 LOOP
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION '% did not return', conn; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  BEGIN
    SELECT r.v INTO v_reply FROM dblink_get_result(conn) AS r(v text);
  EXCEPTION WHEN OTHERS THEN
    v_reply := SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM * FROM dblink_get_result(conn, false) AS r(v text);
  RETURN v_reply;
END;
$$;
CREATE FUNCTION pg_temp.run(conn text, sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.send(conn, sql);
  RETURN pg_temp.reply(conn);
END;
$$;
CREATE FUNCTION pg_temp.waits(waiter text, holder text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      WITH RECURSIVE chain(pid, path) AS (
        SELECT w.pid, ARRAY[w.pid] FROM pg_stat_activity w
        WHERE w.application_name = 't3_life_' || waiter AND w.wait_event_type = 'Lock'
        UNION ALL
        SELECT blocked.pid, c.path || blocked.pid FROM chain c, LATERAL unnest(pg_blocking_pids(c.pid)) AS blocked(pid)
        WHERE NOT blocked.pid = ANY (c.path)
      ) SELECT 1 FROM chain c JOIN pg_stat_activity b ON b.pid = c.pid WHERE b.application_name = 't3_life_' || holder
    ) THEN RETURN true; END IF;
    IF clock_timestamp() >= deadline THEN RETURN false; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
CREATE FUNCTION pg_temp.finish(conn text) RETURNS text LANGUAGE sql AS $$
  SELECT dblink_exec(conn, 'COMMIT')
$$;
CREATE FUNCTION pg_temp.state(p_person integer)
RETURNS TABLE (family text, k integer, archived_at timestamptz, status text) LANGUAGE sql AS $$
  SELECT * FROM dblink('fixture', format($q$
    SELECT 'person', 0, archived_at, NULL FROM public.personnel WHERE id = %1$L
    UNION ALL SELECT 'follow_up', right(id::text, 1)::integer, archived_at, status FROM public.personnel_follow_ups WHERE personnel_id = %1$L
    UNION ALL SELECT 'counseling', right(id::text, 1)::integer, archived_at, NULL FROM public.counseling_records WHERE personnel_id = %1$L
    UNION ALL SELECT 'document', right(id::text, 1)::integer, archived_at, NULL FROM public.personnel_documents WHERE personnel_id = %1$L
    UNION ALL SELECT 'note', right(id::text, 1)::integer, archived_at, NULL FROM public.leader_notes WHERE personnel_id = %1$L
    ORDER BY 1, 2 $q$, pg_temp.u(p_person))) AS r(family text, k integer, archived_at timestamptz, status text)
$$;
CREATE FUNCTION pg_temp.whole(p_event timestamptz)
RETURNS TABLE (family text, k integer, archived_at timestamptz, status text) LANGUAGE sql AS $$
  VALUES ('counseling', 1, p_event, NULL::text), ('document', 1, p_event, NULL),
    ('follow_up', 1, p_event, CASE WHEN p_event IS NULL THEN 'open' ELSE 'archived' END),
    ('note', 1, p_event, NULL), ('note', 2, '2029-06-01T00:00:00Z'::timestamptz, NULL), ('person', 0, p_event, NULL)
$$;
CREATE FUNCTION pg_temp.request(p_request integer) RETURNS TABLE (status text, reviewed_by uuid, reviewed_at timestamptz)
LANGUAGE sql AS $$
  SELECT * FROM dblink('fixture', format('SELECT status, reviewed_by, reviewed_at FROM public.deletion_requests WHERE id = %L',
    pg_temp.u(p_request))) AS r(status text, reviewed_by uuid, reviewed_at timestamptz)
$$;

SELECT pg_temp.begin_as('first', 2);
SELECT is(pg_temp.run('first', pg_temp.approve_sql(601, 301, '2030-01-01T00:00:00Z')), 'true', 'approval runs and holds its locks');
SELECT pg_temp.begin_as('second', 1);
SELECT pg_temp.send('second', pg_temp.deny_sql(601, 1));
SELECT ok(pg_temp.waits('second', 'first'), 'denial waits on the approving transaction');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), '0', 'the waiting denial changes no request');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(301) $$, $$ SELECT * FROM pg_temp.whole('2030-01-01T00:00:00Z') $$,
  'approval that won archives the Person and all families');
SELECT results_eq($$ SELECT * FROM pg_temp.request(601) $$, $$ VALUES ('approved', pg_temp.u(2), '2030-01-01T00:00:00Z'::timestamptz) $$,
  'the approval is the single terminal review');

SELECT pg_temp.begin_as('first', 1);
SELECT is(pg_temp.run('first', pg_temp.deny_sql(602, 1)), '1', 'denial runs and holds the request');
SELECT pg_temp.begin_as('second', 2);
SELECT pg_temp.send('second', pg_temp.approve_sql(602, 302, '2030-01-02T00:00:00Z'));
SELECT ok(pg_temp.waits('second', 'first'), 'approval waits on the denying transaction');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), 'P0002 Pending deletion request not found', 'approval after a committed denial fails');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(302) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'a denied request leaves the Person and every artifact active');
SELECT results_eq($$ SELECT status FROM pg_temp.request(602) $$, $$ VALUES ('denied') $$, 'the denial stays the terminal review');

SELECT pg_temp.begin_as('first', 5);
SELECT is(pg_temp.run('first', pg_temp.cancel_sql(603)), 'true', 'cancellation runs and holds the request');
SELECT pg_temp.begin_as('second', 2);
SELECT pg_temp.send('second', pg_temp.approve_sql(603, 303, '2030-01-03T00:00:00Z'));
SELECT ok(pg_temp.waits('second', 'first'), 'approval waits on the cancelling transaction');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), 'P0002 Pending deletion request not found', 'approval after a committed cancellation fails');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(303) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'a cancelled request leaves the Person and every artifact active');
SELECT results_eq($$ SELECT status FROM pg_temp.request(603) $$, $$ VALUES ('cancelled') $$, 'the cancellation stays terminal');

SELECT pg_temp.begin_as('first', 2);
SELECT is(pg_temp.run('first', pg_temp.approve_sql(604, 304, '2030-01-04T00:00:00Z')), 'true', 'approval runs before cancellation');
SELECT pg_temp.begin_as('second', 5);
SELECT pg_temp.send('second', pg_temp.cancel_sql(604));
SELECT ok(pg_temp.waits('second', 'first'), 'cancellation waits on the approving transaction');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), 'P0002 Pending deletion request not found', 'cancellation after a committed approval fails');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(304) $$, $$ SELECT * FROM pg_temp.whole('2030-01-04T00:00:00Z') $$,
  'the approval that beat cancellation archived everything');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', pg_temp.hold_request_sql(605)), '1', 'holder locks the request');
SELECT pg_temp.begin_as('first', 1);
SELECT pg_temp.begin_as('second', 2);
SELECT pg_temp.send('first', pg_temp.approve_sql(605, 305, '2030-01-05T00:00:00Z'));
SELECT pg_temp.send('second', pg_temp.approve_sql(605, 305, '2030-01-05T00:00:09Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'first approval waits on the held request');
SELECT ok(pg_temp.waits('second', 'holder'), 'second approval waits in the same chain');
SELECT dblink_exec('holder', 'ROLLBACK');
CREATE TEMP TABLE approval_race (conn text, reply text);
DO $race$
DECLARE winner text; deadline timestamptz := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    IF dblink_is_busy('first') = 0 THEN winner := 'first'; EXIT; END IF;
    IF dblink_is_busy('second') = 0 THEN winner := 'second'; EXIT; END IF;
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'Neither approval returned'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  INSERT INTO approval_race VALUES (winner, pg_temp.reply(winner));
  PERFORM pg_temp.finish(winner);
  INSERT INTO approval_race SELECT conn, pg_temp.reply(conn) FROM (VALUES ('first'), ('second')) AS c(conn) WHERE conn <> winner;
  PERFORM pg_temp.finish(conn) FROM (VALUES ('first'), ('second')) AS c(conn) WHERE conn <> winner;
END;
$race$;
SELECT results_eq($$ SELECT reply FROM approval_race ORDER BY reply $$,
  $$ VALUES ('P0002 Pending deletion request not found'), ('true') $$, 'exactly one approval is acknowledged');
SELECT results_eq($$ SELECT * FROM pg_temp.state(305) $$,
  $$ SELECT * FROM pg_temp.whole((SELECT CASE (SELECT conn FROM approval_race WHERE reply = 'true')
    WHEN 'first' THEN '2030-01-05T00:00:00Z' ELSE '2030-01-05T00:00:09Z' END)::timestamptz) $$,
  'the winning approval owns the single archive event');
SELECT is((SELECT reviewed_by FROM pg_temp.request(605)),
  (SELECT CASE conn WHEN 'first' THEN pg_temp.u(1) ELSE pg_temp.u(2) END FROM approval_race WHERE reply = 'true'),
  'the request records the winning reviewer');

SELECT pg_temp.begin_as('first', 1);
SELECT is(pg_temp.run('first', pg_temp.approve_sql(606, 306, '2030-01-06T00:00:00Z')), 'true', 'first historical request approves');
SELECT pg_temp.begin_as('second', 2);
SELECT pg_temp.send('second', pg_temp.approve_sql(607, 306, '2030-01-06T00:00:09Z'));
SELECT ok(pg_temp.waits('second', 'first'), 'the other request waits on the locked Person');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), 'true', 'the other request approves against the saved event');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(306) $$, $$ SELECT * FROM pg_temp.whole('2030-01-06T00:00:00Z') $$,
  'one event remains after both historical requests');
SELECT results_eq($$ SELECT status, reviewed_at FROM pg_temp.request(606) UNION ALL SELECT status, reviewed_at FROM pg_temp.request(607) $$,
  $$ VALUES ('approved', '2030-01-06T00:00:00Z'::timestamptz), ('approved', '2030-01-06T00:00:09Z') $$,
  'each historical request keeps its own review');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', pg_temp.hold_request_sql(608)), '1', 'holder locks the request');
SELECT pg_temp.begin_as('first', 6);
SELECT pg_temp.send('first', pg_temp.approve_sql(608, 307, '2030-01-07T00:00:00Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'admitted approval waits on the request');
SELECT dblink_exec('fixture', format($q$ UPDATE public.organization_memberships SET role = 'member'
  WHERE organization_id = %L AND user_id = %L $q$, pg_temp.u(101), pg_temp.u(6)));
SELECT dblink_exec('holder', 'ROLLBACK');
SELECT is(pg_temp.reply('first'), '42501 Deletion request review is not allowed', 'demotion during the wait rejects approval');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(307) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'rejected approval leaves the Person and artifacts active');
SELECT results_eq($$ SELECT status FROM pg_temp.request(608) $$, $$ VALUES ('pending') $$, 'the request stays pending');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', pg_temp.hold_person_sql(308)), '1', 'holder locks the Person');
SELECT pg_temp.begin_as('first', 7);
SELECT pg_temp.send('first', pg_temp.archive_sql(ARRAY[308], '2030-01-08T00:00:00Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'admitted archive waits on the Person');
SELECT dblink_exec('fixture', format($q$ UPDATE public.organization_memberships SET capability_overrides = '{}'
  WHERE organization_id = %L AND user_id = %L $q$, pg_temp.u(101), pg_temp.u(7)));
SELECT dblink_exec('holder', 'ROLLBACK');
SELECT is(pg_temp.reply('first'), '42501 Archiving or restoring Personnel requires configure access',
  'capability removal during the wait rejects the archive');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(308) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'rejected archive changes nothing');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', format($q$ WITH moved AS (UPDATE public.personnel SET group_id = %L, rank = 'SSG'
  WHERE id = %L RETURNING 1) SELECT count(*)::text FROM moved $q$, pg_temp.u(202), pg_temp.u(309))), '1', 'parent edit holds the Person');
SELECT pg_temp.begin_as('first', 4);
SELECT pg_temp.send('first', pg_temp.archive_sql(ARRAY[309], '2030-01-09T00:00:00Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'Alpha-scoped archive waits on the parent edit');
SELECT pg_temp.finish('holder');
SELECT is(pg_temp.reply('first'), 'P0002 Personnel not found',
  'the archive checks the Group saved by the edit it waited on');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(309) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'the out-of-scope Person keeps every artifact active');
SELECT results_eq($$ SELECT * FROM dblink('fixture', format('SELECT group_id, rank FROM public.personnel WHERE id = %L', pg_temp.u(309)))
  AS r(group_id uuid, rank text) $$, $$ VALUES (pg_temp.u(202), 'SSG') $$, 'the parent edit is kept');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', pg_temp.hold_person_sql(328)), '1', 'holder locks the Person before the approval');
SELECT pg_temp.begin_as('first', 8);
SELECT pg_temp.send('first', pg_temp.approve_sql(611, 328, '2030-01-28T00:00:00Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'admitted approval waits on the Person');
SELECT dblink_exec('fixture', format($q$ UPDATE public.organization_memberships SET role = 'member'
  WHERE organization_id = %L AND user_id = %L $q$, pg_temp.u(101), pg_temp.u(8)));
SELECT dblink_exec('holder', 'ROLLBACK');
SELECT is(pg_temp.reply('first'), '42501 Deletion request review is not allowed', 'demotion during the Person wait rejects approval');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(328) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'approval rejected after the Person wait leaves the Person and artifacts active');
SELECT results_eq($$ SELECT status FROM pg_temp.request(611) $$, $$ VALUES ('pending') $$,
  'approval rejected after the Person wait leaves the request pending');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', pg_temp.hold_note_sql(329)), '1', 'holder locks the last-family Leader Note before the approval');
SELECT pg_temp.begin_as('first', 9);
SELECT pg_temp.send('first', pg_temp.approve_sql(612, 329, '2030-01-29T00:00:00Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'admitted approval waits on the Leader Note');
SELECT dblink_exec('fixture', format($q$ UPDATE public.organizations SET suspended_at = '2030-01-29T00:00:00Z' WHERE id = %L $q$,
  pg_temp.u(101)));
SELECT dblink_exec('holder', 'ROLLBACK');
SELECT is(pg_temp.reply('first'), '42501 Deletion request review is not allowed',
  'Organization suspension during the Leader Note wait rejects approval');
SELECT pg_temp.finish('first');
SELECT dblink_exec('fixture', format($q$ UPDATE public.organizations SET suspended_at = NULL WHERE id = %L $q$, pg_temp.u(101)));
SELECT results_eq($$ SELECT * FROM pg_temp.state(329) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'approval rejected after the Leader Note wait rolls back the Person and earlier families');
SELECT results_eq($$ SELECT status FROM pg_temp.request(612) $$, $$ VALUES ('pending') $$,
  'approval rejected after the Leader Note wait leaves the request pending');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', pg_temp.hold_note_sql(330)), '1', 'holder locks the last-family Leader Note before the archive');
SELECT pg_temp.begin_as('first', 10);
SELECT pg_temp.send('first', pg_temp.archive_sql(ARRAY[330], '2030-01-30T00:00:00Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'admitted archive waits on the Leader Note');
SELECT dblink_exec('fixture', format($q$ UPDATE public.organization_memberships SET capability_overrides = '{}'
  WHERE organization_id = %L AND user_id = %L $q$, pg_temp.u(101), pg_temp.u(10)));
SELECT dblink_exec('holder', 'ROLLBACK');
SELECT is(pg_temp.reply('first'), '42501 Archiving or restoring Personnel requires configure access',
  'capability removal during the Leader Note wait rejects the archive');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(330) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'archive rejected after the Leader Note wait rolls back the Person and earlier families');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', pg_temp.hold_note_sql(331)), '1', 'holder locks the last-family Leader Note before the restore');
SELECT pg_temp.begin_as('first', 11);
SELECT pg_temp.send('first', pg_temp.restore_sql(331));
SELECT ok(pg_temp.waits('first', 'holder'), 'admitted restore waits on the Leader Note');
SELECT dblink_exec('fixture', format($q$ INSERT INTO public.user_suspensions (user_id, suspended_by, reason)
  VALUES (%L, %L, 'Suspended during restore') $q$, pg_temp.u(11), pg_temp.u(1)));
SELECT dblink_exec('holder', 'ROLLBACK');
SELECT is(pg_temp.reply('first'), '42501 Archiving or restoring Personnel requires configure access',
  'account suspension during the Leader Note wait rejects the restore');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(331) $$, $$ SELECT * FROM pg_temp.whole('2029-05-01T00:00:00.123Z') $$,
  'restore rejected after the Leader Note wait keeps the Person and every artifact archived');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.archive_sql(ARRAY[311, 310], '2030-01-10T00:00:00Z')), '2', 'first bulk archive holds both People');
SELECT pg_temp.begin_as('second', 1);
SELECT pg_temp.send('second', pg_temp.archive_sql(ARRAY[310, 311], '2030-01-10T00:00:09Z'));
SELECT ok(pg_temp.waits('second', 'first'), 'second bulk archive waits on the first');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), '2', 'second bulk archive is acknowledged after the wait');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(310) UNION ALL SELECT * FROM pg_temp.state(311) $$,
  $$ SELECT * FROM pg_temp.whole('2030-01-10T00:00:00Z') UNION ALL SELECT * FROM pg_temp.whole('2030-01-10T00:00:00Z') $$,
  'the waiting archive keeps the first saved event for both People');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.restore_sql(312)), 'true', 'restore holds the archived Person');
SELECT pg_temp.begin_as('second', 3);
SELECT pg_temp.send('second', pg_temp.archive_sql(ARRAY[312], '2030-01-12T00:00:00Z'));
SELECT ok(pg_temp.waits('second', 'first'), 'archive waits on the restore');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), '1', 'archive after restore is acknowledged');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(312) $$, $$ SELECT * FROM pg_temp.whole('2030-01-12T00:00:00Z') $$,
  'the archive after the restore owns every restored artifact');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.archive_sql(ARRAY[313], '2030-01-13T00:00:00Z')), '1', 'archive holds the Person');
SELECT pg_temp.begin_as('second', 4);
SELECT pg_temp.send('second', pg_temp.restore_sql(313));
SELECT ok(pg_temp.waits('second', 'first'), 'restore waits on the archive');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), 'true', 'restore sees the committed event');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(313) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$,
  'restore after the archive returns every event-owned artifact');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.archive_sql(ARRAY[314], '2030-01-14T00:00:00Z')), '1', 'direct archive holds the Person');
SELECT pg_temp.begin_as('second', 2);
SELECT pg_temp.send('second', pg_temp.approve_sql(609, 314, '2030-01-14T00:00:09Z'));
SELECT ok(pg_temp.waits('second', 'first'), 'approval waits on the direct archive');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('second'), 'true', 'approval completes against the saved event');
SELECT pg_temp.finish('second');
SELECT results_eq($$ SELECT * FROM pg_temp.state(314) $$, $$ SELECT * FROM pg_temp.whole('2030-01-14T00:00:00Z') $$,
  'the direct archive event is kept');
SELECT results_eq($$ SELECT status, reviewed_at FROM pg_temp.request(609) $$, $$ VALUES ('approved', '2030-01-14T00:00:09Z'::timestamptz) $$,
  'the request records its own review time');

SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT is(pg_temp.run('holder', pg_temp.follow_up_status_sql(315, 'completed', '2030-01-15T00:00:00Z')), '1', 'completion holds the Follow-up');
SELECT pg_temp.begin_as('first', 3);
SELECT pg_temp.send('first', pg_temp.archive_sql(ARRAY[315], '2030-01-15T00:00:09Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'the archive cascade waits on the Follow-up writer, not on a Person lock');
SELECT pg_temp.finish('holder');
SELECT is(pg_temp.reply('first'), '1', 'archive completes after the completion');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(315) WHERE family = 'follow_up' $$,
  $$ VALUES ('follow_up', 1, NULL::timestamptz, 'completed') $$, 'the completed Follow-up is not archived');
SELECT results_eq($$ SELECT * FROM pg_temp.state(315) WHERE family <> 'follow_up' $$,
  $$ SELECT * FROM pg_temp.whole('2030-01-15T00:00:09Z') WHERE family <> 'follow_up' $$, 'the other families share the archive event');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.archive_sql(ARRAY[316], '2030-01-16T00:00:00Z')), '1', 'archive holds the Follow-up');
SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT pg_temp.send('holder', pg_temp.follow_up_status_sql(316, 'completed', '2030-01-16T00:00:09Z'));
SELECT ok(pg_temp.waits('holder', 'first'), 'the Follow-up writer waits on the cascade');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('holder'), '1', 'the identity-only completion applies after the cascade');
SELECT pg_temp.finish('holder');
SELECT results_eq($$ SELECT * FROM pg_temp.state(316) $$,
  $$ SELECT * FROM pg_temp.whole('2030-01-16T00:00:00Z') WHERE family <> 'follow_up'
    UNION ALL VALUES ('follow_up', 1, NULL::timestamptz, 'completed') ORDER BY 1, 2 $$,
  'the later completion replaces the Follow-up archive; every other family keeps the event');

SELECT dblink_exec('holder', 'BEGIN');
SELECT is(pg_temp.run('holder', format($q$ WITH changed AS (UPDATE public.leader_notes SET archived_at = '2030-01-17T00:00:00Z'
  WHERE organization_id = %L AND personnel_id = %L AND id = %L RETURNING 1) SELECT count(*)::text FROM changed $q$,
  pg_temp.u(101), pg_temp.u(317), pg_temp.child(4, 317, 1))), '1', 'note archive holds the note');
SELECT pg_temp.begin_as('first', 3);
SELECT pg_temp.send('first', pg_temp.archive_sql(ARRAY[317], '2030-01-17T00:00:09Z'));
SELECT ok(pg_temp.waits('first', 'holder'), 'the cascade waits on the note writer');
SELECT pg_temp.finish('holder');
SELECT is(pg_temp.reply('first'), '1', 'archive completes after the note archive');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.run('fixture', format('SELECT archived_at::text FROM public.leader_notes WHERE id = %L', pg_temp.child(4, 317, 1))),
  '2030-01-17 00:00:00+00', 'the independently archived note keeps its own time');
SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.restore_sql(317)), 'true', 'the Person restores');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(317) $$,
  $$ SELECT * FROM pg_temp.whole(NULL) WHERE NOT (family = 'note' AND k = 1)
    UNION ALL VALUES ('note', 1, '2030-01-17T00:00:00Z'::timestamptz, NULL::text) ORDER BY 1, 2 $$,
  'restore leaves the independently archived note archived');

SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT is(pg_temp.run('holder', pg_temp.follow_up_status_sql(318, 'open', '2030-01-18T00:00:00Z')), '1', 'reopen holds the Follow-up');
SELECT pg_temp.begin_as('first', 3);
SELECT pg_temp.send('first', pg_temp.restore_sql(318));
SELECT ok(pg_temp.waits('first', 'holder'), 'restore waits on the reopen');
SELECT pg_temp.finish('holder');
SELECT is(pg_temp.reply('first'), 'true', 'restore completes after the reopen');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(318) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$, 'every row is active once');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.archive_sql(ARRAY[319], '2030-01-19T00:00:00Z')), '1', 'archive holds the Person');
SELECT dblink_exec('holder', $$SET lock_timeout = '1s'$$);
SELECT is(pg_temp.run('holder', format($q$ WITH created AS (INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id,
  title, status, created_by) VALUES (%L, %L, %L, 'Concurrent', 'open', 'fixture') RETURNING 1) SELECT count(*)::text FROM created $q$,
  pg_temp.child(1, 319, 2), pg_temp.u(101), pg_temp.u(319))), '1', 'the insert commits without waiting on the archive');
SELECT dblink_exec('holder', $$RESET lock_timeout$$);
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(319) WHERE family = 'follow_up' $$,
  $$ VALUES ('follow_up', 1, '2030-01-19T00:00:00Z'::timestamptz, 'archived'), ('follow_up', 2, NULL, 'open') $$,
  'the archive owns only rows its statement saw; the concurrent Follow-up stays active');

SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT is(pg_temp.run('holder', format($q$ SELECT coalesce(bool_or(deleted)::text, 'none') FROM public.delete_archived_personnel_artifact(%L, %L, 'counseling', %L,
  '2029-05-01T00:00:00.123Z') $q$, pg_temp.u(101), pg_temp.u(320), pg_temp.child(2, 320, 1))), 'true', 'deletion holds the record');
SELECT pg_temp.begin_as('first', 3);
SELECT pg_temp.send('first', pg_temp.restore_sql(320));
SELECT ok(pg_temp.waits('first', 'holder'), 'restore waits on the deleted record');
SELECT pg_temp.finish('holder');
SELECT is(pg_temp.reply('first'), 'true', 'restore completes after the deletion');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(320) $$, $$ SELECT * FROM pg_temp.whole(NULL) WHERE family <> 'counseling' $$,
  'the deleted record stays deleted and every other artifact is restored');
SELECT is(pg_temp.run('fixture', format($q$ SELECT count(*)::text FROM organization_private.file_retirements
  WHERE object_name = %L $q$, pg_temp.u(101) || '/counseling-records/' || pg_temp.u(320) || '/c1.pdf')), '1',
  'the deleted record retires its file key');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.restore_sql(321)), 'true', 'restore holds the record');
SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT pg_temp.send('holder', format($q$ SELECT coalesce(bool_or(deleted)::text, 'none') FROM public.delete_archived_personnel_artifact(%L, %L, 'document', %L,
  '2029-05-01T00:00:00.123Z') $q$, pg_temp.u(101), pg_temp.u(321), pg_temp.child(3, 321, 1)));
SELECT ok(pg_temp.waits('holder', 'first'), 'deletion waits on the restore');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('holder'), 'none', 'the restored document is not deleted and has no deletion receipt');
SELECT pg_temp.finish('holder');
SELECT results_eq($$ SELECT * FROM pg_temp.state(321) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$, 'restore kept every artifact');
SELECT is(pg_temp.run('fixture', format($q$ SELECT count(*)::text FROM organization_private.file_retirements
  WHERE object_name = %L $q$, pg_temp.u(101) || '/personnel/' || pg_temp.u(321) || '/documents/d1.pdf')), '0',
  'the restored document keeps its file key');

SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT is(pg_temp.run('holder', format($q$ WITH expired AS (DELETE FROM public.leader_notes WHERE organization_id = %L
  AND personnel_id = %L AND archived_at IS NOT NULL AND archived_at < '2029-05-15T00:00:00Z' RETURNING 1) SELECT count(*)::text FROM expired $q$,
  pg_temp.u(101), pg_temp.u(322))), '1', 'retention holds the expired note');
SELECT pg_temp.begin_as('first', 3);
SELECT pg_temp.send('first', pg_temp.restore_sql(322));
SELECT ok(pg_temp.waits('first', 'holder'), 'restore waits on retention');
SELECT pg_temp.finish('holder');
SELECT is(pg_temp.reply('first'), 'true', 'restore completes after retention');
SELECT pg_temp.finish('first');
SELECT results_eq($$ SELECT * FROM pg_temp.state(322) $$, $$ SELECT * FROM pg_temp.whole(NULL) WHERE NOT (family = 'note' AND k = 1) $$,
  'the expired note stays deleted and every other artifact is restored');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.restore_sql(323)), 'true', 'restore holds the note');
SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT pg_temp.send('holder', format($q$ WITH expired AS (DELETE FROM public.leader_notes WHERE organization_id = %L
  AND personnel_id = %L AND archived_at IS NOT NULL AND archived_at < '2029-05-15T00:00:00Z' RETURNING 1) SELECT count(*)::text FROM expired $q$,
  pg_temp.u(101), pg_temp.u(323)));
SELECT ok(pg_temp.waits('holder', 'first'), 'retention waits on the restore');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('holder'), '0', 'retention deletes no restored note');
SELECT pg_temp.finish('holder');
SELECT results_eq($$ SELECT * FROM pg_temp.state(323) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$, 'restore kept every artifact');

SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT is(pg_temp.run('holder', format($q$ SELECT public.delete_expired_personnel(%L, ARRAY[%L]::uuid[], '2029-05-15T00:00:00Z')::text $q$,
  pg_temp.u(101), pg_temp.u(324))), '1', 'Person retention holds the deletion');
SELECT pg_temp.begin_as('first', 3);
SELECT pg_temp.send('first', pg_temp.restore_sql(324));
SELECT ok(pg_temp.waits('first', 'holder'), 'restore waits on Person retention');
SELECT pg_temp.finish('holder');
SELECT is(pg_temp.reply('first'), 'P0002 Personnel not found', 'restore of a deleted Person fails');
SELECT pg_temp.finish('first');
SELECT is_empty($$ SELECT * FROM pg_temp.state(324) $$, 'the Person and its artifacts are gone together');

SELECT pg_temp.begin_as('first', 3);
SELECT is(pg_temp.run('first', pg_temp.restore_sql(325)), 'true', 'restore holds the Person');
SELECT pg_temp.begin_as('holder', NULL, 'service_role');
SELECT pg_temp.send('holder', format($q$ SELECT public.delete_expired_personnel(%L, ARRAY[%L]::uuid[], '2029-05-15T00:00:00Z')::text $q$,
  pg_temp.u(101), pg_temp.u(325)));
SELECT ok(pg_temp.waits('holder', 'first'), 'Person retention waits on the restore');
SELECT pg_temp.finish('first');
SELECT is(pg_temp.reply('holder'), '0', 'retention deletes no restored Person');
SELECT pg_temp.finish('holder');
SELECT results_eq($$ SELECT * FROM pg_temp.state(325) $$, $$ SELECT * FROM pg_temp.whole(NULL) $$, 'the restored Person keeps every artifact');

SELECT pg_temp.begin_as('first', 3, 'authenticated', 'REPEATABLE READ');
SELECT is(pg_temp.run('first', pg_temp.restore_sql(326)), '25001 Personnel lifecycle changes require READ COMMITTED',
  'repeatable-read restore is rejected');
SELECT dblink_exec('first', 'ROLLBACK');
SELECT pg_temp.begin_as('first', 3, 'authenticated', 'SERIALIZABLE');
SELECT is(pg_temp.run('first', pg_temp.archive_sql(ARRAY[327], '2030-01-27T00:00:00Z')), '25001 Personnel lifecycle changes require READ COMMITTED',
  'serializable archive is rejected');
SELECT dblink_exec('first', 'ROLLBACK');
SELECT pg_temp.begin_as('first', 2, 'authenticated', 'REPEATABLE READ');
SELECT is(pg_temp.run('first', pg_temp.approve_sql(610, 326, '2030-01-26T00:00:00Z')), '25001 Deletion request review requires READ COMMITTED',
  'repeatable-read approval is rejected');
SELECT dblink_exec('first', 'ROLLBACK');
SELECT results_eq($$ SELECT * FROM pg_temp.state(326) $$, $$ SELECT * FROM pg_temp.whole('2029-05-01T00:00:00.123Z') $$,
  'rejected isolation levels change nothing');
SELECT results_eq($$ SELECT status FROM pg_temp.request(610) $$, $$ VALUES ('pending') $$, 'the request stays pending');

SELECT dblink_disconnect(name) FROM (VALUES ('holder'), ('first'), ('second')) AS connections(name);
SELECT dblink_exec('fixture', format($cleanup$
  DELETE FROM public.organizations WHERE id = %2$L;
  DELETE FROM public.user_suspensions WHERE user_id::text LIKE 'd1643b00-0000-4000-8000-%%';
  DELETE FROM auth.users WHERE id::text LIKE 'd1643b00-0000-4000-8000-%%';
  DELETE FROM organization_private.file_artifact_deletions WHERE organization_id = %2$L;
  DELETE FROM organization_private.file_retirements WHERE object_name LIKE %1$L;
$cleanup$, pg_temp.u(101) || '/%', pg_temp.u(101)));
SELECT is(pg_temp.run('fixture', format($q$ SELECT count(*)::text FROM (
  SELECT 1 FROM public.personnel WHERE organization_id = %1$L
  UNION ALL SELECT 1 FROM public.deletion_requests WHERE organization_id = %1$L
  UNION ALL SELECT 1 FROM public.organizations WHERE id = %1$L
  UNION ALL SELECT 1 FROM auth.users WHERE id::text LIKE 'd1643b00-0000-4000-8000-%%'
  UNION ALL SELECT 1 FROM public.user_suspensions WHERE user_id::text LIKE 'd1643b00-0000-4000-8000-%%'
  UNION ALL SELECT 1 FROM organization_private.file_artifact_deletions WHERE organization_id = %1$L
  UNION ALL SELECT 1 FROM organization_private.file_retirements WHERE object_name LIKE %2$L
) AS residue $q$, pg_temp.u(101), pg_temp.u(101) || '/%')), '0', 'every committed synthetic row was cleaned');
SELECT dblink_disconnect('fixture');
SELECT * FROM finish();
ROLLBACK;
