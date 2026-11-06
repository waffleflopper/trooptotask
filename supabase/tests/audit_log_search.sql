-- #1999 Activity searches on the server: by person, member, kind and day, paged on (timestamp, id).
-- The paging predicate below is the one src/lib/audit/supabaseOrganizationAudit.server.ts sends through PostgREST.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1990000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;

-- 1 owner, 2 admin, 3 member without admin, 4 another unit's owner.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'search-' || n || '@example.test', now()
FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Search Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Search Other', pg_temp.id('4'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('102'), pg_temp.id('4'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL);

-- Entry n=1 is the newest. Four entries share each timestamp, 40 minutes apart, so every page boundary can fall inside a tie.
-- Person 399, member 3, kind 'availability.deleted' and the day 2029-12-01 each match a few entries far past the newest 100.
INSERT INTO public.audit_logs (
  id, "timestamp", user_id, org_id, action, resource_type, resource_id, subject_personnel_id, subject_label, actor_label,
  record_label, batch_id, details
)
SELECT
  md5('entry-' || n)::uuid,
  timestamptz '2030-01-01 00:00:00+00' - ((n - 1) / 4) * interval '40 minutes',
  pg_temp.id((1 + n % 2)::text),
  pg_temp.id('101'),
  CASE WHEN n IN (3990, 3991) THEN 'availability.deleted' WHEN n % 20 = 0 THEN 'availability.imported'
    WHEN n % 2 = 0 THEN 'availability.created' ELSE 'availability.updated' END,
  'availability',
  md5('record-' || n)::uuid,
  CASE WHEN n IN (3988, 3989, 3990) THEN pg_temp.id('399') WHEN n % 7 = 0 THEN NULL ELSE pg_temp.id((300 + n % 5)::text) END,
  CASE WHEN n IN (3988, 3989, 3990) THEN 'SPC Needle, Nora' WHEN n % 7 = 0 THEN NULL ELSE 'PV' || n % 5 || ' Person, Number' END,
  'SSG Rivera, Sam',
  'Leave',
  CASE WHEN n % 40 < 4 THEN md5('batch-' || n / 40)::uuid END,
  '{}'::jsonb
FROM generate_series(1, 4000) AS n;
UPDATE public.audit_logs SET user_id = pg_temp.id('3'), actor_label = 'PFC Member, Lone'
WHERE id = md5('entry-3995')::uuid;
-- The day 2029-12-01 holds entries 3980 to 3999 only.
UPDATE public.audit_logs SET "timestamp" = timestamptz '2029-12-01 12:00:00+00' + (n - 3980) * interval '1 second'
FROM (SELECT md5('entry-' || n)::uuid AS id, n FROM generate_series(3980, 3999) AS n) AS day_entries
WHERE audit_logs.id = day_entries.id;
-- Sign-ins are excluded from the unit log; they outnumber everything else and are the newest rows.
INSERT INTO public.audit_logs (id, "timestamp", user_id, org_id, action, resource_type)
SELECT md5('login-' || n)::uuid, timestamptz '2030-01-02 00:00:00+00' - n * interval '14 minutes', pg_temp.id('2'),
  pg_temp.id('101'), 'auth.login_success', 'auth'
FROM generate_series(1, 3000) AS n;
INSERT INTO public.audit_logs (id, "timestamp", user_id, org_id, action, resource_type, subject_personnel_id, subject_label)
SELECT md5('other-' || n)::uuid, timestamptz '2030-01-01 00:00:00+00' - n * interval '40 seconds', pg_temp.id('4'),
  pg_temp.id('102'), 'availability.created', 'availability', pg_temp.id('399'), 'SPC Needle, Nora'
FROM generate_series(1, 60000) AS n;
ANALYZE public.audit_logs;

CREATE FUNCTION pg_temp.filter(p_person uuid, p_user uuid, p_action text, p_since timestamptz, p_until timestamptz)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' AND ',
    'org_id = ' || quote_literal(pg_temp.id('101')),
    'action NOT IN (''auth.login_success'', ''auth.login_failure'', ''auth.mfa_verify'',
      ''security.rate_limit_violation'', ''security.rate_limit_exceeded'')',
    CASE WHEN p_person IS NOT NULL THEN 'subject_personnel_id = ' || quote_literal(p_person) END,
    CASE WHEN p_user IS NOT NULL THEN 'user_id = ' || quote_literal(p_user) END,
    CASE WHEN p_action IS NOT NULL THEN 'action = ' || quote_literal(p_action) END,
    CASE WHEN p_since IS NOT NULL THEN '"timestamp" >= ' || quote_literal(p_since) END,
    CASE WHEN p_until IS NOT NULL THEN '"timestamp" < ' || quote_literal(p_until) END);
