-- A signed-in member writing through the Data API is recorded as the author of what they
-- create and cannot rename the author of what they edit. Deletion review, document storage
-- limits and member labels hold the same line. Every assertion runs as `authenticated`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('f9100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.act_as(n integer, p_email text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(n)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(n), 'email', p_email, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.id(integer), pg_temp.act_as(integer, text) TO authenticated, service_role;

INSERT INTO auth.users (id, email) VALUES
  (pg_temp.id(1), 'attribution-actor@example.test'),
  (pg_temp.id(2), 'attribution-commander@example.test'),
  (pg_temp.id(3), 'attribution-suspended@example.test'),
  (pg_temp.id(4), 'attribution-bravo@example.test');
INSERT INTO public.organizations (id, name, created_by, url_slug) VALUES
  (pg_temp.id(101), 'Attribution Alpha', pg_temp.id(2), 'attribution-alpha'),
  (pg_temp.id(102), 'Attribution Bravo', pg_temp.id(4), 'attribution-bravo');
INSERT INTO public.organization_memberships
  (organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email)
VALUES
  (pg_temp.id(101), pg_temp.id(1), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'attribution-actor@example.test'),
  (pg_temp.id(101), pg_temp.id(2), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'attribution-commander@example.test'),
  (pg_temp.id(101), pg_temp.id(3), 'admin', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'attribution-suspended@example.test'),
  (pg_temp.id(102), pg_temp.id(4), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], 'attribution-bravo@example.test');
INSERT INTO public.user_suspensions (user_id, suspended_by, reason) VALUES (pg_temp.id(3), pg_temp.id(2), 'synthetic');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug)
VALUES (pg_temp.id(301), pg_temp.id(101), 'SGT', 'Attribution', 'Subject', 'attribution-subject');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title)
VALUES (pg_temp.id(401), pg_temp.id(101), 'ATTR-1', 'Attribution task');

-- Saved rows written by the commander, before the actor edits them.
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text)
VALUES (pg_temp.id(501), pg_temp.id(101), pg_temp.id(301), pg_temp.id(2)::text, 'Commander note');
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, created_by)
VALUES (pg_temp.id(502), pg_temp.id(101), pg_temp.id(301), 'Commander follow-up', pg_temp.id(2)::text);
INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, uploaded_by, file_size_bytes, content_type)
VALUES (pg_temp.id(503), pg_temp.id(101), pg_temp.id(301), 'Commander document', 'synthetic/attribution/commander.pdf',
  pg_temp.id(2)::text, 5000, 'application/pdf');
INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, conducted_by)
VALUES (pg_temp.id(504), pg_temp.id(101), pg_temp.id(301), '2026-01-01', 'Counseling', 'Commander counseling', pg_temp.id(2)::text, 'CPT Typed Name');
INSERT INTO public.sign_in_rosters (id, organization_id, title, personnel_snapshot, created_by)
VALUES (pg_temp.id(505), pg_temp.id(101), 'Commander roster', '[]', pg_temp.id(2));
INSERT INTO public.personnel_ict_completions (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method, logged_by)
VALUES (pg_temp.id(506), pg_temp.id(101), pg_temp.id(301), pg_temp.id(401), '2026-01-01', 'Practical Exercise', pg_temp.id(2));
INSERT INTO public.data_exports (id, org_id, requested_by, status)
VALUES (pg_temp.id(507), pg_temp.id(101), pg_temp.id(2), 'processing');
INSERT INTO public.training_views (id, organization_id, name, created_by)
VALUES (pg_temp.id(508), pg_temp.id(101), 'Commander view', pg_temp.id(2));
INSERT INTO public.deletion_requests (id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status, reviewed_by, reviewed_at)
VALUES
  (pg_temp.id(601), pg_temp.id(101), pg_temp.id(2), 'attribution-commander@example.test', 'personnel', pg_temp.id(301), 'Pending request', 'pending', NULL, NULL),
  (pg_temp.id(602), pg_temp.id(101), pg_temp.id(2), 'attribution-commander@example.test', 'personnel', pg_temp.id(301), 'Approved request', 'approved', pg_temp.id(2), '2026-01-02T00:00:00Z');
INSERT INTO public.organization_invitations (id, organization_id, email, invited_by)
VALUES
  (pg_temp.id(701), pg_temp.id(101), 'attribution-actor@example.test', pg_temp.id(2)),
  (pg_temp.id(702), pg_temp.id(101), 'attribution-invitee@example.test', pg_temp.id(2));

