-- An Evaluation stays on the rating scheme until an Evals operator archives it, whatever step its evaluation has
-- reached. Every call below is made as an ordinary signed-in member.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('e7c30000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.new_entry(p_person text DEFAULT '301', p_start date DEFAULT '2030-01-01',
  p_end date DEFAULT '2030-12-31') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id,
    senior_rater_name, rating_period_start, rating_period_end, report_type)
  VALUES (v_id, pg_temp.id('101'), pg_temp.id(p_person), 'NCOER', pg_temp.id('302'), 'COL Senior', p_start, p_end, 'AN');
  RETURN v_id;
END;
$$;
CREATE FUNCTION pg_temp.stored(p_entry uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT to_jsonb(r) FROM public.rating_scheme_entries r WHERE r.id = p_entry;
$$;
CREATE TEMP TABLE probe (label text, entry uuid, result jsonb);
CREATE TEMP TABLE changed (entry uuid, successor uuid);
GRANT ALL ON probe, changed TO authenticated;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'membership-' || n || '@example.test', now()
FROM generate_series(1, 4) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES
  (pg_temp.id('101'), 'Membership Alpha', pg_temp.id('1')),
  (pg_temp.id('102'), 'Membership Foreign', pg_temp.id('1'));
INSERT INTO public.groups (id, organization_id, name) VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'Alpha'),
  (pg_temp.id('202'), pg_temp.id('101'), 'Bravo');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'viewer', '{"ratingScheme":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id('101'), pg_temp.id('3'), 'member', 'viewer', '{"ratingScheme":"operate"}', 'groups', ARRAY[pg_temp.id('202')]),
  (pg_temp.id('101'), pg_temp.id('4'), 'member', 'viewer', '{"ratingScheme":"view"}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Rated', 'Able', 'membership-rated'),
  (pg_temp.id('302'), pg_temp.id('101'), pg_temp.id('201'), 'SSG', 'First', 'Rater', 'membership-rater'),
  (pg_temp.id('303'), pg_temp.id('101'), pg_temp.id('201'), 'SFC', 'Next', 'Rater', 'membership-next'),
  (pg_temp.id('304'), pg_temp.id('101'), pg_temp.id('201'), 'SGT', 'Roster', 'Baker', 'membership-roster');

SELECT ok(NOT has_function_privilege('anon', 'public.set_rating_scheme_entry_archived(uuid,uuid,boolean)', 'EXECUTE'),
  'signed-out callers cannot archive an evaluation');
SELECT hasnt_column('public', 'rating_scheme_entries', 'status', 'membership does not bring the status column back');

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('2');

-- Archive and restore, with the evaluation open and then completed.
INSERT INTO probe (label, entry) VALUES ('open', pg_temp.new_entry()), ('completed', pg_temp.new_entry());
UPDATE probe SET result = public.transition_rating_scheme_entry(pg_temp.id('101'), entry, NULL, 'completed')
WHERE label = 'completed';
UPDATE probe SET result = NULL;

SELECT results_eq(
  $$ SELECT archived_at IS NULL, archived_by FROM public.rating_scheme_entries WHERE id IN (SELECT entry FROM probe) $$,
  $$ VALUES (true, NULL::text), (true, NULL::text) $$,
  'a new or completed entry is on the scheme');

INSERT INTO changed (entry) SELECT entry FROM probe WHERE label = 'open';
SELECT is(public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, true),
  jsonb_build_object('changed', true, 'entry', pg_temp.stored(entry)), 'archiving returns the entry as stored')
FROM changed;
SELECT results_eq(
  $$ SELECT archived_at IS NOT NULL, archived_by, workflow_status FROM public.rating_scheme_entries
     WHERE id = (SELECT entry FROM changed) $$,
  $$ VALUES (true, pg_temp.id('2')::text, NULL::text) $$,
  'archiving an open evaluation names the member and leaves its step alone');
SELECT is((public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, true) ->> 'changed')::boolean, false,
  'archiving an archived entry again changes nothing')
FROM changed;
SELECT is(public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, false),
  jsonb_build_object('changed', true, 'entry', pg_temp.stored(entry) || '{"archived_at": null, "archived_by": null}'),
  'restoring returns the entry on the scheme again')
FROM changed;
SELECT results_eq(
  $$ SELECT archived_at, archived_by FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM changed) $$,
  $$ VALUES (NULL::timestamptz, NULL::text) $$,
  'a restored entry has no archive time or member');
SELECT is((public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, false) ->> 'changed')::boolean, false,
  'restoring a listed entry changes nothing')
FROM changed;

SELECT is((public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, true) -> 'entry' ->> 'workflow_status'),
  'completed', 'a completed evaluation archives and stays completed')