$$;

CREATE FUNCTION pg_temp.page_sql(p_where text, p_limit integer, p_ts timestamptz, p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT 'SELECT id, user_id, action, resource_type, resource_id, details, "timestamp", actor_label, record_label, '
    || 'subject_personnel_id, subject_label, batch_id FROM public.audit_logs WHERE ' || p_where
    || CASE WHEN p_ts IS NULL THEN ''
         ELSE format(' AND "timestamp" <= %L AND ("timestamp" < %L OR id < %L)', p_ts, p_ts, p_id) END
    || ' ORDER BY "timestamp" DESC, id DESC LIMIT ' || p_limit;
$$;

-- The ids every page returns, in order. One more than a page is read, as the server does, to know a page follows.
CREATE FUNCTION pg_temp.walk(p_where text, p_limit integer) RETURNS uuid[] LANGUAGE plpgsql AS $$
DECLARE
  seen uuid[] := ARRAY[]::uuid[];
  cursor_ts timestamptz;
  cursor_id uuid;
  page_ids uuid[];
  page_stamps timestamptz[];
BEGIN
  LOOP
    EXECUTE 'SELECT coalesce(array_agg(id ORDER BY "timestamp" DESC, id DESC), ARRAY[]::uuid[]), array_agg("timestamp" ORDER BY "timestamp" DESC, id DESC) FROM ('
      || pg_temp.page_sql(p_where, p_limit + 1, cursor_ts, cursor_id) || ') AS fetched'
      INTO page_ids, page_stamps;
    seen := seen || page_ids[1:p_limit];
    EXIT WHEN cardinality(page_ids) <= p_limit;
    cursor_id := page_ids[p_limit];
    cursor_ts := page_stamps[p_limit];
  END LOOP;
  RETURN seen;
END;
$$;
CREATE FUNCTION pg_temp.everything(p_where text) RETURNS uuid[] LANGUAGE plpgsql AS $$
DECLARE ids uuid[];
BEGIN
  EXECUTE 'SELECT coalesce(array_agg(id ORDER BY "timestamp" DESC, id DESC), ARRAY[]::uuid[]) FROM public.audit_logs WHERE ' || p_where
    INTO ids;
  RETURN ids;
END;
$$;
CREATE FUNCTION pg_temp.sorted(p_ids uuid[]) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[]) FROM unnest(p_ids) AS ids(id);
$$;

