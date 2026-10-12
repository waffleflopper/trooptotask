-- Invitation-origin platform access is a derived grant: issuance, claim, the invite
-- bridge and platform rescind all read it; only deliberate withdrawal kills it.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
 ('f1000000-0000-4000-8000-000000000001','grant-owner-a@example.test'),
 ('f1000000-0000-4000-8000-000000000002','grant-owner-b@example.test'),
 ('f1000000-0000-4000-8000-000000000003','grant-platform@example.test'),
 ('f1000000-0000-4000-8000-000000000004','grant-completed@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
 ('f1000000-0000-4000-8000-000000000101','Grant Unit A','f1000000-0000-4000-8000-000000000001'),
 ('f1000000-0000-4000-8000-000000000102','Grant Unit B','f1000000-0000-4000-8000-000000000002');
INSERT INTO public.organization_memberships(organization_id,user_id,role,member_preset,access_scope_kind) VALUES
 ('f1000000-0000-4000-8000-000000000101','f1000000-0000-4000-8000-000000000001','owner','editor','organization'),
 ('f1000000-0000-4000-8000-000000000102','f1000000-0000-4000-8000-000000000002','owner','editor','organization');

CREATE FUNCTION pg_temp.invite(p_id uuid, p_org uuid, p_email text, p_inviter uuid) RETURNS void
LANGUAGE sql AS $$
 INSERT INTO public.organization_invitations(id,organization_id,email,invited_by,expires_at,role,access_scope_kind)
 VALUES (p_id,p_org,p_email,p_inviter,now()+interval '14 days','member','organization');
$$;
CREATE FUNCTION pg_temp.bridge(p_invitation uuid, p_org uuid, p_email text, p_inviter uuid)
RETURNS TABLE(bridge_status text, access_request_id uuid) LANGUAGE sql AS $$
 SELECT * FROM public.link_organization_invitation_access_request(
  p_invitation,p_org,p_email,p_inviter,now(),'member',NULL,'{}'::jsonb,'organization',ARRAY[]::uuid[]);
$$;
CREATE FUNCTION pg_temp.request_for(p_email text) RETURNS uuid LANGUAGE sql AS $$
 SELECT id FROM public.access_requests WHERE email=p_email ORDER BY created_at DESC LIMIT 1;
$$;
CREATE FUNCTION pg_temp.issue(p_request uuid, p_hash text)
RETURNS TABLE(issue_status text, setup_link_id uuid, revoked_setup_link_ids uuid[]) LANGUAGE sql AS $$
 SELECT issue_status,setup_link_id,revoked_setup_link_ids
 FROM public.issue_account_setup_link(p_request,p_hash,now()+interval '14 days',now());
$$;
CREATE FUNCTION pg_temp.as_owner(p_user uuid, p_email text) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claim.sub',p_user::text,true);
 SELECT set_config('request.jwt.claims',json_build_object('sub',p_user,'email',p_email)::text,true);
$$;

-- Privileges
SELECT ok(
 has_function_privilege('service_role','public.access_request_setup_grant_is_live(uuid)','EXECUTE')
 AND has_function_privilege('service_role','public.issue_account_setup_link(uuid,text,timestamp with time zone,timestamp with time zone)','EXECUTE')
 AND has_function_privilege('service_role','public.link_organization_invitation_access_request(uuid,uuid,text,uuid,timestamp with time zone,text,text,jsonb,text,uuid[])','EXECUTE')
 AND has_function_privilege('service_role','public.rescind_access_request_and_block_linked_invitations(uuid,uuid)','EXECUTE')
 AND has_function_privilege('service_role','public.setup_grant_live(public.access_requests)','EXECUTE'),
 'service role can call every grant function');
SELECT ok(NOT (
 has_function_privilege('authenticated','public.access_request_setup_grant_is_live(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.access_request_setup_grant_is_live(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.issue_account_setup_link(uuid,text,timestamp with time zone,timestamp with time zone)','EXECUTE')
 OR has_function_privilege('anon','public.issue_account_setup_link(uuid,text,timestamp with time zone,timestamp with time zone)','EXECUTE')
 OR has_function_privilege('authenticated','public.link_organization_invitation_access_request(uuid,uuid,text,uuid,timestamp with time zone,text,text,jsonb,text,uuid[])','EXECUTE')
 OR has_function_privilege('anon','public.link_organization_invitation_access_request(uuid,uuid,text,uuid,timestamp with time zone,text,text,jsonb,text,uuid[])','EXECUTE')
 OR has_function_privilege('authenticated','public.rescind_access_request_and_block_linked_invitations(uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.rescind_access_request_and_block_linked_invitations(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.setup_grant_live(public.access_requests)','EXECUTE')
 OR has_function_privilege('anon','public.setup_grant_live(public.access_requests)','EXECUTE')),
 'browser roles cannot call any grant function');

-- Approval basis CHECK
SELECT throws_ok($$ INSERT INTO public.access_requests(email,name,status) VALUES ('grant-nobasis@example.test','No basis','approved') $$,
 '23514',NULL,'an approved row without a basis is refused');
SELECT throws_ok($$ INSERT INTO public.access_requests(email,name,status,approval_basis) VALUES ('grant-pendingbasis@example.test','Pending basis','pending','platform_review') $$,
 '23514',NULL,'a pending row cannot carry a basis');
SELECT throws_ok($$ INSERT INTO public.access_requests(email,name,status) VALUES ('grant-rescindnobasis@example.test','Rescinded','rescinded') $$,
 '23514',NULL,'a rescinded row keeps its basis');
SELECT throws_ok($$ INSERT INTO public.access_requests(email,name,status,approval_basis) VALUES ('grant-badbasis@example.test','Bad basis','approved','self_service') $$,
 '23514',NULL,'an unknown basis is refused');

-- First-time bridge
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000101','grant-new@example.test','f1000000-0000-4000-8000-000000000001');
SELECT is((SELECT bridge_status FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000101','Grant-New@Example.Test ','f1000000-0000-4000-8000-000000000001')),
 'created','first invitation for a new email creates the Access Request');
SELECT results_eq(
 $$ SELECT status,approval_basis,reviewed_by,name FROM public.access_requests WHERE email='grant-new@example.test' $$,
 $$ VALUES ('approved'::text,'organization_invitation'::text,'f1000000-0000-4000-8000-000000000001'::uuid,'grant-new@example.test'::text) $$,
 'bridge approves on the invitation basis with the inviter as reviewer');
SELECT results_eq(
 $$ SELECT organization_id,invited_by,intended_membership_role,intended_access_scope_kind FROM public.access_request_organization_invitation_links
    WHERE organization_invitation_id='f1000000-0000-4000-8000-000000000301' $$,
 $$ VALUES ('f1000000-0000-4000-8000-000000000101'::uuid,'f1000000-0000-4000-8000-000000000001'::uuid,'member'::text,'organization'::text) $$,
 'bridge records the invitation link with intended access');
SELECT is((SELECT bridge_status FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000101','grant-new@example.test','f1000000-0000-4000-8000-000000000001')),
 'already-linked','bridge replay for the same invitation is a no-op');
SELECT is((SELECT access_request_id FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000101','grant-new@example.test','f1000000-0000-4000-8000-000000000001')),
 pg_temp.request_for('grant-new@example.test'),'bridge replay returns the linked request');
SELECT ok(public.access_request_setup_grant_is_live(pg_temp.request_for('grant-new@example.test')),'pending invitation keeps the grant live');

-- Issuance replaces atomically
SELECT is((SELECT issue_status FROM pg_temp.issue(pg_temp.request_for('grant-new@example.test'),'grant-new-hash-1')),'created','live grant issues a link');
SELECT is((SELECT revoked_setup_link_ids FROM pg_temp.issue(pg_temp.request_for('grant-new@example.test'),'grant-new-hash-2')),
 ARRAY[(SELECT id FROM public.account_setup_links WHERE token_hash='grant-new-hash-1')],'a fresh issue reports the link it replaced');
SELECT is((SELECT revocation_reason FROM public.account_setup_links WHERE token_hash='grant-new-hash-1'),'replaced','replaced link is revoked as replaced');
SELECT is((SELECT issue_status FROM pg_temp.issue(pg_temp.request_for('grant-new@example.test'),'grant-new-hash-2')),
 'concurrent-create','unique violation reports concurrent-create');
SELECT ok((SELECT revoked_at IS NULL FROM public.account_setup_links WHERE token_hash='grant-new-hash-2'),
 'a failed insert rolls back the revocation it attempted');

-- Sibling Organization shares the request and survives the first revoke
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000302','f1000000-0000-4000-8000-000000000102','grant-new@example.test','f1000000-0000-4000-8000-000000000002');
SELECT results_eq($$ SELECT * FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000302','f1000000-0000-4000-8000-000000000102','grant-new@example.test','f1000000-0000-4000-8000-000000000002') $$,
 $$ SELECT 'linked'::text, pg_temp.request_for('grant-new@example.test') $$,'second Organization links the same request');
SELECT is((SELECT reviewed_by FROM public.access_requests WHERE email='grant-new@example.test'),'f1000000-0000-4000-8000-000000000001'::uuid,
 'an already approved request keeps its first reviewer');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_owner('f1000000-0000-4000-8000-000000000001','grant-owner-a@example.test');
SELECT is((SELECT revoke_status FROM public.revoke_organization_invitation('f1000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000101')),'revoked','Organization A revokes its invitation');
RESET ROLE;
SELECT ok(public.access_request_setup_grant_is_live(pg_temp.request_for('grant-new@example.test')),'sibling Organization invitation keeps the grant live');
SELECT ok((SELECT revoked_at IS NULL FROM public.account_setup_links WHERE token_hash='grant-new-hash-2'),'revoking one Organization leaves the active link');

-- The last vouch withdrawn kills the grant at issuance and claim
UPDATE public.organization_invitations SET status='blocked', blocked_at=now(), blocked_by='f1000000-0000-4000-8000-000000000002'
 WHERE id='f1000000-0000-4000-8000-000000000302';
SELECT ok(NOT public.access_request_setup_grant_is_live(pg_temp.request_for('grant-new@example.test')),'no live invitation means no grant');
SELECT is((SELECT public.setup_grant_live(request) FROM public.access_requests AS request WHERE id=pg_temp.request_for('grant-new@example.test')),
 false,'the computed field reads the same grant');
SELECT is((SELECT issue_status FROM pg_temp.issue(pg_temp.request_for('grant-new@example.test'),'grant-new-hash-3')),'access-request-not-approved','dead grant refuses issuance');
SELECT ok((SELECT revoked_at IS NULL FROM public.account_setup_links WHERE token_hash='grant-new-hash-2'),'refused issuance changes no link');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
 (SELECT id FROM public.account_setup_links WHERE token_hash='grant-new-hash-2'),pg_temp.request_for('grant-new@example.test'),now())),
 'access-request-not-approved','dead grant refuses the claim');
SELECT ok((SELECT claimed_at IS NULL FROM public.account_setup_links WHERE token_hash='grant-new-hash-2'),'refused claim leaves the link unclaimed');
SELECT results_eq($$ SELECT status,approval_basis FROM public.access_requests WHERE email='grant-new@example.test' $$,
 $$ VALUES ('approved'::text,'organization_invitation'::text) $$,'withdrawal leaves the request row intact');

-- Re-invitation revives the same request
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000303','f1000000-0000-4000-8000-000000000101','grant-new@example.test','f1000000-0000-4000-8000-000000000001');
SELECT is((SELECT bridge_status FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000303','f1000000-0000-4000-8000-000000000101','grant-new@example.test','f1000000-0000-4000-8000-000000000001')),
 'linked','re-invitation links the existing approved request');
SELECT ok(public.access_request_setup_grant_is_live(pg_temp.request_for('grant-new@example.test')),'a new live invitation revives the grant');

-- Expiry is not withdrawal
UPDATE public.organization_invitations SET status='expired', expired_at=now() WHERE id='f1000000-0000-4000-8000-000000000303';
SELECT ok(public.access_request_setup_grant_is_live(pg_temp.request_for('grant-new@example.test')),'an expired invitation keeps the renewal grant');

-- Bridge refuses an invitation that is no longer pending
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000304','f1000000-0000-4000-8000-000000000101','grant-late@example.test','f1000000-0000-4000-8000-000000000001');
UPDATE public.organization_invitations SET status='revoked', revoked_at=now(), revoked_by='f1000000-0000-4000-8000-000000000001'
 WHERE id='f1000000-0000-4000-8000-000000000304';
SELECT is((SELECT bridge_status FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000304','f1000000-0000-4000-8000-000000000101','grant-late@example.test','f1000000-0000-4000-8000-000000000001')),
 'invitation-not-pending','revoked invitation cannot be bridged');
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE email='grant-late@example.test'),0,'refused bridge creates no request');
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000305','f1000000-0000-4000-8000-000000000101','grant-wrong-org@example.test','f1000000-0000-4000-8000-000000000001');
SELECT is((SELECT bridge_status FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000305','f1000000-0000-4000-8000-000000000102','grant-wrong-org@example.test','f1000000-0000-4000-8000-000000000002')),
 'invitation-not-pending','another Organization cannot bridge the invitation');

-- Bridge reuses a public pending request; a block after issuance failure kills it
INSERT INTO public.access_requests(id,email,name,status) VALUES ('f1000000-0000-4000-8000-000000000401','grant-public@example.test','Public applicant','pending');
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000306','f1000000-0000-4000-8000-000000000101','grant-public@example.test','f1000000-0000-4000-8000-000000000001');
SELECT results_eq($$ SELECT * FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000306','f1000000-0000-4000-8000-000000000101','grant-public@example.test','f1000000-0000-4000-8000-000000000001') $$,
 $$ VALUES ('linked'::text,'f1000000-0000-4000-8000-000000000401'::uuid) $$,'bridge reuses the public pending request');
SELECT results_eq($$ SELECT status,approval_basis FROM public.access_requests WHERE id='f1000000-0000-4000-8000-000000000401' $$,
 $$ VALUES ('approved'::text,'organization_invitation'::text) $$,'reused pending request is approved on the invitation basis');
UPDATE public.organization_invitations SET status='blocked', blocked_at=now(), blocked_by='f1000000-0000-4000-8000-000000000001'
 WHERE id='f1000000-0000-4000-8000-000000000306';
SELECT is((SELECT issue_status FROM pg_temp.issue('f1000000-0000-4000-8000-000000000401','grant-public-hash')),'access-request-not-approved',
 'a blocked invitation leaves no mintable credential');

-- An independent platform approval survives a failed invitation
INSERT INTO public.access_requests(id,email,name,status,approval_basis,reviewed_by,reviewed_at)
 VALUES ('f1000000-0000-4000-8000-000000000402','grant-reviewed@example.test','Reviewed','approved','platform_review','f1000000-0000-4000-8000-000000000003',now());
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000307','f1000000-0000-4000-8000-000000000101','grant-reviewed@example.test','f1000000-0000-4000-8000-000000000001');
SELECT results_eq($$ SELECT * FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000307','f1000000-0000-4000-8000-000000000101','grant-reviewed@example.test','f1000000-0000-4000-8000-000000000001') $$,
 $$ VALUES ('linked'::text,'f1000000-0000-4000-8000-000000000402'::uuid) $$,'invitation links the hand-approved request');
UPDATE public.organization_invitations SET status='blocked', blocked_at=now(), blocked_by='f1000000-0000-4000-8000-000000000001'
 WHERE id='f1000000-0000-4000-8000-000000000307';
SELECT results_eq($$ SELECT approval_basis,reviewed_by FROM public.access_requests WHERE id='f1000000-0000-4000-8000-000000000402' $$,
 $$ VALUES ('platform_review'::text,'f1000000-0000-4000-8000-000000000003'::uuid) $$,'invitation keeps the platform basis and reviewer');
SELECT is((SELECT issue_status FROM pg_temp.issue('f1000000-0000-4000-8000-000000000402','grant-reviewed-hash')),'created',
 'platform review stays live after the invitation fails');

-- Completed setup is never live
INSERT INTO public.access_requests(id,email,name,status,approval_basis,setup_completed_at,setup_user_id)
 VALUES ('f1000000-0000-4000-8000-000000000403','grant-completed@example.test','Completed','approved','platform_review',now(),'f1000000-0000-4000-8000-000000000004');
SELECT ok(NOT public.access_request_setup_grant_is_live('f1000000-0000-4000-8000-000000000403'),'completed setup has no live grant');
SELECT is((SELECT issue_status FROM pg_temp.issue('f1000000-0000-4000-8000-000000000403','grant-completed-hash')),'access-request-completed','completed request reports completion');
SELECT is((SELECT issue_status FROM pg_temp.issue('f1000000-0000-4000-8000-000000000999','grant-missing-hash')),'access-request-missing','missing request reports missing');

-- Platform rescind
SELECT is((SELECT rescind_status FROM public.rescind_access_request_and_block_linked_invitations('f1000000-0000-4000-8000-000000000403','f1000000-0000-4000-8000-000000000003')),
 'completed','rescind refuses a completed request');
SELECT is((SELECT status FROM public.access_requests WHERE id='f1000000-0000-4000-8000-000000000403'),'approved','refused rescind leaves the completed request approved');
INSERT INTO public.access_requests(id,email,name,status) VALUES ('f1000000-0000-4000-8000-000000000404','grant-pending@example.test','Pending','pending');
SELECT is((SELECT rescind_status FROM public.rescind_access_request_and_block_linked_invitations('f1000000-0000-4000-8000-000000000404','f1000000-0000-4000-8000-000000000003')),
 'not_found','rescind applies only to approved requests');

INSERT INTO public.access_requests(id,email,name,status,approval_basis) VALUES
 ('f1000000-0000-4000-8000-000000000405','grant-held@example.test','Held','approved','platform_review'),
 ('f1000000-0000-4000-8000-000000000406','grant-held@example.test','Sibling held','approved','platform_review');
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,expires_at,claimed_at) VALUES
 ('f1000000-0000-4000-8000-000000000501','f1000000-0000-4000-8000-000000000405','grant-held-hash',now()+interval '1 day',now());
SELECT is((SELECT rescind_status FROM public.rescind_access_request_and_block_linked_invitations('f1000000-0000-4000-8000-000000000405','f1000000-0000-4000-8000-000000000003')),
 'claim-held','rescind refuses while this request holds a claim');
SELECT is((SELECT status FROM public.access_requests WHERE id='f1000000-0000-4000-8000-000000000405'),'approved','held claim leaves the request approved');
SELECT is((SELECT rescind_status FROM public.rescind_access_request_and_block_linked_invitations('f1000000-0000-4000-8000-000000000406','f1000000-0000-4000-8000-000000000003')),
 'rescinded','a claim held on another request for the email does not block rescind');

SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000308','f1000000-0000-4000-8000-000000000101','grant-rescind@example.test','f1000000-0000-4000-8000-000000000001');
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000309','f1000000-0000-4000-8000-000000000102','grant-rescind@example.test','f1000000-0000-4000-8000-000000000002');
SELECT pg_temp.bridge('f1000000-0000-4000-8000-000000000308','f1000000-0000-4000-8000-000000000101','grant-rescind@example.test','f1000000-0000-4000-8000-000000000001');
SELECT pg_temp.bridge('f1000000-0000-4000-8000-000000000309','f1000000-0000-4000-8000-000000000102','grant-rescind@example.test','f1000000-0000-4000-8000-000000000002');
SELECT is((SELECT issue_status FROM pg_temp.issue(pg_temp.request_for('grant-rescind@example.test'),'grant-rescind-hash')),'created','rescind target has an active link');
CREATE TEMP TABLE rescind_result AS
 SELECT * FROM public.rescind_access_request_and_block_linked_invitations(pg_temp.request_for('grant-rescind@example.test'),'f1000000-0000-4000-8000-000000000003');
SELECT results_eq($$ SELECT rescind_status,organization_invitation_id,organization_id,invitation_email FROM rescind_result ORDER BY organization_id $$,
 $$ VALUES ('rescinded'::text,'f1000000-0000-4000-8000-000000000308'::uuid,'f1000000-0000-4000-8000-000000000101'::uuid,'grant-rescind@example.test'::text),
           ('rescinded'::text,'f1000000-0000-4000-8000-000000000309'::uuid,'f1000000-0000-4000-8000-000000000102'::uuid,'grant-rescind@example.test'::text) $$,
 'rescind reports every linked invitation it blocked');
SELECT results_eq($$ SELECT status,approval_basis,reviewed_by FROM public.access_requests WHERE email='grant-rescind@example.test' $$,
 $$ VALUES ('rescinded'::text,'organization_invitation'::text,'f1000000-0000-4000-8000-000000000001'::uuid) $$,
 'rescinded request keeps its basis and original reviewer');
SELECT ok((SELECT revoked_at IS NOT NULL AND revocation_reason='manual' FROM public.account_setup_links WHERE token_hash='grant-rescind-hash'),
 'rescind revokes the active link as manual');
SELECT results_eq($$ SELECT status::text,blocked_by FROM public.organization_invitations WHERE id IN ('f1000000-0000-4000-8000-000000000308','f1000000-0000-4000-8000-000000000309') ORDER BY id $$,
 $$ VALUES ('blocked'::text,'f1000000-0000-4000-8000-000000000003'::uuid),('blocked'::text,'f1000000-0000-4000-8000-000000000003'::uuid) $$,
 'rescind blocks linked pending invitations as the platform reviewer');
SELECT results_eq($$ SELECT org_id,details->>'reason',severity FROM public.audit_logs
   WHERE action='organization_invitation.blocked_by_access_request_rescission'
     AND resource_id IN ('f1000000-0000-4000-8000-000000000308','f1000000-0000-4000-8000-000000000309') ORDER BY org_id $$,
 $$ VALUES ('f1000000-0000-4000-8000-000000000101'::uuid,'linked_platform_access_rescinded'::text,'warning'::text),
           ('f1000000-0000-4000-8000-000000000102'::uuid,'linked_platform_access_rescinded'::text,'warning'::text) $$,
 'each blocked invitation has an audit row for its Organization');
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
 (SELECT id FROM public.account_setup_links WHERE token_hash='grant-rescind-hash'),pg_temp.request_for('grant-rescind@example.test'),now())),
 'revoked','rescinded link reports revoked at claim');