FROM probe WHERE label = 'completed';
SELECT results_eq(
  $$ SELECT archived_at IS NOT NULL, workflow_status FROM public.rating_scheme_entries
     WHERE id = (SELECT entry FROM probe WHERE label = 'completed') $$,
  $$ VALUES (true, 'completed'::text) $$,
  'the archived completed entry keeps its completed step');
SELECT is((public.transition_rating_scheme_entry(pg_temp.id('101'), entry, 'completed', NULL) -> 'entry' ->> 'archived_at') IS NOT NULL,
  true, 'moving the evaluation does not put an archived entry back on the scheme')
FROM probe WHERE label = 'completed';

SELECT throws_ok(format($$ SELECT public.set_rating_scheme_entry_archived(%L, %L, NULL) $$, pg_temp.id('101'),
    (SELECT entry FROM changed)), '22023', 'Choose whether to archive or restore the evaluation',
  'an unnamed request is refused');

-- Direct writes to either column are refused, on update and on insert.
SELECT throws_ok(format($$ UPDATE public.rating_scheme_entries SET archived_at = now() WHERE id = %L $$,
    (SELECT entry FROM changed)), '42501', NULL, 'an operator cannot write archived_at directly');
SELECT throws_ok(format($$ UPDATE public.rating_scheme_entries SET archived_by = %L WHERE id = %L $$,
    pg_temp.id('1')::text, (SELECT entry FROM probe WHERE label = 'completed')),
  '42501', NULL, 'an operator cannot name who archived an entry');
SELECT throws_ok(format($$ INSERT INTO public.rating_scheme_entries (organization_id, rated_person_id, eval_type,
    rating_period_start, rating_period_end, archived_at) VALUES (%L, %L, 'NCOER', '2031-01-01', '2031-12-31', now()) $$,
    pg_temp.id('101'), pg_temp.id('301')), '42501', NULL, 'an operator cannot create an entry already archived');
SELECT throws_ok(format($$ INSERT INTO public.rating_scheme_entries (organization_id, rated_person_id, eval_type,
    rating_period_start, rating_period_end, archived_by) VALUES (%L, %L, 'NCOER', '2031-01-01', '2031-12-31', %L) $$,
    pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('1')::text), '42501', NULL,
  'an operator cannot create an entry archived by someone');
SELECT is((SELECT count(*)::int FROM public.rating_scheme_entries WHERE rating_period_start = '2031-01-01'), 0,
  'the refused inserts created nothing');

-- The first member to archive stays named when another member repeats or changes the entry later.
INSERT INTO probe (label, entry) VALUES ('named', pg_temp.new_entry());
SELECT public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, true) FROM probe WHERE label = 'named';
SELECT pg_temp.act_as('1');
SELECT public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, true) FROM probe WHERE label = 'named';
SELECT is((SELECT archived_by FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM probe WHERE label = 'named')),
  pg_temp.id('2')::text, 'a repeated archive does not name a second member');
SELECT pg_temp.act_as('2');

-- Scope and access.
INSERT INTO probe (label, entry) VALUES ('scope', pg_temp.new_entry());
SELECT pg_temp.act_as('3');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_entry_archived(%L, %L, true) $$, pg_temp.id('101'),
    (SELECT entry FROM probe WHERE label = 'scope')), 'P0002', 'Evaluation not found',
  'an operator outside the rated Person''s Group cannot find the entry to archive it');
SELECT pg_temp.act_as('4');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_entry_archived(%L, %L, true) $$, pg_temp.id('101'),
    (SELECT entry FROM probe WHERE label = 'scope')), '42501', NULL, 'a view-only member cannot archive an evaluation');
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_entry_archived(%L, %L, true) $$, pg_temp.id('101'),
    (SELECT entry FROM probe WHERE label = 'scope')), 'P0002', 'Evaluation not found', 'a request without a user finds nothing');
SELECT pg_temp.act_as('2');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_entry_archived(%L, %L, true) $$, pg_temp.id('102'),
    (SELECT entry FROM probe WHERE label = 'scope')), 'P0002', 'Evaluation not found',
  'the entry cannot be archived through another Organization');
SELECT throws_ok(format($$ SELECT public.set_rating_scheme_entry_archived(%L, %L, true) $$, pg_temp.id('101'),
    gen_random_uuid()), 'P0002', 'Evaluation not found', 'an entry that does not exist cannot be archived');
SELECT is((SELECT archived_at FROM public.rating_scheme_entries WHERE id = (SELECT entry FROM probe WHERE label = 'scope')),
  NULL::timestamptz, 'denied calls left the entry on the scheme');

-- Change of rater takes the closed entry off the scheme and starts the successor on it.
INSERT INTO changed (entry) SELECT pg_temp.new_entry('301', '2032-01-01', '2032-12-31');
UPDATE changed SET successor = (public.change_rating_scheme_rater(pg_temp.id('101'), entry, '2032-06-15', pg_temp.id('303'), NULL)
  -> 'successor' ->> 'id')::uuid WHERE entry NOT IN (SELECT entry FROM probe) AND successor IS NULL
  AND entry = (SELECT entry FROM changed ORDER BY ctid DESC LIMIT 1);
