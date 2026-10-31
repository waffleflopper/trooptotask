BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('d1952000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(actor integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(actor)::text, true);
END; $$;
CREATE FUNCTION pg_temp.status_of(request integer) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.deletion_requests WHERE id = pg_temp.id(request);
$$;

INSERT INTO auth.users (id, email)
SELECT pg_temp.id(n), 'deletion-status-' || n || '@example.test' FROM generate_series(1, 2) AS n;
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id(101), 'Status Alpha', pg_temp.id(1));
INSERT INTO public.organization_memberships (organization_id, user_id, role) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'owner'),
  (pg_temp.id(101), pg_temp.id(2), 'member');
INSERT INTO public.deletion_requests (
  id, organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description
) VALUES
  (pg_temp.id(201), pg_temp.id(101), pg_temp.id(2), 'deletion-status-2@example.test', 'personnel', pg_temp.id(301), 'Archive A'),
  (pg_temp.id(202), pg_temp.id(101), pg_temp.id(2), 'deletion-status-2@example.test', 'personnel', pg_temp.id(302), 'Archive B');

-- Owner-level: the constraint is saved and validated, so existing rows were checked at migration time.
SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.deletion_requests'::regclass AND conname = 'deletion_requests_status_check'
    AND contype = 'c' AND convalidated
), 'deletion_requests_status_check is a validated CHECK constraint');
-- Owner-level: no ordinary role can insert a request, so the insert path is proved as the table owner.
SELECT throws_ok($$
  INSERT INTO public.deletion_requests (organization_id, requested_by, requested_by_email, resource_type, resource_id, resource_description, status)
  VALUES (pg_temp.id(101), pg_temp.id(2), 'deletion-status-2@example.test', 'personnel', pg_temp.id(303), 'Archive C', 'withdrawn')
$$, '23514', NULL, 'an owner-level insert of an unknown status violates the CHECK constraint');

-- An Organization owner reviews requests through the ordinary client: UPDATE is granted and the admin policy passes.
SELECT pg_temp.act(1);
SELECT throws_ok($$ UPDATE public.deletion_requests SET status = 'withdrawn' WHERE id = pg_temp.id(201) $$,
  '23514', NULL, 'an Organization owner cannot save an unknown status');
SELECT throws_ok($$ UPDATE public.deletion_requests SET status = 'Approved' WHERE id = pg_temp.id(201) $$,
  '23514', NULL, 'the status match is exact');
SELECT throws_ok($$ UPDATE public.deletion_requests SET status = '' WHERE id = pg_temp.id(201) $$,
  '23514', NULL, 'an empty status is refused');
SELECT is(pg_temp.status_of(201), 'pending', 'the refused writes left the request pending');

SELECT lives_ok($$ UPDATE public.deletion_requests SET status = 'denied', reviewed_by = pg_temp.id(1),
  reviewed_at = now(), denial_reason = 'Keep the record' WHERE id = pg_temp.id(201) $$,
  'an Organization owner can still deny a pending request');
SELECT is(pg_temp.status_of(201), 'denied', 'the denial was saved');
SELECT lives_ok($$ UPDATE public.deletion_requests SET status = 'approved' WHERE id = pg_temp.id(202) $$,
  'an Organization owner can still approve a pending request');
SELECT is(pg_temp.status_of(202), 'approved', 'the approval was saved');

-- Contrast: a member's write is filtered by RLS (no error, no row), so 23514 above came from the constraint.
SELECT pg_temp.act(2);
CREATE TEMP TABLE member_updates(count integer);
GRANT INSERT ON member_updates TO authenticated;
WITH changed AS (
  UPDATE public.deletion_requests SET status = 'withdrawn' WHERE id = pg_temp.id(202) RETURNING id
) INSERT INTO member_updates SELECT count(*)::integer FROM changed;
RESET ROLE;
SELECT is((SELECT count FROM member_updates), 0, 'a member update touches no row, so RLS filters it before the constraint');
SELECT is(pg_temp.status_of(202), 'approved', 'the member write changed nothing');

SELECT * FROM finish();
ROLLBACK;