SELECT is((SELECT issue_status FROM pg_temp.issue(pg_temp.request_for('grant-rescind@example.test'),'grant-rescind-hash-2')),'access-request-not-approved',
 'rescinded request cannot be issued a link');
SELECT is((SELECT rescind_status FROM public.rescind_access_request_and_block_linked_invitations(pg_temp.request_for('grant-rescind@example.test'),'f1000000-0000-4000-8000-000000000003')),
 'not_found','rescind replay is refused');

-- A later invitation after rescind starts a new request instead of reviving the rescinded one
SELECT pg_temp.invite('f1000000-0000-4000-8000-000000000310','f1000000-0000-4000-8000-000000000101','grant-rescind@example.test','f1000000-0000-4000-8000-000000000001');
SELECT is((SELECT bridge_status FROM pg_temp.bridge('f1000000-0000-4000-8000-000000000310','f1000000-0000-4000-8000-000000000101','grant-rescind@example.test','f1000000-0000-4000-8000-000000000001')),
 'created','invitation after rescind creates a new request');
SELECT results_eq($$ SELECT status FROM public.access_requests WHERE email='grant-rescind@example.test' ORDER BY status $$,
 $$ VALUES ('approved'::text),('rescinded'::text) $$,'the rescinded request stays rescinded');

SELECT * FROM finish();
ROLLBACK;