-- The plan's nodes in order, each with the index it reads and the rows it returned, then buffers and time.
CREATE FUNCTION pg_temp.explain(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE plan jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || p_sql INTO plan;
  RETURN (
    SELECT string_agg(
      node->>'Node Type' || coalesce(' using ' || (node->>'Index Name'), '') || ' rows=' || (node->>'Actual Rows'),
      ' > ' ORDER BY ordinality)
    FROM jsonb_path_query(plan->0->'Plan', 'strict $.**') WITH ORDINALITY AS nodes(node, ordinality)
    WHERE node ? 'Node Type')
    || format(' | shared buffers hit=%s read=%s | %s ms', plan->0->'Plan'->>'Shared Hit Blocks', plan->0->'Plan'->>'Shared Read Blocks',
      plan->0->>'Execution Time');
END;
$$;
CREATE FUNCTION pg_temp.first_page_plan(p_where text, p_limit integer) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.explain(pg_temp.page_sql(p_where, p_limit, NULL, NULL));
$$;
CREATE FUNCTION pg_temp.deep_page_plan(p_where text, p_limit integer) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.explain(pg_temp.page_sql(p_where, p_limit, timestamptz '2029-12-15 00:00:00+00', md5('entry-3900')::uuid));
$$;

-- The Organization's own unit-log entries: four thousand, not the sign-ins and not another unit's.
SELECT is(cardinality(pg_temp.everything(pg_temp.filter(NULL, NULL, NULL, NULL, NULL))), 4000,
  'the unit log holds 4000 entries once sign-ins are left out');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;

SELECT is(pg_temp.walk(pg_temp.filter(NULL, NULL, NULL, NULL, NULL), 7),
  pg_temp.everything(pg_temp.filter(NULL, NULL, NULL, NULL, NULL)),
  'an admin pages the whole unit log in pages of 7, every entry once and in order, across ties on the timestamp');
SELECT is(pg_temp.walk(pg_temp.filter(NULL, NULL, NULL, NULL, NULL), 4),
  pg_temp.everything(pg_temp.filter(NULL, NULL, NULL, NULL, NULL)),
  'and in pages that end exactly at a tie');
SELECT is(
  (SELECT count(*)::integer FROM unnest(pg_temp.walk(pg_temp.filter(NULL, NULL, NULL, NULL, NULL), 50)) AS paged(id)),
  (SELECT count(DISTINCT id)::integer FROM unnest(pg_temp.walk(pg_temp.filter(NULL, NULL, NULL, NULL, NULL), 50)) AS paged(id)),
  'no entry appears on two pages');

SELECT is(pg_temp.sorted(pg_temp.everything(pg_temp.filter(pg_temp.id('399'), NULL, NULL, NULL, NULL))),
  pg_temp.sorted(ARRAY[md5('entry-3988')::uuid, md5('entry-3989')::uuid, md5('entry-3990')::uuid]),
  'an admin finds the 3 entries about one person, all older than the newest 100');
SELECT is(pg_temp.walk(pg_temp.filter(pg_temp.id('399'), NULL, NULL, NULL, NULL), 2),
  pg_temp.everything(pg_temp.filter(pg_temp.id('399'), NULL, NULL, NULL, NULL)),
  'a person''s entries page without gaps or repeats');
SELECT is(pg_temp.everything(pg_temp.filter(NULL, pg_temp.id('3'), NULL, NULL, NULL)), ARRAY[md5('entry-3995')::uuid],
  'an admin finds the only entry by one member');
SELECT is(pg_temp.sorted(pg_temp.everything(pg_temp.filter(NULL, NULL, 'availability.deleted', NULL, NULL))),
  pg_temp.sorted(ARRAY[md5('entry-3990')::uuid, md5('entry-3991')::uuid]),
  'an admin finds the 2 entries of one kind');
SELECT is(cardinality(pg_temp.everything(pg_temp.filter(NULL, NULL, NULL, timestamptz '2029-12-01 00:00:00+00', timestamptz '2029-12-02 00:00:00+00'))),
  20, 'an admin finds the 20 entries of one day, from its first instant to the next day''s');
SELECT is(cardinality(pg_temp.everything(pg_temp.filter(NULL, NULL, NULL, timestamptz '2029-12-01 12:00:19+00', timestamptz '2029-12-01 12:00:20+00'))),
  1, 'the end of a day range is exclusive and the start inclusive');
SELECT is(pg_temp.walk(pg_temp.filter(pg_temp.id('301'), pg_temp.id('2'), 'availability.updated', NULL, NULL), 5),
  pg_temp.everything(pg_temp.filter(pg_temp.id('301'), pg_temp.id('2'), 'availability.updated', NULL, NULL)),
  'filters combine and still page exactly');

SELECT pg_temp.act_as('3');
SELECT is(pg_temp.everything(pg_temp.filter(NULL, NULL, NULL, NULL, NULL)), ARRAY[]::uuid[],
  'a member without admin reads no entries');
SELECT is(pg_temp.everything(pg_temp.filter(pg_temp.id('399'), NULL, NULL, NULL, NULL)), ARRAY[]::uuid[],
  'and finds none by person');
SELECT is(pg_temp.everything(pg_temp.filter(NULL, pg_temp.id('3'), NULL, NULL, NULL)), ARRAY[]::uuid[],
  'not even the entry made by that member');
SELECT pg_temp.act_as('4');
SELECT is(pg_temp.everything(pg_temp.filter(NULL, NULL, NULL, NULL, NULL)), ARRAY[]::uuid[],
  'another unit''s owner reads none of this unit''s entries');
RESET ROLE;

-- The app reads as the service role after its own admission, so plans are read as that role. Each filter that
-- matches many entries reads its index newest first and sorts nothing. A value that matches a handful of entries
-- unit-wide may use a narrower index and sort them, which costs nothing.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE plans AS
SELECT label, pg_temp.first_page_plan(filter_sql, 51) AS plan FROM (VALUES
  ('no filter', pg_temp.filter(NULL, NULL, NULL, NULL, NULL)),
  ('person', pg_temp.filter(pg_temp.id('301'), NULL, NULL, NULL, NULL)),
  ('member', pg_temp.filter(NULL, pg_temp.id('2'), NULL, NULL, NULL)),
  ('common kind', pg_temp.filter(NULL, NULL, 'availability.created', NULL, NULL)),
  ('kind', pg_temp.filter(NULL, NULL, 'availability.imported', NULL, NULL)),
  ('person and kind', pg_temp.filter(pg_temp.id('301'), NULL, 'availability.created', NULL, NULL)),
  ('days', pg_temp.filter(NULL, NULL, NULL, timestamptz '2029-12-20 00:00:00+00', timestamptz '2029-12-22 00:00:00+00'))
) AS first_pages(label, filter_sql);
INSERT INTO plans VALUES
  ('deep page, no filter', pg_temp.deep_page_plan(pg_temp.filter(NULL, NULL, NULL, NULL, NULL), 51)),
  ('deep page, person', pg_temp.deep_page_plan(pg_temp.filter(pg_temp.id('301'), NULL, NULL, NULL, NULL), 51)),
  ('rare member', pg_temp.first_page_plan(pg_temp.filter(NULL, pg_temp.id('3'), NULL, NULL, NULL), 51)),
  ('rare kind', pg_temp.first_page_plan(pg_temp.filter(NULL, NULL, 'availability.deleted', NULL, NULL), 51)),
  ('rare person', pg_temp.first_page_plan(pg_temp.filter(pg_temp.id('399'), NULL, NULL, NULL, NULL), 51));
RESET ROLE;
SELECT diag(label || ': ' || plan) FROM plans ORDER BY label;

SELECT unalike((SELECT plan FROM plans WHERE label = 'no filter'), '%Sort rows%', 'an unfiltered page sorts nothing');
SELECT alike((SELECT plan FROM plans WHERE label = 'no filter'), '%using idx_audit_logs_org_timestamp_id%',
  'and reads the unit''s entries newest first');
SELECT alike((SELECT plan FROM plans WHERE label = 'deep page, no filter'), '%using idx_audit_logs_org_timestamp_id%',
  'a deep page starts at its cursor in that index');
SELECT unalike((SELECT plan FROM plans WHERE label = 'deep page, no filter'), '%Sort rows%', 'and sorts nothing');
SELECT alike((SELECT plan FROM plans WHERE label = 'person'), '%using idx_audit_logs_org_subject_timestamp%',
  'a person''s entries are read from the person index');
SELECT unalike((SELECT plan FROM plans WHERE label = 'person'), '%Sort rows%', 'without a sort');
SELECT alike((SELECT plan FROM plans WHERE label = 'deep page, person'), '%using idx_audit_logs_org_subject_timestamp%',
  'a person''s deep page starts at its cursor in the person index');
SELECT alike((SELECT plan FROM plans WHERE label = 'member'), '%using idx_audit_logs_org_user_timestamp%',
  'a member''s entries are read from the member index');
SELECT unalike((SELECT plan FROM plans WHERE label = 'member'), '%Sort rows%', 'without a sort');
SELECT alike((SELECT plan FROM plans WHERE label = 'kind'), '%using idx_audit_logs_org_action_timestamp%',
  'a kind''s entries are read from the kind index');
SELECT unalike((SELECT plan FROM plans WHERE label = 'kind'), '%Sort rows%', 'without a sort');
SELECT unalike((SELECT plan FROM plans WHERE label = 'common kind'), '%Sort rows%', 'a kind most entries share sorts nothing either');
SELECT unalike((SELECT plan FROM plans WHERE label = 'person and kind'), '%Sort rows%', 'a person and a kind together sort nothing');
SELECT unalike((SELECT plan FROM plans WHERE label = 'days'), '%Sort rows%', 'a day range sorts nothing');
SELECT alike((SELECT plan FROM plans WHERE label = 'days'), '%using idx_audit_logs_org_timestamp_id%',
  'and reads only the unit''s entries in the range');

SELECT * FROM finish();
ROLLBACK;