SELECT results_eq(
  $$ SELECT workflow_status, archived_at IS NOT NULL, archived_by FROM public.rating_scheme_entries
     WHERE id = (SELECT entry FROM changed ORDER BY ctid DESC LIMIT 1) $$,
  $$ VALUES ('completed'::text, true, pg_temp.id('2')::text) $$,
  'the closed entry is completed and archived by the member who changed the rater');
SELECT results_eq(
  $$ SELECT workflow_status, archived_at, archived_by FROM public.rating_scheme_entries
     WHERE id = (SELECT successor FROM changed ORDER BY ctid DESC LIMIT 1) $$,
  $$ VALUES (NULL::text, NULL::timestamptz, NULL::text) $$,
  'the successor starts on the scheme');
SELECT is(public.change_rating_scheme_rater(pg_temp.id('101'), entry, '2032-06-15', pg_temp.id('303'), NULL),
  jsonb_build_object('entry', pg_temp.stored(entry), 'successor', pg_temp.stored(successor)),
  'replaying the change returns the archived entry and its successor')
FROM (SELECT * FROM changed ORDER BY ctid DESC LIMIT 1) latest;

INSERT INTO probe (label, entry) VALUES ('archived first', pg_temp.new_entry('301', '2033-01-01', '2033-12-31'));
SELECT public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, true) FROM probe WHERE label = 'archived first';
SELECT pg_temp.act_as('1');
SELECT public.change_rating_scheme_rater(pg_temp.id('101'), entry, '2033-06-15', pg_temp.id('303'), NULL)
FROM probe WHERE label = 'archived first';
SELECT results_eq(
  $$ SELECT workflow_status, archived_at IS NOT NULL, archived_by FROM public.rating_scheme_entries
     WHERE id = (SELECT entry FROM probe WHERE label = 'archived first') $$,
  $$ VALUES ('completed'::text, true, pg_temp.id('2')::text) $$,
  'an entry archived before its rater changed stays archived by the member who archived it');
SELECT pg_temp.act_as('2');

-- The rating scheme the Person's card and the roster read lists only entries still on it.
INSERT INTO probe (label, entry) VALUES ('roster', pg_temp.new_entry('304'));
CREATE FUNCTION pg_temp.roster_entries() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.roster_signals(pg_temp.id('101'), '2030-06-01', '2029-06-01', ARRAY['evaluations'], ARRAY[pg_temp.id('304')])
    -> 'evaluations' -> 'entries';
$$;
SELECT is(pg_temp.roster_entries() -> 0 ->> 1, (SELECT entry::text FROM probe WHERE label = 'roster'),
  'an open evaluation on the scheme is the Person''s active evaluation');
SELECT public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, true) FROM probe WHERE label = 'roster';
SELECT is(pg_temp.roster_entries(), '[]'::jsonb, 'an open evaluation taken off the scheme is no longer active');
SELECT public.set_rating_scheme_entry_archived(pg_temp.id('101'), entry, false) FROM probe WHERE label = 'roster';
SELECT is(pg_temp.roster_entries() -> 0 ->> 1, (SELECT entry::text FROM probe WHERE label = 'roster'),
  'restoring it makes the evaluation active again');

-- The audit log names the member for each change.
RESET ROLE;
SELECT results_eq(
  $$ SELECT action, user_id, details -> 'change' FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND resource_id = (SELECT entry FROM changed ORDER BY ctid LIMIT 1)
       AND action LIKE 'rating_scheme.%' ORDER BY action $$,
  $$ VALUES ('rating_scheme.archived'::text, pg_temp.id('2'), NULL::jsonb),
    ('rating_scheme.created'::text, pg_temp.id('2'), NULL::jsonb),
    ('rating_scheme.restored'::text, pg_temp.id('2'), NULL::jsonb) $$,
  'archiving and restoring are recorded as their own entries with the member');
SELECT results_eq(
  $$ SELECT action, user_id, details -> 'change' FROM public.audit_logs
     WHERE org_id = pg_temp.id('101') AND action = 'rating_scheme.updated'
       AND resource_id = (SELECT entry FROM changed ORDER BY ctid DESC LIMIT 1) $$,
  $$ VALUES ('rating_scheme.updated'::text, pg_temp.id('2'),
    '{"periodEnd": {"from": "2032-12-31", "to": "2032-06-15"}, "reportType": {"from": "AN", "to": "CR"},
      "membership": true, "workflowStatus": {"from": null, "to": "completed"}}'::jsonb) $$,
  'a change of rater records that the entry also left the scheme');

SELECT * FROM finish();
ROLLBACK;
