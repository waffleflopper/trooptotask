BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();
SELECT dblink_connect('first','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
 ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_grant_first');
SELECT dblink_connect('second','hostaddr=' || host(inet_server_addr()) || ' port=' || current_setting('port') ||
 ' user=postgres password=postgres dbname=' || current_database() || ' application_name=t3_grant_second');
SELECT dblink_exec('first', $$SET statement_timeout='5s'$$);
SELECT dblink_exec('second', $$SET statement_timeout='5s'$$);

CREATE FUNCTION pg_temp.cleanup() RETURNS void LANGUAGE sql AS $$
 SELECT dblink_exec('first',$cleanup$
  DELETE FROM public.audit_logs WHERE resource_id::text LIKE 'f2000000-%';
  DELETE FROM public.access_requests WHERE email LIKE 'race-%@example.test';
  DELETE FROM public.organizations WHERE id::text LIKE 'f2000000-%';
  DELETE FROM auth.users WHERE id::text LIKE 'f2000000-%';
 $cleanup$);
$$;
CREATE FUNCTION pg_temp.second_waits() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp() + interval '3 seconds';
BEGIN
 LOOP
  PERFORM pg_stat_clear_snapshot();
  IF EXISTS (SELECT 1 FROM pg_stat_activity
    WHERE application_name='t3_grant_second' AND wait_event_type='Lock') THEN RETURN true; END IF;
  IF clock_timestamp() >= deadline THEN RETURN false; END IF;
  PERFORM pg_sleep(0.01);
 END LOOP;
END $$;
CREATE FUNCTION pg_temp.bridge_sql(p_invitation text, p_org text, p_email text, p_inviter text) RETURNS text
LANGUAGE sql AS $$
 SELECT format($q$ SELECT bridge_status, access_request_id FROM public.link_organization_invitation_access_request(
  %L,%L,%L,%L,now(),'member',NULL,'{}'::jsonb,'organization',ARRAY[]::uuid[]) $q$, p_invitation, p_org, p_email, p_inviter);
$$;

-- A previous interrupted dblink run can leave its committed synthetic rows.
SELECT pg_temp.cleanup();
SELECT dblink_exec('first',$fixture$
 INSERT INTO auth.users(id,email) VALUES
  ('f2000000-0000-4000-8000-000000000001','race-owner-a@example.test'),
  ('f2000000-0000-4000-8000-000000000002','race-owner-b@example.test'),
  ('f2000000-0000-4000-8000-000000000003','race-platform@example.test');
 INSERT INTO public.organizations(id,name,created_by) VALUES
  ('f2000000-0000-4000-8000-000000000101','Race Unit A','f2000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000102','Race Unit B','f2000000-0000-4000-8000-000000000002');
 INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,access_scope_kind) VALUES
  ('f2000000-0000-4000-8000-000000000101','f2000000-0000-4000-8000-000000000001','owner','editor','organization'),
  ('f2000000-0000-4000-8000-000000000102','f2000000-0000-4000-8000-000000000002','owner','editor','organization');
 INSERT INTO public.organization_invitations(id,organization_id,email,invited_by,expires_at,role,access_scope_kind) VALUES
  ('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000101','race-pair@example.test','f2000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000302','f2000000-0000-4000-8000-000000000102','race-pair@example.test','f2000000-0000-4000-8000-000000000002',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000303','f2000000-0000-4000-8000-000000000101','race-rescind@example.test','f2000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000304','f2000000-0000-4000-8000-000000000102','race-rescind@example.test','f2000000-0000-4000-8000-000000000002',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000305','f2000000-0000-4000-8000-000000000101','race-issue@example.test','f2000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000306','f2000000-0000-4000-8000-000000000101','race-claim@example.test','f2000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000307','f2000000-0000-4000-8000-000000000101','race-sibling@example.test','f2000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000308','f2000000-0000-4000-8000-000000000102','race-sibling@example.test','f2000000-0000-4000-8000-000000000002',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000309','f2000000-0000-4000-8000-000000000101','race-issuers@example.test','f2000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f2000000-0000-4000-8000-000000000310','f2000000-0000-4000-8000-000000000101','race-retry@example.test','f2000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization');
$fixture$);

SELECT dblink_exec('first','BEGIN');
SELECT is((SELECT status FROM dblink('first',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000101','race-pair@example.test','f2000000-0000-4000-8000-000000000001'))
 AS result(status text, request_id uuid)),'created','first bridge creates the request inside its transaction');
SELECT dblink_send_query('second',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000302','f2000000-0000-4000-8000-000000000102','race-pair@example.test','f2000000-0000-4000-8000-000000000002'));
SELECT ok(pg_temp.second_waits(),'second bridge waits on the bridge key');
SELECT dblink_exec('first','COMMIT');
SELECT is((SELECT status FROM dblink_get_result('second') AS result(status text, request_id uuid)),'linked','second bridge links the committed request');
SELECT * FROM dblink_get_result('second') AS result(status text, request_id uuid);
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE email='race-pair@example.test'),1,'two first-time bridges leave one request');
SELECT is((SELECT count(DISTINCT access_request_id)::integer FROM public.access_request_organization_invitation_links
 WHERE organization_invitation_id IN ('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000302')),1,
 'both invitations link the same request');

SELECT * FROM dblink('first',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000303','f2000000-0000-4000-8000-000000000101','race-rescind@example.test','f2000000-0000-4000-8000-000000000001')) AS bridged(status text, request_id uuid);
CREATE TEMP TABLE rescinded_request AS SELECT id FROM public.access_requests WHERE email='race-rescind@example.test';
SELECT dblink_exec('first','BEGIN');
SELECT is((SELECT status FROM dblink('first',format($q$ SELECT rescind_status FROM public.rescind_access_request_and_block_linked_invitations(%L,'f2000000-0000-4000-8000-000000000003') $q$,
 (SELECT id FROM rescinded_request))) AS result(status text)),'rescinded','rescind holds the request');
SELECT dblink_send_query('second',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000304','f2000000-0000-4000-8000-000000000102','race-rescind@example.test','f2000000-0000-4000-8000-000000000002'));
SELECT ok(pg_temp.second_waits(),'bridge waits for the rescinding transaction');
SELECT dblink_exec('first','COMMIT');
SELECT is((SELECT status FROM dblink_get_result('second') AS result(status text, request_id uuid)),'created','bridge after rescind creates a fresh request');
SELECT * FROM dblink_get_result('second') AS result(status text, request_id uuid);
SELECT results_eq($$ SELECT status,approval_basis FROM public.access_requests WHERE email='race-rescind@example.test' ORDER BY status $$,
 $$ VALUES ('approved'::text,'organization_invitation'::text),('rescinded'::text,'organization_invitation'::text) $$,
 'rescind stands and the later invitation vouches for a new request');
SELECT isnt((SELECT access_request_id FROM public.access_request_organization_invitation_links WHERE organization_invitation_id='f2000000-0000-4000-8000-000000000304'),
 (SELECT id FROM rescinded_request),'the later invitation is not linked to the rescinded request');

SELECT * FROM dblink('first',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000305','f2000000-0000-4000-8000-000000000101','race-issue@example.test','f2000000-0000-4000-8000-000000000001')) AS bridged(status text, request_id uuid);
SELECT dblink_exec('first','BEGIN');
SELECT is((SELECT status FROM dblink('first',$q$ SELECT issue_status FROM public.issue_account_setup_link(
 (SELECT id FROM public.access_requests WHERE email='race-issue@example.test'),'race-issue-hash',now()+interval '14 days',now()) $q$)
 AS result(status text)),'created','issuance holds the request share lock');
SELECT dblink_send_query('second',$q$ SELECT rescind_status FROM public.rescind_access_request_and_block_linked_invitations(
 (SELECT id FROM public.access_requests WHERE email='race-issue@example.test'),'f2000000-0000-4000-8000-000000000003') $q$);
SELECT ok(pg_temp.second_waits(),'rescind waits for the issuing transaction');
SELECT dblink_exec('first','COMMIT');
SELECT is((SELECT status FROM dblink_get_result('second') AS result(status text) LIMIT 1),'rescinded','rescind completes after issuance commits');
SELECT * FROM dblink_get_result('second') AS result(status text);
SELECT ok((SELECT revoked_at IS NOT NULL AND revocation_reason='manual' FROM public.account_setup_links WHERE token_hash='race-issue-hash'),
 'rescind revokes the link issuance just minted');

SELECT * FROM dblink('first',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000306','f2000000-0000-4000-8000-000000000101','race-claim@example.test','f2000000-0000-4000-8000-000000000001')) AS bridged(status text, request_id uuid);
SELECT * FROM dblink('first',$q$ SELECT issue_status FROM public.issue_account_setup_link(
 (SELECT id FROM public.access_requests WHERE email='race-claim@example.test'),'race-claim-hash',now()+interval '14 days',now()) $q$) AS issued(status text);
SELECT dblink_exec('first','BEGIN');
SELECT is((SELECT status FROM dblink('first',$q$ SELECT claim_status FROM public.claim_account_setup_link_for_session(
 (SELECT id FROM public.account_setup_links WHERE token_hash='race-claim-hash'),
 (SELECT id FROM public.access_requests WHERE email='race-claim@example.test'),now()) $q$) AS result(status text)),
 'claim-started','claim admitted while the invitation is live');
SELECT dblink_exec('second','BEGIN');
SELECT dblink_exec('second','SET LOCAL ROLE authenticated');
SELECT * FROM dblink('second',$q$ SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","email":"race-owner-a@example.test"}',true) $q$) AS claims(sub text, claims text);
SELECT is((SELECT status FROM dblink('second',$q$ SELECT revoke_status FROM public.revoke_organization_invitation(
 'f2000000-0000-4000-8000-000000000306','f2000000-0000-4000-8000-000000000101') $q$) AS result(status text)),
 'revoked','revoke completes while the claim transaction is open');
SELECT dblink_exec('second','COMMIT');
SELECT dblink_exec('first','COMMIT');
SELECT ok((SELECT claimed_at IS NOT NULL AND revoked_at IS NULL FROM public.account_setup_links WHERE token_hash='race-claim-hash'),
 'the admitted claim keeps its link');
SELECT ok(NOT public.access_request_setup_grant_is_live((SELECT id FROM public.access_requests WHERE email='race-claim@example.test')),
 'the revoke leaves no grant for later issuance');

SELECT * FROM dblink('first',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000307','f2000000-0000-4000-8000-000000000101','race-sibling@example.test','f2000000-0000-4000-8000-000000000001')) AS bridged(status text, request_id uuid);
SELECT * FROM dblink('first',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000308','f2000000-0000-4000-8000-000000000102','race-sibling@example.test','f2000000-0000-4000-8000-000000000002')) AS bridged(status text, request_id uuid);
SELECT dblink_exec('first','BEGIN');
SELECT is((SELECT status FROM dblink('first',$q$ SELECT issue_status FROM public.issue_account_setup_link(
 (SELECT id FROM public.access_requests WHERE email='race-sibling@example.test'),'race-sibling-hash',now()+interval '14 days',now()) $q$)
 AS result(status text)),'created','sibling issuance in flight');
SELECT dblink_exec('second','BEGIN');
SELECT dblink_exec('second','SET LOCAL ROLE authenticated');
SELECT * FROM dblink('second',$q$ SELECT set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","email":"race-owner-a@example.test"}',true) $q$) AS claims(sub text, claims text);
SELECT is((SELECT status FROM dblink('second',$q$ SELECT revoke_status FROM public.revoke_organization_invitation(
 'f2000000-0000-4000-8000-000000000307','f2000000-0000-4000-8000-000000000101') $q$) AS result(status text)),
 'revoked','Organization A revokes without waiting on the issuance');
SELECT dblink_exec('second','COMMIT');
SELECT dblink_exec('first','COMMIT');
SELECT ok(public.access_request_setup_grant_is_live((SELECT id FROM public.access_requests WHERE email='race-sibling@example.test')),
 'Organization B keeps the grant live');
SELECT is((SELECT status FROM dblink('first',$q$ SELECT claim_status FROM public.claim_account_setup_link_for_session(
 (SELECT id FROM public.account_setup_links WHERE token_hash='race-sibling-hash'),
 (SELECT id FROM public.access_requests WHERE email='race-sibling@example.test'),now()) $q$) AS result(status text)),
 'claim-started','the sibling link remains claimable');

SELECT * FROM dblink('first',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000309','f2000000-0000-4000-8000-000000000101','race-issuers@example.test','f2000000-0000-4000-8000-000000000001')) AS bridged(status text, request_id uuid);
SELECT dblink_exec('first','BEGIN');
SELECT is((SELECT status FROM dblink('first',$q$ SELECT issue_status FROM public.issue_account_setup_link(
 (SELECT id FROM public.access_requests WHERE email='race-issuers@example.test'),'race-issuers-hash-first',now()+interval '14 days',now()) $q$)
 AS result(status text)),'created','first issuer inserts its link inside its transaction');
SELECT dblink_send_query('second',$q$ SELECT issue_status FROM public.issue_account_setup_link(
 (SELECT id FROM public.access_requests WHERE email='race-issuers@example.test'),'race-issuers-hash-second',now()+interval '14 days',now()) $q$);
SELECT ok(pg_temp.second_waits(),'second issuer with a distinct token waits on the one-active-link index');
SELECT dblink_exec('first','COMMIT');
SELECT is((SELECT status FROM dblink_get_result('second') AS result(status text) LIMIT 1),'concurrent-create',
 'second issuer reports concurrent-create');
SELECT * FROM dblink_get_result('second') AS result(status text);
SELECT results_eq($$ SELECT token_hash,revoked_at IS NULL FROM public.account_setup_links
   WHERE access_request_id=(SELECT id FROM public.access_requests WHERE email='race-issuers@example.test') $$,
 $$ VALUES ('race-issuers-hash-first'::text,true) $$,'the winning link persists unrevoked and the loser left no row');

SELECT dblink_exec('first','BEGIN');
SELECT is((SELECT status FROM dblink('first',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000310','f2000000-0000-4000-8000-000000000101','race-retry@example.test','f2000000-0000-4000-8000-000000000001'))
 AS result(status text, request_id uuid)),'created','first bridge attempt creates the request inside its transaction');
SELECT dblink_send_query('second',pg_temp.bridge_sql('f2000000-0000-4000-8000-000000000310','f2000000-0000-4000-8000-000000000101','race-retry@example.test','f2000000-0000-4000-8000-000000000001'));
SELECT ok(pg_temp.second_waits(),'retried bridge for the same invitation waits on the bridge key');
SELECT dblink_exec('first','COMMIT');
SELECT results_eq($$ SELECT status, request_id FROM dblink_get_result('second') AS result(status text, request_id uuid) $$,
 $$ SELECT 'already-linked'::text, id FROM public.access_requests WHERE email='race-retry@example.test' $$,
 'retried bridge returns the committed link');
SELECT * FROM dblink_get_result('second') AS result(status text, request_id uuid);
SELECT results_eq($$ SELECT status FROM public.access_requests WHERE email='race-retry@example.test' $$,
 $$ VALUES ('approved'::text) $$,'a concurrent retry leaves one approved request and no extra pending row');
SELECT is((SELECT count(*)::integer FROM public.access_request_organization_invitation_links
 WHERE organization_invitation_id='f2000000-0000-4000-8000-000000000310'),1,'a concurrent retry leaves one link');

SELECT pg_temp.cleanup();
SELECT dblink_disconnect('first');
SELECT dblink_disconnect('second');
SELECT * FROM finish();
ROLLBACK;