-- (table, author column, saved row, inserted row, insert statement whose author names the commander)
CREATE TEMP TABLE authored (tbl text, col text, saved uuid, inserted uuid, forged_insert text) ON COMMIT DROP;
GRANT SELECT ON authored TO authenticated;
INSERT INTO authored VALUES
  ('leader_notes', 'author', pg_temp.id(501), pg_temp.id(801), format(
    'INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text) VALUES (%L, %L, %L, %L, %L)',
    pg_temp.id(801), pg_temp.id(101), pg_temp.id(301), pg_temp.id(2), 'Forged note')),
  ('personnel_follow_ups', 'created_by', pg_temp.id(502), pg_temp.id(802), format(
    'INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title) VALUES (%L, %L, %L, %L)',
    pg_temp.id(802), pg_temp.id(101), pg_temp.id(301), 'Forged follow-up')),
  ('personnel_documents', 'uploaded_by', pg_temp.id(503), pg_temp.id(803), format(
    'INSERT INTO public.personnel_documents (id, organization_id, personnel_id, title, file_path, uploaded_by, file_size_bytes, content_type) VALUES (%L, %L, %L, %L, %L, %L, 10, %L)',
    pg_temp.id(803), pg_temp.id(101), pg_temp.id(301), 'Forged document', pg_temp.id(101) || '/personnel/' || pg_temp.id(301) || '/documents/forged.pdf', pg_temp.id(2), 'application/pdf')),
  ('counseling_records', 'uploaded_by', pg_temp.id(504), pg_temp.id(804), format(
    'INSERT INTO public.counseling_records (id, organization_id, personnel_id, date_conducted, subject, title) VALUES (%L, %L, %L, %L, %L, %L)',
    pg_temp.id(804), pg_temp.id(101), pg_temp.id(301), '2026-01-03', 'Counseling', 'Forged counseling')),
  ('sign_in_rosters', 'created_by', pg_temp.id(505), pg_temp.id(805), format(
    'INSERT INTO public.sign_in_rosters (id, organization_id, title, personnel_snapshot, created_by) VALUES (%L, %L, %L, %L, %L)',
    pg_temp.id(805), pg_temp.id(101), 'Forged roster', '[]', pg_temp.id(2))),
  ('personnel_ict_completions', 'logged_by', pg_temp.id(506), pg_temp.id(806), format(
    'INSERT INTO public.personnel_ict_completions (id, organization_id, personnel_id, ict_task_id, completed_at, validation_method, logged_by) VALUES (%L, %L, %L, %L, %L, %L, %L)',
    pg_temp.id(806), pg_temp.id(101), pg_temp.id(301), pg_temp.id(401), '2026-01-04', 'Practical Exercise', pg_temp.id(2))),
  ('training_views', 'created_by', pg_temp.id(508), pg_temp.id(808), format(
    'INSERT INTO public.training_views (id, organization_id, name, created_by) VALUES (%L, %L, %L, %L)',
    pg_temp.id(808), pg_temp.id(101), 'Forged view', pg_temp.id(2)));

-- Reads the stored value past RLS; some inserted rows are outside the actor's read scope.
CREATE FUNCTION pg_temp.author_of(p_table text, p_column text, p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE answer text;
BEGIN
  EXECUTE format('SELECT %I::text FROM public.%I WHERE id = $1', p_column, p_table) INTO answer USING p_id;
  RETURN answer;
END;
$$;
CREATE FUNCTION pg_temp.rewrite_author(p_table text, p_column text, p_id uuid, p_author uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
  EXECUTE format('UPDATE public.%I SET %I = $2 WHERE id = $1', p_table, p_column) USING p_id, p_author;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
CREATE FUNCTION pg_temp.run(p_sql text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE p_sql; END; $$;
GRANT EXECUTE ON FUNCTION pg_temp.author_of(text, text, uuid), pg_temp.rewrite_author(text, text, uuid, uuid), pg_temp.run(text) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as(1, 'attribution-actor@example.test');
SELECT is(current_user, 'authenticated'::name, 'security assertions run as an ordinary signed-in role');

-- Authors
SELECT pg_temp.run(forged_insert) FROM authored;
-- A signed-in roster insert gets a database-chosen id.
RESET ROLE;
UPDATE authored SET inserted = (SELECT id FROM public.sign_in_rosters WHERE title = 'Forged roster') WHERE tbl = 'sign_in_rosters';
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.author_of(tbl, col, inserted),
  pg_temp.id(1)::text, tbl || '.' || col || ' records the caller, not the commander named in the insert') FROM authored;
SELECT is(pg_temp.rewrite_author(tbl, col, saved, pg_temp.id(1)), 1, tbl || ' update reaches the saved row') FROM authored WHERE tbl NOT IN ('counseling_records','personnel_follow_ups');
SELECT throws_ok(format('UPDATE public.%I SET %I = %L WHERE id = %L', tbl, col, pg_temp.id(1), saved),
  '42501', NULL, tbl || ' author is not client-updatable') FROM authored WHERE tbl IN ('counseling_records','personnel_follow_ups');
SELECT is(pg_temp.author_of(tbl, col, saved), pg_temp.id(2)::text,
  tbl || '.' || col || ' keeps the saved author when an edit names the caller') FROM authored;

SELECT throws_ok($$ UPDATE public.data_exports SET requested_by = pg_temp.id(1) WHERE id = pg_temp.id(507) $$,
  '42501', NULL, 'export requester cannot be rewritten');
SELECT lives_ok($$ SELECT public.finish_data_export(pg_temp.id(101), pg_temp.id(507), 'completed', now(), 1024) $$, 'export completion uses the lifecycle function');
SELECT results_eq($$ SELECT requested_by, status FROM public.data_exports WHERE id = pg_temp.id(507) $$,
  $$ VALUES (pg_temp.id(2), 'completed'::text) $$, 'updating an export keeps the member who requested it');

UPDATE public.leader_notes SET text = 'Edited by actor' WHERE id = pg_temp.id(501);
SELECT results_eq($$ SELECT author, text FROM public.leader_notes WHERE id = pg_temp.id(501) $$,
  $$ VALUES (pg_temp.id(2)::text, 'Edited by actor'::text) $$, 'editing a note keeps its original author');
SELECT throws_ok($$ UPDATE public.counseling_records SET conducted_by = 'CPT Typed Name' WHERE id = pg_temp.id(804) $$,
  '42501', NULL, 'counselor names are written through the server artifact command');

-- Document storage
SELECT throws_ok($$ UPDATE public.personnel_documents SET file_size_bytes = 1 WHERE id = pg_temp.id(503) $$,
  '42501', NULL, 'a member cannot shrink a saved document size to free storage');
SELECT lives_ok($$ UPDATE public.personnel_documents SET title = 'Renamed' WHERE id = pg_temp.id(503) $$,
  'a member can still edit document fields other than its size');
SELECT throws_ok($$ UPDATE public.organizations SET personnel_document_storage_cap_bytes = 1099511627776 WHERE id = pg_temp.id(101) $$,
  '23514', NULL, 'a storage cap above 1 GiB is rejected');
SELECT throws_ok($$ UPDATE public.organizations SET personnel_document_storage_cap_bytes = 1048576 WHERE id = pg_temp.id(101) $$,
  '23514', NULL, 'a storage cap below 10 MiB is rejected');
SELECT lives_ok($$ UPDATE public.organizations SET personnel_document_storage_cap_bytes = 1073741824 WHERE id = pg_temp.id(101) $$,
  'a storage cap of exactly 1 GiB is accepted');

-- Deletion review
SELECT throws_ok($$ UPDATE public.deletion_requests SET status = 'pending', reviewed_by = NULL WHERE id = pg_temp.id(602) $$,
  '42501', NULL, 'an admin cannot reopen or rewrite a deletion request directly');
SELECT is(public.deny_deletion_request(pg_temp.id(101), pg_temp.id(602), 'personnel', pg_temp.id(301), 'Too late'), false,
  'denying a request that is no longer pending changes nothing');
SELECT is(public.deny_deletion_request(pg_temp.id(101), pg_temp.id(601), 'training_type', pg_temp.id(301), 'Wrong target'), false,
  'denying with a different target changes nothing');
SELECT is(public.deny_deletion_request(pg_temp.id(101), pg_temp.id(601), 'personnel', pg_temp.id(301), 'Not needed'), true,
  'an admin denies a pending request');
SELECT results_eq(
  $$ SELECT status, reviewed_by, reviewed_at IS NOT NULL, denial_reason, requested_by FROM public.deletion_requests WHERE id = pg_temp.id(601) $$,
  $$ VALUES ('denied'::text, pg_temp.id(1), true, 'Not needed'::text, pg_temp.id(2)) $$,
  'denial records the caller as reviewer and keeps the requester');
SELECT results_eq($$ SELECT status, reviewed_by FROM public.deletion_requests WHERE id = pg_temp.id(602) $$,
  $$ VALUES ('approved'::text, pg_temp.id(2)) $$, 'the approved request keeps its status and reviewer');

-- Feedback reporter
INSERT INTO public.beta_feedback (id, user_id, user_email, organization_id, organization_name, message)
VALUES (pg_temp.id(901), pg_temp.id(1), 'commander@example.test', pg_temp.id(101), 'Spoofed Organization', 'Reported issue');
INSERT INTO public.beta_feedback (id, user_id, user_email, organization_id, organization_name, message)
VALUES (pg_temp.id(902), pg_temp.id(1), 'commander@example.test', pg_temp.id(102), 'Attribution Bravo', 'Foreign context');
SELECT results_eq($$ SELECT user_email, organization_name FROM public.beta_feedback ORDER BY id $$,
  $$ VALUES ('attribution-actor@example.test'::text, 'Attribution Alpha'::text), ('attribution-actor@example.test'::text, NULL::text) $$,
  'feedback shows the reporter account email and only the name of an Organization they belong to');

-- Invitations: each lifecycle actor column only accompanies its own transition.
SELECT throws_ok($$ UPDATE public.organization_invitations SET status = 'declined', declined_at = now(), declined_by = pg_temp.id(1),
  revoked_by = pg_temp.id(2) WHERE id = pg_temp.id(701) $$, '23514', NULL, 'an invitee who declines cannot name a revoker');
SELECT throws_ok($$ UPDATE public.organization_invitations SET status = 'revoked', revoked_at = now(), revoked_by = pg_temp.id(1),
  declined_by = pg_temp.id(2) WHERE id = pg_temp.id(702) $$, '23514', NULL, 'a member manager who revokes cannot name a decliner');

-- Member labels
SELECT is((SELECT count(*) FROM public.organization_member_labels(pg_temp.id(101))), 3::bigint,
  'an admitted member reads every member label');
SELECT pg_temp.act_as(3, 'attribution-suspended@example.test');
SELECT is((SELECT count(*) FROM public.organization_member_labels(pg_temp.id(101))), 0::bigint,
  'a suspended account reads no member labels');
SELECT throws_ok($$ SELECT public.deny_deletion_request(pg_temp.id(101), pg_temp.id(601), 'personnel', pg_temp.id(301), NULL) $$,
  '42501', NULL, 'a suspended admin cannot review deletion requests');
RESET ROLE;
UPDATE public.organizations SET suspended_at = now() WHERE id = pg_temp.id(102);
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as(4, 'attribution-bravo@example.test');
SELECT is((SELECT count(*) FROM public.organization_member_labels(pg_temp.id(102))), 0::bigint,
  'a member of a suspended Organization reads no member labels');

-- Service-role writes keep the value the server supplies.
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text)
VALUES (pg_temp.id(811), pg_temp.id(101), pg_temp.id(301), pg_temp.id(2)::text, 'Server note');
SELECT is((SELECT author FROM public.leader_notes WHERE id = pg_temp.id(811)), pg_temp.id(2)::text,
  'a service-role write keeps the author the server supplies');

-- Privileges
RESET ROLE;
SELECT is(has_function_privilege('anon', 'public.deny_deletion_request(uuid,uuid,text,uuid,text)', 'EXECUTE'), false,
  'anonymous callers cannot review deletion requests');
CREATE FUNCTION public.attribution_default_privilege_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1';
CREATE TABLE public.attribution_default_privilege_probe (id integer);
SELECT is((SELECT count(*) FROM pg_proc AS f, aclexplode(f.proacl) AS acl
  WHERE f.oid = 'public.attribution_default_privilege_probe()'::regprocedure AND acl.grantee = 'anon'::regrole), 0::bigint,
  'a new function carries no explicit anonymous grant');
SELECT is(has_table_privilege('authenticated', 'public.attribution_default_privilege_probe', 'TRUNCATE'), false,
  'a new table grants no TRUNCATE to signed-in callers by default');

SELECT * FROM finish();
ROLLBACK;
